import { createHmac, timingSafeEqual } from "crypto";
import { BaseConnector } from "./base.connector";
import type { SyncCursor } from "./base.connector";
import type { RawDocument, OAuthTokens } from "@devglean/shared";
import { env } from "../env";
import { logger } from "../lib/logger";

/**
 * GitLab Connector — GitLab REST API v4 (ADR-024).
 *
 * Covers the primary GitHub alternative for engineering teams,
 * especially self-hosted enterprises. Uses OAuth2 PKCE flow.
 *
 * Data sources: Projects (repos), READMEs, Issues, Merge Requests, Commits.
 */
export class GitLabConnector extends BaseConnector {
  readonly type = "GITLAB" as const;

  buildOAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: env.GITLAB_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "read_api",
      state,
    });
    return `https://gitlab.com/oauth/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const response = await fetch("https://gitlab.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: env.GITLAB_CLIENT_ID,
        client_secret: env.GITLAB_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
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
        `GitLab OAuth error: ${data.error_description ?? data.error ?? "Unknown error"}`
      );
    }

    // Fetch authenticated user
    const userResponse = await fetch("https://gitlab.com/api/v4/user", {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    const userData = (await userResponse.json()) as { username: string };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
      workspaceId: userData.username,
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

    const projects = await this.fetchProjects(accessToken);

    for (const project of projects) {
      try {
        // Fetch README
        const readme = await this.fetchReadme(accessToken, project.id, project.path_with_namespace);
        if (readme) docs.push(readme);

        // Fetch closed issues with resolution
        const issues = await this.fetchIssues(accessToken, project.id, project.path_with_namespace, since);
        docs.push(...issues);

        // Fetch merged merge requests
        const mrs = await this.fetchMergeRequests(accessToken, project.id, project.path_with_namespace, since);
        docs.push(...mrs);

        // Fetch recent commits
        const commits = await this.fetchCommits(accessToken, project.id, project.path_with_namespace, since);
        docs.push(...commits);
      } catch (err) {
        logger.warn(
          { project: project.path_with_namespace, err },
          "Failed to fetch data for GitLab project"
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
    // GitLab uses X-Gitlab-Token header — simple string comparison
    try {
      return timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(secret)
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
      const projectId = sourceId.split(":")[1];
      const response = await fetch(
        `https://gitlab.com/api/v4/projects/${projectId}/members/all`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!response.ok) return [];

      const members = (await response.json()) as Array<{ username: string }>;
      return members.map((m) => `gitlab:${m.username}`);
    } catch {
      return [];
    }
  }

  private async fetchProjects(
    accessToken: string
  ): Promise<Array<{ id: number; path_with_namespace: string; web_url: string }>> {
    const projects: Array<{ id: number; path_with_namespace: string; web_url: string }> = [];
    let page = 1;

    while (true) {
      const response = await fetch(
        `https://gitlab.com/api/v4/projects?membership=true&per_page=100&page=${page}&order_by=updated_at`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!response.ok) break;

      const data = (await response.json()) as Array<{
        id: number;
        path_with_namespace: string;
        web_url: string;
      }>;

      if (data.length === 0) break;
      projects.push(...data);
      page++;
      if (data.length < 100) break;
    }

    return projects;
  }

  private async fetchReadme(
    accessToken: string,
    projectId: number,
    projectPath: string
  ): Promise<RawDocument | null> {
    try {
      const response = await fetch(
        `https://gitlab.com/api/v4/projects/${projectId}/repository/files/README.md?ref=main`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!response.ok) {
        // Try master branch
        const fallbackResponse = await fetch(
          `https://gitlab.com/api/v4/projects/${projectId}/repository/files/README.md?ref=master`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!fallbackResponse.ok) return null;
        const data = (await fallbackResponse.json()) as { content: string; encoding: string };
        const content = data.encoding === "base64"
          ? Buffer.from(data.content, "base64").toString("utf-8")
          : data.content;

        return {
          sourceId: `gitlab:${projectId}:readme`,
          sourceUrl: `https://gitlab.com/${projectPath}/-/blob/master/README.md`,
          title: `${projectPath} — README`,
          content,
          metadata: { repository: projectPath },
          aclGroups: [],
        };
      }

      const data = (await response.json()) as { content: string; encoding: string };
      const content = data.encoding === "base64"
        ? Buffer.from(data.content, "base64").toString("utf-8")
        : data.content;

      return {
        sourceId: `gitlab:${projectId}:readme`,
        sourceUrl: `https://gitlab.com/${projectPath}/-/blob/main/README.md`,
        title: `${projectPath} — README`,
        content,
        metadata: { repository: projectPath },
        aclGroups: [],
      };
    } catch {
      return null;
    }
  }

  private async fetchIssues(
    accessToken: string,
    projectId: number,
    projectPath: string,
    since?: string
  ): Promise<RawDocument[]> {
    const params = new URLSearchParams({
      state: "closed",
      per_page: "50",
      order_by: "updated_at",
      sort: "desc",
    });
    if (since) params.set("updated_after", since);

    const response = await fetch(
      `https://gitlab.com/api/v4/projects/${projectId}/issues?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) return [];

    const issues = (await response.json()) as Array<{
      iid: number;
      web_url: string;
      title: string;
      description: string | null;
      author: { username: string } | null;
      created_at: string;
      labels: string[];
    }>;

    return issues.map((issue) => ({
      sourceId: `gitlab:${projectId}:issue:${issue.iid}`,
      sourceUrl: issue.web_url,
      title: `Issue #${issue.iid}: ${issue.title}`,
      content: `${issue.title}\n\n${issue.description ?? ""}`,
      metadata: {
        repository: projectPath,
        author: issue.author?.username,
        createdAt: issue.created_at,
        tags: issue.labels,
      },
      aclGroups: [],
    }));
  }

  private async fetchMergeRequests(
    accessToken: string,
    projectId: number,
    projectPath: string,
    since?: string
  ): Promise<RawDocument[]> {
    const params = new URLSearchParams({
      state: "merged",
      per_page: "50",
      order_by: "updated_at",
      sort: "desc",
    });
    if (since) params.set("updated_after", since);

    const response = await fetch(
      `https://gitlab.com/api/v4/projects/${projectId}/merge_requests?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) return [];

    const mrs = (await response.json()) as Array<{
      iid: number;
      web_url: string;
      title: string;
      description: string | null;
      author: { username: string } | null;
      created_at: string;
      merged_at: string | null;
    }>;

    return mrs.map((mr) => ({
      sourceId: `gitlab:${projectId}:mr:${mr.iid}`,
      sourceUrl: mr.web_url,
      title: `MR !${mr.iid}: ${mr.title}`,
      content: `${mr.title}\n\n${mr.description ?? ""}`,
      metadata: {
        repository: projectPath,
        author: mr.author?.username,
        createdAt: mr.created_at,
        mergedAt: mr.merged_at,
      },
      aclGroups: [],
    }));
  }

  private async fetchCommits(
    accessToken: string,
    projectId: number,
    projectPath: string,
    since?: string
  ): Promise<RawDocument[]> {
    const params = new URLSearchParams({ per_page: "50" });
    if (since) params.set("since", since);

    const response = await fetch(
      `https://gitlab.com/api/v4/projects/${projectId}/repository/commits?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) return [];

    const commits = (await response.json()) as Array<{
      id: string;
      web_url: string;
      message: string;
      author_name: string;
      created_at: string;
    }>;

    return commits.map((commit) => ({
      sourceId: `gitlab:${projectId}:commit:${commit.id}`,
      sourceUrl: commit.web_url,
      title: `Commit: ${commit.message.split("\n")[0] ?? commit.id.slice(0, 8)}`,
      content: commit.message,
      metadata: {
        repository: projectPath,
        author: commit.author_name,
        createdAt: commit.created_at,
      },
      aclGroups: [],
    }));
  }
}

export const gitlabConnector = new GitLabConnector();
