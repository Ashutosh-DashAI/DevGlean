export interface SearchResult {
  id: string;
  title: string;
  content: string;
  sourceUrl: string;
  sourceType: string;
  score: number;
  metadata: DocumentMetadata;
  chunkIndex: number;
  chunkTotal: number;
}

export interface SearchResponse {
  answer: string;
  sources: SearchResult[];
  latencyMs: number;
  queryId: string;
  tokensUsed: number;
}

export interface SSEEvent {
  event: "token" | "source" | "done" | "error";
  data: string;
}

export interface DocumentMetadata {
  author?: string;
  createdAt?: string;
  updatedAt?: string;
  filePath?: string;
  section?: string;
  tags?: string[];
  channel?: string;
  repository?: string;
  language?: string;
  [key: string]: unknown;
}

export interface RawDocument {
  sourceId: string;
  sourceUrl: string;
  title: string;
  content: string;
  metadata: DocumentMetadata;
  aclGroups: string[];
}

export interface DocumentChunk {
  content: string;
  chunkIndex: number;
  chunkTotal: number;
  contentHash: string;
  metadata: DocumentMetadata;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  workspaceId?: string;
}

export interface ConnectorSyncResult {
  docsIndexed: number;
  docsUpdated: number;
  docsDeleted: number;
  errors: string[];
}

export interface JwtPayload {
  sub: string;
  teamId: string;
  role: string;
  plan: string;
  iat: number;
  exp: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  teamId: string;
  role: string;
  plan: string;
}

export interface TeamOverview {
  id: string;
  name: string;
  slug: string;
  plan: string;
  memberCount: number;
  connectorCount: number;
  documentCount: number;
  createdAt: string;
}

export interface AnalyticsOverview {
  totalQueries: number;
  avgLatencyMs: number;
  documentCount: number;
  activeConnectors: number;
  queriesThisMonth: number;
  queryLimitMonthly: number;
}

export interface QueryVolumeDataPoint {
  date: string;
  count: number;
}

export interface TopQuery {
  query: string;
  count: number;
  avgLatencyMs: number;
}

export interface ConnectorHealth {
  connectorId: string;
  displayName: string;
  type: string;
  status: string;
  documentCount: number;
  successRate: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface UsageInfo {
  queriesUsed: number;
  queriesLimit: number;
  connectorsUsed: number;
  connectorsLimit: number;
  plan: string;
  billingPeriodEnd: string | null;
}

// ─── OSS Intelligence Types ──────────────────────────────────────────────────

export type QuerySurface = "private" | "oss" | "both";

export interface OSSIssue {
  id: string;
  title: string;
  body: string;
  htmlUrl: string;
  repoFullName: string;
  repoUrl: string;
  repoStars: number;
  reactionCount: number;
  commentCount: number;
  linkedPRMerged: boolean;
  linkedPRUrl: string | null;
  hasCodeBlock: boolean;
  hasAcceptedLabel: boolean;
  closedAt: string | null;
  labels: string[];
  author: string;
  source: "github" | "stackoverflow";
  issueScore: number;
}

export interface IssueScoreBreakdown {
  linkedPRMerged: number;
  reactionScore: number;
  starsScore: number;
  hasCodeBlock: number;
  acceptedLabel: number;
  recencyScore: number;
  total: number;
}

export interface RawOSSResult {
  title: string;
  body: string;
  htmlUrl: string;
  repoFullName: string;
  repoUrl: string;
  repoStars: number;
  reactionCount: number;
  commentCount: number;
  linkedPRMerged: boolean;
  linkedPRUrl: string | null;
  hasCodeBlock: boolean;
  hasAcceptedLabel: boolean;
  closedAt: string | null;
  labels: string[];
  author: string;
  source: "github" | "stackoverflow";
}

export interface OSSFilters {
  repos?: string[];
  minStars?: number;
  language?: string;
  dateRange?: {
    from?: string;
    to?: string;
  };
}

export interface OSSSearchResult {
  issues: OSSIssue[];
  totalCount: number;
  cacheHit: boolean;
  rateLimitStatus: OSSRateLimitStatus;
}

export interface OSSRateLimitStatus {
  remaining: number;
  limit: number;
  resetAt: string;
  paused: boolean;
}

export interface OSSCacheStatus {
  hitRate: number;
  totalEntries: number;
  nextResetAt: string | null;
  rateLimitRemaining: number;
}

export interface IssueSynthesis {
  problem: string;
  rootCause: string;
  solution: string;
  codeExamples: string[];
  references: Array<{ title: string; url: string }>;
}

export interface QueryClassification {
  surface: QuerySurface;
  reasoning: string;
  confidence: number;
}

export interface FusedResult {
  id: string;
  title: string;
  content: string;
  sourceUrl: string;
  sourceLabel: "team" | "github" | "stackoverflow";
  sourceType: string;
  score: number;
  metadata: Record<string, unknown>;
}
