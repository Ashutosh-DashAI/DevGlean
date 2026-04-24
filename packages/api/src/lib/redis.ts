import Redis from "ioredis";
import { env } from "../env";
import { logger } from "./logger";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createRedisClient(): Redis {
  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy(times: number) {
      const delay = Math.min(times * 100, 3000);
      return delay;
    },
  });

  client.on("connect", () => {
    logger.info("Redis connected");
  });

  client.on("error", (err: Error) => {
    logger.error({ err }, "Redis connection error");
  });

  client.on("close", () => {
    logger.warn("Redis connection closed");
  });

  return client;
}

export const redis: Redis =
  globalForRedis.redis ?? createRedisClient();

if (env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}
