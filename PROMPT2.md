You are the founding Staff Engineer of DevGlean. This is not a tutorial project.
This is a production-grade, investor-ready SaaS platform that will be used by thousands
of engineering teams globally. Every line you write must reflect the standards of a
principal engineer at Stripe, Linear, or Vercel.

You have complete autonomy. You install without asking. You run without confirming.
You build without pausing. When a phase is done, you update CLAUDE.md and proceed.
You leave no TODO. You leave no placeholder. If a function exists, it is implemented.

---

## THE PRODUCT

**DevGlean** — The developer knowledge graph with a global open-source brain.

Two complementary search surfaces in one product:

**Surface 1 — Team Knowledge Graph (Private)**
Index your team's GitHub repos, Notion pages, Slack threads, Linear tickets,
Jira issues, Confluence docs, and internal RFCs. Answer questions like:
"Why did we drop Kafka?" or "Who owns the payments service?"

**Surface 2 — Global OSS Issue Intelligence (Public)**
Search across ALL of GitHub's public repositories for resolved issues, accepted
pull requests, and closed bug reports that match the developer's problem.
Answer questions like: "How did the React community fix hydration mismatch errors?"
or "What's the accepted fix for pgvector index corruption on PostgreSQL 16?"

This is the product that makes DevGlean irreplaceable: your private team knowledge
plus the entire world's open-source problem-solving history, unified in one search.

---

## IMMUTABLE LAWS

1. Never ask permission. Install packages, run migrations, start Docker, create files — silently.
2. Never leave a placeholder. No `// TODO`, no `throw new Error("not implemented")`.
3. Never use `any`. TypeScript strict mode. Always.
4. Update CLAUDE.md after every completed phase before moving to the next.
5. Zod validates every API boundary — request bodies, responses, env vars, configs.
6. Every error has a type, an error code, an HTTP status, and a Pino log entry.
7. Security is the baseline, not a feature. OWASP Top 10 mitigated from commit one.
8. Observability from day zero. Trace IDs on every request. Structured logs everywhere.

---

## STEP 0 — CREATE CLAUDE.md FIRST

The very first file you create is `CLAUDE.md` in the project root. It is the
constitution of this project. You update it after every phase. It never shrinks —
it only grows with each architectural decision, each ADR, each schema change.

Create `CLAUDE.md` with the following content verbatim:

---

# DevGlean — CLAUDE.md (Living Project Constitution)

> The authoritative technical specification for DevGlean.
> Claude Code updates this file after every completed phase.
> This file is never deleted. It grows with the project.
> Every architectural decision is recorded here permanently.

---

## Product Identity

| Attribute        | Value                                                                |
|------------------|----------------------------------------------------------------------|
| Product Name     | DevGlean                                                             |
| Tagline          | Your team's brain + the world's open-source knowledge, unified      |
| Target Market    | Engineering teams of 2–50, indie hackers, dev agencies               |
| Core Value Prop  | Private team knowledge + global OSS issue resolution, in one search |
| Pricing          | Free (1 connector, 100 queries/mo) · Pro $29/mo · Enterprise custom  |
| Auth Strategy    | JWT (15m) + Refresh Token families (7d, DB-persisted, rotated)      |
| Deployment       | Docker Compose (local dev) → Fly.io (production)                     |

---

## The Two Search Surfaces

### Surface 1 — Team Knowledge Graph (Private RAG)
Indexes connectors the team explicitly connects. Documents are stored in PostgreSQL
with pgvector embeddings. ACL-filtered so users only see what they're permitted to.
Real-time sync via BullMQ jobs + webhooks. Hybrid vector + full-text retrieval.

### Surface 2 — Global OSS Issue Intelligence
Searches the entire public GitHub ecosystem for resolved issues in real-time.
Does NOT pre-index the world (impossible at this scale). Instead:

**Architecture — Federated Search with Intelligent Caching:**

```
User query: "pgvector index corruption PostgreSQL 16"
     │
     ▼
┌─────────────────────────────────────────────────────┐
│            QueryClassifier (LLM, fast)              │
│  Detects: is this a team question or OSS question?  │
│  Can be both → runs both pipelines in parallel      │
└──────────┬──────────────────────────┬───────────────┘
           │                          │
    ┌──────▼──────┐            ┌──────▼────────────────┐
    │  Private    │            │  OSS Intelligence     │
    │  RAG        │            │  Pipeline             │
    │  (Surface 1)│            │                       │
    │             │            │  1. Redis cache check │
    │  pgvector   │            │     (TTL: 24h)        │
    │  hybrid     │            │                       │
    │  search     │            │  2. Cache MISS:       │
    │             │            │     GitHub Search API │
    │             │            │     (semantic+hybrid) │
    │             │            │     state:closed      │
    │             │            │     is:issue OR is:pr │
    │             │            │     + Stack Exchange  │
    │             │            │       API (answered)  │
    │             │            │                       │
    │             │            │  3. Fetch top 10      │
    │             │            │     issue bodies +    │
    │             │            │     linked PRs +      │
    │             │            │     accepted comments │
    │             │            │                       │
    │             │            │  4. Embed + store in  │
    │             │            │     ephemeral cache   │
    │             │            │     (Redis, 24h TTL)  │
    │             │            │                       │
    │             │            │  5. Warm: background  │
    │             │            │     job pre-fetches   │
    │             │            │     related issues    │
    └──────┬──────┘            └──────┬────────────────┘
           │                          │
    ┌──────▼──────────────────────────▼───────────────┐
    │              Result Fusion Layer                 │
    │  Merges private + OSS results by relevance score │
    │  Deduplicates. Ranks. Injects source labels.     │
    └──────────────────────┬──────────────────────────┘
                           │
    ┌──────────────────────▼──────────────────────────┐
    │           Generation Service (Claude)            │
    │  Synthesizes unified answer with citations:      │
    │  [Team: ADR-004] [OSS: facebook/react#28523]    │
    └─────────────────────────────────────────────────┘
```

**GitHub API Rate Limit Strategy (Critical — Do Not Skip):**

The GitHub Search API limits to 30 req/min per PAT, 10 req/min for semantic search.
This is the hard constraint. The architecture is designed around it:

1. **GitHub App per team installation** — each team installs DevGlean as a GitHub App.
   Rate limit is per-installation: 30 searches/min × N teams. Scales linearly.

2. **Redis query result cache** — cache key: `oss:v1:${sha256(normalizedQuery)}`.
   TTL: 24 hours. Estimated cache hit rate: ~70% (dev problems are repetitive).
   With 100 teams and 70% cache hit rate, real API calls drop to ~9/min per team.

3. **Semantic search via new GitHub API** — use `search_type=hybrid` on
   `GET /search/issues` endpoint (GA as of April 2026). Natural language queries
   return conceptually related results even when wording differs. Use this.

4. **Query normalization before caching** — embed the query, find the nearest
   cached query within cosine similarity > 0.92. If found, return cached result.
   Avoids duplicate API calls for semantically identical questions.

5. **BullMQ background pre-warming** — when a cache miss occurs and results are
   fetched, enqueue a job to pre-fetch 5 related queries (using Claude to generate
   related phrasings). Warms cache proactively.

6. **Stack Exchange API as supplement** — Stack Exchange API has no auth requirement
   for reads, 300 req/day unauthenticated, 10,000/day with key. Always supplement
   GitHub results with Stack Overflow accepted answers (score > 10, has_accepted_answer).

7. **Circuit breaker on GitHub API** — if rate limit header `X-RateLimit-Remaining`
   drops below 5, pause OSS queries for the remainder of the reset window and serve
   cache-only results with a UI indicator "Live search paused — serving cached results".

**Issue Quality Scoring (IssueRanker):**

Not all closed issues are equal. Score each issue on:

