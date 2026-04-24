import { anthropic } from "../lib/anthropic";
import { logger } from "../lib/logger";
import { CLASSIFIER_MODEL, CLASSIFIER_MAX_TOKENS } from "@devglean/shared";
import type { QueryClassification } from "@devglean/shared";

/**
 * QueryClassifier — fast Claude Haiku call to determine if a query is about
 * the team's private knowledge, public OSS issues, or both.
 *
 * This is the routing decision that prevents wasting tokens/latency by running
 * both pipelines when only one is needed.
 */
export class QueryClassifier {
  /**
   * Classifies a query into: "private" | "oss" | "both"
   * Uses Claude Haiku for speed (< 200ms).
   * Falls back to "both" on any error (safe default).
   */
  static async classify(
    query: string,
    teamName: string
  ): Promise<QueryClassification> {
    try {
      const response = await anthropic.messages.create({
        model: CLASSIFIER_MODEL,
        max_tokens: CLASSIFIER_MAX_TOKENS,
        system: `You classify developer search queries into one of three categories.
Output ONLY valid JSON matching: {"surface":"private"|"oss"|"both","reasoning":"brief explanation","confidence":0.0-1.0}

Categories:
- "private": Questions about the team's specific codebase, architecture decisions, internal processes, team history, or internal tools. Clues: past tense ("why did we…"), team references ("our", "we"), specific internal project names.
- "oss": Questions about general programming problems, public library bugs, framework errors, or how the open-source community solved something. Clues: generic error messages, library/framework names, "how to fix", version-specific issues.
- "both": Questions that could benefit from both team context AND public OSS solutions. Clues: "how did we fix the issue that others also reported", comparing team decisions against community standards.

The team name is "${teamName}". When in doubt, lean toward "both".`,
        messages: [
          {
            role: "user",
            content: query,
          },
        ],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock) {
        return { surface: "both", reasoning: "No classifier response", confidence: 0.5 };
      }

      const parsed = JSON.parse(textBlock.text) as QueryClassification;

      // Validate surface value
      if (!["private", "oss", "both"].includes(parsed.surface)) {
        return { surface: "both", reasoning: "Invalid surface value", confidence: 0.5 };
      }

      logger.debug(
        { query: query.slice(0, 80), surface: parsed.surface, confidence: parsed.confidence },
        "Query classified"
      );

      return parsed;
    } catch (error) {
      logger.warn({ error, query: query.slice(0, 80) }, "Query classification failed — defaulting to 'both'");
      return { surface: "both", reasoning: "Classification error — safe fallback", confidence: 0.5 };
    }
  }
}
