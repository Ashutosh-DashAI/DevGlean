import { openai } from "../lib/openai";
import { redis } from "../lib/redis";
import { sha256 } from "../lib/crypto";
import { logger } from "../lib/logger";
import {
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_CACHE_TTL_SECONDS,
  QUERY_EMBEDDING_CACHE_TTL_SECONDS,
  REDIS_KEYS,
} from "@devglean/shared";

/**
 * Generates a single embedding with Redis caching.
 */
export async function embed(text: string, isQuery = false): Promise<number[]> {
  const hash = sha256(text);
  const cacheKey = REDIS_KEYS.embeddingCache(hash);

  // Check Redis cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as number[];
  }

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  const embedding = response.data[0]?.embedding;
  if (!embedding) {
    throw new Error("Failed to generate embedding: empty response");
  }

  // Cache the result
  const ttl = isQuery ? QUERY_EMBEDDING_CACHE_TTL_SECONDS : EMBEDDING_CACHE_TTL_SECONDS;
  await redis.set(cacheKey, JSON.stringify(embedding), "EX", ttl);

  return embedding;
}

/**
 * Generates embeddings for a batch of texts with per-item caching.
 * Processes in batches of EMBEDDING_BATCH_SIZE.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
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
    return results as number[][];
  }

  logger.debug(
    { cached: texts.length - uncachedTexts.length, uncached: uncachedTexts.length },
    "Embedding batch cache stats"
  );

  // Process uncached texts in batches
  for (let batchStart = 0; batchStart < uncachedTexts.length; batchStart += EMBEDDING_BATCH_SIZE) {
    const batchTexts = uncachedTexts.slice(batchStart, batchStart + EMBEDDING_BATCH_SIZE);
    const batchIndices = uncachedIndices.slice(batchStart, batchStart + EMBEDDING_BATCH_SIZE);

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batchTexts,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    // Cache and assign results
    const cachePipeline = redis.pipeline();

    for (let j = 0; j < response.data.length; j++) {
      const embedding = response.data[j]?.embedding;
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

  return results as number[][];
}