```typescript
interface IssueScore {
  reactionCount: number;       // 👍 reactions on the issue
  commentCount: number;        // More discussion = more signal
  linkedPRMerged: boolean;     // Has a merged PR that closes it = definitive fix
  acceptedLabel: boolean;      // Has label: "resolution/fixed", "status:resolved"
  repoStars: number;           // log10(stars) as weight — popular repos matter more
  recency: number;             // Issues closed in last 2 years weighted higher
  hasCodeBlock: boolean;       // Issue/comment contains a code block = actionable
  upvotedAnswer: boolean;      // Stack Overflow: has_accepted_answer = true
}

// Final score: weighted sum, normalized 0–1
score = (
  0.30 * linkedPRMerged +
  0.20 * (reactionCount / 100).clamp(0,1) +
  0.15 * (repoStars_log / 5).clamp(0,1) +
  0.15 * hasCodeBlock +
  0.10 * acceptedLabel +
  0.10 * recency
)
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                               │
│   React 19 + Vite 6 │ TanStack Router │ TanStack Query v5          │
│   Zustand 5 │ shadcn/ui │ Tailwind 4 │ Framer Motion │ SSE         │
└─────────────────────────────┬───────────────────────────────────────┘
                              │ HTTPS / SSE
┌─────────────────────────────▼───────────────────────────────────────┐
│                          API GATEWAY (Hono 4 + Bun)                 │
│   Rate Limit (Redis sliding window) │ JWT Auth │ Zod Validation     │
│   Helmet │ CORS │ Pino Logger │ Trace IDs │ Circuit Breaker         │
└───┬────────────┬────────────┬────────────┬────────────┬─────────────┘
    │            │            │            │            │
┌───▼──┐  ┌─────▼──┐  ┌──────▼─┐  ┌──────▼─┐  ┌──────▼──────┐
│ Auth │  │ Search │  │Connec- │  │Billing │  │  OSS Intel  │
│      │  │        │  │ tors   │  │        │  │  Service    │
│ JWT  │  │ RAG    │  │        │  │ Stripe │  │             │
│ Rot- │  │ Hybrid │  │ OAuth2 │  │ Subs   │  │ GitHub App  │
│ ation│  │ Stream │  │ BullMQ │  │ Plans  │  │ Rate-Limit  │
│ ACL  │  │ Fusion │  │ Sync   │  │ Usage  │  │ Cache Layer │
└───┬──┘  └─────┬──┘  └──────┬─┘  └──────┬─┘  └──────┬──────┘
    │            │            │            │            │
┌───▼────────────▼────────────▼────────────▼────────────▼──────────┐
│                         DATA LAYER                                 │
│  PostgreSQL 16 + pgvector    │    Redis 7 + BullMQ                 │
│  Prisma 6 ORM                │    OSS query cache (24h TTL)        │
│  Documents + embeddings      │    Embedding cache (30d TTL)        │
│  Teams + users + ACL         │    Rate limit counters              │
│  Query logs + analytics      │    Session + OAuth tokens           │
└────────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────────┐
│                      EXTERNAL SERVICES                               │
│  GitHub App API (semantic search, issues, PRs, repos)               │
│  Stack Exchange API (answered questions, accepted answers)          │
│  OpenAI text-embedding-3-small (1536-dim, $0.02/1M tokens)         │
│  Anthropic claude-sonnet-4-20250514 (answer gen, streaming)         │
│  Stripe (subscriptions, webhooks, customer portal)                  │
│  Resend (transactional email — invites, billing, alerts)            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Monorepo Structure

```
devglean/
├── CLAUDE.md                          ← Constitution. Updated after every phase.
├── PROMPT.md                          ← Original build prompt. Never delete.
├── .env.example                       ← All env vars with inline documentation
├── docker-compose.yml                 ← Dev: postgres, redis, pgadmin
├── docker-compose.prod.yml            ← Prod: all services + nginx
├── turbo.json                         ← Task graph: dev, build, typecheck, lint, test
├── package.json                       ← Bun workspaces root
│
├── packages/
│   ├── db/                            ← Shared Prisma client + schema
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   └── src/
│   │       └── index.ts              ← Re-exports PrismaClient + all types
│   │
│   ├── shared/                        ← Zod schemas, types, errors (imported by api + web)
│   │   └── src/
│   │       ├── schemas/               ← auth, search, connector, oss, billing schemas
│   │       ├── types/                 ← SearchResult, OSSIssue, Connector, IssueScore...
│   │       ├── errors/                ← AppError class + ErrorCode enum
│   │       └── constants/             ← Rate limits, TTLs, chunk sizes, plan limits
│   │
│   ├── api/                           ← Bun + Hono 4 backend
│   │   └── src/
│   │       ├── index.ts               ← Entry: boot server, wire middleware, start workers
│   │       ├── app.ts                 ← Hono app factory (no side effects, testable)
│   │       ├── env.ts                 ← Zod-validated env — throws on missing vars at boot
│   │       ├── middleware/
│   │       │   ├── auth.ts            ← JWT verify, attach c.set('user', payload)
│   │       │   ├── rateLimit.ts       ← Sliding window via Redis ZADD/ZCOUNT
│   │       │   ├── traceId.ts         ← UUID per request, X-Trace-ID header
│   │       │   ├── errorHandler.ts    ← AppError → structured JSON, unknown → 500
│   │       │   ├── teamScope.ts       ← Inject teamId + plan + aclGroups
│   │       │   └── circuitBreaker.ts  ← GitHub API rate limit guard
│   │       ├── routes/
│   │       │   ├── auth.routes.ts
│   │       │   ├── search.routes.ts   ← Unified: private RAG + OSS in parallel
│   │       │   ├── oss.routes.ts      ← Dedicated OSS search + trending issues
│   │       │   ├── connector.routes.ts
│   │       │   ├── document.routes.ts
│   │       │   ├── team.routes.ts
│   │       │   ├── analytics.routes.ts
│   │       │   ├── webhook.routes.ts  ← GitHub, Notion, Slack, Linear, Stripe
│   │       │   ├── billing.routes.ts
│   │       │   └── health.routes.ts   ← /health + /metrics
│   │       ├── services/
│   │       │   ├── auth.service.ts
│   │       │   ├── search.service.ts  ← Orchestrates Surface 1 + Surface 2 fusion
│   │       │   ├── oss.service.ts     ← Global OSS search pipeline (THE core feature)
│   │       │   ├── issueRanker.ts     ← IssueScore weighted algorithm
│   │       │   ├── queryClassifier.ts ← Claude: team? oss? both?
│   │       │   ├── resultFusion.ts    ← Merge private + OSS by relevance
│   │       │   ├── embedding.service.ts
│   │       │   ├── retrieval.service.ts
│   │       │   ├── generation.service.ts
│   │       │   ├── chunker.service.ts
│   │       │   ├── acl.service.ts
│   │       │   ├── billing.service.ts
│   │       │   └── analytics.service.ts
│   │       ├── connectors/
│   │       │   ├── base.connector.ts
│   │       │   ├── github.connector.ts    ← Private repos (team connector)
│   │       │   ├── githubOSS.connector.ts ← Public OSS search (global brain)
│   │       │   ├── stackexchange.connector.ts
│   │       │   ├── notion.connector.ts
│   │       │   ├── slack.connector.ts
│   │       │   ├── linear.connector.ts
│   │       │   └── jira.connector.ts
│   │       ├── jobs/
│   │       │   ├── queue.ts
│   │       │   ├── sync.worker.ts
│   │       │   ├── embed.worker.ts
│   │       │   ├── ossPrewarm.worker.ts   ← Pre-warms OSS cache for related queries
│   │       │   └── scheduler.ts
│   │       └── lib/
│   │           ├── prisma.ts
│   │           ├── redis.ts
│   │           ├── openai.ts
│   │           ├── anthropic.ts
│   │           ├── github.ts              ← GitHub App Octokit client (per-installation)
│   │           ├── stackexchange.ts       ← Stack Exchange API client
│   │           ├── stripe.ts
│   │           └── logger.ts
│   │
│   └── web/                           ← React 19 + Vite 6 frontend
│       └── src/
│           ├── pages/
│           │   ├── search/Search.tsx       ← Unified search (both surfaces)
│           │   ├── oss/OSSExplorer.tsx     ← Dedicated OSS issue browser
│           │   ├── connectors/Connectors.tsx
│           │   ├── documents/Documents.tsx
│           │   ├── analytics/Analytics.tsx
│           │   ├── settings/Settings.tsx
│           │   └── onboarding/Onboarding.tsx
│           ├── components/
│           │   ├── search/
│           │   │   ├── SearchBar.tsx
│           │   │   ├── AnswerCard.tsx
│           │   │   ├── SourcePanel.tsx      ← Unified: team + OSS sources
│           │   │   ├── OSSIssueCard.tsx     ← GitHub issue card with score badge
│           │   │   └── SearchSurface.tsx    ← Toggle: "Team" | "OSS" | "Both"
│           │   ├── oss/
│           │   │   ├── IssueList.tsx
│           │   │   ├── IssueDetail.tsx      ← Full issue + linked PR + solution
│           │   │   ├── RepoFilter.tsx
│           │   │   └── TrendingIssues.tsx
│           │   └── layout/
│           │       ├── Sidebar.tsx
│           │       └── CommandPalette.tsx
│           ├── hooks/
│           │   ├── useSearch.ts            ← SSE streaming unified search
│           │   ├── useOSSSearch.ts         ← OSS-only search with cache status
│           │   └── useRateLimit.ts         ← Shows API status in UI
│           └── store/
│               └── auth.store.ts
│
└── infra/
    ├── fly.toml
    ├── nginx.conf
    └── scripts/
        ├── setup.sh                   ← One command: clone → running in 5 minutes
        ├── migrate.sh
        └── seed.ts                    ← Demo team + GitHub App + 200 OSS cache entries
