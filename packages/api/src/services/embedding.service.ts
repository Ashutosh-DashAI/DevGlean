import * as voyage from "../lib/voyage";
import { redis } from "../lib/redis";
import { sha256 } from "../lib/crypto";
import { logger } from "../lib/logger";
import {
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_CACHE_TTL_SECONDS,
  QUERY_EMBEDDING_CACHE_TTL_SECONDS,
  REDIS_KEYS,
} from "@devglean/shared";

/**
 * EmbeddingCircuitBreaker — protects the private RAG pipeline from
 * Voyage AI outages. Falls back to BM25-only retrieval (ADR-028).
 *
 * 3 consecutive failures → circuit opens for 60s.
 * After 60s, first request acts as a probe (half-open).
 * On success → circuit closes. On failure → re-opens for 60s.
 */
export class EmbeddingCircuitBreaker {
  private static readonly REDIS_KEY = "circuit:embedding";
  private static readonly FAILURE_THRESHOLD = 3;
  private static readonly RECOVERY_WINDOW_SECONDS = 60;

  static async isOpen(): Promise<boolean> {
    const state = await redis.get(this.REDIS_KEY);
    return state === "open";
  }

  static async recordFailure(): Promise<void> {
    const failKey = `${this.REDIS_KEY}:failures`;
    const failures = await redis.incr(failKey);
    await redis.expire(failKey, this.RECOVERY_WINDOW_SECONDS);

    if (failures >= this.FAILURE_THRESHOLD) {
      await redis.setex(this.REDIS_KEY, this.RECOVERY_WINDOW_SECONDS, "open");
      logger.error(
        { failures, recoveryWindowSeconds: this.RECOVERY_WINDOW_SECONDS },
        "Embedding circuit breaker OPENED — switching to BM25-only mode"
      );
    }
  }

  static async recordSuccess(): Promise<void> {
    await redis.del(`${this.REDIS_KEY}:failures`);
    await redis.del(this.REDIS_KEY);
  }
}

/**
 * Generates a single embedding with Redis caching and circuit breaker protection.
 * Returns null when the circuit breaker is open → signals BM25-only fallback.
 */
export async function embed(text: string, isQuery = false): Promise<number[] | null> {
  // Circuit breaker check (ADR-028)
  if (await EmbeddingCircuitBreaker.isOpen()) {
    logger.warn("Embedding circuit open — skipping embed, using BM25 fallback");
    return null;
  }

  const hash = sha256(text);
  const cacheKey = REDIS_KEYS.embeddingCache(hash);

  // Check Redis cache (ADR-006)
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as number[];
  }

  try {
    const embedding = isQuery
      ? await voyage.embedQuery(text)
      : await voyage.embedDocument(text);

    // Cache the result
    const ttl = isQuery ? QUERY_EMBEDDING_CACHE_TTL_SECONDS : EMBEDDING_CACHE_TTL_SECONDS;
    await redis.set(cacheKey, JSON.stringify(embedding), "EX", ttl);

    await EmbeddingCircuitBreaker.recordSuccess();
    return embedding;
  } catch (err) {
    await EmbeddingCircuitBreaker.recordFailure();
    logger.error({ err }, "Voyage AI embedding failed");
    return null;
  }
}

/**
 * Generates embeddings for a batch of texts with per-item caching.
 * Processes in batches of EMBEDDING_BATCH_SIZE.
 * Returns null entries when the circuit breaker is open.
 */
export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  // Circuit breaker check
  if (await EmbeddingCircuitBreaker.isOpen()) {
    logger.warn("Embedding circuit open — skipping batch embed");
    return new Array(texts.length).fill(null);
  }

  const results: (number[] | null)[] = new Array(texts.length).fill(null);
  const uncachedIndices: number[] = [];
  const uncachedTexts: string[] = [];

  // Check cache for each text
  const pipeline = redis.pipeline();
  const hashes = texts.map((t) => sha256(t));

  for (const hash of hashes) {
    pipeline.get(REDIS_KEYS.embeddingCache(hash));
  }

  const cacheResults = await pipeline.exec();

  for (let i = 0; i < texts.length; i++) {
    const cached = cacheResults?.[i]?.[1] as string | null;
    if (cached) {
      results[i] = JSON.parse(cached) as number[];
    } else {
      uncachedIndices.push(i);
      uncachedTexts.push(texts[i]!);
    }
  }

  if (uncachedTexts.length === 0) {
    return results;
  }

  logger.debug(
    { cached: texts.length - uncachedTexts.length, uncached: uncachedTexts.length },
    "Embedding batch cache stats"
  );

  // Process uncached texts in batches using Voyage document embedding
  try {
    for (let batchStart = 0; batchStart < uncachedTexts.length; batchStart += EMBEDDING_BATCH_SIZE) {
      const batchTexts = uncachedTexts.slice(batchStart, batchStart + EMBEDDING_BATCH_SIZE);
      const batchIndices = uncachedIndices.slice(batchStart, batchStart + EMBEDDING_BATCH_SIZE);

      const embeddings = await voyage.embedDocumentBatch(batchTexts);

      // Cache and assign results
      const cachePipeline = redis.pipeline();

      for (let j = 0; j < embeddings.length; j++) {
        const embedding = embeddings[j];
        if (!embedding) continue;

        const originalIndex = batchIndices[j]!;
        results[originalIndex] = embedding;

        const hash = hashes[originalIndex]!;
        cachePipeline.set(
          REDIS_KEYS.embeddingCache(hash),
          JSON.stringify(embedding),
          "EX",
          EMBEDDING_CACHE_TTL_SECONDS
        );
      }

      await cachePipeline.exec();
    }

    await EmbeddingCircuitBreaker.recordSuccess();
  } catch (err) {
    await EmbeddingCircuitBreaker.recordFailure();
    logger.error({ err }, "Voyage AI batch embedding failed");
    // Return whatever we cached before the failure
  }

  return results;
}
