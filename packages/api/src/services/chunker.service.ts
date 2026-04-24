import { sha256 } from "../lib/crypto";
import { CHUNK_SIZE_CHARS, CHUNK_OVERLAP_CHARS } from "@devglean/shared";
import type { DocumentChunk, DocumentMetadata } from "@devglean/shared";

interface ChunkInput {
  title: string;
  content: string;
  sourceUrl: string;
  metadata: DocumentMetadata;
}

/**
 * Splits document content into overlapping chunks at sentence boundaries.
 * Target size: 512 tokens (~2048 characters)
 * Overlap: 64 tokens (~256 characters)
 */
export function chunkDocument(input: ChunkInput): DocumentChunk[] {
  const { content, metadata } = input;

  if (!content || content.trim().length === 0) {
    return [];
  }

  const sentences = splitIntoSentences(content);
  const chunks: DocumentChunk[] = [];

  let currentChunk = "";
  let chunkStart = 0;
  let sentenceIndex = 0;

  while (sentenceIndex < sentences.length) {
    const sentence = sentences[sentenceIndex]!;

    // If adding this sentence would exceed chunk size and we have content
    if (
      currentChunk.length > 0 &&
      currentChunk.length + sentence.length > CHUNK_SIZE_CHARS
    ) {
      // Finalize current chunk
      const trimmedChunk = currentChunk.trim();
      if (trimmedChunk.length > 0) {
        chunks.push({
          content: trimmedChunk,
          chunkIndex: chunks.length,
          chunkTotal: 0, // Set after all chunks are created
          contentHash: sha256(trimmedChunk),
          metadata: {
            ...metadata,
            title: input.title,
            sourceUrl: input.sourceUrl,
          },
        });
      }

      // Backtrack for overlap
      currentChunk = "";
      const overlapTarget = CHUNK_OVERLAP_CHARS;
      let overlapLength = 0;

      // Walk backward from current sentence to build overlap
      for (let i = sentenceIndex - 1; i >= chunkStart && overlapLength < overlapTarget; i--) {
        const overlapSentence = sentences[i]!;
        currentChunk = overlapSentence + " " + currentChunk;
        overlapLength += overlapSentence.length;
      }

      chunkStart = sentenceIndex;
      continue;
    }

    currentChunk += (currentChunk.length > 0 ? " " : "") + sentence;
    sentenceIndex++;
  }

  // Don't forget the last chunk
  const trimmedFinal = currentChunk.trim();
  if (trimmedFinal.length > 0) {
    chunks.push({
      content: trimmedFinal,
      chunkIndex: chunks.length,
      chunkTotal: 0,
      contentHash: sha256(trimmedFinal),
      metadata: {
        ...metadata,
        title: input.title,
        sourceUrl: input.sourceUrl,
      },
    });
  }

  // Set chunkTotal on all chunks
  const total = chunks.length;
  for (const chunk of chunks) {
    chunk.chunkTotal = total;
  }

  return chunks;
}

/**
 * Splits text into sentences using common sentence boundary heuristics.
 */
function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace
  const raw = text.split(/(?<=[.!?])\s+/);

  // Filter empty strings and trim
  return raw
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Prepends document title and source info to chunk content
 * for better embedding context.
 */
export function enrichChunkContent(
  title: string,
  sourceType: string,
  content: string
): string {
  return `[${sourceType}] ${title}\n\n${content}`;
}
