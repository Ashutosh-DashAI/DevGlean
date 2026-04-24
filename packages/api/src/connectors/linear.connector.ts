import { createHmac, timingSafeEqual } from "crypto";
import { BaseConnector } from "./base.connector";
import type { SyncCursor } from "./base.connector";
import type { RawDocument, OAuthTokens } from "@devglean/shared";
import { env } from "../env";
import { logger } from "../lib/logger";

export class LinearConnector extends BaseConnector {
  readonly type = "LINEAR" as const;

  buildOAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: env.LINEAR_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "read",
      state,
      prompt: "consent",
    });
    return `https://linear.app/oauth/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const response = await fetch("https://api.linear.app/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.LINEAR_CLIENT_ID,
        client_secret: env.LINEAR_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const data = (await response.json()) as {
      access_token?: string;
      error?: string;
    };

    if (data.error || !data.access_token) {
      throw new Error(`Linear OAuth error: ${data.error ?? "Unknown error"}`);
    }

    // Fetch organization info
    const orgResponse = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        Authorization: data.access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "{ organization { id name } }",
      }),
    });

    const orgData = (await orgResponse.json()) as {
      data?: { organization?: { id: string } };
    };

    return {
      accessToken: data.access_token,
      workspaceId: orgData.data?.organization?.id,
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
    const since = cursor?.lastSyncedAt as string | undefined;

    // Fetch issues with comments
    let afterCursor: string | null = null;
    let hasMore = true;

    while (hasMore) {
      const filter = since
        ? `updatedAt: { gte: "${since}" }`
        : "";

      const query = `
        query($after: String) {
          issues(first: 50, after: $after ${filter ? `, filter: { ${filter} }` : ""}) {
            nodes {
              id
              identifier
              title
              description
              url
              state { name }
              assignee { name }
              creator { name }
              createdAt
              updatedAt
              labels { nodes { name } }
              comments {
                nodes {
                  body
                  user { name }
                  createdAt
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `;

      const response = await fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: {
          Authorization: accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables: { after: afterCursor } }),
      });

      const data = (await response.json()) as {
        data?: {
          issues?: {
            nodes: Array<{
              id: string;
              identifier: string;
              title: string;
              description: string | null;
              url: string;
              state: { name: string };
              assignee: { name: string } | null;
              creator: { name: string } | null;
              createdAt: string;
              updatedAt: string;
              labels: { nodes: Array<{ name: string }> };
              comments: {
                nodes: Array<{
                  body: string;
                  user: { name: string } | null;
                  createdAt: string;
                }>;
              };
            }>;
            pageInfo: {
              hasNextPage: boolean;
              endCursor: string | null;
            };
          };
        };
      };

      const issues = data.data?.issues;
      if (!issues) break;

      for (const issue of issues.nodes) {
        const comments = issue.comments.nodes
          .map((c) => `${c.user?.name ?? "Unknown"}: ${c.body}`)
          .join("\n\n");

        const content = [
          `[${issue.state.name}] ${issue.identifier}: ${issue.title}`,
          issue.description ?? "",
          comments ? `\n--- Comments ---\n${comments}` : "",
        ]
          .filter(Boolean)
          .join("\n\n");

        docs.push({
          sourceId: `linear:${issue.id}`,
          sourceUrl: issue.url,
          title: `${issue.identifier}: ${issue.title}`,
          content,
          metadata: {
            author: issue.creator?.name,
            createdAt: issue.createdAt,
            updatedAt: issue.updatedAt,
            tags: issue.labels.nodes.map((l) => l.name),
          },
          aclGroups: [],
        });
      }

      hasMore = issues.pageInfo.hasNextPage;
      afterCursor = issues.pageInfo.endCursor;
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
      .update(typeof payload === "string" ? payload : payload.toString())
      .digest("hex");

    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  async extractAclGroups(
    _accessToken: string,
    _sourceId: string
  ): Promise<string[]> {
    return [];
  }
}

export const linearConnector = new LinearConnector();
