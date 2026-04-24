import { createHmac, timingSafeEqual } from "crypto";
import { BaseConnector } from "./base.connector";
import type { SyncCursor } from "./base.connector";
import type { RawDocument, OAuthTokens } from "@devglean/shared";
import { env } from "../env";
import { logger } from "../lib/logger";

export class GitHubConnector extends BaseConnector {
  readonly type = "GITHUB" as const;

  buildOAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: "repo read:org read:user",
      state,
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const response = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: redirectUri,
        }),
      }
    );

    const data = (await response.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (data.error || !data.access_token) {
      throw new Error(
        `GitHub OAuth error: ${data.error_description ?? data.error ?? "Unknown error"}`
      );
    }

    // Fetch the authenticated user to get workspace info
    const userResponse = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    const userData = (await userResponse.json()) as { login: string };

    return {
      accessToken: data.access_token,
      workspaceId: userData.login,
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

    // Fetch repos
    const repos = await this.fetchRepos(accessToken, config?.repos as string[] | undefined);

    for (const repo of repos) {
      try {
        // Fetch README
        const readme = await this.fetchReadme(accessToken, repo.full_name);
        if (readme) {
          docs.push(readme);
        }

        // Fetch recent commits
        const commits = await this.fetchCommits(
          accessToken,
          repo.full_name,
          since
        );
        docs.push(...commits);

        // Fetch open issues
        const issues = await this.fetchIssues(
          accessToken,
          repo.full_name,
          since
        );
        docs.push(...issues);

        // Fetch open pull requests
        const pullRequests = await this.fetchPullRequests(
          accessToken,
          repo.full_name,
          since
        );
        docs.push(...pullRequests);
      } catch (err) {
        logger.warn(
          { repo: repo.full_name, err },
          "Failed to fetch data for repository"
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
    const expected = `sha256=${createHmac("sha256", secret)
      .update(payload)
      .digest("hex")}`;

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
      const response = await fetch(
        `https://api.github.com/repos/${sourceId}/collaborators`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      if (!response.ok) return [];

      const collaborators = (await response.json()) as Array<{
        login: string;
      }>;
      return collaborators.map((c) => `github:${c.login}`);
    } catch {
      return [];
    }
  }

  private async fetchRepos(
    accessToken: string,
    filterRepos?: string[]
  ): Promise<Array<{ full_name: string; html_url: string }>> {
    const repos: Array<{ full_name: string; html_url: string }> = [];
    let page = 1;

    while (true) {
      const response = await fetch(
        `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      if (!response.ok) break;

      const data = (await response.json()) as Array<{
        full_name: string;
        html_url: string;
      }>;

      if (data.length === 0) break;

      repos.push(...data);
      page++;

      if (data.length < 100) break;
    }

    if (filterRepos && filterRepos.length > 0) {
      return repos.filter((r) => filterRepos.includes(r.full_name));
    }

    return repos;
  }

  private async fetchReadme(
    accessToken: string,
    repoFullName: string
  ): Promise<RawDocument | null> {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${repoFullName}/readme`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      if (!response.ok) return null;

      const data = (await response.json()) as {
        content: string;
        encoding: string;
        html_url: string;
        name: string;
      };

      const content =
        data.encoding === "base64"
          ? Buffer.from(data.content, "base64").toString("utf-8")
          : data.content;

      return {
        sourceId: `github:${repoFullName}:readme`,
        sourceUrl: data.html_url,
        title: `${repoFullName} — README`,
        content,
        metadata: {
          repository: repoFullName,
          filePath: data.name,
        },
        aclGroups: [],
      };
    } catch {
      return null;
    }
  }

  private async fetchCommits(
    accessToken: string,
    repoFullName: string,
    since?: string
  ): Promise<RawDocument[]> {
    const params = new URLSearchParams({ per_page: "50" });
    if (since) params.set("since", since);

    const response = await fetch(
      `https://api.github.com/repos/${repoFullName}/commits?${params}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    if (!response.ok) return [];

    const commits = (await response.json()) as Array<{
      sha: string;
      html_url: string;
      commit: {
        message: string;
        author: { name: string; date: string };
      };
    }>;

    return commits.map((commit) => ({
      sourceId: `github:${repoFullName}:commit:${commit.sha}`,
      sourceUrl: commit.html_url,
      title: `Commit: ${commit.commit.message.split("\n")[0] ?? commit.sha.slice(0, 8)}`,
      content: commit.commit.message,
      metadata: {
        repository: repoFullName,
        author: commit.commit.author.name,
        createdAt: commit.commit.author.date,
      },
      aclGroups: [],
    }));
  }

  private async fetchIssues(
    accessToken: string,
    repoFullName: string,
    since?: string
  ): Promise<RawDocument[]> {
    const params = new URLSearchParams({
      per_page: "50",
      state: "all",
      sort: "updated",
    });
    if (since) params.set("since", since);

    const response = await fetch(
      `https://api.github.com/repos/${repoFullName}/issues?${params}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    if (!response.ok) return [];

    const issues = (await response.json()) as Array<{
      number: number;
      html_url: string;
      title: string;
      body: string | null;
      user: { login: string } | null;
      created_at: string;
      pull_request?: unknown;
      labels: Array<{ name: string }>;
    }>;

    // Filter out pull requests (GitHub API returns them in issues endpoint)
    return issues
      .filter((issue) => !issue.pull_request)
      .map((issue) => ({
        sourceId: `github:${repoFullName}:issue:${issue.number}`,
        sourceUrl: issue.html_url,
        title: `Issue #${issue.number}: ${issue.title}`,
        content: `${issue.title}\n\n${issue.body ?? ""}`,
        metadata: {
          repository: repoFullName,
          author: issue.user?.login,
          createdAt: issue.created_at,
          tags: issue.labels.map((l) => l.name),
        },
        aclGroups: [],
      }));
  }

  private async fetchPullRequests(
    accessToken: string,
    repoFullName: string,
    since?: string
  ): Promise<RawDocument[]> {
    const params = new URLSearchParams({
      per_page: "50",
      state: "all",
      sort: "updated",
    });

    const response = await fetch(
      `https://api.github.com/repos/${repoFullName}/pulls?${params}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    if (!response.ok) return [];

    const prs = (await response.json()) as Array<{
      number: number;
      html_url: string;
      title: string;
      body: string | null;
      user: { login: string } | null;
      created_at: string;
      merged_at: string | null;
    }>;

    return prs
      .filter((pr) => !since || new Date(pr.created_at) >= new Date(since))
      .map((pr) => ({
        sourceId: `github:${repoFullName}:pr:${pr.number}`,
        sourceUrl: pr.html_url,
        title: `PR #${pr.number}: ${pr.title}`,
        content: `${pr.title}\n\n${pr.body ?? ""}`,
        metadata: {
          repository: repoFullName,
          author: pr.user?.login,
          createdAt: pr.created_at,
          mergedAt: pr.merged_at,
        },
        aclGroups: [],
      }));
  }
}

export const githubConnector = new GitHubConnector();
