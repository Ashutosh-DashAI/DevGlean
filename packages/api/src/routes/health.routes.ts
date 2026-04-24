import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";

const healthRoutes = new Hono();

// GET /health
healthRoutes.get("/", async (c) => {
  let dbStatus = "ok";
  let redisStatus = "ok";

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "error";
  }

  try {
    await redis.ping();
  } catch {
    redisStatus = "error";
  }

  const status = dbStatus === "ok" && redisStatus === "ok" ? "ok" : "degraded";

  return c.json({
    status,
    db: dbStatus,
    redis: redisStatus,
    version: "0.1.0",
    timestamp: new Date().toISOString(),
  });
});

// GET /health/deep
healthRoutes.get("/deep", async (c) => {
  const checks: Record<string, { status: string; latencyMs: number; error?: string }> = {};

  // Database check
  const dbStart = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks["database"] = { status: "ok", latencyMs: Math.round(performance.now() - dbStart) };
  } catch (err) {
    checks["database"] = {
      status: "error",
      latencyMs: Math.round(performance.now() - dbStart),
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }

  // Redis check
  const redisStart = performance.now();
  try {
    await redis.ping();
    checks["redis"] = { status: "ok", latencyMs: Math.round(performance.now() - redisStart) };
  } catch (err) {
    checks["redis"] = {
      status: "error",
      latencyMs: Math.round(performance.now() - redisStart),
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }

  // pgvector extension check
  const pgvStart = performance.now();
  try {
    await prisma.$queryRaw`SELECT extversion FROM pg_extension WHERE extname = 'vector'`;
    checks["pgvector"] = { status: "ok", latencyMs: Math.round(performance.now() - pgvStart) };
  } catch (err) {
    checks["pgvector"] = {
      status: "error",
      latencyMs: Math.round(performance.now() - pgvStart),
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }

  const allOk = Object.values(checks).every((check) => check.status === "ok");

  return c.json({
    status: allOk ? "ok" : "degraded",
    checks,
    version: "0.1.0",
    timestamp: new Date().toISOString(),
  });
});

// GET /metrics (Prometheus-compatible)
healthRoutes.get("/metrics", async (c) => {
  const metrics: string[] = [];

  // Basic application metrics
  const uptime = process.uptime();
  metrics.push(`# HELP devglean_uptime_seconds Application uptime in seconds`);
  metrics.push(`# TYPE devglean_uptime_seconds gauge`);
  metrics.push(`devglean_uptime_seconds ${uptime.toFixed(2)}`);

  // Memory metrics
  const memUsage = process.memoryUsage();
  metrics.push(`# HELP devglean_memory_heap_used_bytes Heap memory used`);
  metrics.push(`# TYPE devglean_memory_heap_used_bytes gauge`);
  metrics.push(`devglean_memory_heap_used_bytes ${memUsage.heapUsed}`);

  metrics.push(`# HELP devglean_memory_rss_bytes Resident set size`);
  metrics.push(`# TYPE devglean_memory_rss_bytes gauge`);
  metrics.push(`devglean_memory_rss_bytes ${memUsage.rss}`);

  // Document count
  try {
    const docCount = await prisma.document.count();
    metrics.push(`# HELP devglean_documents_total Total indexed documents`);
    metrics.push(`# TYPE devglean_documents_total gauge`);
    metrics.push(`devglean_documents_total ${docCount}`);
  } catch {
    // Skip if DB unavailable
  }

  // Team count
  try {
    const teamCount = await prisma.team.count();
    metrics.push(`# HELP devglean_teams_total Total teams`);
    metrics.push(`# TYPE devglean_teams_total gauge`);
    metrics.push(`devglean_teams_total ${teamCount}`);
  } catch {
    // Skip if DB unavailable
  }

  c.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  return c.text(metrics.join("\n") + "\n");
});

export { healthRoutes };
