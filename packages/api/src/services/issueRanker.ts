import { ISSUE_RANKER_WEIGHTS, TWO_YEARS_MS } from "@devglean/shared";
import type { RawOSSResult, IssueScoreBreakdown } from "@devglean/shared";

/**
 * IssueRanker — weighted scoring algorithm for OSS issue quality.
 *
 * Not all closed issues are equal. A 2-line fix on a 5-star repo is noise.
 * A merged PR with 200 👍 on a 50k-star repo is signal.
 */
export class IssueRanker {
  /**
   * Computes a normalized quality score (0–1) for an OSS issue.
   */
  static score(issue: RawOSSResult): number {
    const breakdown = IssueRanker.breakdown(issue);
    return breakdown.total;
  }

  /**
   * Returns the full score breakdown for transparency / debugging.
   */
  static breakdown(issue: RawOSSResult): IssueScoreBreakdown {
    const w = ISSUE_RANKER_WEIGHTS;

    const linkedPRMerged = issue.linkedPRMerged ? 1 : 0;

    const reactionScore = Math.min(issue.reactionCount / 100, 1);

    const starsLog = Math.log10(Math.max(issue.repoStars, 1) + 1);
    const starsScore = Math.min(starsLog / 5, 1);

    const hasCodeBlock = issue.hasCodeBlock ? 1 : 0;

    const acceptedLabel = issue.hasAcceptedLabel ? 1 : 0;

    const twoYearsAgo = Date.now() - TWO_YEARS_MS;
    const closedTs = issue.closedAt ? new Date(issue.closedAt).getTime() : 0;
    const recencyScore = closedTs > twoYearsAgo ? 1 : 0.5;

    const total =
      w.linkedPRMerged * linkedPRMerged +
      w.reactionScore * reactionScore +
      w.starsScore * starsScore +
      w.hasCodeBlock * hasCodeBlock +
      w.acceptedLabel * acceptedLabel +
      w.recency * recencyScore;

    return {
      linkedPRMerged: w.linkedPRMerged * linkedPRMerged,
      reactionScore: w.reactionScore * reactionScore,
      starsScore: w.starsScore * starsScore,
      hasCodeBlock: w.hasCodeBlock * hasCodeBlock,
      acceptedLabel: w.acceptedLabel * acceptedLabel,
      recencyScore: w.recency * recencyScore,
      total: Math.round(total * 10000) / 10000,
    };
  }
}
