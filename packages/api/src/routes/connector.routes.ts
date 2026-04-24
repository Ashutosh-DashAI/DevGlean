import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { encrypt } from "../lib/crypto";
import { generateSecureToken } from "../lib/crypto";
import { authMiddleware, requireRole } from "../middleware/auth";
import { teamScopeMiddleware } from "../middleware/teamScope";
import { syncQueue } from "../jobs/queue";
import { scheduleConnectorSync, removeConnectorSync } from "../jobs/scheduler";
import {
  connectorTypeParamSchema,
  connectorUpdateSchema,
  oauthCallbackSchema,
  AppError,
  ErrorCode,
  OAUTH_STATE_TTL_SECONDS,
  REDIS_KEYS,
  PLAN_LIMITS,
} from "@devglean/shared";
import { githubConnector } from "../connectors/github.connector";
import { notionConnector } from "../connectors/notion.connector";
import { slackConnector } from "../connectors/slack.connector";
import { linearConnector } from "../connectors/linear.connector";
import { jiraConnector } from "../connectors/jira.connector";
import { env } from "../env";
import { logger } from "../lib/logger";
import { createHmac } from "crypto";
import type { BaseConnector } from "../connectors/base.connector";

const connectorRoutes = new Hono();

connectorRoutes.use("*", authMiddleware, teamScopeMiddleware);

const connectorMap: Record<string, BaseConnector> = {
  github: githubConnector,
  notion: notionConnector,
  slack: slackConnector,
  linear: linearConnector,
  jira: jiraConnector,
};

