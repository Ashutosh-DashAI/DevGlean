import { createHmac, timingSafeEqual } from "crypto";
import { BaseConnector } from "./base.connector";
import type { SyncCursor } from "./base.connector";
import type { RawDocument, OAuthTokens } from "@devglean/shared";
import { env } from "../env";
import { logger } from "../lib/logger";

export class NotionConnector extends BaseConnector {
  readonly type = "NOTION" as const;

  buildOAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: env.NOTION_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      owner: "user",
      state,
    });
    return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const credentials = Buffer.from(
      `${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`
    ).toString("base64");

    const response = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    const data = (await response.json()) as {
      access_token?: string;
      workspace_id?: string;
      error?: string;
    };

    if (data.error || !data.access_token) {
      throw new Error(`Notion OAuth error: ${data.error ?? "Unknown error"}`);
    }

    return {
      accessToken: data.access_token,
      workspaceId: data.workspace_id,
    };
  }

  async fetchDiff(
    accessToken: string,
    cursor: SyncCursor | null
  ): Promise<{
    docs: RawDocument[];
    nextCursor: SyncCursor;
    hasMore: boolean;
  }> {
    const docs: RawDocument[] = [];
    let startCursor = cursor?.startCursor as string | undefined;
    let hasMore = true;

    while (hasMore) {
      const body: Record<string, unknown> = {
        filter: { property: "object", value: "page" },
        page_size: 100,
      };
      if (startCursor) body.start_cursor = startCursor;

      const response = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) break;

      const data = (await response.json()) as {
        results: Array<{
          id: string;
          url: string;
          properties: Record<string, unknown>;
          created_time: string;
          last_edited_time: string;
        }>;
        has_more: boolean;
        next_cursor: string | null;
      };

      for (const page of data.results) {
        const title = this.extractTitle(page.properties);
        const content = await this.fetchPageContent(accessToken, page.id);

        docs.push({
          sourceId: `notion:${page.id}`,
          sourceUrl: page.url,
          title: title || "Untitled",
          content,
          metadata: {
            createdAt: page.created_time,
            updatedAt: page.last_edited_time,
          },
          aclGroups: [],
        });
      }

      hasMore = data.has_more;
      startCursor = data.next_cursor ?? undefined;
    }

    return {
      docs,
      nextCursor: {
        lastSyncedAt: new Date().toISOString(),
        startCursor,
      },
      hasMore: false,
    };
  }

  validateWebhook(
    _payload: string | Buffer,
    _signature: string,
    _secret: string
  ): boolean {
    // Notion doesn't have webhooks in the same way — uses polling
    return true;
  }

  async extractAclGroups(
    _accessToken: string,
    _sourceId: string
  ): Promise<string[]> {
    return [];
  }

  private extractTitle(properties: Record<string, unknown>): string {
    const titleProp = Object.values(properties).find(
      (p) => (p as Record<string, unknown>)?.type === "title"
    ) as { title?: Array<{ plain_text: string }> } | undefined;

    return titleProp?.title?.map((t) => t.plain_text).join("") ?? "Untitled";
  }

  private async fetchPageContent(
    accessToken: string,
    pageId: string
  ): Promise<string> {
    const blocks: string[] = [];
    let startCursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const url = `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100${
        startCursor ? `&start_cursor=${startCursor}` : ""
      }`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Notion-Version": "2022-06-28",
        },
      });

      if (!response.ok) break;

      const data = (await response.json()) as {
        results: Array<{
          type: string;
          [key: string]: unknown;
        }>;
        has_more: boolean;
        next_cursor: string | null;
      };

      for (const block of data.results) {
        const text = this.extractBlockText(block);
        if (text) blocks.push(text);
      }

      hasMore = data.has_more;
      startCursor = data.next_cursor ?? undefined;
    }

    return blocks.join("\n\n");
  }

  private extractBlockText(block: Record<string, unknown>): string {
    const type = block.type as string;
    const blockData = block[type] as {
      rich_text?: Array<{ plain_text: string }>;
      text?: Array<{ plain_text: string }>;
    } | undefined;

    if (!blockData) return "";

    const richText = blockData.rich_text ?? blockData.text ?? [];
    return richText.map((t) => t.plain_text).join("");
  }
}

export const notionConnector = new NotionConnector();
