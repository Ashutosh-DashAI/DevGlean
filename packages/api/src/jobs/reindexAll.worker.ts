import { prisma } from "../lib/prisma";
import { syncQueue } from "./queue";
import { logger } from "../lib/logger";
import * as embeddingService from "../services/embedding.service";
import { SYNC_INTERVAL_MINUTES } from "@devglean/shared";

/**
 * Re-indexes all documents to a new embedding model.
 * Iterates in batches of 50 to avoid memory pressure and API timeouts.
 */
export async function reindexAllDocuments(): Promise<void> {
  logger.info("Starting full document re-index to voyage-code-3...");

  const batchSize = 50;
  let processedCount = 0;
  let totalDocuments = await prisma.document.count();

  logger.info({ totalDocuments }, "Total documents to re-index");

  while (true) {
    const docs = await prisma.document.findMany({
      where: {
        // Only re-index docs that don't match the target model
        embeddingModel: { not: "voyage-code-3" },
      },
      take: batchSize,
    });

    if (docs.length === 0) break;

    const texts = docs.map(d => d.content);
    const embeddings = await embeddingService.embedBatch(texts);

    // Update documents in a transaction
    await prisma.$transaction(
      docs.map((doc, i) => {
        const embedding = embeddings[i];
        return prisma.document.update({
          where: { id: doc.id },
          data: {
            embedding: embedding as any,
            embeddingModel: "voyage-code-3"
          },
        });
      })
    );

    processedCount += docs.length;
    logger.info(`Re-indexed ${processedCount}/${totalDocuments} documents...`);
  }

  logger.info("Full document re-index complete.");
}

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
