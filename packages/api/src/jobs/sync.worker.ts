import { Worker, type ConnectionOptions } from "bullmq";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { logger } from "../lib/logger";
import { decrypt } from "../lib/crypto";
import { githubConnector } from "../connectors/github.connector";
import { notionConnector } from "../connectors/notion.connector";
import { slackConnector } from "../connectors/slack.connector";
import { linearConnector } from "../connectors/linear.connector";
import { jiraConnector } from "../connectors/jira.connector";
import { chunkDocument, enrichChunkContent } from "../services/chunker.service";
import * as embeddingService from "../services/embedding.service";
import { QUEUE_NAMES } from "@devglean/shared";
import type { SyncJobData } from "./queue";
import type { BaseConnector } from "../connectors/base.connector";
import type { ConnectorType } from "@devglean/db";

const connectorMap: Record<string, BaseConnector> = {
  GITHUB: githubConnector,
  NOTION: notionConnector,
  SLACK: slackConnector,
  LINEAR: linearConnector,
  JIRA: jiraConnector,
};

const connection: ConnectionOptions = {
  host: redis.options.host ?? "localhost",
  port: redis.options.port ?? 6379,
};

export function startSyncWorker(): Worker {
  const worker = new Worker<SyncJobData>(
    QUEUE_NAMES.connectorSync,
    async (job) => {
      const { connectorId, fullSync, teamId } = job.data;
      const log = logger.child({ connectorId, jobId: job.id, teamId });

      log.info("Starting connector sync");

      // Create sync job record
      const syncJob = await prisma.syncJob.create({
        data: {
          connectorId,
          status: "RUNNING",
        },
      });

      try {
        // Fetch connector
        const connector = await prisma.connector.findUnique({
          where: { id: connectorId },
        });

        if (!connector) {
          throw new Error(`Connector ${connectorId} not found`);
        }

        const engine = connectorMap[connector.type];
        if (!engine) {
          throw new Error(`No connector engine for type: ${connector.type}`);
        }

        // Decrypt OAuth token
        const accessToken = decrypt(connector.oauthToken);

        // Fetch documents
        const cursor = fullSync ? null : (connector.syncCursor as Record<string, unknown> | null);
        const { docs, nextCursor } = await engine.fetchDiff(
          accessToken,
          cursor,
          connector.config as Record<string, unknown> | undefined
        );

        log.info({ docCount: docs.length }, "Fetched documents from source");

        let docsIndexed = 0;
        let docsUpdated = 0;

        // Process each document
        for (const doc of docs) {
          // Chunk the document
          const chunks = chunkDocument({
            title: doc.title,
            content: doc.content,
            sourceUrl: doc.sourceUrl,
            metadata: doc.metadata,
          });

          for (const chunk of chunks) {
            // Check if content already exists (skip re-embed)
            const existing = await prisma.document.findUnique({
              where: {
                teamId_sourceId_chunkIndex: {
                  teamId,
                  sourceId: doc.sourceId,
                  chunkIndex: chunk.chunkIndex,
                },
              },
              select: { id: true, contentHash: true },
            });

            if (existing?.contentHash === chunk.contentHash) {
              continue; // Content unchanged, skip
            }

            // Generate embedding for enriched content
            const enrichedContent = enrichChunkContent(
              doc.title,
              connector.type,
              chunk.content
            );
            const embedding = await embeddingService.embed(enrichedContent);
            const vectorStr = `[${embedding.join(",")}]`;

            // Upsert document chunk
            if (existing) {
              await prisma.$executeRawUnsafe(
                `UPDATE "Document" SET
                  content = $1,
                  embedding = $2::vector,
                  "contentHash" = $3,
                  "chunkTotal" = $4,
                  metadata = $5::jsonb,
                  "aclGroups" = $6::text[],
                  "sourceUrl" = $7,
                  title = $8,
                  version = version + 1,
                  "updatedAt" = NOW()
                WHERE id = $9`,
                chunk.content,
                vectorStr,
                chunk.contentHash,
                chunk.chunkTotal,
                JSON.stringify(chunk.metadata),
                doc.aclGroups,
                doc.sourceUrl,
                doc.title,
                existing.id
              );
              docsUpdated++;
            } else {
              await prisma.$executeRawUnsafe(
                `INSERT INTO "Document" (
                  id, "teamId", "connectorId", "sourceType", "sourceId",
                  "sourceUrl", title, content, embedding, "chunkIndex",
                  "chunkTotal", metadata, "aclGroups", "contentHash",
                  "createdAt", "updatedAt"
                ) VALUES (
                  gen_random_uuid()::text, $1, $2, $3::"ConnectorType", $4,
                  $5, $6, $7, $8::vector, $9,
                  $10, $11::jsonb, $12::text[], $13,
                  NOW(), NOW()
                )`,
                teamId,
                connectorId,
                connector.type,
                doc.sourceId,
                doc.sourceUrl,
                doc.title,
                chunk.content,
                vectorStr,
                chunk.chunkIndex,
                chunk.chunkTotal,
                JSON.stringify(chunk.metadata),
                doc.aclGroups,
                chunk.contentHash
              );
              docsIndexed++;
            }
          }
        }

        // Update connector
        await prisma.connector.update({
          where: { id: connectorId },
          data: {
            syncCursor: nextCursor as Record<string, unknown>,
            lastSyncedAt: new Date(),
            lastSyncStatus: "SUCCESS",
            lastSyncError: null,
          },
        });

        // Update sync job
        await prisma.syncJob.update({
          where: { id: syncJob.id },
          data: {
            status: "SUCCESS",
            docsIndexed,
            docsUpdated,
            completedAt: new Date(),
          },
        });

        log.info(
          { docsIndexed, docsUpdated },
          "Connector sync completed"
        );
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";

        log.error({ err }, "Connector sync failed");

        await prisma.connector.update({
          where: { id: connectorId },
          data: {
            lastSyncStatus: "FAILED",
            lastSyncError: errorMessage,
          },
        });

        await prisma.syncJob.update({
          where: { id: syncJob.id },
          data: {
            status: "FAILED",
            errorMessage,
            completedAt: new Date(),
          },
        });

        throw err; // Re-throw for BullMQ retry
      }
    },
    {
      connection,
      concurrency: 3,
    }
  );

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, err: err.message },
      "Sync worker job failed"
    );
  });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Sync worker job completed");
  });

  return worker;
}