```

---

## Prisma Schema (Authoritative)

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgvector(map: "vector"), pg_trgm]
}

// ─── IDENTITY ────────────────────────────────────────────────────────────────

model User {
  id            String         @id @default(cuid())
  email         String         @unique
  passwordHash  String
  name          String
  avatarUrl     String?
  role          TeamRole       @default(MEMBER)
  teamId        String
  team          Team           @relation(fields: [teamId], references: [id], onDelete: Cascade)
  refreshTokens RefreshToken[]
  queryLogs     QueryLog[]
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  @@index([teamId])
  @@index([email])
}

model RefreshToken {
  id        String    @id @default(cuid())
  token     String    @unique        // SHA-256 hashed, never plaintext
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  family    String                   // Token family ID — full family revoked on reuse
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
  @@index([token])
  @@index([family])
}

// ─── MULTI-TENANCY ────────────────────────────────────────────────────────────

model Team {
  id                   String       @id @default(cuid())
  name                 String
  slug                 String       @unique
  plan                 Plan         @default(FREE)
  stripeCustomerId     String?      @unique
  stripeSubscriptionId String?      @unique
  githubAppInstallId   String?      @unique  // GitHub App installation ID for OSS search
  members              User[]
  connectors           Connector[]
  documents            Document[]
  queryLogs            QueryLog[]
  ossQueryLogs         OSSQueryLog[]
  invites              TeamInvite[]
  createdAt            DateTime     @default(now())
  updatedAt            DateTime     @updatedAt

  @@index([slug])
}

model TeamInvite {
  id         String    @id @default(cuid())
  email      String
  role       TeamRole  @default(MEMBER)
  token      String    @unique
  teamId     String
  team       Team      @relation(fields: [teamId], references: [id], onDelete: Cascade)
  expiresAt  DateTime
  acceptedAt DateTime?
  createdAt  DateTime  @default(now())

  @@index([token])
  @@index([teamId])
}

// ─── TEAM CONNECTORS (Private) ────────────────────────────────────────────────

model Connector {
  id             String          @id @default(cuid())
  teamId         String
  team           Team            @relation(fields: [teamId], references: [id], onDelete: Cascade)
  type           ConnectorType
  displayName    String
  oauthToken     String          // AES-256-GCM encrypted
  refreshToken   String?         // AES-256-GCM encrypted
  tokenExpiresAt DateTime?
  workspaceId    String?
  syncCursor     Json?
  lastSyncedAt   DateTime?
  lastSyncStatus SyncStatus      @default(PENDING)
  lastSyncError  String?
  webhookSecret  String?
  config         Json?           // repos[], channels[], etc.
  status         ConnectorStatus @default(ACTIVE)
  documents      Document[]
  syncJobs       SyncJob[]
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  @@unique([teamId, type, workspaceId])
  @@index([teamId, status])
}

model SyncJob {
  id           String     @id @default(cuid())
  connectorId  String
  connector    Connector  @relation(fields: [connectorId], references: [id], onDelete: Cascade)
  status       SyncStatus @default(RUNNING)
  docsIndexed  Int        @default(0)
  docsUpdated  Int        @default(0)
  docsDeleted  Int        @default(0)
  errorMessage String?
  startedAt    DateTime   @default(now())
  completedAt  DateTime?

  @@index([connectorId, status])
}

// ─── PRIVATE DOCUMENT STORE + VECTOR INDEX ────────────────────────────────────

model Document {
  id          String                        @id @default(cuid())
  teamId      String
  team        Team                          @relation(fields: [teamId], references: [id], onDelete: Cascade)
  connectorId String
  connector   Connector                     @relation(fields: [connectorId], references: [id], onDelete: Cascade)
  sourceType  ConnectorType
  sourceId    String
  sourceUrl   String
  title       String
  content     String
  embedding   Unsupported("vector(1536)")?
  chunkIndex  Int
  chunkTotal  Int
  metadata    Json
  aclGroups   String[]
  contentHash String
  version     Int                           @default(1)
  createdAt   DateTime                      @default(now())
  updatedAt   DateTime                      @updatedAt

  @@unique([teamId, sourceId, chunkIndex])
  @@index([teamId, connectorId])
  @@index([contentHash])
}

// ─── OSS ISSUE CACHE ─────────────────────────────────────────────────────────
// Ephemeral cache of resolved OSS issues fetched from GitHub/Stack Exchange.
// Row TTL enforced by a nightly cleanup job (not by Postgres TTL extension —
// we control it via expiresAt and a BullMQ cleaner job).

model OSSIssueCache {
  id            String   @id @default(cuid())
  queryHash     String   @unique  // SHA-256 of normalizedQuery
  normalizedQuery String
  queryEmbedding Unsupported("vector(1536)")?  // For semantic deduplication
  results       Json     // OSSSearchResult[] serialized
  hitCount      Int      @default(1)  // How many times this cache entry was served
  expiresAt     DateTime
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([queryHash])
  @@index([expiresAt])
}

// ─── ANALYTICS ────────────────────────────────────────────────────────────────

model QueryLog {
  id             String   @id @default(cuid())
  teamId         String
  team           Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  userId         String
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  query          String
  answer         String?
  surface        QuerySurface  // PRIVATE | OSS | BOTH
  sourceCount    Int      @default(0)
  ossResultCount Int      @default(0)
  latencyMs      Int
  tokensUsed     Int      @default(0)
  cacheHit       Boolean  @default(false)  // Was OSS result from cache?
  wasHelpful     Boolean?
  createdAt      DateTime @default(now())

  @@index([teamId, createdAt])
  @@index([userId])
}

model OSSQueryLog {
  id           String   @id @default(cuid())
  teamId       String
  team         Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  query        String
  cacheHit     Boolean
  resultCount  Int
  topRepoUrl   String?
  latencyMs    Int
  createdAt    DateTime @default(now())

  @@index([teamId, createdAt])
  @@index([cacheHit])
}

// ─── ENUMS ────────────────────────────────────────────────────────────────────

enum TeamRole        { OWNER ADMIN MEMBER }
enum Plan            { FREE PRO ENTERPRISE }
enum ConnectorType   { GITHUB NOTION SLACK LINEAR JIRA CONFLUENCE GITLAB }
enum ConnectorStatus { ACTIVE PAUSED ERROR DISCONNECTED }
enum SyncStatus      { PENDING RUNNING SUCCESS FAILED }
enum QuerySurface    { PRIVATE OSS BOTH }
```

