import { createHash } from "crypto";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { logger } from "../lib/logger";
import { GitHubOSSConnector } from "../connectors/githubOSS.connector";
import { StackExchangeConnector } from "../connectors/stackexchange.connector";
import { IssueRanker } from "./issueRanker";
import * as embeddingService from "./embedding.service";
import { anthropic } from "../lib/anthropic";
import { getRateLimitStatus, isCircuitOpen } from "../middleware/circuitBreaker";
import {
  AppError,
  ErrorCode,
  OSS_CACHE_TTL_SECONDS,
  OSS_SEMANTIC_CACHE_THRESHOLD,
  OSS_MAX_RESULTS,
  OSS_REDIS_KEYS,
  GENERATION_MODEL,
  MAX_OUTPUT_TOKENS,
} from "@devglean/shared";
import type {
  OSSIssue,
  OSSSearchResult,
  OSSFilters,
  RawOSSResult,
  IssueSynthesis,
  OSSRateLimitStatus,
  OSSCacheStatus,
} from "@devglean/shared";

const githubOSS = new GitHubOSSConnector();
const stackExchange = new StackExchangeConnector();

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * OSSService — the core OSS Intelligence Pipeline.
 *
 * Architecture: Cache check → Semantic dedup → Circuit breaker → Parallel fetch
 *             → IssueRanker → Cache store → Pre-warm enqueue
 */

/**
 * Search for resolved OSS issues across GitHub and Stack Exchange.
 */
export async function search(
  query: string,
  filters: OSSFilters,
  teamId: string,
  installationId?: string
): Promise<OSSSearchResult> {
  const normalized = normalizeQuery(query);
  const queryHash = sha256(normalized);
  const startMs = performance.now();

  // 1. Check exact cache hit (Redis first, then Postgres)
  const cached = await getFromCache(queryHash);
  if (cached) {
    await logOSSQuery(teamId, query, true, cached.length, Math.round(performance.now() - startMs));
    return {
      issues: cached,
      totalCount: cached.length,
      cacheHit: true,
      rateLimitStatus: await getRateLimitStatus(),
    };
  }

  // 2. Check semantic near-match in cache (cosine > 0.92)
  const queryVec = await embeddingService.embed(normalized, true);
  const semanticMatch = await findSemanticCacheMatch(queryVec);
  if (semanticMatch) {
    await logOSSQuery(teamId, query, true, semanticMatch.length, Math.round(performance.now() - startMs));
    return {
      issues: semanticMatch,
      totalCount: semanticMatch.length,
      cacheHit: true,
      rateLimitStatus: await getRateLimitStatus(),
    };
  }

  // 3. Circuit breaker check
  const circuitOpen = await isCircuitOpen();
  if (circuitOpen) {
    throw new AppError(
      ErrorCode.RATE_LIMITED,
      "GitHub API rate limit reached — serving cached results only. Try again shortly.",
      429,
      { rateLimitStatus: await getRateLimitStatus() }
    );
  }

  // 4. Parallel fetch: GitHub Issues + Stack Exchange
  const [githubResult, stackResult] = await Promise.allSettled([
    githubOSS.searchResolvedIssues(normalized, filters, installationId),
    stackExchange.searchAnswered(normalized, filters.language),
  ]);

  const rawResults: RawOSSResult[] = [
    ...(githubResult.status === "fulfilled" ? githubResult.value : []),
    ...(stackResult.status === "fulfilled" ? stackResult.value : []),
  ];

  // 5. Rank and score
  const issues = mergeAndRank(rawResults);

  // 6. Store in cache
  await storeInCache(queryHash, normalized, queryVec, issues);

  const latencyMs = Math.round(performance.now() - startMs);
  await logOSSQuery(
    teamId,
    query,
    false,
    issues.length,
    latencyMs,
    issues[0]?.repoUrl
  );

  return {
    issues,
    totalCount: issues.length,
    cacheHit: false,
    rateLimitStatus: await getRateLimitStatus(),
  };
}

/**
 * Synthesize a GitHub issue thread into a structured solution via Claude.
 */
