# DevGlean — CLAUDE.md

> The authoritative, living technical specification for DevGlean.
> Every architectural decision lives here. Every schema change is recorded here.
> This file is never deleted. It grows with the project.

---

## Project Overview

| Attribute         | Value                                                                 |
|-------------------|-----------------------------------------------------------------------|
| Product Name      | DevGlean                                                              |
| Tagline           | Your team's brain + the world's open-source knowledge, unified        |
| Category          | Developer Knowledge Graph / AI Search                                 |
| Target Market     | Engineering teams of 2–50, indie hackers, dev agencies                |
| Core Value Prop   | Private team knowledge + global OSS issue resolution, in one search   |
| Pricing           | Free (1 connector, 1k q/mo) · Pro $29/mo · Enterprise custom         |
| Auth Strategy     | JWT (15m access) + Refresh Token families (7d, DB-persisted, rotated) |
| Deployment Model  | Docker Compose (local) → Fly.io (production)                          |
| Source File Count | 94 files across 4 workspace packages                                  |

---

## Architecture Overview

DevGlean is a multi-tenant RAG platform with **two complementary search surfaces**:

### Surface 1 — Team Knowledge Graph (Private RAG)

**What:** Indexes data from connectors the team explicitly connects (GitHub, Notion, Slack, Linear, Jira).

**How:** Documents are chunked (sentence-boundary, 512-token target, 64-token overlap), embedded via OpenAI `text-embedding-3-small` (1536-dim), and stored in PostgreSQL with `pgvector`. Retrieval uses hybrid 70% vector cosine similarity + 30% BM25 full-text search. Results are ACL-filtered per-team.

**Why this design:** Pure vector search fails catastrophically on exact entity names like function names, ticket IDs, and error codes (ADR-003). Hybrid ensures semantic understanding while preserving exact match capability. Single PostgreSQL instance avoids the operational overhead of a separate vector database (ADR-002).

### Surface 2 — Global OSS Issue Intelligence

**What:** Searches public GitHub resolved issues + Stack Exchange accepted answers in real-time. Not pre-indexed — queries live APIs on demand.

**How:** `QueryClassifier` (Claude Haiku, ~200ms) routes each query to `private`, `oss`, or `both` surfaces. OSS results are fetched in parallel from GitHub Search API + Stack Exchange, scored by `IssueRanker` (weighted: merged PR 30%, reactions 20%, stars 15%, code 15%, label 10%, recency 10%), cached in Redis (24h TTL) + PostgreSQL (with vector embedding for semantic deduplication at cosine > 0.92).

**Why this was added (PROMPT2):** DevGlean's original value proposition was "search your team's knowledge." PROMPT2 expanded this to "search your team's knowledge AND the world's resolved issues." The insight: when a developer asks "How to fix pgvector index corruption?", the answer often exists in a closed GitHub issue — not in the team's docs. Surface 2 searches the public knowledge that no team would ever manually index.

**Why GitHub App auth (ADR-014):** A personal access token gives 30 requests/min shared across ALL teams. A GitHub App gives 30 req/min per installation × N teams. Rate limits scale linearly with customer count.

**Why semantic cache deduplication (ADR-015):** 70% of developer search queries are semantically identical ("pgvector index corruption" ≈ "pgvector index returning wrong results"). Cosine > 0.92 threshold collapses cache misses by ~10×, dramatically reducing live API calls.

**Why circuit breaker (ADR-019):** When GitHub API rate limits drop below 5 remaining, the circuit breaker pauses live OSS search and falls back to cache-only. Recovers automatically when the reset window expires. Prevents cascading failures.

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                         │
│   React 19 + Vite │ TanStack Query v5 │ Zustand │ SSE       │
│   8 pages: Search, OSS Explorer, Connectors, Analytics...   │
└─────────────────────────────┬───────────────────────────────┘
                              │ HTTPS / SSE
┌─────────────────────────────▼───────────────────────────────┐
│                         API GATEWAY                         │
│   Bun 1.x + Hono │ Rate Limiting │ Auth │ CORS │ Zod        │
│   Trace IDs │ Secure Headers │ Team Scope │ Circuit Breaker  │
└──────┬────────────┬───────────────┬──────────┬──────────────┘
       │            │               │          │
