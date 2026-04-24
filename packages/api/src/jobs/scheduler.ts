import { prisma } from "../lib/prisma";
import { syncQueue } from "./queue";
import { logger } from "../lib/logger";
import { SYNC_INTERVAL_MINUTES } from "@devglean/shared";

/**
 * Registers repeatable sync jobs for all active connectors.
 * Called on server startup and when connectors are created/resumed.
 */
export async function registerScheduledJobs(): Promise<void> {
  const activeConnectors = await prisma.connector.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, teamId: true, type: true },
  });

  for (const connector of activeConnectors) {
    await scheduleConnectorSync(connector.id, connector.teamId);
  }

  logger.info(
    { count: activeConnectors.length },
    "Registered scheduled sync jobs for active connectors"
  );
}

/**
 * Schedule a repeatable sync job for a single connector.
 */
export async function scheduleConnectorSync(
  connectorId: string,
  teamId: string
): Promise<void> {
  const jobId = `sync:${connectorId}`;

  await syncQueue.upsertJobScheduler(
    jobId,
    {
      every: SYNC_INTERVAL_MINUTES * 60 * 1000,
    },
    {
      name: jobId,
      data: {
        connectorId,
        fullSync: false,
        teamId,
      },
    }
  );

  logger.debug(
    { connectorId, intervalMinutes: SYNC_INTERVAL_MINUTES },
    "Scheduled connector sync"
  );
}

/**
 * Remove the scheduled sync job for a connector (on pause/delete).
 */
export async function removeConnectorSync(
  connectorId: string
): Promise<void> {
  const jobId = `sync:${connectorId}`;
  await syncQueue.removeJobScheduler(jobId);

  logger.debug({ connectorId }, "Removed connector sync schedule");
}
