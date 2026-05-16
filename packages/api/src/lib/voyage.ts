import { env } from "../env";
import { logger } from "./logger";

const VOYAGE_API_BASE = "https://api.voyageai.com/v1";

export const EMBEDDING_DIM = 1024;
export const EMBEDDING_MODEL = "voyage-code-3";

/**
 * Voyage AI embedding client — purpose-built for code and technical text retrieval.
 * Replaces OpenAI text-embedding-3-small (ADR-022).
 *
 * Voyage AI distinguishes between query-time and document-time embeddings.
 * Query embeddings are optimised for search-time similarity; document embeddings
 * are optimised for index-time storage. Using the correct input_type improves
 * retrieval quality by ~3% on code benchmarks.
 */

interface VoyageEmbeddingResponse {
  object: string;
  data: Array<{ object: string; embedding: number[]; index: number }>;
  model: string;
  usage: { total_tokens: number };
}

async function embedWithType(
  texts: string[],
  inputType: "query" | "document"
): Promise<number[][]> {
  const res = await fetch(`${VOYAGE_API_BASE}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: texts,
      model: EMBEDDING_MODEL,
      input_type: inputType,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    logger.error(
      { status: res.status, body: errorBody },
      "Voyage AI embedding request failed"
    );
    throw new Error(`Voyage AI error: ${res.status} ${errorBody}`);
  }

  const data = (await res.json()) as VoyageEmbeddingResponse;

  logger.debug(
    { model: data.model, tokensUsed: data.usage.total_tokens, count: texts.length },
    "Voyage AI embedding complete"
  );

  return data.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

/**
 * Embed a single query string for search-time similarity matching.
 * Uses input_type: "query" for optimal retrieval.
 */
export async function embedQuery(text: string): Promise<number[]> {
  const [embedding] = await embedWithType([text], "query");
  if (!embedding) {
    throw new Error("Voyage AI returned empty embedding for query");
  }
  return embedding;
}

/**
 * Embed a single document string for index-time storage.
 * Uses input_type: "document" for optimal retrieval.
 */
export async function embedDocument(text: string): Promise<number[]> {
  const [embedding] = await embedWithType([text], "document");
  if (!embedding) {
    throw new Error("Voyage AI returned empty embedding for document");
  }
  return embedding;
}

/**
 * Embed a batch of document strings for bulk indexing.
 * Uses input_type: "document". Processes in chunks of 128 (Voyage max batch).
 */
export async function embedDocumentBatch(texts: string[]): Promise<number[][]> {
  const BATCH_SIZE = 128;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const embeddings = await embedWithType(batch, "document");
    results.push(...embeddings);
  }

  return results;
}