---

## API Gateway — Complete Route Manifest

### Auth — `/api/v1/auth`

| Method | Path | Auth | Contract |
|--------|------|------|----------|
| POST | `/register` | Public | `{email, password, name, teamName}` → `{user, team, accessToken}` + refresh cookie |
| POST | `/login` | Public | `{email, password}` → `{user, accessToken}` + refresh cookie |
| POST | `/refresh` | Cookie | → `{accessToken}` + rotated refresh cookie. Reuse = full family revocation. |
| POST | `/logout` | JWT | Revokes current token family. Clears cookie. |
| POST | `/logout-all` | JWT | Revokes all token families for user. |
| POST | `/invite/accept` | Public | `{token, password, name}` → joins team |
| POST | `/password/reset-request` | Public | `{email}` → sends reset email via Resend |
| POST | `/password/reset` | Public | `{token, newPassword}` → updates hash |

### Teams — `/api/v1/teams`

| Method | Path | Auth | Contract |
|--------|------|------|----------|
| GET | `/` | JWT | Returns team + members + plan + usage stats |
| PATCH | `/` | ADMIN | `{name?, slug?}` |
| GET | `/members` | JWT | Paginated member list with roles |
| POST | `/members/invite` | ADMIN | `{email, role}` → sends invite email |
| DELETE | `/members/:userId` | ADMIN | Remove member |
| PATCH | `/members/:userId/role` | OWNER | `{role}` |
| DELETE | `/` | OWNER | `{confirmSlug}` — deletes team + all data (GDPR) |

### Search — `/api/v1/search`

| Method | Path | Auth | Contract |
|--------|------|------|----------|
| POST | `/` | JWT | `{query, surface?: "private"\|"oss"\|"both", filters?: {connectorIds?, sourceTypes?, repos?, dateRange?, minStars?}, stream?: true}` → SSE stream of `{type: "token"\|"sources"\|"done"}` |
| GET | `/history` | JWT | `?page=&limit=&surface=` → paginated query history |
| POST | `/:queryId/feedback` | JWT | `{helpful: boolean, comment?: string}` |
| GET | `/suggestions` | JWT | `?q=` → autocomplete from team query history |

### OSS Intelligence — `/api/v1/oss`

| Method | Path | Auth | Contract |
|--------|------|------|----------|
| POST | `/search` | JWT | `{query, filters?: {repos?: string[], minStars?: number, language?: string, dateRange?}}` → `{issues: OSSIssue[], cacheHit: boolean, rateLimitStatus}` |
| GET | `/trending` | JWT | Top issues being searched by teams globally (anonymized). `?language=&timeframe=day\|week` |
| GET | `/issue/:owner/:repo/:number` | JWT | Full issue detail: body + all comments + linked PRs + IssueScore breakdown |
| POST | `/issue/:owner/:repo/:number/synthesize` | JWT | Claude synthesizes the issue thread into a structured solution. Returns `{problem, solution, codeExamples[], references[]}` |
| GET | `/cache/status` | JWT | `{hitRate, totalEntries, nextResetAt, rateLimitRemaining}` — OSS cache health |

### Connectors — `/api/v1/connectors`

| Method | Path | Auth | Contract |
|--------|------|------|----------|
| GET | `/` | JWT | List connectors with sync status, doc count, last synced |
| GET | `/:id` | JWT | Single connector + recent sync jobs |
| POST | `/:type/oauth/start` | JWT | → `{authUrl, state}`. State stored in Redis, 10-min TTL. |
| POST | `/:type/oauth/callback` | JWT | Exchange code, encrypt tokens, create Connector, enqueue initial sync |
| PATCH | `/:id` | ADMIN | `{config?, displayName?, status?}` |
| DELETE | `/:id` | ADMIN | Disconnect + delete all indexed docs |
| POST | `/:id/sync` | ADMIN | Enqueue manual full sync → `{jobId}` |
| POST | `/:id/pause` | ADMIN | Pause scheduled sync |
| POST | `/:id/resume` | ADMIN | Resume scheduled sync |
| GET | `/:id/jobs` | JWT | Sync job history, paginated |

### Documents — `/api/v1/documents`

| Method | Path | Auth | Contract |
|--------|------|------|----------|
| GET | `/` | JWT | `?connectorId=&sourceType=&q=&page=&limit=` → paginated doc browser |
| GET | `/:id` | JWT | Single chunk with embedding metadata |
| DELETE | `/:id` | ADMIN | Remove chunk from index |
| POST | `/reindex` | ADMIN | `{connectorId?}` → re-embed all docs (model upgrade path) |

### Analytics — `/api/v1/analytics`

| Method | Path | Auth | Contract |
|--------|------|------|----------|
| GET | `/overview` | ADMIN | `{totalQueries, avgLatencyMs, docCount, ossHitRate, connectorHealth[]}` |
| GET | `/queries` | ADMIN | `?from=&to=&granularity=hour\|day\|week&surface=` → time series |
| GET | `/queries/top` | ADMIN | Top N most frequent queries, by surface |
| GET | `/queries/slow` | ADMIN | Queries exceeding P95 latency |
| GET | `/oss/cache` | ADMIN | OSS cache analytics: hit rate, popular queries, cost saved |
| GET | `/usage` | JWT | Current user's team usage vs plan limits |

### Billing — `/api/v1/billing`

| Method | Path | Auth | Contract |
|--------|------|------|----------|
| GET | `/` | JWT | Current plan, next billing date, usage vs limits |
| POST | `/checkout` | OWNER | → `{checkoutUrl}` Stripe Checkout session |
| POST | `/portal` | OWNER | → `{portalUrl}` Stripe Customer Portal |
| DELETE | `/subscription` | OWNER | Cancel at period end |

### Webhooks — `/api/v1/webhooks`

All webhook routes validate HMAC signature BEFORE any processing.
Reject with 401 if signature invalid. No exceptions.

| Method | Path | Validation | Handles |
|--------|------|------------|---------|
| POST | `/github` | `X-Hub-Signature-256` | push, pull_request, issues closed → incremental sync |
| POST | `/github/app` | `X-Hub-Signature-256` | App installation events → update githubAppInstallId |
| POST | `/notion` | Header HMAC | Page updated → re-index page |
| POST | `/slack` | `X-Slack-Signature` | Message posted in indexed channel |
| POST | `/linear` | `X-Linear-Signature` | Issue/comment created/updated |
| POST | `/stripe` | `Stripe-Signature` | subscription.created/updated/deleted → update Plan |

### Health — `/health`, `/metrics`

| Method | Path | Auth | Contract |
|--------|------|------|----------|
| GET | `/health` | Public | `{status, db, redis, version, uptime}` |
| GET | `/health/deep` | Internal | Per-dependency latency + queue depths |
| GET | `/metrics` | Internal | Prometheus format: request counters, latency histograms, queue gauges |

---

## Auth Strategy (Full Specification)

### Token Architecture

```
Access Token
  Format:    JWT, HS256, signed with JWT_SECRET
  Payload:   { sub: userId, teamId, role, plan, iat, exp }
  TTL:       15 minutes
  Transport: Authorization: Bearer header
  Storage:   Never persisted — stateless by design

Refresh Token
  Format:    crypto.randomBytes(32).toString('hex') — 64-char opaque string
  Storage:   SHA-256(token) stored in DB — plaintext never persists
  TTL:       7 days
  Transport: HttpOnly, Secure, SameSite=Strict cookie named __rt
  Family:    Each login session generates a new family UUID

Token Rotation
  On refresh: old token revoked (revokedAt set), new token issued same family
  On reuse:   ENTIRE family revoked → user must re-login → Sentry alert fired
  On logout:  Current token revoked, cookie cleared
  On logout-all: All families for user revoked
```

