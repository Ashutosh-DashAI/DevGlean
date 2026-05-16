import { createHmac, timingSafeEqual } from "crypto";
import { BaseConnector } from "./base.connector";
import type { SyncCursor } from "./base.connector";
import type { RawDocument, OAuthTokens } from "@devglean/shared";
import { env } from "../env";
import { logger } from "../lib/logger";

/**
 * Confluence Connector — Atlassian OAuth 2.0 & REST API v1.
 *
 * Indexes Confluence Pages and Blog posts for team knowledge retrieval.
 * Handles the "Space" based architecture of Confluence.
 */
export class ConfluenceConnector extends BaseConnector {
  readonly type = "CONFLUENCE" as const;

  buildOAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: env.CONFLUENCE_CLIENT_ID,
      callback: redirectUri,
      scope: "read:confluence-content.summary read:confluence-content.all read:confluence-user",
      state,
    });
    return `https://auth.atlassian.com/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const response = await fetch("https://auth.atlassian.com/manage/2.0/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: env.CONFLUENCE_CLIENT_ID,
        client_secret: env.CONFLUENCE_CLIENT_SECRET,
        code,
        callback: redirectUri,
      }),
    });

    const data = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (data.error || !data.access_token) {
      throw new Error(
        `Confluence OAuth error: ${data.error_description ?? data.error ?? "Unknown error"}`
      );
    }

    // Fetch accessible resources to determine the cloud ID (required for all subsequent API calls)
    const resourcesResponse = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });

    const resources = (await resourcesResponse.json()) as Array<{
      id: string;
      url: string;
      name: string;
    }>;

    if (resources.length === 0) {
      throw new Error("No accessible Confluence resources found for this account.");
    }

    // Use the first accessible resource as the primary workspace
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
      workspaceId: resources[0].id, // Cloud ID
    };
  }

  async fetchDiff(
    accessToken: string,
    cursor: SyncCursor | null,
    config?: Record<string, unknown>
  ): Promise<{
    docs: RawDocument[];
    nextCursor: SyncCursor;
    hasMore: boolean;
  }> {
    const docs: RawDocument[] = [];
    const workspaceId = (await this.getWorkspaceId(accessToken));
    const since = cursor?.lastSyncedAt as string | undefined;

    // Confluence uses CQL (Confluence Query Language) for filtering
    // We fetch pages and blog posts updated after 'since'
    let start = 0;
    const limit = 50;
    let hasMore = true;

    while (hasMore) {
      const cql = since
        ? `lastModified > "${since}"`
        : `type = "page" or type = "blogpost"`;

      const params = new URLSearchParams({
        cql,
        limit: limit.toString(),
        start: start.toString(),
        expand: "body.storage,version",
      });

      const response = await fetch(
        `https://api.atlassian.com/wiki/api/v2/pages?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!response.ok) {
        logger.error({ status: response.status }, "Confluence API fetch failed");
        break;
      }

      const data = (await response.json()) as {
        results: Array<{
          id: string;
          title: string;
          body: { storage: { value: string } };
          version: { number: number };
          url: string;
        }>;
        _links: { start: string; next: string };
      };

      for (const page of data.results) {
        docs.push({
          sourceId: `confluence:${workspaceId}:${page.id}`,
          sourceUrl: page.url,
          title: page.title,
          content: this.stripHtml(page.body?.storage?.value ?? ""),
          metadata: {
            workspaceId,
            version: page.version?.number,
          },
          aclGroups: [],
        });
      }

      start += limit;
      hasMore = data.results.length === limit;
      if (docs.length > 500) break; // Safety limit per sync cycle
    }

    return {
      docs,
      nextCursor: { lastSyncedAt: new Date().toISOString() },
      hasMore: false,
    };
  }

  validateWebhook(
    payload: string | Buffer,
    signature: string,
    secret: string
  ): boolean {
    const expected = createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    try {
      return timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected)
      );
    } catch {
      return false;
    }
  }

  async extractAclGroups(
    accessToken: string,
    sourceId: string
  ): Promise<string[]> {
    try {
      const [_, workspaceId, pageId] = sourceId.split(":");
      const response = await fetch(
        `https://api.atlassian.com/wiki/api/v2/pages/${pageId}/permissions`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!response.ok) return [];

      const permissions = (await response.json()) as Array<{
        group: { name: string };
      }>;
      return permissions.map((p) => `confluence-group:${p.group?.name}`).filter(Boolean);
    } catch {
      return [];
    }
  }

  private async getWorkspaceId(accessToken: string): Promise<string> {
    const response = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const resources = (await response.json()) as Array<{ id: string }>;
    return resources[0]?.id ?? "";
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<ac:structured-macro[^>]*>[\s\S]*?<\/ac:structured-macro>/g, "")
      .replace(/<pre[^>]*><code[^>]*>/g, "```\n")
      .replace(/<\/code><\/pre>/g, "\n```")
      .replace(/<code>/g, "`")
      .replace(/<\/code>/g, "`")
      .replace(/<br\s*\/?>/g, "\n")
      .replace(/<li[^>]*>/g, "- ")
      .replace(/<\/li>/g, "\n")
      .replace(/<h[1-6][^>]*>/g, "## ")
      .replace(/<\/h[1-6]>/g, "\n")
      .replace(/<p[^>]*>/g, "")
      .replace(/<\/p>/g, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
}

export const confluenceConnector = new ConfluenceConnector();
