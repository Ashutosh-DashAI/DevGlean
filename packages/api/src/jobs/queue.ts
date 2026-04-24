import { Queue, type ConnectionOptions } from "bullmq";
import { redis } from "../lib/redis";
import { QUEUE_NAMES } from "@devglean/shared";

const connection: ConnectionOptions = {
  host: redis.options.host ?? "localhost",
  port: redis.options.port ?? 6379,
};

export const syncQueue = new Queue(QUEUE_NAMES.connectorSync, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

export const embeddingQueue = new Queue(QUEUE_NAMES.embedding, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 50 },
  },
});

export interface SyncJobData {
  connectorId: string;
  fullSync: boolean;
  teamId: string;
}

export interface EmbedJobData {
  documentId: string;
  content: string;
  teamId: string;
}
