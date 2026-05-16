import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import {
  searchQuerySchema,
  searchFeedbackSchema,
  searchHistoryQuerySchema,
  RATE_LIMITS,
  REDIS_KEYS,
} from "@devglean/shared";
import * as searchService from "../services/search.service";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { authMiddleware } from "../middleware/auth";
import { teamScopeMiddleware } from "../middleware/teamScope";
import { rateLimit } from "../middleware/rateLimit";
import type { AuthUser } from "@devglean/shared";

const searchRoutes = new Hono();

searchRoutes.use("*", authMiddleware, teamScopeMiddleware);

const searchRateLimit = rateLimit(RATE_LIMITS.search);

const suggestionsQuerySchema = z.object({
  q: z.string().min(1).max(100).trim(),
});

// POST /api/v1/search
searchRoutes.post("/", searchRateLimit, async (c) => {
  const body = await c.req.json();
  const input = searchQuerySchema.parse(body);

  const user: AuthUser = {
    id: c.get("userId") as string,
    email: "",
    name: "",
    teamId: c.get("teamId") as string,
    role: c.get("role") as string,
    plan: c.get("plan") as string,
  };

  const aclGroups = c.get("aclGroups") as string[];

  if (input.stream) {
    // SSE streaming response
    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");
    c.header("X-Accel-Buffering", "no");

    return streamSSE(c, async (stream) => {
      const generator = searchService.searchStream(input, user, aclGroups);

      for await (const chunk of generator) {
        await stream.write(chunk);
      }
    });
  }

  // Non-streaming response
  const result = await searchService.search(input, user, aclGroups);
  return c.json(result);
});

// GET /api/v1/search/history
searchRoutes.get("/history", async (c) => {
  const query = searchHistoryQuerySchema.parse(c.req.query());
  const userId = c.get("userId") as string;
  const teamId = c.get("teamId") as string;

  const where: Record<string, unknown> = { teamId, userId };
  if (query.q) {
    where.query = { contains: query.q, mode: "insensitive" };
  }

  const [items, total] = await Promise.all([
    prisma.queryLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true,
        query: true,
        answer: true,
        sourceCount: true,
        latencyMs: true,
        wasHelpful: true,
        createdAt: true,
      },
    }),
    prisma.queryLog.count({ where }),
  ]);

  return c.json({
    items,
    total,
    page: query.page,
    limit: query.limit,
    totalPages: Math.ceil(total / query.limit),
  });
});

// POST /api/v1/search/:queryId/feedback
searchRoutes.post("/:queryId/feedback", async (c) => {
  const queryId = c.req.param("queryId");
  const body = await c.req.json();
  const input = searchFeedbackSchema.parse(body);
  const userId = c.get("userId") as string;

  await prisma.queryLog.updateMany({
    where: { id: queryId, userId },
    data: { wasHelpful: input.helpful },
  });

  return c.json({ success: true });
});

/**
 * GET /api/v1/search/suggestions — Redis ZSET prefix autocomplete (ADR-023).
 *
 * Uses ZRANGEBYLEX for O(log N + M) prefix matching, then re-ranks by
 * frequency score (ZSCORE pipeline). Returns top 5 per-team, per-prefix.
 * Team isolation is enforced via per-team Redis keys.
 */
searchRoutes.get("/suggestions", async (c) => {
  const teamId = c.get("teamId") as string;
  const rawQ = c.req.query("q");

  // Validate or return empty
  const parseResult = suggestionsQuerySchema.safeParse({ q: rawQ });
  if (!parseResult.success) {
    return c.json({ suggestions: [] });
  }

  const prefix = parseResult.data.q.toLowerCase().trim();
  const key = REDIS_KEYS.autocomplete(teamId);

  // ZRANGEBYLEX returns members lexicographically between [prefix and [prefix\xff
  const allMatches = await redis.zrangebylex(
    key,
    `[${prefix}`,
    `[${prefix}\xff`,
    "LIMIT",
    0,
    20
  );

  if (allMatches.length === 0) {
    return c.json({ suggestions: [] });
  }

  // Get scores for matched members to re-rank by frequency
  const scorePipeline = redis.pipeline();
  for (const member of allMatches) {
    scorePipeline.zscore(key, member);
  }
  const scores = await scorePipeline.exec();

  const ranked = allMatches
    .map((query, i) => ({
      query,
      score: Number(scores?.[i]?.[1] ?? 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((r) => r.query);

  return c.json({ suggestions: ranked });
});

export { searchRoutes };
