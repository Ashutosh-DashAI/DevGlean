import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

interface AnalyticsDateRange {
  from?: string;
  to?: string;
}

export async function getOverview(teamId: string) {
  const [totalQueries, avgLatency, documentCount, activeConnectors, monthlyQueries] =
    await Promise.all([
      prisma.queryLog.count({ where: { teamId } }),

      prisma.queryLog.aggregate({
        where: { teamId },
        _avg: { latencyMs: true },
      }),

      prisma.document.count({ where: { teamId } }),

      prisma.connector.count({
        where: { teamId, status: "ACTIVE" },
      }),

      prisma.queryLog.count({
        where: {
          teamId,
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
    ]);

  return {
    totalQueries,
    avgLatencyMs: Math.round(avgLatency._avg.latencyMs ?? 0),
    documentCount,
    activeConnectors,
    queriesThisMonth: monthlyQueries,
  };
}

export async function getQueryVolume(
  teamId: string,
  range: AnalyticsDateRange,
  granularity: "day" | "week"
) {
  const from = range.from
    ? new Date(range.from)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = range.to ? new Date(range.to) : new Date();

  const interval = granularity === "week" ? "1 week" : "1 day";

  const rows = await prisma.$queryRaw<{ date: Date; count: bigint }[]>`
    SELECT date_trunc(${granularity}, "createdAt") AS date, COUNT(*)::bigint AS count
    FROM "QueryLog"
    WHERE "teamId" = ${teamId}
      AND "createdAt" >= ${from}
      AND "createdAt" <= ${to}
    GROUP BY date_trunc(${granularity}, "createdAt")
    ORDER BY date ASC
  `;

  return rows.map((r) => ({
    date: r.date.toISOString().split("T")[0],
    count: Number(r.count),
  }));
}

export async function getTopQueries(
  teamId: string,
  limit: number,
  range?: AnalyticsDateRange
) {
  const from = range?.from
    ? new Date(range.from)
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const to = range?.to ? new Date(range.to) : new Date();

  const rows = await prisma.$queryRaw<
    { query: string; count: bigint; avg_latency: number }[]
  >`
    SELECT query, COUNT(*)::bigint AS count, AVG("latencyMs")::float AS avg_latency
    FROM "QueryLog"
    WHERE "teamId" = ${teamId}
      AND "createdAt" >= ${from}
      AND "createdAt" <= ${to}
    GROUP BY query
    ORDER BY count DESC
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    query: r.query,
    count: Number(r.count),
    avgLatencyMs: Math.round(r.avg_latency),
  }));
}

export async function getSlowQueries(teamId: string, limit = 20) {
  const rows = await prisma.queryLog.findMany({
    where: { teamId },
    orderBy: { latencyMs: "desc" },
    take: limit,
    select: {
      id: true,
      query: true,
      latencyMs: true,
      sourceCount: true,
      tokensUsed: true,
      createdAt: true,
    },
  });

  return rows;
}

export async function getConnectorHealth(teamId: string) {
  const connectors = await prisma.connector.findMany({
    where: { teamId },
    include: {
      _count: { select: { documents: true } },
      syncJobs: {
        orderBy: { startedAt: "desc" },
        take: 10,
        select: { status: true },
      },
    },
  });

  return connectors.map((c) => {
    const totalJobs = c.syncJobs.length;
    const successJobs = c.syncJobs.filter((j) => j.status === "SUCCESS").length;

    return {
      connectorId: c.id,
      displayName: c.displayName,
      type: c.type,
      status: c.status,
      documentCount: c._count.documents,
      successRate: totalJobs > 0 ? Math.round((successJobs / totalJobs) * 100) : 0,
      lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
      lastError: c.lastSyncError,
    };
  });
}

export async function getUsage(teamId: string, plan: string) {
  const month = new Date().toISOString().slice(0, 7);

  const [queriesUsed, connectorsUsed, team] = await Promise.all([
    prisma.queryLog.count({
      where: {
        teamId,
        createdAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
    }),
    prisma.connector.count({ where: { teamId } }),
    prisma.team.findUnique({
      where: { id: teamId },
      select: { plan: true, stripeSubscriptionId: true },
    }),
  ]);

  const planLimits = {
    FREE: { queries: 1000, connectors: 1 },
    PRO: { queries: 10000, connectors: 50 },
    ENTERPRISE: { queries: 100000, connectors: 500 },
  };

  const limits = planLimits[plan as keyof typeof planLimits] ?? planLimits.FREE;

  return {
    queriesUsed,
    queriesLimit: limits.queries,
    connectorsUsed,
    connectorsLimit: limits.connectors,
    plan: team?.plan ?? "FREE",
    billingPeriodEnd: null,
  };
}