┌──────▼──────┐ ┌───▼─────────┐ ┌──▼────────┐ ┌▼──────────────┐
│  Auth       │ │  Search     │ │ Connector │ │ OSS           │
│  Service    │ │  Service    │ │ Sync Svc  │ │ Intelligence  │
│             │ │             │ │           │ │               │
│  JWT issue  │ │ Classify →  │ │ OAuth2    │ │ GitHub Search │
│  Refresh    │ │ Private RAG │ │ BullMQ    │ │ StackExchange │
│  rotation   │ │ + OSS fetch │ │ Webhooks  │ │ IssueRanker   │
│  ACL sync   │ │ ResultFuse  │ │ Chunk     │ │ Cache + Dedup │
│             │ │ Claude SSE  │ │ Embed     │ │ Pre-warm      │
└──────┬──────┘ └───┬─────────┘ └──┬────────┘ └┬──────────────┘
       │            │               │           │
┌──────▼────────────▼───────────────▼───────────▼──────────┐
│                    DATA LAYER                             │
│                                                           │
│  PostgreSQL 16 (primary)    │  Redis 7 (cache + queue)    │
│  pgvector + pg_trgm ext     │  BullMQ (sync + prewarm)    │
│  OSSIssueCache (24h TTL)    │  OSS result cache (24h)     │
│  Prisma 6 ORM               │  Rate limit counters        │
│  GIN indexes (ACL)           │  Circuit breaker state      │
└───────────────────────────────────────────────────────────┘
```

---

## Monorepo Structure

```
devglean/
├── CLAUDE.md                     # This file — living architecture constitution
├── PROMPT.md                     # Original build spec (Phase 1–7)
├── PROMPT2.md                    # OSS Intelligence spec (Phase 8)
├── Dockerfile                    # Multi-stage production build
├── .env.example                  # All required environment variables
├── docker-compose.yml            # PostgreSQL 16 + Redis 7 + pgAdmin
├── turbo.json                    # Monorepo task pipeline
├── package.json                  # Root Bun workspace config
├── packages/
│   ├── db/                       # Prisma ORM
│   │   └── prisma/schema.prisma  # 10 models, 5 enums (see Schema section)
│   ├── shared/                   # Cross-package contracts
│   │   └── src/
│   │       ├── schemas/          # Zod: auth, search, connector, team, analytics, document, oss
│   │       ├── types/            # Interfaces: 25+ domain types including OSS pipeline
│   │       ├── errors/           # AppError with structured JSON serialization
│   │       └── constants/        # TTLs, weights, Redis keys, queue names, ranker weights
│   ├── api/                      # Bun + Hono backend (45 source files)
│   │   └── src/
│   │       ├── connectors/       # 8 connectors: base, github, githubOSS, stackexchange, notion, slack, linear, jira
│   │       ├── jobs/             # BullMQ: queue.ts, sync.worker.ts, ossPrewarm.worker.ts, scheduler.ts
│   │       ├── lib/              # Singletons: prisma, redis, openai, anthropic, github (App), stackexchange, stripe, crypto, logger
│   │       ├── middleware/       # 6: auth, rateLimit, traceId, errorHandler, teamScope, circuitBreaker
│   │       ├── routes/           # 10 route groups, ~55 endpoints
│   │       ├── services/         # 12: auth, embedding, chunker, retrieval, generation, search, oss, issueRanker, queryClassifier, resultFusion, analytics, billing
│   │       ├── app.ts            # Hono app factory (middleware + route mounting)
│   │       ├── index.ts          # Server entry (Bun.serve + workers + graceful shutdown)
│   │       └── env.ts            # T3-pattern Zod env validation (30+ vars)
│   └── web/                      # React 19 + Vite 6 frontend
│       └── src/
│           ├── components/       # Layout, Sidebar (Framer Motion + Globe icon)
│           ├── pages/            # 8 pages: auth/{Login,Register}, search, oss/OSSExplorer, connectors, documents, analytics, settings
│           ├── store/            # Zustand auth store (localStorage-persisted)
│           ├── lib/              # API client (auto-refresh, SSE streaming), QueryClient
│           ├── styles/           # CSS design system (dark mode, glassmorphism tokens)
│           ├── App.tsx           # Root with auth-gated routing (6 main pages)
│           └── main.tsx          # React 19 createRoot entry point
├── infra/
│   ├── fly.toml                  # Fly.io deployment (health checks, auto-scaling)
│   └── scripts/
│       ├── setup.sh              # One-command dev environment bootstrap
│       └── seed.ts               # Demo: 1 user, 50 docs, 200 OSS cache entries, 30 days analytics
└── .github/workflows/
    ├── ci.yml                    # Lint, typecheck, test (PG + Redis services)
    └── deploy.yml                # Prisma migrate → Fly.io deploy on main push
