<p align="center">
  <img src="https://img.shields.io/badge/Bun-1.x-f9f1e1?logo=bun&logoColor=black" alt="Bun" />
  <img src="https://img.shields.io/badge/Hono-4.x-E36002?logo=hono&logoColor=white" alt="Hono" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/pgvector-0.7-4169E1" alt="pgvector" />
  <img src="https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white" alt="Redis" />
  <img src="https://img.shields.io/badge/Claude-Sonnet-cc785c" alt="Claude" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License" />
</p>

<h1 align="center">⚡ DevGlean</h1>

<p align="center">
  <strong>Your team's brain + the world's open-source knowledge, unified.</strong><br/>
  Search your codebase, architecture decisions, and team history — plus every resolved issue on GitHub and Stack Overflow — in one query.
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#project-structure">Structure</a> •
  <a href="#api-reference">API</a> •
  <a href="#deployment">Deployment</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## What is DevGlean?

DevGlean connects to the tools your engineering team already uses — **GitHub**, **Notion**, **Slack**, **Linear**, and **Jira** — indexes everything into a unified knowledge graph, and lets you search across all of it with a single question.

But that's only half of it. DevGlean also searches the **entire open-source world** — resolved GitHub issues, merged pull requests, and accepted Stack Overflow answers — ranked by quality and synthesized by AI.

Under the hood, it's a dual-surface **RAG (Retrieval-Augmented Generation)** pipeline:

1. **Private Surface** — Your question is embedded, matched against your team's documents using hybrid vector + full-text search, and answered by Claude with `[Source N]` citations.
2. **OSS Surface** — The same question is simultaneously searched across all of GitHub's closed issues and Stack Exchange, scored by an IssueRanker algorithm, and fused with your private results.

No hallucinations. No context switching. No digging through 47 Slack threads OR 200 GitHub issues to find the answer.

---

## Features

### 🔍 AI-Powered Dual Search
- **Two search surfaces** — Team knowledge + global OSS intelligence in one query
- **Smart query routing** — Claude Haiku classifies each query as `private`, `oss`, or `both` — runs only the pipelines that matter
- **Hybrid retrieval** — 70% pgvector cosine similarity + 30% PostgreSQL full-text BM25
- **Streaming answers** — Claude generates responses token-by-token via SSE
- **Grounded citations** — every claim traces to `[Source N]` with deep links to original content
- **Result fusion** — private + OSS results merged with score normalization and surface diversity guarantees

### 🌐 OSS Issue Intelligence
- **GitHub search** — Closed issues + merged PRs across all public repositories
- **Stack Exchange** — Accepted answers from Stack Overflow
- **IssueRanker** — Weighted quality scoring: merged PR (30%), reactions (20%), stars (15%), code blocks (15%), labels (10%), recency (10%)
- **24h intelligent cache** — Redis + PostgreSQL with semantic deduplication (cosine > 0.92)
- **Claude synthesis** — "Synthesize Solution" button extracts problem/root-cause/fix from full issue threads
- **Circuit breaker** — Auto-pauses live search when GitHub API rate limit is low, falls back to cache

### 🔌 7 Data Source Connectors

| Connector | What it indexes | Surface |
|---|---|---|
| **GitHub** | Repos, READMEs, issues, PRs, commits | Private |
| **Notion** | Pages, databases, block content | Private |
| **Slack** | Channel messages, threads | Private |
| **Linear** | Issues, comments, projects | Private |
| **Jira** | Issues, comments (JQL + ADF parsing) | Private |
| **GitHub OSS** | Public closed issues, merged PRs (all repos) | OSS |
| **Stack Exchange** | Accepted answers on Stack Overflow | OSS |

Private connectors support **OAuth**, **incremental sync**, **webhook-triggered updates**, and **ACL-based access control**.

### 🏢 Multi-Tenant by Design
- Team-scoped data isolation on every query
- Role-based access control (Owner → Admin → Member)
- ACL filtering via PostgreSQL array overlap — no data leaks between teams
- Plan-based usage limits (FREE / PRO / ENTERPRISE)

### 💳 Stripe Billing
- Checkout session creation for plan upgrades
- Customer Portal for self-service billing management
- Webhook-driven plan lifecycle (activate / cancel / downgrade)