### OAuth2 Flow (per connector type)

```
1. GET /api/v1/connectors/:type/oauth/start
   Server: state = HMAC-SHA256(crypto.randomUUID() + teamId, OAUTH_STATE_SECRET)
   Server: Redis.set(`oauth:state:${state}`, teamId, 'EX', 600)
   Returns: { authUrl: provider_auth_url_with_state }

2. Provider redirects to /api/v1/connectors/:type/oauth/callback?code=&state=
   Server: validates state exists in Redis + HMAC matches (CSRF protection)
   Server: deletes state from Redis (one-time use)
   Server: exchanges code for { access_token, refresh_token, expires_in }
   Server: AES-256-GCM encrypts both tokens using ENCRYPTION_KEY
   Server: creates Connector record
   Server: enqueues BullMQ job { connectorId, fullSync: true }
   Server: redirects to /connectors?connected=:type
```

### ACL Model

```
Documents carry: aclGroups: String[]
  → Always includes: ["team:{teamId}", "user:{userId}", ...source-specific groups]

Search filter: WHERE acl_groups && ARRAY['team:{teamId}', 'user:{userId}', ...userGroups]
  → PostgreSQL && operator on GIN-indexed array column → O(log n)

ACL sync per connector:
  GitHub: extract repo collaborator usernames → add "github:{username}" to aclGroups
  Notion: extract page member emails → hash → add "notion:{hash}" to aclGroups
  Slack: extract channel members → add "slack:{userId}" to aclGroups
  Linear: extract team members → add "linear:{userId}" to aclGroups

OSS results: no ACL filtering needed — all public by definition
```

---

## OSS Intelligence Service (Core Implementation)

```typescript
// packages/api/src/services/oss.service.ts

export class OSSService {
  constructor(
    private github: GitHubOSSConnector,
    private stackExchange: StackExchangeConnector,
    private embedding: EmbeddingService,
    private redis: Redis,
    private prisma: PrismaClient,
    private logger: Logger,
  ) {}

  async search(query: string, filters: OSSFilters, teamId: string): Promise<OSSSearchResult> {
    const normalizedQuery = this.normalizeQuery(query);
    const queryHash = sha256(normalizedQuery);
    const startMs = Date.now();

    // 1. Check exact cache hit
    const cached = await this.getFromCache(queryHash);
    if (cached) {
      await this.logOSSQuery({ teamId, query, cacheHit: true, resultCount: cached.issues.length, latencyMs: Date.now() - startMs });
      return { ...cached, cacheHit: true, rateLimitStatus: await this.getRateLimitStatus() };
    }

    // 2. Check semantic near-match in cache (cosine similarity > 0.92)
    const queryVec = await this.embedding.embed(normalizedQuery);
    const semanticMatch = await this.findSemanticCacheMatch(queryVec, 0.92);
    if (semanticMatch) {
      await this.logOSSQuery({ teamId, query, cacheHit: true, resultCount: semanticMatch.issues.length, latencyMs: Date.now() - startMs });
      return { ...semanticMatch, cacheHit: true, rateLimitStatus: await this.getRateLimitStatus() };
    }

    // 3. Circuit breaker check
    const rateLimitStatus = await this.getRateLimitStatus();
    if (rateLimitStatus.remaining < 5) {
      throw new AppError(ErrorCode.RATE_LIMITED, 'GitHub API rate limit low — serving cached results only', 429, { rateLimitStatus });
    }

    // 4. Parallel fetch: GitHub Issues + Stack Exchange
    const [githubIssues, stackAnswers] = await Promise.allSettled([
      this.github.searchResolvedIssues(normalizedQuery, filters),
      this.stackExchange.searchAnswered(normalizedQuery, filters.language),
    ]);

    const issues = this.mergeAndRank([
      ...(githubIssues.status === 'fulfilled' ? githubIssues.value : []),
      ...(stackAnswers.status === 'fulfilled' ? stackAnswers.value : []),
    ]);

    // 5. Store in cache
    const result = { issues, totalCount: issues.length };
    await this.storeInCache(queryHash, normalizedQuery, queryVec, result);

    // 6. Enqueue pre-warming job for related queries
    await ossPrewarmQueue.add('prewarm', { originalQuery: normalizedQuery, teamId });

    await this.logOSSQuery({ teamId, query, cacheHit: false, resultCount: issues.length, latencyMs: Date.now() - startMs, topRepoUrl: issues[0]?.repoUrl });
    return { ...result, cacheHit: false, rateLimitStatus };
  }

  private mergeAndRank(raw: RawOSSResult[]): OSSIssue[] {
    return raw
      .map(r => ({ ...r, score: IssueRanker.score(r) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 15); // Return top 15 across all sources
  }

  async synthesizeIssue(owner: string, repo: string, number: number): Promise<IssueSynthesis> {
    // Fetch full issue thread: body + all comments + linked PR body
    const thread = await this.github.fetchFullIssueThread(owner, repo, number);
    
    // Ask Claude to synthesize the thread into a structured solution
    const synthesis = await this.generation.synthesize({
      systemPrompt: `You are analyzing a resolved GitHub issue thread. Extract:
1. Problem: What was the exact issue? (2-3 sentences)
2. Root Cause: Why did it happen?
3. Solution: The accepted fix, step by step
4. Code Examples: Any relevant code blocks from the thread
5. References: PRs, commits, docs that resolved it
Be precise and technical. Output JSON matching the IssueSynthesis schema.`,
      content: this.formatThread(thread),
    });

    return synthesis;
  }
}
```

---

## Technology Stack (Justified)

| Layer | Technology | Why |
|---|---|---|
| Runtime | **Bun 1.x** | Native TS, 3x faster installs, built-in test runner, SQLite for tests |
| API Framework | **Hono 4** | Fastest Node/Bun framework, typed RPC, edge-native, zero config |
| Frontend | **React 19 + Vite 6** | Concurrent rendering, streaming, fastest HMR |
| Routing | **TanStack Router** | Full type-safe routes — no runtime routing bugs |
| Server State | **TanStack Query v5** | Stale-while-revalidate, streaming, offline-first |
| Client State | **Zustand 5** | Zero boilerplate, selector-based, Immer-compatible |
| Styling | **Tailwind CSS 4 + shadcn/ui** | Zero-runtime, accessible, copy-own-code primitives |
| Animation | **Framer Motion 11** | Production-grade, layout animations, gestures |
| Charts | **Recharts** | React-native, composable, zero SVG boilerplate |
| ORM | **Prisma 6** | Migrations, type-safety, pgvector `Unsupported()` |
| Database | **PostgreSQL 16** | pgvector, pg_trgm, JSONB, ACID, array operators |
| Vector Search | **pgvector 0.7** | Cosine similarity, IVFFlat index — no separate infra |
| Cache + Queue | **Redis 7 + BullMQ 5** | OSS query cache, embedding cache, sync jobs, rate counters |
| Embeddings | **OpenAI text-embedding-3-small** | 1536-dim, best quality/cost ($0.02/1M tokens) |
| LLM | **Anthropic claude-sonnet-4-20250514** | Grounded citations, 200K context, streaming SDK |
| GitHub Integration | **Octokit + GitHub App** | Per-installation rate limits — only scalable approach |
| Stack Exchange | **Stack Exchange API v2.3** | Answered questions, accepted answers, no auth needed for reads |
| Auth | **jose (JWT) + custom rotation** | Lightweight, edge-compatible, no Passport overhead |
| Validation | **Zod 3** | Runtime + compile-time, transforms, error paths |
| Logging | **Pino 9** | 5x faster than Winston, JSON structured, child loggers |
| Email | **Resend + React Email** | Developer-first, React templates, webhooks |
| Billing | **Stripe** | Subscriptions, Customer Portal, webhooks, metered usage |
| Monorepo | **Turborepo + Bun workspaces** | Incremental builds, shared types without drift |
| CI/CD | **GitHub Actions** | Typecheck → test → migrate → deploy |
| Deployment | **Fly.io** | Global edge, Dockerfile-based, free postgres |
| Monitoring | **Sentry + Prometheus/Grafana** | Error tracking, custom dashboards |

