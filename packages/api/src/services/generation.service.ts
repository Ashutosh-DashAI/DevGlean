import { anthropic } from "../lib/anthropic";
import { logger } from "../lib/logger";
import { GENERATION_MODEL, MAX_OUTPUT_TOKENS } from "@devglean/shared";
import type { SearchResult } from "@devglean/shared";

const SYSTEM_PROMPT = `You are DevGlean, an AI assistant that answers developer questions with grounded citations.

Sources may come from TWO surfaces:
1. **Private Team Knowledge** — internal docs, code, decisions, Slack threads, etc.
2. **Open Source Intelligence** — resolved GitHub issues, merged PRs, Stack Overflow answers from public repositories.

Rules:
1. Answer using ONLY the provided context sources. Never hallucinate.
2. Cite every claim using [Source N] format where N is the source number.
   - For team sources, cite as: [Source N] (with connector type indicated in context)
   - For OSS sources, include repo context when relevant: "As shown in [Source N] (react/react#28523)..."
3. If sources disagree, present both viewpoints and explain the difference.
4. Be concise, technical, and precise. Use markdown formatting.
5. When multiple sources agree, cite all of them.
6. Prefer recent sources over older ones when information conflicts.
7. If OSS sources provide a code fix, include the code block.
8. If the context does not contain the answer, say so explicitly.`;

function buildContextBlock(sources: SearchResult[]): string {
  return sources
    .map(
      (source, index) =>
        `[Source ${index + 1}] (${source.sourceType}) "${source.title}" — ${source.sourceUrl}\n${source.content}`
    )
    .join("\n\n---\n\n");
}

/**
 * Generates a streaming answer using Anthropic Claude with citation injection.
 * Returns an async generator of string tokens.
 */
export async function* generateStream(
  query: string,
  sources: SearchResult[]
): AsyncGenerator<string, void, undefined> {
  if (sources.length === 0) {
    yield "I couldn't find any relevant documents in your team's knowledge base to answer this question. ";
    yield "Try connecting more data sources or refining your query.";
    return;
  }

  const contextBlock = buildContextBlock(sources);
  const userMessage = `Context:\n${contextBlock}\n\n---\n\nQuestion: ${query}`;

  const stream = anthropic.messages.stream({
    model: GENERATION_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: userMessage,
      },
    ],
  });

  let totalTokens = 0;

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }

    if (event.type === "message_delta" && event.usage) {
      totalTokens = event.usage.output_tokens;
    }
  }

  const finalMessage = await stream.finalMessage();
  totalTokens = finalMessage.usage.output_tokens + finalMessage.usage.input_tokens;

  logger.debug(
    {
      tokensUsed: totalTokens,
      sourceCount: sources.length,
    },
    "Generation complete"
  );
}

/**
 * Non-streaming generation for cases where the full answer is needed at once.
 */
export async function generate(
  query: string,
  sources: SearchResult[]
): Promise<{ answer: string; tokensUsed: number }> {
  if (sources.length === 0) {
    return {
      answer:
        "I couldn't find any relevant documents in your team's knowledge base to answer this question. Try connecting more data sources or refining your query.",
      tokensUsed: 0,
    };
  }

  const contextBlock = buildContextBlock(sources);
  const userMessage = `Context:\n${contextBlock}\n\n---\n\nQuestion: ${query}`;

  const response = await anthropic.messages.create({
    model: GENERATION_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: userMessage,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const answer = textBlock?.text ?? "";
  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

  return { answer, tokensUsed };
}
