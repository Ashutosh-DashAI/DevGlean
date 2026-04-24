import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  searchQuerySchema,
  searchFeedbackSchema,
  searchHistoryQuerySchema,
  RATE_LIMITS,
} from "@devglean/shared";
import * as searchService from "../services/search.service";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";
import { teamScopeMiddleware } from "../middleware/teamScope";
import { rateLimit } from "../middleware/rateLimit";
import type { AuthUser } from "@devglean/shared";

const searchRoutes = new Hono();

searchRoutes.use("*", authMiddleware, teamScopeMiddleware);

const searchRateLimit = rateLimit(RATE_LIMITS.search);

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

// GET /api/v1/search/suggestions
searchRoutes.get("/suggestions", async (c) => {
  const teamId = c.get("teamId") as string;
  const q = c.req.query("q") ?? "";

  const recentQueries = await prisma.queryLog.findMany({
    where: {
      teamId,
      ...(q ? { query: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { query: true },
    distinct: ["query"],
  });

  return c.json({
    suggestions: recentQueries.map((q) => q.query),
  });
});

export { searchRoutes };