### 📊 Analytics Dashboard
- Query volume charts (daily/weekly) — broken down by surface (private vs OSS)
- Average latency tracking
- Top queries and slow query detection
- Connector health monitoring with success rate bars
- OSS cache hit rate and rate limit monitoring
- Plan usage meters (queries, connectors)

### 🔒 Security-First
- **bcrypt** password hashing (12 rounds)
- **JWT + refresh token rotation** with family-based reuse detection
- **AES-256-GCM** encryption for OAuth tokens at rest
- **HMAC-signed OAuth state** with Redis replay protection
- **Zod validation** on every API boundary
- **Redis sliding-window rate limiting** per route category
- **timing-safe comparison** for all webhook signatures
- **Circuit breaker** prevents cascading failures from external API exhaustion

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                          │
│   React 19 + Vite 6 │ TanStack Query │ Zustand │ SSE         │
│   8 pages: Search, OSS Explorer, Connectors, Analytics...    │
└─────────────────────────────┬────────────────────────────────┘
                              │ HTTPS / SSE
┌─────────────────────────────▼────────────────────────────────┐
│                         API GATEWAY                          │
│   Bun 1.x + Hono 4 │ Rate Limiting │ Auth │ CORS │ Zod       │
│   Trace IDs │ Secure Headers │ Team Scope │ Circuit Breaker   │
└──────┬────────────┬───────────────┬──────────┬───────────────┘
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

### Search Pipeline Flow

