import { StackExchangeClient } from "../lib/stackexchange";
import { env } from "../env";
import { logger } from "../lib/logger";
import type { RawOSSResult } from "@devglean/shared";

const CODE_BLOCK_REGEX = /```[\s\S]*?```|`[^`]+`|<code>[\s\S]*?<\/code>|<pre>[\s\S]*?<\/pre>/;

/**
 * Stack Exchange Connector — searches accepted answers on Stack Overflow.
 * Supplements GitHub results with curated community answers.
 */
export class StackExchangeConnector {
  private client: StackExchangeClient;

  constructor() {
    this.client = new StackExchangeClient(env.STACK_EXCHANGE_KEY);
  }

  async searchAnswered(
    query: string,
    language?: string
  ): Promise<RawOSSResult[]> {
    try {
      const items = await this.client.searchAnswered(query, language);

      return items.map((item) => ({
        title: item.title,
        body: this.stripHtml(item.body).slice(0, 5000),
        htmlUrl: item.link,
        repoFullName: "stackoverflow.com",
        repoUrl: "https://stackoverflow.com",
        repoStars: item.score * 100, // Normalize SO score for star-based ranking
        reactionCount: item.score,
        commentCount: item.answer_count,
        linkedPRMerged: false,
        linkedPRUrl: null,
        hasCodeBlock: CODE_BLOCK_REGEX.test(item.body),
        hasAcceptedLabel: item.accepted_answer_id !== undefined,
        closedAt: new Date(item.creation_date * 1000).toISOString(),
        labels: item.tags,
        author: item.owner.display_name,
        source: "stackoverflow" as const,
      }));
    } catch (error) {
      logger.error({ error }, "Stack Exchange search failed");
      return [];
    }
  }

  /**
   * Strip HTML tags from Stack Exchange API responses (bodies are HTML-encoded).
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<pre><code[^>]*>/g, "```\n")
      .replace(/<\/code><\/pre>/g, "\n```")
      .replace(/<code>/g, "`")
      .replace(/<\/code>/g, "`")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }
}
