import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { teamScopeMiddleware } from "../middleware/teamScope";
import { rateLimitMiddleware } from "../middleware/rateLimit";
import { circuitBreakerMiddleware } from "../middleware/circuitBreaker";
import {
  ossSearchSchema,
  ossIssueParamsSchema,
  ossTrendingSchema,
  RATE_LIMITS_OSS,
} from "@devglean/shared";
import * as ossService from "../services/oss.service";

export const ossRoutes = new Hono();

// All OSS routes require auth + team scope
ossRoutes.use("*", authMiddleware);
ossRoutes.use("*", teamScopeMiddleware);
ossRoutes.use("*", rateLimitMiddleware(RATE_LIMITS_OSS.oss));
ossRoutes.use("*", circuitBreakerMiddleware);

/**
 * POST /search — Search resolved OSS issues across GitHub + Stack Exchange
 */
ossRoutes.post("/search", async (c) => {
  const body = await c.req.json();
  const input = ossSearchSchema.parse(body);
  const user = c.get("user" as never) as { teamId: string };
  const team = c.get("team" as never) as { githubAppInstallId: string | null };

  const result = await ossService.search(
    input.query,
    input.filters ?? {},
    user.teamId,
    team.githubAppInstallId ?? undefined
  );

  return c.json(result);
});

/**
 * GET /trending — Top issues being searched globally (anonymized)
 */
ossRoutes.get("/trending", async (c) => {
  const params = ossTrendingSchema.parse({
    language: c.req.query("language"),
    timeframe: c.req.query("timeframe"),
  });

  const trending = await ossService.getTrending(params.language, params.timeframe);

  return c.json({ issues: trending });
});

/**
 * GET /issue/:owner/:repo/:number — Full issue detail with IssueScore breakdown
 */
ossRoutes.get("/issue/:owner/:repo/:number", async (c) => {
  const params = ossIssueParamsSchema.parse({
    owner: c.req.param("owner"),
    repo: c.req.param("repo"),
    number: c.req.param("number"),
  });

  const team = c.get("team" as never) as { githubAppInstallId: string | null };

  const { GitHubOSSConnector } = await import("../connectors/githubOSS.connector");
  const connector = new GitHubOSSConnector();
  const thread = await connector.fetchFullIssueThread(
    params.owner,
    params.repo,
    params.number,
    team.githubAppInstallId ?? undefined
  );

  return c.json({ thread });
});

/**
 * POST /issue/:owner/:repo/:number/synthesize — Claude-synthesized solution
 */
ossRoutes.post("/issue/:owner/:repo/:number/synthesize", async (c) => {
  const params = ossIssueParamsSchema.parse({
    owner: c.req.param("owner"),
    repo: c.req.param("repo"),
    number: c.req.param("number"),
  });

  const team = c.get("team" as never) as { githubAppInstallId: string | null };

  const synthesis = await ossService.synthesizeIssue(
    params.owner,
    params.repo,
    params.number,
    team.githubAppInstallId ?? undefined
  );

  return c.json(synthesis);
});

/**
 * GET /cache/status — OSS cache health metrics
 */
ossRoutes.get("/cache/status", async (c) => {
  const status = await ossService.getCacheStatus();
  return c.json(status);
});