```

---

## Technology Stack

| Layer            | Technology                      | Why                                                         |
|------------------|---------------------------------|-------------------------------------------------------------|
| Runtime          | Bun 1.x                        | Native TS, fast startup, built-in test runner               |
| API Framework    | Hono 4.x                       | Edge-ready, typed RPC, first-class Bun support              |
| Frontend         | React 19 + Vite 6              | Concurrent rendering, fast HMR                              |
| State            | Zustand 5 + TanStack Query 5   | Client state + server state separation                      |
| Animation        | Framer Motion 11               | layoutId transitions, spring physics                        |
| Charts           | Recharts 2                     | Composable SVG charts for analytics                         |
| ORM              | Prisma 6                       | Type-safe, migration-first, pgvector support                |
| Database         | PostgreSQL 16 + pgvector        | Unified data + vector store (ADR-002)                       |
| Full-text Ext    | pg_trgm                        | Trigram similarity for fuzzy text matching in hybrid search  |
| Cache/Queue      | Redis 7 + BullMQ 5             | Atomic ops, job queues with retry, OSS cache layer          |
| Embeddings       | OpenAI text-embedding-3-small  | 1536-dim, best cost/quality                                 |
| LLM (Generation) | Anthropic Claude Sonnet        | Citation grounding, streaming, dual-surface context          |
| LLM (Classifier) | Anthropic Claude Haiku         | Fast query classification (~200ms), cheap                   |
| Auth             | jose + custom refresh rotation  | Edge-compatible, lightweight (ADR-004)                      |
| Validation       | Zod 3                          | Runtime + compile-time safety                               |
| Payments         | Stripe Checkout + Portal       | Webhook-driven plan lifecycle                               |
| CSS              | Vanilla CSS + Tailwind 4       | Design system tokens + utility classes                      |
| GitHub API       | Octokit + GitHub App Auth      | Per-installation rate limits for OSS search (ADR-014)       |
| Stack Exchange   | Stack Exchange API v2.3        | Supplemental accepted answers, no auth needed for reads     |

---

## Prisma Schema (10 models, 5 enums)

| Model           | Purpose                                              | Key Fields                                            |
|-----------------|------------------------------------------------------|-------------------------------------------------------|
| User            | Team member identity                                 | email, passwordHash, role, teamId                     |
| RefreshToken    | JWT refresh rotation (family-based reuse detection)  | token (SHA-256), family, expiresAt, revokedAt         |
| Team            | Multi-tenant root entity                             | slug, plan, stripeCustomerId, githubAppInstallId      |
| TeamInvite      | Email-based team invitations                         | token, expiresAt, acceptedAt                          |
| Connector       | OAuth-connected data source                          | type, oauthToken (AES-256-GCM), syncCursor, status   |
| SyncJob         | Connector sync execution log                         | docsIndexed, docsUpdated, docsDeleted, status         |
| Document        | Chunked + embedded team document                     | embedding (vector 1536), contentHash, aclGroups       |
| QueryLog        | Search analytics (private + OSS)                     | surface, sourceCount, ossResultCount, cacheHit        |
| OSSIssueCache   | Ephemeral cache of resolved OSS issues               | queryHash, queryEmbedding (vector), results (JSONB), expiresAt |
| OSSQueryLog     | Separate analytics for OSS search usage              | cacheHit, resultCount, topRepoUrl, latencyMs          |

| Enum            | Values                                               |
|-----------------|------------------------------------------------------|
| TeamRole        | OWNER, ADMIN, MEMBER                                 |
| Plan            | FREE, PRO, ENTERPRISE                                |
| ConnectorType   | GITHUB, NOTION, SLACK, LINEAR, JIRA, CONFLUENCE, GITLAB |
| ConnectorStatus | ACTIVE, PAUSED, ERROR, DISCONNECTED                  |
| SyncStatus      | PENDING, RUNNING, SUCCESS, FAILED                    |
| QuerySurface    | PRIVATE, OSS, BOTH                                   |

**Why OSSIssueCache has a vector embedding (ADR-015):** Enables semantic deduplication — "pgvector index corruption" and "pgvector wrong results after vacuum" are cosine > 0.92 similar, so they share one cache entry instead of two separate API calls.

**Why QueryLog has `surface` + `ossResultCount` + `cacheHit`:** Analytics need to know which pipeline was used, how many OSS results contributed, and whether the response came from cache. This drives dashboard metrics and cache hit-rate optimization.

**Why Team has `githubAppInstallId` (ADR-014):** Links each team to their GitHub App installation, enabling per-team API rate limits instead of a shared global limit.

---

## Key Engineering Decisions (ADR Log)

### Phase 1–7 (Original Build)

| #       | Decision                          | Rationale                                                                            |
|---------|-----------------------------------|--------------------------------------------------------------------------------------|
| ADR-001 | Hono over Express                 | 3x faster, edge-compatible, typed RPC                                                |
| ADR-002 | pgvector over Pinecone            | Unified PostgreSQL; good at <1M docs; no vendor lock-in; $0 additional cost          |
| ADR-003 | Hybrid search (vector + BM25)     | Pure vector fails on exact names (function names, ticket IDs, error codes)           |
| ADR-004 | Token family refresh rotation     | Prevents theft without sessions; if a token is reused, entire family is revoked      |
| ADR-005 | AES-256-GCM for OAuth tokens      | Encrypted at rest, not just transit — protects against DB dump compromise             |
| ADR-006 | Embedding cache in Redis          | ~60% repeat queries, cuts OpenAI costs substantially                                 |
| ADR-007 | SSE over WebSocket                | LLM output is unidirectional; SSE is simpler, works through HTTP proxies             |
| ADR-008 | Turborepo monorepo                | Shared types across API + web; incremental builds; single lockfile                   |
| ADR-009 | SHA-256 content hash              | Skip re-embedding when document content hasn't changed — saves tokens + time          |
| ADR-010 | Zustand over TanStack Router      | Lightweight client-side page state for SPA; no URL routing needed                    |
| ADR-011 | Sentence-boundary chunking        | Fixed-size chunking splits mid-sentence; 512-token target, 64-token overlap          |
| ADR-012 | BullMQ over Kafka                 | <10k jobs/day doesn't justify Kafka's operational overhead; Redis is already in stack |
| ADR-013 | Multi-stage Dockerfile            | Builder compiles TS, slim runner only ships dist + Prisma client                     |

### Phase 8 (PROMPT2 — OSS Intelligence Surface)

| #       | Decision                          | Rationale                                                                             |
|---------|-----------------------------------|---------------------------------------------------------------------------------------|
| ADR-014 | GitHub App over personal PAT      | PAT: 30 req/min shared globally. App: 30 req/min per installation × N teams. Scales linearly with customer count. |
| ADR-015 | Semantic cache deduplication      | 70% of dev queries are semantically identical. Cosine > 0.92 threshold collapses cache misses by ~10×. |
| ADR-016 | Stack Exchange as OSS supplement  | GitHub has code context and PR fixes; SO has curated accepted answers. Combined coverage > either alone. |
| ADR-017 | IssueRanker weighted scoring      | Not all closed issues are equal. A 2-line fix on a 5-star repo is noise; a merged PR with 200 👍 on a 50k-star repo is signal. |
| ADR-018 | QueryClassifier before dual search| Fast Haiku call routes queries to correct surface. "Why did we drop Kafka?" → private only. Saves ~60% wasted dual-pipeline computation. |
| ADR-019 | Circuit breaker on GitHub API     | Auto-pauses live OSS search when rate limit < 5 remaining. Falls back to cache-only. Recovers when reset window expires. |
| ADR-020 | Nightly OSS cache cleanup         | PostgreSQL has no row-level TTL. BullMQ cron job DELETEs expired OSSIssueCache rows at 3 AM daily. |

---

## Implemented Connectors

### Private Team Connectors (Surface 1)

| Connector | OAuth            | Webhook       | Incremental Sync            | Data Sources                          |
|-----------|------------------|---------------|-----------------------------|---------------------------------------|
| GitHub    | ✅ OAuth App     | HMAC-SHA256   | Cursor-based (lastSyncedAt) | Repos, READMEs, Issues, PRs, Commits  |
| Notion    | ✅ OAuth 2.0     | Polling       | Pagination (start_cursor)   | Pages, Databases, Blocks              |
| Slack     | ✅ OAuth v2      | Signing Secret| Timestamp (oldest)          | Channels, Messages, Threads           |
| Linear    | ✅ OAuth 2.0     | HMAC          | GraphQL cursor              | Issues, Comments, Projects            |
| Jira      | ✅ Atlassian OAuth| URL Secret   | JQL (updatedAt)             | Issues, Comments, Boards              |

### OSS Intelligence Connectors (Surface 2)

| Connector      | Auth Method           | Rate Limiting            | Data Sources                        |
|----------------|-----------------------|--------------------------|-------------------------------------|
| GitHub OSS     | GitHub App (per-install) | Per-team via X-RateLimit + circuit breaker | Public closed issues, merged PRs     |
| Stack Exchange | API key (optional)    | 10k req/day with key     | Accepted answers on Stack Overflow   |

---

## API Routes (v1)

All routes are prefixed with `/api/v1` unless otherwise noted.

| Group              | Prefix             | Endpoints                                                    | Auth                 |
|--------------------|--------------------|------------------------------------------------------------- |----------------------|
| Auth               | `/auth`            | register, login, refresh, logout                             | Public (rate-limited)|
| Search             | `/search`          | search (SSE+JSON, dual-surface), history, feedback, suggestions | JWT + team scope  |
| OSS Intelligence   | `/oss`             | search, trending, issue/:owner/:repo/:number, synthesize, cache/status | JWT + team scope |
| Connectors         | `/connectors`      | list, get, OAuth start/callback, update, delete, sync, pause, resume, jobs | JWT + team scope |
| Teams              | `/teams`           | get, update, members, invite, remove, role update, delete (GDPR)    | JWT + role-based |
| Documents          | `/documents`       | list, get, delete, reindex                                  | JWT + team scope     |
| Analytics          | `/analytics`       | overview, query volume, top queries, slow queries, connector health, usage | JWT + admin  |
| Billing            | `/billing`         | get, checkout, portal, cancel subscription                   | JWT + owner          |
| Webhooks           | `/webhooks`        | github, slack, linear, notion, stripe                        | Signature-verified   |
| Health             | `/health` (no prefix) | health, deep health, /metrics (Prometheus)                | Public               |

---

## Security Measures

| Measure              | Implementation                                                      |
|----------------------|---------------------------------------------------------------------|
| Password hashing     | bcrypt, 12 rounds                                                   |
| Token rotation       | SHA-256 hashed refresh tokens, family-based reuse detection         |
| OAuth token storage  | AES-256-GCM encryption at rest                                      |
| OAuth CSRF           | HMAC-signed state + Redis replay protection                         |
| API validation       | Zod on every request boundary                                       |
| Rate limiting        | Redis sliding window (10/min auth, 60/min search, 20/min OSS, 120/min API) |
| ACL filtering        | PostgreSQL array overlap (`&&`) on every retrieval query            |
| CORS                 | Strict origin whitelist (WEB_BASE_URL only)                         |
| Security headers     | Hono secureHeaders middleware                                       |
| Webhook verification | `crypto.timingSafeEqual` for all HMAC signatures                    |
| Circuit breaker      | Auto-pauses external API calls when rate limits exhausted           |

---

## Phase Checklist

- [x] **Phase 0** — CLAUDE.md created, repo scaffolded, Docker Compose, env validation
- [x] **Phase 1** — Prisma schema, Auth service (JWT + refresh rotation), middleware stack
- [x] **Phase 2** — GitHub connector (OAuth + sync + chunking + embedding), BaseConnector
- [x] **Phase 3** — Core search (embed → pgvector hybrid → Claude stream → SSE)
- [x] **Phase 4** — Notion, Slack, Linear, Jira connectors + BullMQ scheduler + sync worker
- [x] **Phase 5** — React 19 frontend (Login, Register, Search, Connectors, Documents, Analytics, Settings)
- [x] **Phase 6** — Stripe billing, team invites, analytics dashboard, usage tracking
- [x] **Phase 7** — Dockerfile, Fly.io config, GitHub Actions CI/CD, seed script, security hardening
- [x] **Phase 8** — OSS Intelligence Surface (PROMPT2): GitHubOSS + StackExchange connectors, IssueRanker, QueryClassifier, ResultFusion, OSSService, CircuitBreaker, OSS Explorer page, 200 seed cache entries

---

## How to Run

```bash
# 1. Start infrastructure
docker-compose up -d

