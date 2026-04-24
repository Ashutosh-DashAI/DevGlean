import { createApp } from "./app";
import { env } from "./env";
import { logger } from "./lib/logger";
import { startSyncWorker } from "./jobs/sync.worker";
import { registerScheduledJobs } from "./jobs/scheduler";

const app = createApp();

// Start BullMQ workers
const syncWorker = startSyncWorker();
logger.info("Sync worker started");

// Register scheduled jobs for active connectors
registerScheduledJobs().catch((err) => {
  logger.error({ err }, "Failed to register scheduled jobs");
});

// Start HTTP server
const server = Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
});

logger.info(
  {
    port: env.PORT,
    env: env.NODE_ENV,
    url: `http://localhost:${env.PORT}`,
  },
  `🚀 DevGlean API running on port ${env.PORT}`
);

// Graceful shutdown
const shutdown = async () => {
  logger.info("Shutting down gracefully...");

  await syncWorker.close();
  server.stop();

  logger.info("Shutdown complete");
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
