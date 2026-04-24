import { Worker, Queue } from "bullmq";
import { redis } from "../lib/redis";
import { logger } from "../lib/logger";
import { anthropic } from "../lib/anthropic";
import { OSS_QUEUE_NAMES, CLASSIFIER_MODEL } from "@devglean/shared";
import * as ossService from "../services/oss.service";
import { prisma } from "../lib/prisma";

/**
 * OSS Pre-warm Queue — used to proactively cache results for related queries.
 */
export const ossPrewarmQueue = new Queue(OSS_QUEUE_NAMES.ossPrewarm, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 1, // Pre-warming is best-effort
    priority: 10, // Low priority
  },
});

/**
 * OSS Cache Cleanup Queue — removes expired cache entries nightly.
 */
export const ossCacheCleanupQueue = new Queue(OSS_QUEUE_NAMES.ossCacheCleanup, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 5,
  },
});

/**
 * Pre-warm Worker — generates related query phrasings and pre-fetches OSS results.
 *
 * When a cache miss occurs, this worker:
 * 1. Uses Claude to generate 5 related phrasings of the original query
 * 2. For each phrasing, runs an OSS search (which caches the results)
 * 3. This warms the cache for future semantically-similar questions
 */
export function startOSSPrewarmWorker(): Worker {
  const worker = new Worker(
    OSS_QUEUE_NAMES.ossPrewarm,
    async (job) => {
      const { originalQuery, teamId } = job.data as {
        originalQuery: string;
        teamId: string;
      };

      logger.debug({ originalQuery }, "Pre-warming OSS cache for related queries");

      try {
        // Generate related phrasings using Claude Haiku (fast, cheap)
        const response = await anthropic.messages.create({
          model: CLASSIFIER_MODEL,
          max_tokens: 300,
          system:
            "Generate 5 alternative phrasings of the given developer search query. " +
            "Each phrasing should approach the same problem from a different angle. " +
            'Output ONLY a JSON array of strings: ["phrasing1", "phrasing2", ...]',
          messages: [{ role: "user", content: originalQuery }],
        });

        const textBlock = response.content.find((b) => b.type === "text");
        if (!textBlock) return;

        const phrasings = JSON.parse(textBlock.text) as string[];

        // Search each phrasing (results are automatically cached)
        let warmed = 0;
        for (const phrasing of phrasings.slice(0, 5)) {
          try {
            await ossService.search(phrasing, {}, teamId);
            warmed++;
          } catch {
            // Best-effort — continue on failure
          }
        }

        logger.debug(
          { originalQuery, warmedCount: warmed },
          "OSS cache pre-warming complete"
        );
      } catch (error) {
        logger.warn({ error, originalQuery }, "OSS pre-warm failed — non-critical");
      }
    },
    {
      connection: redis,
      concurrency: 1, // Low concurrency to avoid rate limit exhaustion
      limiter: { max: 3, duration: 60_000 }, // Max 3 pre-warm jobs per minute
    }
  );

  worker.on("error", (err) => {
    logger.error({ error: err }, "OSS prewarm worker error");
  });

  return worker;
}

/**
 * Cache Cleanup Worker — removes expired OSS cache entries.
 * Runs as a repeatable job on a nightly schedule.
 */
export function startOSSCacheCleanupWorker(): Worker {
  const worker = new Worker(
    OSS_QUEUE_NAMES.ossCacheCleanup,
    async () => {
      logger.info("Running OSS cache cleanup");

      const result = await prisma.oSSIssueCache.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });

      logger.info(
        { deletedCount: result.count },
        "OSS cache cleanup complete"
      );
    },
    { connection: redis, concurrency: 1 }
  );

  // Schedule nightly cleanup
  ossCacheCleanupQueue.add(
    "nightly-cleanup",
    {},
    {
      repeat: {
        pattern: "0 3 * * *", // 3 AM daily
      },
    }
  );

  worker.on("error", (err) => {
    logger.error({ error: err }, "OSS cache cleanup worker error");
  });

  return worker;
}
