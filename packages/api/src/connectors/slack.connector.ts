import { createHmac, timingSafeEqual } from "crypto";
import { BaseConnector } from "./base.connector";
import type { SyncCursor } from "./base.connector";
import type { RawDocument, OAuthTokens } from "@devglean/shared";
import { env } from "../env";
import { logger } from "../lib/logger";

export class SlackConnector extends BaseConnector {
  readonly type = "SLACK" as const;

  buildOAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: "channels:history,channels:read,groups:history,groups:read,users:read",
      state,
    });
    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const response = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.SLACK_CLIENT_ID,
        client_secret: env.SLACK_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const data = (await response.json()) as {
      ok: boolean;
      access_token?: string;
      team?: { id: string };
      error?: string;
    };

    if (!data.ok || !data.access_token) {
      throw new Error(`Slack OAuth error: ${data.error ?? "Unknown error"}`);
    }

    return {
      accessToken: data.access_token,
      workspaceId: data.team?.id,
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
    const since = cursor?.lastSyncedAt as string | undefined;
    const oldest = since
      ? (new Date(since).getTime() / 1000).toString()
      : undefined;

    // Fetch channels
    const channels = await this.fetchChannels(accessToken, config?.channels as string[] | undefined);

    for (const channel of channels) {
      try {
        const messages = await this.fetchMessages(
          accessToken,
          channel.id,
          channel.name,
          oldest
        );
        docs.push(...messages);
      } catch (err) {
        logger.warn(
          { channel: channel.name, err },
          "Failed to fetch Slack channel"
        );
      }
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
    const timestamp = signature.split(",")[0]?.split("=")[1] ?? "";
    const sig = signature.split(",")[1]?.split("=")[1] ?? "";

    const basestring = `v0:${timestamp}:${typeof payload === "string" ? payload : payload.toString()}`;
    const expected = createHmac("sha256", secret)
      .update(basestring)
      .digest("hex");

    try {
      return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  async extractAclGroups(
    accessToken: string,
    channelId: string
  ): Promise<string[]> {
    try {
      const response = await fetch(
        `https://slack.com/api/conversations.members?channel=${channelId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      const data = (await response.json()) as {
        ok: boolean;
        members?: string[];
      };

      return data.members?.map((m) => `slack:${m}`) ?? [];
    } catch {
      return [];
    }
  }

  private async fetchChannels(
    accessToken: string,
    filterChannels?: string[]
  ): Promise<Array<{ id: string; name: string }>> {
    const response = await fetch(
      "https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const data = (await response.json()) as {
      ok: boolean;
      channels?: Array<{ id: string; name: string; is_member: boolean }>;
    };

    const channels = data.channels?.filter((c) => c.is_member) ?? [];

    if (filterChannels?.length) {
      return channels.filter((c) => filterChannels.includes(c.name));
    }

    return channels;
  }

  private async fetchMessages(
    accessToken: string,
    channelId: string,
    channelName: string,
    oldest?: string
  ): Promise<RawDocument[]> {
    const params = new URLSearchParams({
      channel: channelId,
      limit: "100",
    });
    if (oldest) params.set("oldest", oldest);

    const response = await fetch(
      `https://slack.com/api/conversations.history?${params}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const data = (await response.json()) as {
      ok: boolean;
      messages?: Array<{
        ts: string;
        text: string;
        user?: string;
        thread_ts?: string;
      }>;
    };

    if (!data.ok || !data.messages) return [];

    return data.messages
      .filter((m) => m.text && m.text.length > 20)
      .map((message) => ({
        sourceId: `slack:${channelId}:${message.ts}`,
        sourceUrl: `https://slack.com/archives/${channelId}/p${message.ts.replace(".", "")}`,
        title: `#${channelName} — ${message.text.slice(0, 80)}`,
        content: message.text,
        metadata: {
          channel: channelName,
          author: message.user,
          createdAt: new Date(parseFloat(message.ts) * 1000).toISOString(),
        },
        aclGroups: [],
      }));
  }
}

export const slackConnector = new SlackConnector();
