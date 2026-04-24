import { Hono } from "hono";
import { authMiddleware, requireRole } from "../middleware/auth";
import { teamScopeMiddleware } from "../middleware/teamScope";
import * as analyticsService from "../services/analytics.service";
import {
  analyticsOverviewQuerySchema,
  analyticsQueriesQuerySchema,
  analyticsTopQueriesQuerySchema,
} from "@devglean/shared";

const analyticsRoutes = new Hono();

analyticsRoutes.use("*", authMiddleware, teamScopeMiddleware);

// GET /api/v1/analytics/overview
analyticsRoutes.get("/overview", requireRole("ADMIN", "OWNER"), async (c) => {
  const teamId = c.get("teamId") as string;
  const overview = await analyticsService.getOverview(teamId);
  return c.json(overview);
});

// GET /api/v1/analytics/queries
analyticsRoutes.get("/queries", requireRole("ADMIN", "OWNER"), async (c) => {
  const teamId = c.get("teamId") as string;
  const query = analyticsQueriesQuerySchema.parse(c.req.query());

  const data = await analyticsService.getQueryVolume(
    teamId,
    { from: query.from, to: query.to },
    query.granularity
  );

  return c.json({ data });
});

// GET /api/v1/analytics/queries/top
analyticsRoutes.get("/queries/top", requireRole("ADMIN", "OWNER"), async (c) => {
  const teamId = c.get("teamId") as string;
  const query = analyticsTopQueriesQuerySchema.parse(c.req.query());

  const data = await analyticsService.getTopQueries(teamId, query.limit, {
    from: query.from,
    to: query.to,
  });

  return c.json({ data });
});

// GET /api/v1/analytics/queries/slow
analyticsRoutes.get("/queries/slow", requireRole("ADMIN", "OWNER"), async (c) => {
  const teamId = c.get("teamId") as string;
  const data = await analyticsService.getSlowQueries(teamId);
  return c.json({ data });
});

// GET /api/v1/analytics/connectors/health
analyticsRoutes.get("/connectors/health", requireRole("ADMIN", "OWNER"), async (c) => {
  const teamId = c.get("teamId") as string;
  const data = await analyticsService.getConnectorHealth(teamId);
  return c.json({ data });
});

// GET /api/v1/analytics/usage
analyticsRoutes.get("/usage", async (c) => {
  const teamId = c.get("teamId") as string;
  const plan = c.get("plan") as string;
  const data = await analyticsService.getUsage(teamId, plan);
  return c.json(data);
});

export { analyticsRoutes };