export async function synthesizeIssue(
  owner: string,
  repo: string,
  number: number,
  installationId?: string
): Promise<IssueSynthesis> {
  const thread = await githubOSS.fetchFullIssueThread(owner, repo, number, installationId);

  const response = await anthropic.messages.create({
    model: GENERATION_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: `You are analyzing a resolved GitHub issue thread. Extract a structured solution.

Output ONLY valid JSON matching this schema:
{
  "problem": "What was the exact issue? (2-3 sentences)",
  "rootCause": "Why did it happen? (1-2 sentences)",
  "solution": "The accepted fix, step by step",
  "codeExamples": ["relevant code blocks from the thread"],
  "references": [{"title": "description", "url": "https://..."}]
}

Be precise and technical. Extract real code from the thread, don't invent code.`,
    messages: [{ role: "user", content: thread }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) {
    return { problem: "Unable to synthesize", rootCause: "", solution: "", codeExamples: [], references: [] };
  }

  try {
    return JSON.parse(textBlock.text) as IssueSynthesis;
  } catch {
    return {
      problem: textBlock.text,
      rootCause: "",
      solution: "",
      codeExamples: [],
      references: [],
    };
  }
}

/**
 * Get trending/popular OSS queries across all teams (anonymized).
 */
export async function getTrending(
  language?: string,
  timeframe: "day" | "week" = "week"
): Promise<Array<{ query: string; count: number; topRepo: string | null }>> {
  const since = new Date();
  if (timeframe === "day") {
    since.setDate(since.getDate() - 1);
  } else {
    since.setDate(since.getDate() - 7);
  }

  const logs = await prisma.oSSQueryLog.groupBy({
    by: ["query"],
    _count: { query: true },
    _max: { topRepoUrl: true },
    where: {
      createdAt: { gte: since },
      cacheHit: false,
    },
    orderBy: { _count: { query: "desc" } },
    take: 20,
  });

  return logs.map((l) => ({
    query: l.query,
    count: l._count.query,
    topRepo: l._max.topRepoUrl,
  }));
}

/**
 * Get OSS cache health statistics.
 */
export async function getCacheStatus(): Promise<OSSCacheStatus> {
  const [totalEntries, totalHits, totalMisses] = await Promise.all([
    prisma.oSSIssueCache.count(),
    prisma.oSSQueryLog.count({ where: { cacheHit: true } }),
    prisma.oSSQueryLog.count({ where: { cacheHit: false } }),
  ]);

  const total = totalHits + totalMisses;
  const hitRate = total > 0 ? Math.round((totalHits / total) * 100) : 0;

  const rateLimitStatus = await getRateLimitStatus();

  return {
    hitRate,
    totalEntries,
    nextResetAt: rateLimitStatus.resetAt,
    rateLimitRemaining: rateLimitStatus.remaining,
  };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function mergeAndRank(raw: RawOSSResult[]): OSSIssue[] {
  return raw
    .map((r, i) => ({
      ...r,
      id: `oss-${sha256(r.htmlUrl).slice(0, 12)}`,
      issueScore: IssueRanker.score(r),
    }))
    .sort((a, b) => b.issueScore - a.issueScore)
    .slice(0, OSS_MAX_RESULTS);
}

async function getFromCache(queryHash: string): Promise<OSSIssue[] | null> {
  // Redis first (fast)
  const redisKey = OSS_REDIS_KEYS.ossCache(queryHash);
  const redisData = await redis.get(redisKey);
  if (redisData) {
    return JSON.parse(redisData) as OSSIssue[];
  }

  // Postgres fallback
  const row = await prisma.oSSIssueCache.findUnique({
    where: { queryHash },
  });

  if (row && new Date(row.expiresAt) > new Date()) {
    const issues = row.results as OSSIssue[];
    // Re-populate Redis
    await redis.set(redisKey, JSON.stringify(issues), "EX", OSS_CACHE_TTL_SECONDS);
    // Increment hit count
    await prisma.oSSIssueCache.update({
      where: { id: row.id },
      data: { hitCount: { increment: 1 } },
    });
    return issues;
  }

  return null;
}

async function findSemanticCacheMatch(queryVec: number[]): Promise<OSSIssue[] | null> {
  try {
    const vectorStr = `[${queryVec.join(",")}]`;
    const result = await prisma.$queryRaw<
      Array<{ id: string; results: unknown; similarity: number }>
    >`
      SELECT id, results, 1 - (query_embedding <=> ${vectorStr}::vector) as similarity
      FROM "OSSIssueCache"
      WHERE query_embedding IS NOT NULL
        AND expires_at > NOW()
        AND 1 - (query_embedding <=> ${vectorStr}::vector) > ${OSS_SEMANTIC_CACHE_THRESHOLD}
      ORDER BY similarity DESC
      LIMIT 1
    `;

    if (result.length > 0 && result[0]) {
      logger.debug(
        { similarity: result[0].similarity },
        "OSS semantic cache hit"
      );
      await prisma.oSSIssueCache.update({
        where: { id: result[0].id },
        data: { hitCount: { increment: 1 } },
      });
      return result[0].results as OSSIssue[];
    }
  } catch (error) {
    logger.warn({ error }, "Semantic cache search failed — not critical");
  }
  return null;
}

async function storeInCache(
  queryHash: string,
  normalizedQuery: string,
  queryVec: number[],
  issues: OSSIssue[]
): Promise<void> {
  const expiresAt = new Date(Date.now() + OSS_CACHE_TTL_SECONDS * 1000);

  // Store in Redis (fast reads)
  const redisKey = OSS_REDIS_KEYS.ossCache(queryHash);
  await redis.set(redisKey, JSON.stringify(issues), "EX", OSS_CACHE_TTL_SECONDS);

  // Store in Postgres (persistent, with embedding for semantic search)
  const vectorStr = `[${queryVec.join(",")}]`;
  try {
    await prisma.$executeRaw`
      INSERT INTO "OSSIssueCache" (id, "queryHash", "normalizedQuery", "queryEmbedding", results, "hitCount", "expiresAt", "createdAt", "updatedAt")
      VALUES (
        ${`oss-${queryHash.slice(0, 20)}`},
        ${queryHash},
        ${normalizedQuery},
        ${vectorStr}::vector,
        ${JSON.stringify(issues)}::jsonb,
        1,
        ${expiresAt},
        NOW(),
        NOW()
      )
      ON CONFLICT ("queryHash") DO UPDATE SET
        results = ${JSON.stringify(issues)}::jsonb,
        "hitCount" = "OSSIssueCache"."hitCount" + 1,
        "expiresAt" = ${expiresAt},
        "updatedAt" = NOW()
    `;
  } catch (error) {
    logger.warn({ error }, "Failed to persist OSS cache to Postgres — Redis cache still active");
  }
}

async function logOSSQuery(
  teamId: string,
  query: string,
  cacheHit: boolean,
  resultCount: number,
  latencyMs: number,
  topRepoUrl?: string
): Promise<void> {
  try {
    await prisma.oSSQueryLog.create({
      data: {
        teamId,
        query: query.slice(0, 500),
        cacheHit,
        resultCount,
        topRepoUrl: topRepoUrl ?? null,
        latencyMs,
      },
    });
  } catch (error) {
    logger.warn({ error }, "Failed to log OSS query — non-critical");
  }
}
