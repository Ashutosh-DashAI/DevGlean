import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { logger } from "../lib/logger";
import * as embeddingService from "./embedding.service";
import * as retrievalService from "./retrieval.service";
import * as generationService from "./generation.service";
import * as ossService from "./oss.service";
import { QueryClassifier } from "./queryClassifier";
import { ResultFusion } from "./resultFusion";
import {
  AppError,
  ErrorCode,
  REDIS_KEYS,
  PLAN_LIMITS,
} from "@devglean/shared";
import type {
  SearchQueryInput,
  SearchResult,
  SearchResponse,
  AuthUser,
  QuerySurface,
  FusedResult,
} from "@devglean/shared";

/**
 * Checks if the team has exceeded their monthly query limit.
 */
async function enforceQueryLimit(teamId: string, plan: string): Promise<void> {
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const key = REDIS_KEYS.queryCount(teamId, month);

  const currentCount = await redis.get(key);
  const count = currentCount ? parseInt(currentCount, 10) : 0;

  const planKey = plan as keyof typeof PLAN_LIMITS;
  const limit = PLAN_LIMITS[planKey]?.maxQueriesPerMonth ?? PLAN_LIMITS.FREE.maxQueriesPerMonth;

  if (count >= limit) {
    throw new AppError(
      ErrorCode.QUERY_LIMIT_EXCEEDED,
      `Monthly query limit reached (${limit} queries). Please upgrade your plan.`,
      402
    );
  }
}

/**
 * Increments the monthly query counter.
 */
async function incrementQueryCount(teamId: string): Promise<void> {
  const month = new Date().toISOString().slice(0, 7);
  const key = REDIS_KEYS.queryCount(teamId, month);

  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.expire(key, 35 * 24 * 60 * 60);
  await pipeline.exec();
}

/**
 * Determines the search surface, optionally overridden by the user.
 */
async function determineSurface(
  query: string,
  requestedSurface: QuerySurface | undefined,
  teamName: string
): Promise<QuerySurface> {
  // If user explicitly requested a surface, use it
  if (requestedSurface && requestedSurface !== "both") {
    return requestedSurface;
  }

  // Auto-classify with Claude Haiku
  const classification = await QueryClassifier.classify(query, teamName);
  return classification.surface;
}

/**
 * Builds the unified source context for generation from fused results.
 */
function fusedToSearchResults(fused: FusedResult[]): SearchResult[] {
  return fused.map((f, i) => ({
    id: f.id,
    title: f.title,
    content: f.content,
    sourceUrl: f.sourceUrl,
    sourceType: f.sourceType,
    score: f.score,
    metadata: f.metadata as Record<string, unknown>,
    chunkIndex: 0,
    chunkTotal: 1,
  }));
}

/**
 * Full unified search pipeline: classify → private RAG + OSS in parallel → fuse → generate → stream.
 */
