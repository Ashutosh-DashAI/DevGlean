import { logger } from "./logger";
import { STACK_MIN_SCORE } from "@devglean/shared";

const BASE_URL = "https://api.stackexchange.com/2.3";

interface StackExchangeItem {
  question_id: number;
  title: string;
  body: string;
  link: string;
  score: number;
  is_answered: boolean;
  accepted_answer_id?: number;
  answer_count: number;
  tags: string[];
  creation_date: number;
  owner: { display_name: string };
}

interface StackExchangeResponse {
  items: StackExchangeItem[];
  has_more: boolean;
  quota_remaining: number;
}

/**
 * Stack Exchange API client for supplemental OSS search.
 * Searches accepted/answered questions on Stack Overflow.
 */
export class StackExchangeClient {
  private readonly key: string;

  constructor(key: string) {
    this.key = key;
  }

  async searchAnswered(
    query: string,
    language?: string
  ): Promise<StackExchangeItem[]> {
    const params = new URLSearchParams({
      order: "desc",
      sort: "relevance",
      accepted: "True",
      filter: "withbody",
      site: "stackoverflow",
      q: query,
      pagesize: "10",
    });

    if (this.key) {
      params.set("key", this.key);
    }

    if (language) {
      params.set("tagged", language.toLowerCase());
    }

    try {
      const response = await fetch(`${BASE_URL}/search/advanced?${params}`);

      if (!response.ok) {
        logger.warn(
          { status: response.status },
          "Stack Exchange API error"
        );
        return [];
      }

      const data = (await response.json()) as StackExchangeResponse;

      logger.debug(
        { quotaRemaining: data.quota_remaining, resultCount: data.items.length },
        "Stack Exchange search complete"
      );

      // Filter to high-quality answers only
      return data.items.filter(
        (item) => item.score >= STACK_MIN_SCORE && item.is_answered
      );
    } catch (error) {
      logger.error({ error }, "Stack Exchange API request failed");
      return [];
    }
  }
}
