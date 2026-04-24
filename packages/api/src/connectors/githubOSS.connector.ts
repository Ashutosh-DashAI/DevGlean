import { getInstallationClient, getPublicClient } from "../lib/github";
import { updateRateLimitStatus } from "../middleware/circuitBreaker";
import { logger } from "../lib/logger";
import type { RawOSSResult, OSSFilters } from "@devglean/shared";

const CODE_BLOCK_REGEX = /```[\s\S]*?```|`[^`]+`/;
const RESOLUTION_LABELS = [
  "resolution/fixed",
  "status:resolved",
  "status:completed",
  "fixed",
  "resolved",
  "wontfix",
];

/**
 * GitHub OSS Connector — searches public resolved issues and merged PRs
 * across ALL of GitHub using the Search API (semantic/hybrid when available).
 */
export class GitHubOSSConnector {
  /**
   * Search resolved issues on public GitHub repositories.
   */
  async searchResolvedIssues(
    query: string,
    filters: OSSFilters,
    installationId?: string
  ): Promise<RawOSSResult[]> {
    const octokit = installationId
      ? getInstallationClient(installationId)
      : getPublicClient();

    // Build query string
    let q = `${query} state:closed`;
    if (filters.language) {
      q += ` language:${filters.language}`;
    }
    if (filters.minStars && filters.minStars > 0) {
      q += ` stars:>=${filters.minStars}`;
    }
    if (filters.repos && filters.repos.length > 0) {
      q += ` ${filters.repos.map((r) => `repo:${r}`).join(" ")}`;
    }

    try {
      const response = await octokit.rest.search.issuesAndPullRequests({
        q,
        sort: "reactions",
        order: "desc",
        per_page: 10,
      });

      // Track rate limits
      const remaining = parseInt(
        (response.headers["x-ratelimit-remaining"] as string) ?? "30",
        10
      );
      const limit = parseInt(
        (response.headers["x-ratelimit-limit"] as string) ?? "30",
        10
      );
      const resetTs = parseInt(
        (response.headers["x-ratelimit-reset"] as string) ?? String(Math.floor(Date.now() / 1000) + 60),
        10
      );
      await updateRateLimitStatus(remaining, limit, resetTs);

      logger.debug(
        { resultCount: response.data.items.length, rateLimitRemaining: remaining },
        "GitHub OSS search complete"
      );

      // Map and enrich results
      const results: RawOSSResult[] = [];

      for (const item of response.data.items) {
        const repoFullName = item.repository_url?.split("/repos/")[1] ?? "";
        const repoUrl = `https://github.com/${repoFullName}`;

        // Get repo stars (use the repository info if available)
        let repoStars = 0;
        try {
          if (repoFullName) {
            const [owner, repo] = repoFullName.split("/");
            if (owner && repo) {
              const repoData = await octokit.rest.repos.get({ owner, repo });
              repoStars = repoData.data.stargazers_count;
            }
          }
        } catch {
          // Non-critical — continue without stars
        }

        // Check for linked merged PRs
        let linkedPRMerged = false;
        let linkedPRUrl: string | null = null;

        if (item.pull_request?.merged_at) {
          linkedPRMerged = true;
          linkedPRUrl = item.pull_request.html_url ?? null;
        }

        const body = item.body ?? "";
        const labels = item.labels.map((l) =>
          typeof l === "string" ? l : l.name ?? ""
        );

        results.push({
          title: item.title,
          body: body.slice(0, 5000),
          htmlUrl: item.html_url,
          repoFullName,
          repoUrl,
          repoStars,
          reactionCount: item.reactions?.total_count ?? 0,
          commentCount: item.comments ?? 0,
          linkedPRMerged,
          linkedPRUrl,
          hasCodeBlock: CODE_BLOCK_REGEX.test(body),
          hasAcceptedLabel: labels.some((l) =>
            RESOLUTION_LABELS.includes(l.toLowerCase())
          ),
          closedAt: item.closed_at,
          labels,
          author: item.user?.login ?? "unknown",
          source: "github",
        });
      }

      return results;
    } catch (error) {
      logger.error({ error }, "GitHub OSS search failed");
      return [];
    }
  }

  /**
   * Fetch full issue thread for Claude synthesis.
   */
  async fetchFullIssueThread(
    owner: string,
    repo: string,
    number: number,
    installationId?: string
  ): Promise<string> {
    const octokit = installationId
      ? getInstallationClient(installationId)
      : getPublicClient();

    try {
      // Fetch issue body
      const issue = await octokit.rest.issues.get({ owner, repo, issue_number: number });

      // Fetch all comments
      const comments = await octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number: number,
        per_page: 50,
      });

      // Build thread text
      let thread = `# ${issue.data.title}\n\n`;
      thread += `**Author:** ${issue.data.user?.login ?? "unknown"}\n`;
      thread += `**State:** ${issue.data.state}\n`;
      thread += `**Labels:** ${issue.data.labels.map((l) => (typeof l === "string" ? l : l.name)).join(", ")}\n`;
      thread += `**Reactions:** ${issue.data.reactions?.total_count ?? 0}\n\n`;
      thread += `## Issue Body\n\n${issue.data.body ?? "(no body)"}\n\n`;

      thread += `## Comments (${comments.data.length})\n\n`;
      for (const comment of comments.data) {
        thread += `### @${comment.user?.login ?? "unknown"} (${comment.reactions?.total_count ?? 0} reactions)\n\n`;
        thread += `${comment.body ?? ""}\n\n---\n\n`;
      }

      // Check for linked PR (look for "Closes #N" or "Fixes #N" in timeline)
      try {
        const timeline = await octokit.rest.issues.listEventsForTimeline({
          owner,
          repo,
          issue_number: number,
          per_page: 30,
        });

        const crossRefs = timeline.data.filter(
          (e) => (e as Record<string, unknown>).event === "cross-referenced"
        );

        if (crossRefs.length > 0) {
          thread += `## Referenced PRs\n\n`;
          for (const ref of crossRefs) {
            const source = (ref as Record<string, unknown>).source as Record<string, unknown> | undefined;
            const issue = source?.issue as Record<string, unknown> | undefined;
            if (issue?.pull_request) {
              thread += `- PR: ${issue.html_url as string}\n`;
            }
          }
        }
      } catch {
        // Timeline API may not be available for all repos
      }

      return thread;
    } catch (error) {
      logger.error({ error, owner, repo, number }, "Failed to fetch full issue thread");
      throw error;
    }
  }
}
