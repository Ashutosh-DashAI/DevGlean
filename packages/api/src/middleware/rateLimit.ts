import { createMiddleware } from "hono/factory";
import { redis } from "../lib/redis";
import { AppError, REDIS_KEYS } from "@devglean/shared";
import type { Context, Next } from "hono";

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (c: Context) => string;
}

/**
 * Sliding window rate limiter backed by Redis sorted sets.
 * Each request adds a timestamped entry; expired entries are pruned.
 */
export function rateLimit(config: RateLimitConfig) {
  return createMiddleware(async (c: Context, next: Next) => {
    const keyGenerator =
      config.keyGenerator ??
      ((ctx: Context) => {
        const userId = ctx.get("userId") as string | undefined;
        const ip = ctx.req.header("x-forwarded-for") ?? "unknown";
        return userId ?? ip;
      });

    const identifier = keyGenerator(c);
    const key = REDIS_KEYS.rateLimit(`${c.req.path}:${identifier}`);
    const now = Date.now();
    const windowStart = now - config.windowMs;

    const pipeline = redis.pipeline();
    // Remove entries outside the current window
    pipeline.zremrangebyscore(key, 0, windowStart);
    // Count entries in the current window
    pipeline.zcard(key);
    // Add the current request
    pipeline.zadd(key, now, `${now}:${Math.random().toString(36).slice(2)}`);
    // Set TTL on the key
    pipeline.pexpire(key, config.windowMs);

    const results = await pipeline.exec();

    if (!results) {
      // Redis pipeline failed — fail open (allow request)
      await next();
      return;
    }

    const requestCount = results[1]?.[1] as number;

    // Set rate limit headers
    c.header("X-RateLimit-Limit", config.maxRequests.toString());
    c.header("X-RateLimit-Remaining", Math.max(0, config.maxRequests - requestCount - 1).toString());
    c.header("X-RateLimit-Reset", Math.ceil((now + config.windowMs) / 1000).toString());

    if (requestCount >= config.maxRequests) {
      const retryAfter = Math.ceil(config.windowMs / 1000);
      c.header("Retry-After", retryAfter.toString());
      throw AppError.rateLimited(retryAfter);
    }

    await next();
  });
}