```
User Query
    │
    ▼
QueryClassifier (Claude Haiku, ~200ms)
    │
    ├── "private" ──▶ Embed → pgvector + BM25 hybrid → ACL filter
    │
    ├── "oss" ──▶ Cache check → GitHub API + Stack Exchange → IssueRanker
    │
    └── "both" ──▶ Run both in parallel
                        │
                        ▼
                  ResultFusion (normalize scores, ensure diversity)
                        │
                        ▼
                  Claude Sonnet (streaming, grounded citations)
                        │
                        ▼
                  SSE → Client
```

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.0
- [Docker](https://docker.com) + Docker Compose
- [OpenAI API key](https://platform.openai.com)
- [Anthropic API key](https://console.anthropic.com)

### 1. Clone & Install

```bash
git clone https://github.com/your-org/devglean.git
cd devglean
bun install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in the required values:

```env
DATABASE_URL=postgresql://devglean:devglean@localhost:5432/devglean
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-at-least-32-characters-long
JWT_REFRESH_SECRET=your-refresh-secret-at-least-32-chars
ENCRYPTION_KEY=64-hex-character-encryption-key-for-aes-256-gcm-here
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

For OSS Intelligence (optional — search works without these, but won't query live GitHub/SO):
```env
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY=base64-encoded-pem-key
STACK_EXCHANGE_KEY=your-stack-exchange-api-key
```

### 3. Start Infrastructure

```bash
docker-compose up -d
```

This starts PostgreSQL 16 (with pgvector + pg_trgm), Redis 7, and pgAdmin.

### 4. Run Database Migrations

```bash
cd packages/db
bunx prisma migrate dev --name init
bunx prisma generate
cd ../..
```

### 5. Seed Demo Data (Optional)

```bash
bun run infra/scripts/seed.ts
```

Creates a demo team, user, 50 documents, 200 OSS cache entries, and 30 days of analytics data.

### 6. Start Development

```bash
bun dev
```

| Service | URL |
|---|---|
| **Web App** | http://localhost:5173 |
| **API** | http://localhost:3001 |
| **pgAdmin** | http://localhost:5050 |
| **Health Check** | http://localhost:3001/health |

**Demo credentials:** `dev@devglean.io` / `Password1!`

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Runtime | **Bun 1.x** | Native TypeScript, fast startup, built-in test runner |
| API | **Hono 4** | Edge-ready, typed middleware, first-class Bun support |
| Frontend | **React 19 + Vite 6** | Concurrent rendering, instant HMR |
| State | **Zustand 5 + TanStack Query 5** | Client state + server state separation |
| Animation | **Framer Motion 11** | Layout animations, spring physics |
| Charts | **Recharts 2** | Composable SVG charts for analytics |
| ORM | **Prisma 6** | Type-safe queries, migration-first, pgvector support |
| Database | **PostgreSQL 16 + pgvector** | Unified relational + vector store |
| Cache/Queue | **Redis 7 + BullMQ 5** | Embedding cache, rate limits, OSS cache, background jobs |
| Embeddings | **OpenAI text-embedding-3-small** | 1536 dimensions, best cost/quality ratio |
| LLM (answers) | **Anthropic Claude Sonnet** | Superior citation grounding, streaming support |
| LLM (routing) | **Anthropic Claude Haiku** | Fast (~200ms) query classification |
| Auth | **jose + custom rotation** | Edge-compatible JWT, refresh token families |
| Validation | **Zod 3** | Runtime + compile-time type safety |
| Payments | **Stripe** | Checkout, Billing Portal, webhooks |
| GitHub API | **Octokit + GitHub App** | Per-installation rate limits for OSS search |
| Stack Exchange | **SE API v2.3** | Supplemental accepted answers |

---

## Project Structure

```
devglean/
├── packages/
│   ├── db/                       # Prisma schema + generated client
│   │   └── prisma/
│   │       └── schema.prisma     # 10 models, 6 enums
│   ├── shared/                   # Shared contracts across packages
│   │   └── src/
│   │       ├── schemas/          # Zod: auth, search, connector, team, analytics, document, oss
│   │       ├── types/            # 25+ domain interfaces (SearchResult, OSSIssue, FusedResult, etc.)
│   │       ├── errors/           # AppError class with structured JSON serialization
│   │       └── constants/        # TTLs, search weights, rate limits, ranker weights, Redis keys
│   ├── api/                      # Bun + Hono backend
│   │   └── src/
│   │       ├── connectors/       # 8 connectors: base, github, githubOSS, stackexchange, notion, slack, linear, jira
│   │       ├── jobs/             # BullMQ: sync worker, OSS prewarm worker, scheduler
│   │       ├── lib/              # Singletons: Prisma, Redis, OpenAI, Anthropic, GitHub App, StackExchange, Stripe
│   │       ├── middleware/       # 6: auth, rateLimit, traceId, errorHandler, teamScope, circuitBreaker
│   │       ├── routes/           # 10 route groups (~55 endpoints)
│   │       ├── services/         # 12: auth, embedding, chunker, retrieval, generation, search, oss, issueRanker, queryClassifier, resultFusion, analytics, billing
│   │       ├── app.ts            # Hono app factory
│   │       ├── index.ts          # Server entry + graceful shutdown
│   │       └── env.ts            # T3-pattern environment validation (30+ vars)
│   └── web/                      # React 19 + Vite 6 frontend
│       └── src/
│           ├── components/       # Layout, Sidebar
│           ├── pages/            # 8 pages: Login, Register, Search, OSS Explorer, Connectors, Documents, Analytics, Settings
│           ├── store/            # Zustand auth store
│           ├── lib/              # API client (auto-refresh, SSE streaming), QueryClient
│           └── styles/           # CSS design system (dark mode, glassmorphism)
├── infra/
│   ├── fly.toml                  # Fly.io production deployment
│   └── scripts/
│       ├── setup.sh              # One-command dev bootstrap
│       └── seed.ts               # Demo data: user, 50 docs, 200 OSS cache entries, 30 days analytics
├── .github/workflows/
│   ├── ci.yml                    # Type check + test (PostgreSQL + Redis services)
│   └── deploy.yml                # Auto-deploy to Fly.io on main push
├── docker-compose.yml            # Local infrastructure
├── Dockerfile                    # Multi-stage production build
├── CLAUDE.md                     # Living architecture specification
└── turbo.json                    # Monorepo task pipeline
```

---

## API Reference

All routes are prefixed with `/api/v1`. Authenticated routes require a `Bearer` token in the `Authorization` header.

### Auth
| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/register` | Create team + first user |
| `POST` | `/auth/login` | Get access token + refresh cookie |
| `POST` | `/auth/refresh` | Rotate refresh token, get new access token |
| `POST` | `/auth/logout` | Revoke refresh token family |

### Search (Dual-Surface)
| Method | Path | Description |
|---|---|---|
| `POST` | `/search` | RAG search — auto-classifies to private/oss/both, streams via SSE or returns JSON |
| `GET` | `/search/history` | Paginated query history (includes surface used) |
| `POST` | `/search/:queryId/feedback` | Submit helpful/not helpful feedback |
| `GET` | `/search/suggestions` | Query autocomplete from team history |

### OSS Intelligence
| Method | Path | Description |
|---|---|---|
| `POST` | `/oss/search` | Search resolved GitHub issues + Stack Exchange answers |
| `GET` | `/oss/trending` | Anonymized popular queries across all teams |
| `GET` | `/oss/issue/:owner/:repo/:number` | Full issue thread detail |
| `POST` | `/oss/issue/:owner/:repo/:number/synthesize` | Claude-powered problem/solution extraction |
| `GET` | `/oss/cache/status` | Cache hit rate, entry count, rate limit status |

### Connectors
| Method | Path | Description |
|---|---|---|
| `GET` | `/connectors` | List team's connectors |
| `GET` | `/connectors/:id` | Connector details + sync history |
| `POST` | `/connectors/:type/oauth/start` | Begin OAuth flow |
| `POST` | `/connectors/:type/oauth/callback` | Complete OAuth + trigger initial sync |
| `PATCH` | `/connectors/:id` | Update display name or config |
| `DELETE` | `/connectors/:id` | Delete connector + all documents |
| `POST` | `/connectors/:id/sync` | Trigger manual full sync |
| `POST` | `/connectors/:id/pause` | Pause scheduled syncing |
| `POST` | `/connectors/:id/resume` | Resume scheduled syncing |
| `GET` | `/connectors/:id/jobs` | List sync job history |

### Teams
| Method | Path | Description |
|---|---|---|
| `GET` | `/teams` | Get current team info |
| `PATCH` | `/teams` | Update team name/slug |
| `GET` | `/teams/members` | List team members |
| `POST` | `/teams/members/invite` | Send invite email |
| `DELETE` | `/teams/members/:userId` | Remove member |
| `PATCH` | `/teams/members/:userId/role` | Update member role |
| `DELETE` | `/teams` | Delete team (GDPR) |

### Documents
| Method | Path | Description |
|---|---|---|
| `GET` | `/documents` | Paginated document browser with filters |
| `GET` | `/documents/:id` | Document chunk detail |
| `DELETE` | `/documents/:id` | Delete document |
| `POST` | `/documents/reindex` | Schedule re-embedding of all documents |

### Analytics
| Method | Path | Description |
|---|---|---|
| `GET` | `/analytics/overview` | KPI summary (queries, latency, docs, connectors) |
| `GET` | `/analytics/queries` | Query volume time series |
| `GET` | `/analytics/queries/top` | Most frequent queries |
| `GET` | `/analytics/queries/slow` | Slowest queries |
| `GET` | `/analytics/connectors/health` | Connector sync success rates |
| `GET` | `/analytics/usage` | Plan usage (queries, connectors vs limits) |

### Billing
| Method | Path | Description |
|---|---|---|
| `GET` | `/billing` | Current plan + usage |
| `POST` | `/billing/checkout` | Create Stripe Checkout session |
| `POST` | `/billing/portal` | Create Stripe Customer Portal session |
| `DELETE` | `/billing/subscription` | Cancel subscription at period end |

### Health
| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Basic health check |
| `GET` | `/health/deep` | PostgreSQL + Redis connectivity check |
| `GET` | `/metrics` | Prometheus-compatible metrics |

---

## Deployment

### Fly.io (Production)

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Launch (first time)
fly launch

# Set secrets
fly secrets set \
  DATABASE_URL="..." \
  REDIS_URL="..." \
  JWT_SECRET="..." \
  JWT_REFRESH_SECRET="..." \
  ENCRYPTION_KEY="..." \
  OPENAI_API_KEY="..." \
  ANTHROPIC_API_KEY="..." \
  GITHUB_APP_ID="..." \
  GITHUB_APP_PRIVATE_KEY="..." \
  STACK_EXCHANGE_KEY="..."

# Deploy
fly deploy --config infra/fly.toml

# Run migrations
fly ssh console -C "bunx prisma migrate deploy"
```

### CI/CD

The project includes GitHub Actions workflows:

- **`ci.yml`** — Runs on every push/PR: installs deps, validates Prisma schema, type checks, runs tests against PostgreSQL + Redis services
- **`deploy.yml`** — Runs on push to `main`: runs Prisma migrations, deploys to Fly.io

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| **pgvector over Pinecone** | Single database for all data. No vendor lock-in. ACID transactions with relational data. Free. At <1M vectors, performance is excellent. |
| **Hybrid search (70/30)** | Pure vector search fails on exact entity names (function names, ticket IDs, error codes). Full-text BM25 preserves exact match capability. |
| **Token family rotation** | Refresh tokens are SHA-256 hashed, grouped by family. If a token is reused, the entire family is revoked — prevents replay attacks without server-side session state. |
| **BullMQ over Kafka** | At <10k jobs/day, Kafka's operational overhead isn't justified. Redis is already in the stack. BullMQ provides excellent retry/backoff support. |
| **Sentence-boundary chunking** | Fixed-size chunking splits mid-sentence, destroying context. Sentence-aware splitting with 64-token overlap preserves semantic coherence. |
| **SSE over WebSocket** | LLM output is unidirectional. SSE is simpler, has native browser support, and works through HTTP proxies without upgrade negotiation. |
| **GitHub App over PAT** | Personal access tokens share one rate limit globally. GitHub App gives each team its own 30 req/min limit. Scales linearly with customers. |
| **Semantic OSS cache** | 70% of developer queries are semantically identical. Embedding cached queries and matching at cosine > 0.92 reduces live API calls by ~10×. |
| **QueryClassifier routing** | ~60% of queries only need one surface. Running both pipelines for every query wastes latency and tokens. A fast Haiku call saves both. |

---

## Environment Variables

See [`.env.example`](.env.example) for all variables.

### Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Access token signing key (≥32 chars) |
| `JWT_REFRESH_SECRET` | Refresh token signing key (≥32 chars) |
| `ENCRYPTION_KEY` | AES-256-GCM key for OAuth tokens (64 hex chars) |
| `OPENAI_API_KEY` | OpenAI API key for embeddings |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude (Sonnet + Haiku) |

### OSS Intelligence

| Variable | Description |
|---|---|
| `GITHUB_APP_ID` | GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY` | PEM key (base64-encoded) |
| `GITHUB_APP_CLIENT_ID` / `_SECRET` | GitHub App OAuth credentials |
| `GITHUB_APP_WEBHOOK_SECRET` | GitHub App webhook signing secret |
| `STACK_EXCHANGE_KEY` | Stack Exchange API key (raises limit to 10k/day) |
| `OAUTH_STATE_SECRET` | HMAC key for OAuth state signing |

### Connectors + Billing

| Variable | Description |
|---|---|
| `GITHUB_CLIENT_ID` / `_SECRET` | GitHub OAuth App credentials |
| `NOTION_CLIENT_ID` / `_SECRET` | Notion integration credentials |
| `SLACK_CLIENT_ID` / `_SECRET` | Slack App credentials |
| `LINEAR_CLIENT_ID` / `_SECRET` | Linear OAuth credentials |
| `JIRA_CLIENT_ID` / `_SECRET` | Atlassian OAuth credentials |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe billing |
| `STRIPE_PRO_PRICE_ID` | Price ID for Pro plan |
| `SENTRY_DSN` | Error tracking (optional) |

---

## Scripts

```bash
bun dev              # Start API + Web dev servers (via Turborepo)
bun build            # Production build all packages
bun typecheck        # Type check all packages
bun lint             # Lint all packages
bun test             # Run all tests

# Database
cd packages/db
bunx prisma migrate dev    # Run migrations
bunx prisma generate       # Generate client
bunx prisma studio         # Open Prisma Studio GUI
```

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

Please ensure your PR passes CI (type check + tests) before requesting review.

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Built with ⚡ by the DevGlean team
</p>