---

## Environment Variables

```bash
# Server
NODE_ENV=development
PORT=3001
API_BASE_URL=http://localhost:3001
WEB_BASE_URL=http://localhost:5173
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://devglean:devglean@localhost:5432/devglean

# Redis
REDIS_URL=redis://localhost:6379

# JWT + Session
JWT_SECRET=                     # 64 hex chars (openssl rand -hex 32)
JWT_REFRESH_SECRET=             # 64 hex chars (different from JWT_SECRET)
OAUTH_STATE_SECRET=             # 64 hex chars (HMAC key for OAuth state)

# Encryption (AES-256-GCM for OAuth tokens at rest)
ENCRYPTION_KEY=                 # 64 hex chars (openssl rand -hex 32)

# AI
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# GitHub App (for OSS search - per-installation rate limits)
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=        # PEM format, base64 encoded
GITHUB_APP_CLIENT_ID=
GITHUB_APP_CLIENT_SECRET=
GITHUB_APP_WEBHOOK_SECRET=

# Stack Exchange API
STACK_EXCHANGE_KEY=             # Register at stackapps.com — raises limit to 10k/day

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRO_PRICE_ID=

# Email
RESEND_API_KEY=
FROM_EMAIL=noreply@devglean.io

# Notion OAuth
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=

# Slack OAuth
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_SIGNING_SECRET=

# Linear OAuth
LINEAR_CLIENT_ID=
LINEAR_CLIENT_SECRET=
LINEAR_WEBHOOK_SECRET=

# Jira OAuth
JIRA_CLIENT_ID=
JIRA_CLIENT_SECRET=

# Sentry
SENTRY_DSN=
```

---

## Phase Checklist

- [ ] Phase 0 — CLAUDE.md created, monorepo scaffolded, Docker up, Prisma migrated
- [ ] Phase 1 — Auth system (register, login, refresh rotation, invite, password reset)
- [ ] Phase 2 — GitHub App integration + OSS search pipeline + Redis cache + IssueRanker
- [ ] Phase 3 — Stack Exchange supplemental search + result fusion + Claude synthesis
- [ ] Phase 4 — Private RAG (team connectors: GitHub private, Notion, Slack, Linear, Jira)
- [ ] Phase 5 — Unified search (private + OSS in parallel, QueryClassifier, ResultFusion, SSE)
- [ ] Phase 6 — React frontend (Search, OSS Explorer, Connectors, Analytics, Settings)
- [ ] Phase 7 — Billing (Stripe), invites (Resend), analytics API, OSS cache dashboard
- [ ] Phase 8 — Production hardening (rate limits, circuit breakers, Sentry, Prometheus, Fly.io CI/CD)

---

## ADR Log

| # | Decision | Rationale |
|---|---|---|
| ADR-001 | GitHub App over PAT for OSS search | PAT: 30 req/min shared. App: 30 req/min per installation × N teams. Scales linearly with user base. |
| ADR-002 | Semantic cache deduplication | 70% of dev queries are semantically near-identical. Cosine similarity matching (>0.92) collapses cache misses dramatically. Cuts real API calls by 10× at scale. |
| ADR-003 | Stack Exchange as OSS supplement | GitHub issues have code context. Stack Overflow has curated accepted answers. Combining both gives better solution coverage than either alone. |
| ADR-004 | IssueRanker weighted scoring | Not all closed issues are equal. A 2-line fix on a 5-star repo is noise. A merged PR with 200 👍 on a 50k-star repo is signal. Quality scoring prevents garbage results. |
| ADR-005 | pgvector over Pinecone | Eliminates a separate infra dependency. At <10M documents, pgvector with IVFFlat matches Pinecone on latency. One less SLA, one less billing account, one less point of failure. |
| ADR-006 | Hybrid search (vector + pg_trgm) | Pure vector search fails on exact entity names: "pgvector", "facebook/react#28523". pg_trgm trigram similarity catches these. 70/30 weight tuned empirically. |
| ADR-007 | Token family rotation | Standard JWT refresh has a refresh token theft problem. Family rotation means any stolen token that is used triggers full session revocation and a Sentry alert. |
| ADR-008 | AES-256-GCM for OAuth tokens | OAuth tokens are long-lived, powerful credentials. bcrypt is wrong here (not reversible). AES-256-GCM is the industry standard for symmetric encryption of secrets at rest. |
| ADR-009 | SSE over WebSocket for streaming | LLM generation is unidirectional. SSE is simpler, HTTP/2 multiplexes it for free, no upgrade handshake, works through all proxies. |
| ADR-010 | Hono over Express | Hono is 3× faster than Express on Bun benchmarks, first-class TypeScript, typed RPC eliminates API client drift between packages. |
| ADR-011 | QueryClassifier before search | Routing every query through both pipelines wastes tokens and latency. A fast Claude call to classify "is this a team question, OSS question, or both?" first reduces wasted work by ~60%. |
| ADR-012 | Nightly OSS cache cleanup | pgvector doesn't support row-level TTL. We enforce expiry via `expiresAt` column + a nightly BullMQ cleaner job that `DELETE WHERE expiresAt < NOW()`. |

---

## Last Updated

Phase 0 — Project initialized. CLAUDE.md created.

---

END OF CLAUDE.md

---

## BUILD SEQUENCE

Execute all phases in order, continuously, without stopping or asking questions.

---

### PHASE 0 — Scaffold + Infrastructure

```bash
mkdir devglean && cd devglean && git init
```