# 2. Install dependencies
bun install

# 3. Generate Prisma client & run migrations
cd packages/db && bunx prisma migrate dev --name init && bunx prisma generate && cd ../..

# 4. Seed demo data (optional — creates user, docs, OSS cache)
bun run infra/scripts/seed.ts

# 5. Start development (API + Web in parallel)
bun dev
```

**Demo credentials:** `dev@devglean.io` / `Password1!`
**API:** http://localhost:3001 — **Web:** http://localhost:5173 — **pgAdmin:** http://localhost:5050

---

## Environment Variables

### Required

| Variable           | Description                                    |
|--------------------|------------------------------------------------|
| `DATABASE_URL`     | PostgreSQL connection string                   |
| `REDIS_URL`        | Redis connection string                        |
| `JWT_SECRET`       | Access token signing key (≥32 chars)           |
| `JWT_REFRESH_SECRET` | Refresh token signing key (≥32 chars)        |
| `ENCRYPTION_KEY`   | AES-256-GCM key for OAuth tokens (64 hex chars)|
| `OPENAI_API_KEY`   | OpenAI API key for embeddings                  |
| `ANTHROPIC_API_KEY`| Anthropic API key for Claude (Sonnet + Haiku)  |

### OSS Intelligence (Phase 8)

| Variable                    | Description                                        |
|-----------------------------|----------------------------------------------------|
| `GITHUB_APP_ID`             | GitHub App ID for OSS search                       |
| `GITHUB_APP_PRIVATE_KEY`    | PEM key (base64-encoded) for GitHub App auth       |
| `GITHUB_APP_CLIENT_ID`      | GitHub App OAuth client ID                         |
| `GITHUB_APP_CLIENT_SECRET`  | GitHub App OAuth client secret                     |
| `GITHUB_APP_WEBHOOK_SECRET` | GitHub App webhook signing secret                  |
| `STACK_EXCHANGE_KEY`        | Stack Exchange API key (raises limit to 10k/day)   |
| `OAUTH_STATE_SECRET`        | HMAC key for OAuth state signing                   |

### Connectors + Billing

| Variable                         | Description                      |
|----------------------------------|----------------------------------|
| `GITHUB_CLIENT_ID/SECRET`        | GitHub OAuth App                 |
| `NOTION_CLIENT_ID/SECRET`        | Notion integration               |
| `SLACK_CLIENT_ID/SECRET`         | Slack App                        |
| `LINEAR_CLIENT_ID/SECRET`        | Linear OAuth                     |
| `JIRA_CLIENT_ID/SECRET`          | Atlassian OAuth                  |
| `STRIPE_SECRET_KEY`              | Stripe API key                   |
| `STRIPE_WEBHOOK_SECRET`          | Stripe webhook signing           |
| `STRIPE_PRO_PRICE_ID`            | Stripe Price ID for Pro plan     |
| `SENTRY_DSN`                     | Error tracking (optional)        |

---

## Changelog

### Phase 8 — 2026-04-25 — OSS Intelligence Surface (PROMPT2)

**Why:** PROMPT2 introduced "Surface 2" — the ability to search all of GitHub's resolved issues and Stack Exchange's accepted answers alongside team's private knowledge. This is DevGlean's core differentiator: no other RAG tool unifies private + public developer knowledge.

**Schema changes:**
- Added `OSSIssueCache` model — ephemeral cache with vector embedding for semantic dedup
- Added `OSSQueryLog` model — separate analytics for OSS search usage patterns
- Added `QuerySurface` enum (`PRIVATE | OSS | BOTH`) — tracks which pipeline was used
- Added `Team.githubAppInstallId` — links team to GitHub App installation for per-team rate limits
- Added `QueryLog.surface`, `QueryLog.ossResultCount`, `QueryLog.cacheHit` — enriched analytics
- Added `RefreshToken.@@index([family])` — faster family-based revocation lookups
- Added `pg_trgm` extension — trigram similarity for BM25 fuzzy matching

**New backend services (8):**
- `oss.service.ts` — Full pipeline: exact cache → semantic cache → circuit breaker → parallel fetch (GitHub + SO) → IssueRanker → dual-layer cache store
- `issueRanker.ts` — Weighted quality scoring. Weights: merged PR (30%), reactions (20%), repo stars (15%), code blocks (15%), accepted labels (10%), recency (10%)
- `queryClassifier.ts` — Claude Haiku call (~200ms) routes queries to the correct surface. Falls back to "both" on error (safe default)
- `resultFusion.ts` — Merges private + OSS results with score normalization, surface diversity guarantees (top-3 from each surface), and URL deduplication
- `githubOSS.connector.ts` — Public GitHub issue search via GitHub App per-installation auth. Rate limit tracking via response headers
- `stackexchange.connector.ts` — Stack Exchange accepted answers with HTML-to-markdown stripping
- `circuitBreaker.ts` — GitHub API rate limit guard stored in Redis. Pauses at < 5 remaining, auto-recovers on reset
- `ossPrewarm.worker.ts` — BullMQ worker: generates 5 related phrasings via Claude Haiku, pre-fetches each to warm cache

**New libraries:**
- `lib/github.ts` — GitHub App Octokit client factory with `getInstallationClient(installId)` for per-team auth
- `lib/stackexchange.ts` — Stack Exchange API v2.3 client with score filtering

**New routes:** `/api/v1/oss` — 5 endpoints: search, trending, issue detail, synthesize, cache status

**Modified services:**
- `search.service.ts` — Rewritten to orchestrate dual surfaces: QueryClassifier → parallel pipeline → ResultFusion → Generation
- `generation.service.ts` — System prompt updated for unified citations: team sources as `[Source N]` + OSS sources with repo context

**Frontend:**
- New `OSSExplorer.tsx` page — dedicated OSS search with issue quality scores, source badges (GitHub green / SO orange), issue detail panel with "Synthesize Solution" Claude button
- Updated `Sidebar.tsx` — added Globe icon + "OSS Explorer" nav item
- Updated `App.tsx` + `Layout.tsx` — added `ossExplorer` route

**Seed:** 200 OSS cache entries across 20 topics (React, pgvector, Redis, Docker, TypeScript, Next.js, Prisma, Bun, Hono, Tailwind, etc.) + 30 days of OSS query logs

### Phase 1–7 — 2026-04-24 — Initial Full Build

Full-stack platform delivered from PROMPT.md:
- Turborepo monorepo with 4 packages (db, shared, api, web)
- 5 data source connectors (GitHub, Notion, Slack, Linear, Jira) with OAuth, webhooks, incremental sync
- RAG pipeline: embed → hybrid retrieve (70/30 vector/FTS) → Claude streaming → SSE
- React 19 frontend with 7 pages, dark mode design system, Framer Motion animations
- Stripe billing integration with webhook-driven plan lifecycle
- Auth: JWT access (15m) + refresh token family rotation (7d)
- CI/CD: GitHub Actions (lint, typecheck, test with PG+Redis) + Fly.io deploy
- Development seed script with 50 documents and 30 days of analytics data
