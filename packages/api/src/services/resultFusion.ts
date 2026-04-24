import type { SearchResult, OSSIssue, FusedResult } from "@devglean/shared";

/**
 * ResultFusion — merges results from both search surfaces (private RAG + OSS)
 * into a unified ranked list for generation.
 *
 * Normalizes scores across both result sets, interleaves by quality,
 * and preserves surface diversity (top-3 from each surface regardless of score).
 */
export class ResultFusion {
  /**
   * Merge private RAG results and OSS issue results into a unified ranked list.
   */
  static merge(
    privateResults: SearchResult[],
    ossResults: OSSIssue[],
    maxResults: number = 10
  ): FusedResult[] {
    const fused: FusedResult[] = [];

    // Normalize private scores to [0, 1]
    const maxPrivateScore = Math.max(...privateResults.map((r) => r.score), 0.001);
    for (const result of privateResults) {
      fused.push({
        id: result.id,
        title: result.title,
        content: result.content,
        sourceUrl: result.sourceUrl,
        sourceLabel: "team",
        sourceType: result.sourceType,
        score: result.score / maxPrivateScore,
        metadata: result.metadata,
      });
    }

    // OSS issues already have issueScore in [0, 1]
    for (const issue of ossResults) {
      const sourceLabel = issue.source === "stackoverflow" ? "stackoverflow" : "github";
      fused.push({
        id: issue.id,
        title: issue.title,
        content: issue.body.slice(0, 2000), // Truncate long issues for context window
        sourceUrl: issue.htmlUrl,
        sourceLabel,
        sourceType: `OSS:${issue.repoFullName}`,
        score: issue.issueScore,
        metadata: {
          repoStars: issue.repoStars,
          reactionCount: issue.reactionCount,
          linkedPRMerged: issue.linkedPRMerged,
          linkedPRUrl: issue.linkedPRUrl,
          closedAt: issue.closedAt,
          labels: issue.labels,
        },
      });
    }

    // Sort by normalized score descending
    fused.sort((a, b) => b.score - a.score);

    // Ensure diversity: guarantee top-3 from each surface
    const teamResults = fused.filter((r) => r.sourceLabel === "team").slice(0, 3);
    const nonTeamResults = fused.filter((r) => r.sourceLabel !== "team").slice(0, 3);

    const guaranteedIds = new Set([
      ...teamResults.map((r) => r.id),
      ...nonTeamResults.map((r) => r.id),
    ]);

    // Build final list: guaranteed items first, then fill with remaining by score
    const result: FusedResult[] = [];

    // Interleave guaranteed results by score
    const guaranteed = [...teamResults, ...nonTeamResults].sort((a, b) => b.score - a.score);
    result.push(...guaranteed);

    // Fill remaining slots
    for (const item of fused) {
      if (result.length >= maxResults) break;
      if (!guaranteedIds.has(item.id)) {
        result.push(item);
      }
    }

    // Deduplicate by URL (private connector may index a public repo)
    const seen = new Set<string>();
    return result.filter((r) => {
      const key = r.sourceUrl.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