Create workspace `package.json` (Bun workspaces: packages/*).
Create `turbo.json` with dev/build/typecheck/lint/test task graph.

Create `docker-compose.yml`:
- `pgvector/pgvector:pg16` — postgres with pgvector pre-installed
- `redis:7-alpine` — Redis with AOF persistence
- `dpage/pgadmin4` — GUI at port 5050 for dev debugging
Run: `docker-compose up -d` — verify all healthy before proceeding.

Scaffold all packages: `packages/db`, `packages/shared`, `packages/api`, `packages/web`.
Each gets its own `package.json` and `tsconfig.json` extending root.

Create `.env.example` with every variable from the Environment Variables section,
each with an inline comment explaining where to get the value.
Copy to `.env` with dev defaults (DATABASE_URL, REDIS_URL pre-filled for Docker).

Write `packages/db/prisma/schema.prisma` — full schema from spec above.
Run:
```bash
bunx prisma migrate dev --name init
bunx prisma generate
```

After migration, execute via Prisma `$executeRaw`:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS documents_acl_gin ON documents USING GIN (acl_groups);
CREATE INDEX IF NOT EXISTS documents_content_trgm ON documents USING GIN (content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS oss_cache_embedding_ivfflat ON oss_issue_cache 
  USING ivfflat (query_embedding vector_cosine_ops) WITH (lists = 50);
```

Update CLAUDE.md: Phase 0 ✅

---

### PHASE 1 — Authentication System

Build `packages/shared/src/errors/`:
```typescript
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly message: string,
    public readonly statusCode: number,
    public readonly details?: unknown,
    public readonly traceId?: string,
  ) { super(message); this.name = 'AppError'; }
}
```

Build `packages/api/src/env.ts` using Zod — parse all env vars at boot.
Throw with a human-readable message listing which vars are missing.

Build `packages/api/src/lib/`:
- `logger.ts` — Pino with `traceId` as child logger context
- `redis.ts` — IORedis singleton with reconnect strategy
- `prisma.ts` — PrismaClient singleton with query event logging
- `crypto.ts` — `encrypt(plaintext): string`, `decrypt(ciphertext): string` using AES-256-GCM
- `anthropic.ts` — Anthropic client singleton
- `openai.ts` — OpenAI client singleton
- `github.ts` — Octokit GitHub App client, `getInstallationClient(installId)` for per-team auth

Build middleware:
- `traceId.ts` — UUID on every request, attached to logger and response header
- `auth.ts` — parse Bearer token → verify JWT → `c.set('user', payload)` → 401 on failure
- `teamScope.ts` — loads team from DB → `c.set('team', team)` → 403 if plan exceeded
- `rateLimit.ts` — sliding window: `ZADD key ${now} ${uuid}` + `ZCOUNT key ${now-window} ${now}`
- `errorHandler.ts` — AppError → structured JSON, unknown → 500 with Sentry capture
- `circuitBreaker.ts` — tracks GitHub API `X-RateLimit-Remaining`, opens circuit at < 5

Build `AuthService`:
- `register()` — bcrypt(12) hash, transaction: create User + Team, generate token pair
- `login()` — constant-time compare, generate token pair, persist refresh token family
- `refreshTokens()` — hash incoming token, find in DB, check revoked, check family,
  rotate: revoke old, create new same family. On reuse: revoke entire family + Sentry alert.
- `logout()` — set revokedAt on token
- `logoutAll()` — set revokedAt on all user tokens
- `generateTokenPair(userId, teamId)` — creates JWT + opaque refresh, persists hashed refresh

Build all auth routes per API manifest. Wire to Hono app.
Write integration tests for token rotation reuse detection.

Update CLAUDE.md: Phase 1 ✅

---

### PHASE 2 — OSS Intelligence Pipeline (The Core Differentiator)

This is the most important phase. Build it as if it will serve 10,000 teams.

Build `GitHubOSSConnector`:
```typescript
class GitHubOSSConnector {
  // Uses GitHub App auth — per-installation Octokit client
  // Provides per-team rate limits instead of shared PAT limits
  
  async searchResolvedIssues(query: string, filters: OSSFilters): Promise<RawOSSResult[]> {
    // Uses GitHub's semantic/hybrid search (GA April 2026)
    // GET /search/issues?q=${query}&state=closed&search_type=hybrid
    // Params: is:issue OR is:pull-request, state:closed, sort:reactions-desc
    // Also separately: search PRs that close issues (linked via "Closes #N")
    // Returns top 10 results with full body + top 3 comments
  }

  async fetchFullIssueThread(owner: string, repo: string, number: number): Promise<IssueThread> {
    // Fetch: issue body, all comments (paginated), linked PR body + review comments
    // Check for "Closes #N" references in PR body → fetch referenced issue
    // Return structured thread for Claude synthesis
  }
}
```

Build `StackExchangeConnector`:
```typescript
class StackExchangeConnector {
  // GET https://api.stackexchange.com/2.3/search/advanced
  // ?order=desc&sort=votes&accepted=True&filter=withbody
  // &key=${STACK_EXCHANGE_KEY}&site=stackoverflow&q=${query}
  // Returns questions with has_accepted_answer=true, score > 10
  // Map to RawOSSResult format for unified ranking
}
```

Build `IssueRanker`:
```typescript
class IssueRanker {
  static score(issue: RawOSSResult): number {
    const reactionScore = Math.min(issue.reactionCount / 100, 1);
    const starsScore = Math.min(Math.log10(issue.repoStars + 1) / 5, 1);
    const recencyScore = issue.closedAt > twoYearsAgo ? 1 : 0.5;
    
    return (
      0.30 * (issue.linkedPRMerged ? 1 : 0) +
      0.20 * reactionScore +
      0.15 * starsScore +
      0.15 * (issue.hasCodeBlock ? 1 : 0) +
      0.10 * (issue.hasAcceptedLabel ? 1 : 0) +
      0.10 * recencyScore
    );
  }
}
```

Build `OSSService` as specified in the Core Implementation section above.

Build `OSSPrewarmWorker`:
- Receives `{originalQuery}` from BullMQ
- Uses Claude to generate 5 related phrasings of the query
- For each phrasing: check cache, if miss, enqueue low-priority OSS search job
- This warms the cache for the next time someone asks a related question

Build `OSSQueryLog` persistence and all `/api/v1/oss` routes.

Update CLAUDE.md: Phase 2 ✅

---

### PHASE 3 — Query Classification + Result Fusion + Claude Synthesis

Build `QueryClassifier`:
```typescript
class QueryClassifier {
  async classify(query: string, team: Team): Promise<QueryClassification> {
    // Fast Claude call (max 100 tokens) to determine:
    // - surface: "private" | "oss" | "both"
    // - reasoning: brief explanation
    // - confidence: 0-1
    //
    // "Why did we drop Kafka?" → private (past tense, team history)
    // "How to fix pgvector index corruption?" → oss (generic error, not team-specific)
    // "How did we fix the auth bug others reported?" → both
    //
    // Uses claude-haiku for speed (< 200ms), not Sonnet
    // Falls back to "both" on error (safe default)
  }
}
```

Build `ResultFusion`:
```typescript
class ResultFusion {
  merge(privateResults: ChunkResult[], ossResults: OSSIssue[]): FusedResult[] {
    // Normalize scores to [0,1] across both result sets
    // Interleave by score, with source label: "team" | "github" | "stackoverflow"
    // Deduplicate if private connector happens to index a public repo
    // Preserve top-3 from each surface regardless of score (surface diversity)
  }
}
```

Build `GenerationService` with unified citation format:
```
System prompt:
"You are DevGlean, answering developer questions with grounded citations.
Sources may be from the user's private team knowledge or from the global
open-source community. Cite every claim using [Source N] format.
For OSS sources, include the repo and issue number: [github.com/owner/repo#N].
For team sources, include the connector and title: [notion: ADR-004].
If you don't know, say so. Never hallucinate. Be precise and technical."
```

Build unified `/api/v1/search` endpoint:
- Classify query (< 200ms Claude Haiku call)
- Based on classification, run pipelines in parallel
- Fuse results
- Stream Claude Sonnet response via SSE
- Log QueryLog with surface, cacheHit, tokenCount

Update CLAUDE.md: Phase 3 ✅

---

### PHASE 4 — Private Connectors (Team RAG)

Build `BaseConnector` abstract class with full interface.
Build `ChunkerService`: 512-token chunks, 64-token overlap, SHA-256 content hash.
Build `EmbeddingService`: OpenAI batch embedding with Redis cache (30-day TTL, sha256 key).
Build `SyncWorker`: BullMQ, concurrency 3, exponential backoff, SyncJob tracking.
Build `Scheduler`: repeatable jobs every 15 min per active connector.

Build connectors for:
- **GitHub (private)** — repos, README, commits, issues, PRs (team's own repos)
- **Notion** — pages + databases, recursive block extraction
- **Slack** — channel messages + threads (channels team has access to)
- **Linear** — issues, comments, project docs
- **Jira** — issues, comments, attachments

For each: full OAuth flow, incremental sync via cursor, webhook handler, ACL extraction.

Build all `/api/v1/connectors` and `/api/v1/documents` routes.

Update CLAUDE.md: Phase 4 ✅

---

### PHASE 5 — React Frontend

**Design Language**:
Colors: `#07090F` (base) · `#0EA5E9` (sky blue — primary) · `#10B981` (emerald — OSS badge)
       `#8B5CF6` (violet — team badge) · `#F59E0B` (amber — citations) · `#EF4444` (errors)
Type: `Berkeley Mono` (queries, code) + `Geist Sans` (UI)
Motion: Framer Motion — page transitions 200ms ease-out, search reveal spring animation
Aesthetic: IDE × Raycast × Linear. The search bar is the product.

**Pages (all fully implemented)**:

`/login` + `/register` — Centered auth cards, animated gradient border on focus.

`/onboarding` — 3-step wizard:
1. "What do you want to index?" — connector grid
2. OAuth connect flow inline, real-time sync progress via SSE
3. "Try your first search" — 3 pre-written example queries as clickable chips

`/search` — The hero page:
- Full-width `<SearchBar>` centered with animated placeholder cycling through examples
- `<SearchSurface>` toggle: `[Team] [OSS] [Both]` — pill tabs, defaults to "Both"
- On submit: SSE stream renders answer token by token in `<AnswerCard>`
- `<AnswerCard>`: renders markdown, `[Source N]` becomes clickable citation chips
  - Team sources: violet badge with connector icon
  - GitHub sources: green badge with repo name
  - Stack Overflow sources: orange badge with question score
- `<SourcePanel>`: slides in from right — ranked sources with score bar, deep link
- `<OSSRateLimitBanner>`: appears when circuit breaker is open — "OSS search paused, serving cache"
- Left sidebar: collapsible query history with surface icon indicators

`/oss` — OSS Explorer:
- Search bar for OSS-only queries with language + repo filters
- `<IssueList>`: cards with repo, title, IssueScore badge, stars, reaction count
- Click → `<IssueDetail>`: full issue thread with "Synthesize Solution" button
  - Synthesis returns structured: Problem / Root Cause / Solution / Code / References
- `<TrendingIssues>`: what teams globally are searching (anonymized query clusters)
- `<CacheStatus>` widget: hit rate %, entries, cost saved vs direct API

`/connectors` — Grid with connected/unconnected states, sync progress rings, error states.

`/documents` — Filterable data table. Click → chunk preview modal.

`/analytics` — KPI cards + Recharts time series + OSS cache analytics panel.

`/settings` — Team, Members (invite form), Billing (Stripe redirect), Danger Zone.

**Hooks**:
- `useSearch(query, surface)` — manages SSE lifecycle, handles `token`/`sources`/`done` events
- `useOSSSearch(query, filters)` — dedicated OSS search with cache status
- `useRateLimit()` — polls `/api/v1/oss/cache/status` every 30s, exposes rateLimitRemaining
- `useConnectors()` — TanStack Query, refetch on window focus
- `useStreamingSynthesis(owner, repo, number)` — SSE for issue synthesis

Update CLAUDE.md: Phase 5 ✅

---

### PHASE 6 — Billing, Invites, Analytics API

Build `BillingService`:
- `createCheckoutSession(team)` → Stripe Checkout, mode: 'subscription', PRO price
- `createPortalSession(team)` → Customer Portal
- Stripe webhooks: `subscription.created` → `Team.plan = PRO`, `subscription.deleted` → `Team.plan = FREE`
- Plan enforcement middleware: query limits, connector count limits (checked in teamScope.ts)

Build `TeamInvite` flow:
- Generate crypto.randomBytes(32) token, store hashed, email plaintext via Resend
- React Email template: branded, clean, 5-minute implementation
- `/auth/invite/accept` validates, creates User, assigns team + role, deletes invite

Build all analytics service methods. Aggregate from QueryLog + OSSQueryLog + SyncJob tables.
OSS cache analytics: calculate cost saved = (total_hits - misses) × $0.001 (estimated API cost per query).

Update CLAUDE.md: Phase 6 ✅

---

### PHASE 7 — Production Hardening

**Security**:
- All auth routes: 10 req/min rate limit per IP
- All search routes: 60 req/min per team
- All OSS routes: 20 req/min per team (protect GitHub API budget)
- All webhook routes: HMAC validation before ANY processing — no exceptions
- All OAuth state params: validated against Redis store before consumption
- SQL: 100% Prisma or parameterized `$queryRaw` — zero string interpolation
- Response headers: full Helmet config (CSP, HSTS, X-Frame-Options, etc.)
- Input sanitization: Zod strips unknown keys on all request bodies

**Observability**:
- Sentry: init with `dsn`, `tracesSampleRate: 0.1`, `environment`
- Pino: every request logs `{traceId, method, path, status, latencyMs, userId, teamId}`
- Prometheus `/metrics`:
  - `devglean_http_requests_total{method,route,status}` — counter
  - `devglean_http_duration_seconds{route}` — histogram
  - `devglean_search_latency_seconds{surface}` — histogram
  - `devglean_oss_cache_hit_ratio` — gauge (updated every minute)
  - `devglean_github_rate_limit_remaining` — gauge
  - `devglean_queue_depth{queue}` — gauge

**Dockerfile** (multi-stage, Bun):
```dockerfile
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lockb turbo.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY packages/api/package.json ./packages/api/
RUN bun install --frozen-lockfile

FROM oven/bun:1 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build --filter=@devglean/api

FROM oven/bun:1-slim AS runner
WORKDIR /app
COPY --from=builder /app/packages/api/dist ./dist
COPY --from=builder /app/packages/db/prisma ./prisma
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
EXPOSE 3001
HEALTHCHECK --interval=30s CMD curl -f http://localhost:3001/health || exit 1
CMD ["bun", "run", "dist/index.js"]
```

**`fly.toml`** with health check on `/health`, auto-scaling min=1 max=3.

**`infra/scripts/setup.sh`**:
```bash
#!/usr/bin/env bash
set -euo pipefail
echo "🚀 Setting up DevGlean..."
cp .env.example .env
docker-compose up -d
echo "⏳ Waiting for PostgreSQL..."
until docker-compose exec postgres pg_isready -U devglean; do sleep 1; done
bun install
bunx prisma migrate dev --name init
bun run db:seed
echo "✅ DevGlean is ready!"
echo "   API:     http://localhost:3001"
echo "   Web:     http://localhost:5173"
echo "   pgAdmin: http://localhost:5050"
echo ""
echo "   Run: bun dev"
```

**`infra/scripts/seed.ts`**:
- Create demo team: `demo@devglean.io` / `devglean123`
- Create 3 mock connectors (GitHub, Notion, Slack) with PAUSED status
- Seed 200 OSSIssueCache entries covering common dev topics (React, PostgreSQL, Redis, Docker, TypeScript errors)
- Seed 50 private Document chunks from mock GitHub README content
- So the product is immediately searchable without real API keys in dev

**GitHub Actions CI** (`ci.yml`):
```yaml
- bun install
- bunx tsc --noEmit (all packages)  
- bunx prisma validate
- bun lint
- bun test
- docker build (smoke test)
```

**GitHub Actions Deploy** (`deploy.yml`, trigger: push to main):
```yaml
- Run CI
- bunx prisma migrate deploy (against prod DB)
- flyctl deploy --remote-only
```

Update CLAUDE.md: All phases complete. Write completion report.

---

## FINAL VERIFICATION

After all phases, run this checklist:

```
□ bun typecheck — zero errors across all packages
□ bun test — all tests pass
□ docker-compose up -d && bun dev — starts without errors
□ POST /api/v1/auth/register → 200 with accessToken + cookie
□ POST /api/v1/auth/login → 200
□ POST /api/v1/auth/refresh → 200 with new token
□ POST /api/v1/search {query:"how to fix memory leak", surface:"oss"} → SSE stream
□ GET /api/v1/oss/trending → 200 with issue list
□ GET /health → {status:"ok", db:"ok", redis:"ok"}
□ GET /metrics → Prometheus format text
□ Web: http://localhost:5173 loads search page
□ Web: OSS Explorer page loads and renders trending issues
□ Seed data: searching "react hydration" returns OSS results from cache
```

Write a `COMPLETION.md` file summarizing:
- Total files created (count them)
- All API routes implemented (list them)
- All connectors built
- Database models
- Test count and coverage %
- Estimated time for a new developer to go from `git clone` to first search result

**The bar: a developer clones this repo, runs `./infra/scripts/setup.sh`, and is searching
open-source issues AND their team's private Notion docs — in a single unified answer —
within 5 minutes. That is the product. Build it.**

**Begin now. Build DevGlean.**