// GET /api/v1/connectors
connectorRoutes.get("/", async (c) => {
  const teamId = c.get("teamId") as string;

  const connectors = await prisma.connector.findMany({
    where: { teamId },
    include: {
      _count: { select: { documents: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({
    connectors: connectors.map((conn) => ({
      id: conn.id,
      type: conn.type,
      displayName: conn.displayName,
      status: conn.status,
      lastSyncStatus: conn.lastSyncStatus,
      lastSyncedAt: conn.lastSyncedAt?.toISOString() ?? null,
      lastSyncError: conn.lastSyncError,
      documentCount: conn._count.documents,
      createdAt: conn.createdAt.toISOString(),
    })),
  });
});

// GET /api/v1/connectors/:id
connectorRoutes.get("/:id", async (c) => {
  const teamId = c.get("teamId") as string;
  const id = c.req.param("id");

  const connector = await prisma.connector.findFirst({
    where: { id, teamId },
    include: {
      _count: { select: { documents: true } },
      syncJobs: {
        orderBy: { startedAt: "desc" },
        take: 10,
      },
    },
  });

  if (!connector) {
    throw AppError.notFound("Connector");
  }

  return c.json({
    id: connector.id,
    type: connector.type,
    displayName: connector.displayName,
    status: connector.status,
    lastSyncStatus: connector.lastSyncStatus,
    lastSyncedAt: connector.lastSyncedAt?.toISOString() ?? null,
    lastSyncError: connector.lastSyncError,
    documentCount: connector._count.documents,
    config: connector.config,
    syncJobs: connector.syncJobs.map((job) => ({
      id: job.id,
      status: job.status,
      docsIndexed: job.docsIndexed,
      docsUpdated: job.docsUpdated,
      docsDeleted: job.docsDeleted,
      errorMessage: job.errorMessage,
      startedAt: job.startedAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
    })),
    createdAt: connector.createdAt.toISOString(),
  });
});

// POST /api/v1/connectors/:type/oauth/start
connectorRoutes.post("/:type/oauth/start", async (c) => {
  const typeParam = c.req.param("type");
  const parsedType = connectorTypeParamSchema.parse(typeParam);
  const teamId = c.get("teamId") as string;
  const plan = c.get("plan") as string;

  // Check connector limit
  const currentCount = await prisma.connector.count({ where: { teamId } });
  const planKey = plan as keyof typeof PLAN_LIMITS;
  const limit = PLAN_LIMITS[planKey]?.maxConnectors ?? PLAN_LIMITS.FREE.maxConnectors;

  if (currentCount >= limit) {
    throw AppError.planLimitExceeded("connectors");
  }

  const engine = connectorMap[parsedType];
  if (!engine) {
    throw AppError.notFound("Connector type");
  }

  // Generate HMAC-signed state
  const stateNonce = crypto.randomUUID();
  const statePayload = `${stateNonce}:${teamId}`;
  const hmac = createHmac("sha256", env.JWT_SECRET)
    .update(statePayload)
    .digest("hex");
  const state = `${statePayload}:${hmac}`;

  // Store state in Redis for CSRF protection
  await redis.set(
    REDIS_KEYS.oauthState(stateNonce),
    JSON.stringify({ teamId, type: parsedType }),
    "EX",
    OAUTH_STATE_TTL_SECONDS
  );

  const redirectUri = `${env.API_BASE_URL}/api/v1/connectors/${parsedType}/oauth/callback`;
  const authUrl = engine.buildOAuthUrl(state, redirectUri);

  return c.json({ authUrl, state: stateNonce });
});

// POST /api/v1/connectors/:type/oauth/callback
connectorRoutes.post("/:type/oauth/callback", async (c) => {
  const typeParam = c.req.param("type");
  const parsedType = connectorTypeParamSchema.parse(typeParam);
  const body = await c.req.json();
  const { code, state } = oauthCallbackSchema.parse(body);
  const teamId = c.get("teamId") as string;

  // Validate state
  const parts = state.split(":");
  if (parts.length !== 3) {
    throw new AppError(ErrorCode.OAUTH_STATE_INVALID, "Invalid OAuth state", 400);
  }

  const [nonce, stateTeamId, hmacSig] = parts as [string, string, string];

  // Verify HMAC
  const expectedHmac = createHmac("sha256", env.JWT_SECRET)
    .update(`${nonce}:${stateTeamId}`)
    .digest("hex");

  if (hmacSig !== expectedHmac || stateTeamId !== teamId) {
    throw new AppError(ErrorCode.OAUTH_STATE_INVALID, "OAuth state validation failed", 400);
  }

  // Check Redis (replay protection)
  const stored = await redis.get(REDIS_KEYS.oauthState(nonce));
  if (!stored) {
    throw new AppError(ErrorCode.OAUTH_STATE_INVALID, "OAuth state expired", 400);
  }
  await redis.del(REDIS_KEYS.oauthState(nonce));

  const engine = connectorMap[parsedType];
  if (!engine) {
    throw AppError.notFound("Connector type");
  }

  const redirectUri = `${env.API_BASE_URL}/api/v1/connectors/${parsedType}/oauth/callback`;
  const tokens = await engine.exchangeCode(code, redirectUri);

  // Encrypt tokens before storage
  const encryptedAccessToken = encrypt(tokens.accessToken);
  const encryptedRefreshToken = tokens.refreshToken
    ? encrypt(tokens.refreshToken)
    : null;

  const webhookSecret = generateSecureToken(32);

  const connector = await prisma.connector.create({
    data: {
      teamId,
      type: parsedType.toUpperCase() as "GITHUB" | "NOTION" | "SLACK" | "LINEAR" | "JIRA",
      displayName: `${parsedType.charAt(0).toUpperCase() + parsedType.slice(1)} Connector`,
      oauthToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      tokenExpiresAt: tokens.expiresAt,
      workspaceId: tokens.workspaceId,
      webhookSecret,
      status: "ACTIVE",
    },
  });

  // Trigger initial full sync
  await syncQueue.add(`sync:${connector.id}:initial`, {
    connectorId: connector.id,
    fullSync: true,
    teamId,
  });

  // Schedule repeating sync
  await scheduleConnectorSync(connector.id, teamId);

  logger.info(
    { connectorId: connector.id, type: parsedType },
    "Connector created and initial sync queued"
  );

  return c.json({
    connector: {
      id: connector.id,
      type: connector.type,
      displayName: connector.displayName,
      status: connector.status,
    },
  }, 201);
});

// PATCH /api/v1/connectors/:id
connectorRoutes.patch("/:id", requireRole("ADMIN", "OWNER"), async (c) => {
  const teamId = c.get("teamId") as string;
  const id = c.req.param("id");
  const body = await c.req.json();
  const input = connectorUpdateSchema.parse(body);

  const connector = await prisma.connector.findFirst({
    where: { id, teamId },
  });

  if (!connector) {
    throw AppError.notFound("Connector");
  }

  const updated = await prisma.connector.update({
    where: { id },
    data: {
      ...(input.displayName && { displayName: input.displayName }),
      ...(input.config && { config: input.config }),
    },
  });

  return c.json({
    id: updated.id,
    type: updated.type,
    displayName: updated.displayName,
    config: updated.config,
  });
});

// DELETE /api/v1/connectors/:id
connectorRoutes.delete("/:id", requireRole("ADMIN", "OWNER"), async (c) => {
  const teamId = c.get("teamId") as string;
  const id = c.req.param("id");

  const connector = await prisma.connector.findFirst({
    where: { id, teamId },
  });

  if (!connector) {
    throw AppError.notFound("Connector");
  }

  // Remove scheduled sync
  await removeConnectorSync(id);

  // Delete connector (cascades to documents and sync jobs)
  await prisma.connector.delete({ where: { id } });

  return c.json({ success: true });
});

// POST /api/v1/connectors/:id/sync
connectorRoutes.post("/:id/sync", requireRole("ADMIN", "OWNER"), async (c) => {
  const teamId = c.get("teamId") as string;
  const id = c.req.param("id");

  const connector = await prisma.connector.findFirst({
    where: { id, teamId },
  });

  if (!connector) {
    throw AppError.notFound("Connector");
  }

  const job = await syncQueue.add(`sync:${id}:manual`, {
    connectorId: id,
    fullSync: true,
    teamId,
  });

  return c.json({ jobId: job.id });
});

// POST /api/v1/connectors/:id/pause
connectorRoutes.post("/:id/pause", requireRole("ADMIN", "OWNER"), async (c) => {
  const teamId = c.get("teamId") as string;
  const id = c.req.param("id");

  await prisma.connector.updateMany({
    where: { id, teamId },
    data: { status: "PAUSED" },
  });

  await removeConnectorSync(id);

  return c.json({ success: true });
});

// POST /api/v1/connectors/:id/resume
connectorRoutes.post("/:id/resume", requireRole("ADMIN", "OWNER"), async (c) => {
  const teamId = c.get("teamId") as string;
  const id = c.req.param("id");

  await prisma.connector.updateMany({
    where: { id, teamId },
    data: { status: "ACTIVE" },
  });

  await scheduleConnectorSync(id, teamId);

  return c.json({ success: true });
});

// GET /api/v1/connectors/:id/jobs
connectorRoutes.get("/:id/jobs", async (c) => {
  const teamId = c.get("teamId") as string;
  const id = c.req.param("id");

  const connector = await prisma.connector.findFirst({
    where: { id, teamId },
    select: { id: true },
  });

  if (!connector) {
    throw AppError.notFound("Connector");
  }

  const jobs = await prisma.syncJob.findMany({
    where: { connectorId: id },
    orderBy: { startedAt: "desc" },
    take: 50,
  });

  return c.json({
    jobs: jobs.map((j) => ({
      id: j.id,
      status: j.status,
      docsIndexed: j.docsIndexed,
      docsUpdated: j.docsUpdated,
      docsDeleted: j.docsDeleted,
      errorMessage: j.errorMessage,
      startedAt: j.startedAt.toISOString(),
      completedAt: j.completedAt?.toISOString() ?? null,
    })),
  });
});

export { connectorRoutes };
