import { BaseConnector } from "./base.connector";
import type { SyncCursor } from "./base.connector";
import type { RawDocument, OAuthTokens } from "@devglean/shared";
import { env } from "../env";
import { logger } from "../lib/logger";

export class JiraConnector extends BaseConnector {
  readonly type = "JIRA" as const;

  buildOAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      audience: "api.atlassian.com",
      client_id: env.JIRA_CLIENT_ID,
      scope: "read:jira-work read:jira-user offline_access",
      redirect_uri: redirectUri,
      state,
      response_type: "code",
      prompt: "consent",
    });
    return `https://auth.atlassian.com/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const response = await fetch("https://auth.atlassian.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: env.JIRA_CLIENT_ID,
        client_secret: env.JIRA_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const data = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
    };

    if (data.error || !data.access_token) {
      throw new Error(`Jira OAuth error: ${data.error ?? "Unknown error"}`);
    }

    // Fetch accessible resources (cloud sites)
    const sitesResponse = await fetch(
      "https://api.atlassian.com/oauth/token/accessible-resources",
      {
        headers: { Authorization: `Bearer ${data.access_token}` },
      }
    );

    const sites = (await sitesResponse.json()) as Array<{
      id: string;
      name: string;
    }>;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
      workspaceId: sites[0]?.id,
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
    const cloudId = config?.cloudId as string;
    const since = cursor?.lastSyncedAt as string | undefined;

    if (!cloudId) {
      logger.warn("No Jira cloudId configured");
      return { docs: [], nextCursor: {}, hasMore: false };
    }

    const jql = since
      ? `updated >= "${new Date(since).toISOString().split("T")[0]}" ORDER BY updated DESC`
      : "ORDER BY updated DESC";

    let startAt = 0;
    let total = 1;

    while (startAt < total) {
      const response = await fetch(
        `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jql,
            startAt,
            maxResults: 50,
            fields: [
              "summary",
              "description",
              "status",
              "assignee",
              "reporter",
              "created",
              "updated",
              "labels",
              "comment",
            ],
          }),
        }
      );

      if (!response.ok) break;

      const data = (await response.json()) as {
        issues: Array<{
          id: string;
          key: string;
          self: string;
          fields: {
            summary: string;
            description: { content?: Array<{ content?: Array<{ text?: string }> }> } | null;
            status: { name: string };
            assignee: { displayName: string } | null;
            reporter: { displayName: string } | null;
            created: string;
            updated: string;
            labels: string[];
            comment: {
              comments: Array<{
                body: { content?: Array<{ content?: Array<{ text?: string }> }> };
                author: { displayName: string };
                created: string;
              }>;
            };
          };
        }>;
        total: number;
      };

      total = data.total;

      for (const issue of data.issues) {
        const description = this.extractAdfText(issue.fields.description);
        const comments = issue.fields.comment.comments
          .map(
            (c) =>
              `${c.author.displayName}: ${this.extractAdfText(c.body)}`
          )
          .join("\n\n");

        const content = [
          `[${issue.fields.status.name}] ${issue.key}: ${issue.fields.summary}`,
          description,
          comments ? `\n--- Comments ---\n${comments}` : "",
        ]
          .filter(Boolean)
          .join("\n\n");

        docs.push({
          sourceId: `jira:${issue.id}`,
          sourceUrl: `https://YOUR_DOMAIN.atlassian.net/browse/${issue.key}`,
          title: `${issue.key}: ${issue.fields.summary}`,
          content,
          metadata: {
            author: issue.fields.reporter?.displayName,
            createdAt: issue.fields.created,
            updatedAt: issue.fields.updated,
            tags: issue.fields.labels,
          },
          aclGroups: [],
        });
      }

      startAt += data.issues.length;
    }

    return {
      docs,
      nextCursor: { lastSyncedAt: new Date().toISOString() },
      hasMore: false,
    };
  }

  validateWebhook(
    _payload: string | Buffer,
    _signature: string,
    _secret: string
  ): boolean {
    // Jira Cloud uses webhook URLs with shared secrets in query params
    return true;
  }

  async extractAclGroups(
    _accessToken: string,
    _sourceId: string
  ): Promise<string[]> {
    return [];
  }

  private extractAdfText(
    doc: { content?: Array<{ content?: Array<{ text?: string }> }> } | null
  ): string {
    if (!doc?.content) return "";

    return doc.content
      .flatMap((block) =>
        block.content?.map((inline) => inline.text ?? "") ?? []
      )
      .join(" ");
  }
}

export const jiraConnector = new JiraConnector();
