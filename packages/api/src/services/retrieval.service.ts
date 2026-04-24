import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import type { Prisma } from "@prisma/client";
import type { SearchResult } from "@devglean/shared";
import { SEARCH_WEIGHTS, MAX_CONTEXT_CHUNKS } from "@devglean/shared";

interface RetrievalParams {
  queryVector: number[];
  query: string;
  teamId: string;
  aclGroups: string[];
  filters?: {
    connectorIds?: string[];
    sourceTypes?: string[];
    dateRange?: {
      from?: string;
      to?: string;
    };
  };
  limit?: number;
}

interface RawSearchRow {
  id: string;
  title: string;
  content: string;
  source_url: string;
  source_type: string;
  metadata: Prisma.JsonValue;
  chunk_index: number;
  chunk_total: number;
  score: number;
}

/**
 * Hybrid search combining pgvector cosine similarity (70%) and
 * PostgreSQL full-text search BM25-approximation (30%).
 * 
 * ACL filtering is applied via PostgreSQL array overlap (&&).
 */
export async function retrieve(params: RetrievalParams): Promise<SearchResult[]> {
  const {
    queryVector,
    query,
    teamId,
    aclGroups,
    filters,
    limit = MAX_CONTEXT_CHUNKS,
  } = params;

  const vectorStr = `[${queryVector.join(",")}]`;

  // Build dynamic WHERE clauses
  let additionalWhere = "";
  const queryParams: unknown[] = [vectorStr, query, teamId, aclGroups, limit];
  let paramIndex = 6;

  if (filters?.connectorIds?.length) {
    additionalWhere += ` AND "connectorId" = ANY($${paramIndex}::text[])`;
    queryParams.push(filters.connectorIds);
    paramIndex++;
  }

  if (filters?.sourceTypes?.length) {
    additionalWhere += ` AND "sourceType"::text = ANY($${paramIndex}::text[])`;
    queryParams.push(filters.sourceTypes);
    paramIndex++;
  }

  if (filters?.dateRange?.from) {
    additionalWhere += ` AND "createdAt" >= $${paramIndex}::timestamp`;
    queryParams.push(filters.dateRange.from);
    paramIndex++;
  }

  if (filters?.dateRange?.to) {
    additionalWhere += ` AND "createdAt" <= $${paramIndex}::timestamp`;
    queryParams.push(filters.dateRange.to);
    paramIndex++;
  }

  const sql = `
    SELECT 
      id,
      title,
      content,
      "sourceUrl" AS source_url,
      "sourceType"::text AS source_type,
      metadata,
      "chunkIndex" AS chunk_index,
      "chunkTotal" AS chunk_total,
      (
        ${SEARCH_WEIGHTS.vector} * (1 - (embedding <=> $1::vector)) + 
        ${SEARCH_WEIGHTS.fullText} * COALESCE(ts_rank(to_tsvector('english', content), plainto_tsquery('english', $2)), 0)
      ) AS score
    FROM "Document"
    WHERE "teamId" = $3
      AND "aclGroups" && $4::text[]
      AND embedding IS NOT NULL
      ${additionalWhere}
    ORDER BY score DESC
    LIMIT $5
  `;

  const startTime = performance.now();

  const rows = await prisma.$queryRawUnsafe<RawSearchRow[]>(sql, ...queryParams);

  const elapsedMs = Math.round(performance.now() - startTime);
  logger.debug({ resultCount: rows.length, elapsedMs, teamId }, "Retrieval complete");

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    sourceUrl: row.source_url,
    sourceType: row.source_type,
    score: Number(row.score),
    metadata: row.metadata as Record<string, unknown>,
    chunkIndex: row.chunk_index,
    chunkTotal: row.chunk_total,
  }));
}
