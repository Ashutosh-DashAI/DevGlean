import { redis } from "../lib/redis";
import { logger } from "../lib/logger";
import {
  GITHUB_RATE_LIMIT_THRESHOLD,
  OSS_REDIS_KEYS,
} from "@devglean/shared";
import type { OSSRateLimitStatus } from "@devglean/shared";
import type { MiddlewareHandler } from "hono";

/**
 * Gets the current GitHub API rate limit status from Redis.
 */
export async function getRateLimitStatus(): Promise<OSSRateLimitStatus> {
  const key = OSS_REDIS_KEYS.ossRateLimit();
  const data = await redis.get(key);

  if (!data) {
    return { remaining: 30, limit: 30, resetAt: new Date().toISOString(), paused: false };
  }

  const parsed = JSON.parse(data) as OSSRateLimitStatus;
  return parsed;
}

/**
 * Updates the GitHub API rate limit status in Redis (called after every GitHub API call).
 */
export async function updateRateLimitStatus(
  remaining: number,
  limit: number,
  resetTimestamp: number
): Promise<void> {
  const resetAt = new Date(resetTimestamp * 1000).toISOString();
  const paused = remaining < GITHUB_RATE_LIMIT_THRESHOLD;

  const status: OSSRateLimitStatus = { remaining, limit, resetAt, paused };
  const key = OSS_REDIS_KEYS.ossRateLimit();

  // Store with TTL matching the reset window
  const ttl = Math.max(1, resetTimestamp - Math.floor(Date.now() / 1000));
  await redis.set(key, JSON.stringify(status), "EX", ttl);

  if (paused) {
    const cbKey = OSS_REDIS_KEYS.ossCircuitBreaker();
    await redis.set(cbKey, "1", "EX", ttl);
    logger.warn(
      { remaining, resetAt },
      "GitHub API circuit breaker OPEN — OSS queries paused until reset"
    );
  }
}

/**
 * Checks if the circuit breaker is currently open (GitHub API rate limit exhausted).
 */
export async function isCircuitOpen(): Promise<boolean> {
  const cbKey = OSS_REDIS_KEYS.ossCircuitBreaker();
  const open = await redis.get(cbKey);
  return open === "1";
}

/**
 * Middleware that attaches circuit breaker status to the context.
 * Does NOT block requests — the OSS service reads the status and falls back to cache.
 */
export const circuitBreakerMiddleware: MiddlewareHandler = async (c, next) => {
  const open = await isCircuitOpen();
  c.set("ossCircuitOpen" as never, open as never);
  await next();
};