export async function* searchStream(
  input: SearchQueryInput,
  user: AuthUser,
  aclGroups: string[],
  teamName: string,
  installationId?: string
): AsyncGenerator<string, { sources: SearchResult[]; latencyMs: number; tokensUsed: number; queryId: string }, undefined> {
  const startTime = performance.now();

  // 1. Enforce query limits
  await enforceQueryLimit(user.teamId, user.plan);

  // 2. Determine surface
  const surface = await determineSurface(
    input.query,
    (input as Record<string, unknown>).surface as QuerySurface | undefined,
    teamName
  );

  // 3. Run pipelines in parallel based on surface
  let privateResults: SearchResult[] = [];
  let ossResults: import("@devglean/shared").OSSIssue[] = [];
  let cacheHit = false;

  if (surface === "private" || surface === "both") {
    const queryVector = await embeddingService.embed(input.query, true);
    privateResults = await retrievalService.retrieve({
      queryVector,
      query: input.query,
      teamId: user.teamId,
      aclGroups,
      filters: input.filters,
    });
  }

  if (surface === "oss" || surface === "both") {
    try {
      const ossResult = await ossService.search(
        input.query,
        (input as Record<string, unknown>).filters as import("@devglean/shared").OSSFilters ?? {},
        user.teamId,
        installationId
      );
      ossResults = ossResult.issues;
      cacheHit = ossResult.cacheHit;
    } catch (error) {
      // OSS failure is non-fatal — continue with private results only
      logger.warn({ error }, "OSS search failed — continuing with private results");
    }
  }

  // 4. Fuse results
  const fused = ResultFusion.merge(privateResults, ossResults);
  const sources = fusedToSearchResults(fused);

  // 5. Stream generated answer with unified citation format
  let fullAnswer = "";
  let tokensUsed = 0;

  for await (const token of generationService.generateStream(input.query, sources)) {
    fullAnswer += token;
    yield `data: ${JSON.stringify({ event: "token", data: token })}\n\n`;
  }

  const latencyMs = Math.round(performance.now() - startTime);

  // 6. Log query
  const queryLog = await prisma.queryLog.create({
    data: {
      teamId: user.teamId,
      userId: user.id,
      query: input.query,
      answer: fullAnswer,
      surface: surface === "private" ? "PRIVATE" : surface === "oss" ? "OSS" : "BOTH",
      sourceCount: sources.length,
      ossResultCount: ossResults.length,
      latencyMs,
      tokensUsed,
      cacheHit,
      connectorTypes: [...new Set(sources.map((s) => s.sourceType))],
    },
  });

  await incrementQueryCount(user.teamId);

  // 7. Send sources with surface labels
  yield `data: ${JSON.stringify({
    event: "sources",
    data: fused.map((s, i) => ({
      index: i + 1,
      title: s.title,
      sourceUrl: s.sourceUrl,
      sourceType: s.sourceType,
      sourceLabel: s.sourceLabel,
      score: s.score.toFixed(4),
    })),
  })}\n\n`;

  // 8. Done
  yield `data: ${JSON.stringify({
    event: "done",
    data: {
      queryId: queryLog.id,
      latencyMs,
      sourceCount: sources.length,
      surface,
      cacheHit,
    },
  })}\n\n`;

  return { sources, latencyMs, tokensUsed, queryId: queryLog.id };
}

/**
 * Non-streaming unified search.
 */
export async function search(
  input: SearchQueryInput,
  user: AuthUser,
  aclGroups: string[],
  teamName: string,
  installationId?: string
): Promise<SearchResponse> {
  const startTime = performance.now();

  await enforceQueryLimit(user.teamId, user.plan);

  const surface = await determineSurface(
    input.query,
    (input as Record<string, unknown>).surface as QuerySurface | undefined,
    teamName
  );

  let privateResults: SearchResult[] = [];
  let ossResults: import("@devglean/shared").OSSIssue[] = [];
  let cacheHit = false;

  if (surface === "private" || surface === "both") {
    const queryVector = await embeddingService.embed(input.query, true);
    privateResults = await retrievalService.retrieve({
      queryVector,
      query: input.query,
      teamId: user.teamId,
      aclGroups,
      filters: input.filters,
    });
  }

  if (surface === "oss" || surface === "both") {
    try {
      const ossResult = await ossService.search(
        input.query,
        (input as Record<string, unknown>).filters as import("@devglean/shared").OSSFilters ?? {},
        user.teamId,
        installationId
      );
      ossResults = ossResult.issues;
      cacheHit = ossResult.cacheHit;
    } catch (error) {
      logger.warn({ error }, "OSS search failed — continuing with private results");
    }
  }

  const fused = ResultFusion.merge(privateResults, ossResults);
  const sources = fusedToSearchResults(fused);

  const { answer, tokensUsed } = await generationService.generate(input.query, sources);

  const latencyMs = Math.round(performance.now() - startTime);

  const queryLog = await prisma.queryLog.create({
    data: {
      teamId: user.teamId,
      userId: user.id,
      query: input.query,
      answer,
      surface: surface === "private" ? "PRIVATE" : surface === "oss" ? "OSS" : "BOTH",
      sourceCount: sources.length,
      ossResultCount: ossResults.length,
      latencyMs,
      tokensUsed,
      cacheHit,
      connectorTypes: [...new Set(sources.map((s) => s.sourceType))],
    },
  });

  await incrementQueryCount(user.teamId);

  return { answer, sources, latencyMs, queryId: queryLog.id, tokensUsed };
}
