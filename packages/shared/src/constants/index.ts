/** Access token TTL: 15 minutes */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** Refresh token TTL: 7 days */
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

/** OAuth state TTL in Redis: 10 minutes */
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

/** Embedding cache TTL: 30 days */
export const EMBEDDING_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Query embedding cache TTL: 5 minutes */
export const QUERY_EMBEDDING_CACHE_TTL_SECONDS = 5 * 60;

/** Target chunk size in characters (≈512 tokens) */
export const CHUNK_SIZE_CHARS = 2048;

/** Overlap between chunks in characters (≈64 tokens) */
export const CHUNK_OVERLAP_CHARS = 256;

/** Maximum chunks per embedding API call */
export const EMBEDDING_BATCH_SIZE = 100;

/** Embedding model */
export const EMBEDDING_MODEL = "text-embedding-3-small";

/** Embedding dimensions */
export const EMBEDDING_DIMENSIONS = 1536;

/** LLM model for answer generation */
export const GENERATION_MODEL = "claude-sonnet-4-20250514";

/** Maximum context chunks sent to LLM */
export const MAX_CONTEXT_CHUNKS = 8;

/** Maximum LLM output tokens */
export const MAX_OUTPUT_TOKENS = 4096;

/** Connector sync interval in minutes */
export const SYNC_INTERVAL_MINUTES = 15;

/** Sync job max retries */
export const SYNC_MAX_RETRIES = 3;

/** Rate limits by route category (requests per window) */
export const RATE_LIMITS = {
  auth: { windowMs: 60_000, maxRequests: 10 },
  search: { windowMs: 60_000, maxRequests: 60 },
  api: { windowMs: 60_000, maxRequests: 120 },
  webhook: { windowMs: 60_000, maxRequests: 200 },
} as const;

/** Plan limits */
export const PLAN_LIMITS = {
  FREE: {
    maxConnectors: 1,
    maxQueriesPerMonth: 1000,
    maxMembers: 3,
  },
  PRO: {
    maxConnectors: 50,
    maxQueriesPerMonth: 10_000,
    maxMembers: 50,
  },
  ENTERPRISE: {
    maxConnectors: 500,
    maxQueriesPerMonth: 100_000,
    maxMembers: 500,
  },
} as const;

/** Hybrid search weights */
export const SEARCH_WEIGHTS = {
  vector: 0.7,
  fullText: 0.3,
} as const;

/** Password hashing rounds */
export const BCRYPT_ROUNDS = 12;

/** Redis key prefixes */
export const REDIS_KEYS = {
  oauthState: (state: string) => `oauth:state:${state}`,
  embeddingCache: (hash: string) => `embed:v1:${hash}`,
  queryCount: (teamId: string, month: string) => `team:${teamId}:queries:${month}`,
  rateLimit: (key: string) => `rl:${key}`,
  session: (userId: string) => `session:${userId}`,
} as const;

/** BullMQ queue names */
export const QUEUE_NAMES = {
  connectorSync: "connector-sync",
  embedding: "embedding",
} as const;

/** Cookie names */
export const COOKIE_NAMES = {
  refreshToken: "devglean_refresh_token",
} as const;

/** API version prefix */
export const API_PREFIX = "/api/v1";

// ─── OSS Intelligence Constants ──────────────────────────────────────────────

/** OSS search result cache TTL: 24 hours */
export const OSS_CACHE_TTL_SECONDS = 24 * 60 * 60;

/** Minimum cosine similarity for semantic cache match */
export const OSS_SEMANTIC_CACHE_THRESHOLD = 0.92;

/** Maximum OSS results returned per query */
export const OSS_MAX_RESULTS = 15;

/** GitHub API circuit breaker threshold — pause when remaining < this */
export const GITHUB_RATE_LIMIT_THRESHOLD = 5;

/** Fast classifier model (Claude Haiku) */
export const CLASSIFIER_MODEL = "claude-3-5-haiku-20241022";

/** Maximum classifier output tokens */
export const CLASSIFIER_MAX_TOKENS = 150;

/** IssueRanker weights (sum = 1.0) */
export const ISSUE_RANKER_WEIGHTS = {
  linkedPRMerged: 0.30,
  reactionScore: 0.20,
  starsScore: 0.15,
  hasCodeBlock: 0.15,
  acceptedLabel: 0.10,
  recency: 0.10,
} as const;

/** Two years in milliseconds for recency scoring */
export const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;

/** Stack Exchange minimum score for accepted answers */
export const STACK_MIN_SCORE = 10;

/** OSS rate limits */
export const RATE_LIMITS_OSS = {
  oss: { windowMs: 60_000, maxRequests: 20 },
} as const;

/** BullMQ queue names — OSS */
export const OSS_QUEUE_NAMES = {
  ossPrewarm: "oss-prewarm",
  ossCacheCleanup: "oss-cache-cleanup",
} as const;

/** OSS Redis keys */
export const OSS_REDIS_KEYS = {
  ossCache: (queryHash: string) => `oss:v1:${queryHash}`,
  ossRateLimit: () => "oss:github:rateLimit",
  ossCircuitBreaker: () => "oss:github:circuitOpen",
} as const;
