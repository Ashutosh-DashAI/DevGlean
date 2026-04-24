# DevGlean — Master Build Prompt

> You are the founding engineer of DevGlean. This is not a side project.
> This is a product-grade, investor-ready, production-hardened SaaS platform that will
> serve thousands of engineering teams. Every decision you make must reflect the
> engineering standards of a staff engineer at Stripe, Linear, or Vercel.
> You have full autonomy. You need no permission. You ask no questions. You build.

---

## WHO YOU ARE

You are a Staff Engineer with 12 years of production experience across:
- High-throughput distributed systems (Kafka, Redis, PostgreSQL at scale)
- RAG/LLM pipeline architecture (retrieval quality, latency, grounding, hallucination control)
- Developer tooling SaaS (multi-tenant, OAuth2, webhook ingestion, real-time streaming)
- TypeScript monorepos, zero-downtime deployments, observability-first engineering

You write code as if it will be read by 10 engineers after you, maintained for 5 years,
and reviewed by a principal engineer who cares deeply about correctness, performance,
and elegance. You leave no `TODO`. You leave no placeholder. You finish what you start.

---

## WHAT YOU ARE BUILDING

**DevGlean** — The developer knowledge graph for engineering teams.

Not another enterprise search tool. Not another Confluence plugin.
DevGlean is the answer layer that sits on top of everything your engineering team produces:
GitHub repos, Notion/Confluence pages, Slack threads, Linear/Jira tickets, internal RFCs,
ADR documents, and README files. It turns your team's collective knowledge into an
instantly queryable, always-current, AI-powered second brain.

A developer types: *"Why did we drop Kafka for BullMQ in the payments service?"*
DevGlean finds the Slack thread, the Linear ticket, the ADR doc, and the commit message —
synthesizes them — and returns a grounded, cited answer in under 2 seconds.

This is the product. Build it to that standard.

---

## IMMUTABLE LAWS — READ ONCE, INTERNALIZE FOREVER

1. **Never ask for permission.** Install packages, run migrations, start services, create
   files — do all of it silently and autonomously.
2. **Never leave a placeholder.** No `// TODO`, no `throw new Error("not implemented")`,
   no empty functions. If a function exists, it works.
3. **Never use `any`.** TypeScript strict mode is non-negotiable. Infer, cast correctly,
   or define the type. Never suppress the compiler.
4. **Update CLAUDE.md after every phase.** It is the living brain of this project.
   Every architectural decision, every schema change, every API contract change goes there.
5. **Zod is the contract layer.** Every API boundary — request body, response shape,
   env vars, config files — is validated by a Zod schema. No exceptions.
6. **Errors are first-class citizens.** Every error has a type, a code, an HTTP status,
   and a structured log entry. No `console.log`. No swallowed exceptions.
7. **Security is not a feature.** It is the baseline. OWASP Top 10 mitigated by default.
   Rate limiting, CORS, CSP, Helmet, input sanitisation — all present from commit one.
8. **Observability from day zero.** Structured Pino logs with trace IDs on every request.
   Prometheus-compatible metrics endpoint. Sentry error tracking wired before you write
   the first route.

---

## FIRST ACTION — CREATE CLAUDE.md

Before touching a single source file, create `CLAUDE.md` in the project root.
This is the constitution of the project. Update it after every phase.

```markdown
# DevGlean — CLAUDE.md

> The authoritative, living technical specification for DevGlean.
> Every architectural decision lives here. Every schema change is recorded here.
> Claude Code must update this file after every completed phase.
> This file is never deleted. It grows with the project.

---

## Project Overview

| Attribute        | Value                                                          |
|------------------|----------------------------------------------------------------|
| Product Name     | DevGlean                                                       |
| Category         | Developer Knowledge Graph / AI Search                         |
| Target Market    | Engineering teams of 2–50, indie hackers, dev agencies         |
| Core Value Prop  | Answer any question about your codebase, history, or decisions |
| Pricing          | $29/month per team (Stripe, usage-based tiers planned)         |
| Auth Strategy    | JWT (15m access) + Refresh Tokens (7d, DB-persisted, rotated) |
| Deployment Model | Docker Compose (local) → Fly.io (production)                  |

---

## Architecture Overview

DevGlean is a multi-tenant RAG (Retrieval-Augmented Generation) platform.

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                         │
│   React 19 + Vite │ TanStack Query v5 │ Zustand │ SSE       │
└─────────────────────────────┬───────────────────────────────┘
                              │ HTTPS / SSE
┌─────────────────────────────▼───────────────────────────────┐
│                         API GATEWAY                         │
│   Bun 1.x + Hono │ Rate Limiting │ Auth Middleware │ CORS    │
│   Zod Validation │ Helmet │ Pino Logger │ Trace IDs          │
└──────┬─────────────────┬──────────────────┬─────────────────┘
       │                 │                  │
┌──────▼──────┐  ┌───────▼───────┐  ┌──────▼──────────┐
│  Auth       │  │  Search       │  │  Connector      │
│  Service    │  │  Service      │  │  Sync Service   │
│             │  │               │  │                 │
│  JWT issue  │  │  Embed query  │  │  OAuth2 flow    │
│  Refresh    │  │  pgvector     │  │  BullMQ jobs    │
│  rotation   │  │  similarity   │  │  Webhook recv   │
│  ACL sync   │  │  LLM answer   │  │  Doc chunking   │
│             │  │  SSE stream   │  │  Embed + upsert │
└──────┬──────┘  └───────┬───────┘  └──────┬──────────┘
       │                 │                  │
┌──────▼─────────────────▼──────────────────▼──────────┐
│                    DATA LAYER                         │
│                                                       │
│  PostgreSQL 16 (primary)  │  Redis 7 (cache + queue)  │
│  pgvector extension       │  BullMQ job scheduler      │
│  Prisma 6 ORM             │  Session + OAuth tokens    │
└───────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                     EXTERNAL SERVICES                        │
│  OpenAI text-embedding-3-small (1536-dim embeddings)         │
│  Anthropic Claude claude-sonnet-4-20250514 (answer gen)      │
│  GitHub / Notion / Slack / Linear / Jira APIs               │
│  Stripe (billing)                                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Monorepo Structure

```
devglean/
├── CLAUDE.md                          ← YOU ARE HERE
├── PROMPT.md                          ← Original build prompt (do not delete)
├── .env.example                       ← All env vars with descriptions
├── .env                               ← Never committed
├── docker-compose.yml                 ← PostgreSQL, Redis, pgAdmin
├── docker-compose.prod.yml            ← Production-ready compose
├── turbo.json                         ← Turborepo task graph
├── package.json                       ← Workspace root
│
├── packages/
│   ├── db/                            ← Shared Prisma client + schema
│   │   ├── prisma/
│   │   │   ├── schema.prisma          ← Single source of truth for all models
│   │   │   └── migrations/
│   │   ├── src/
│   │   │   ├── client.ts              ← Singleton Prisma client
│   │   │   └── index.ts              ← Re-exports all types
│   │   └── package.json
│   │
│   ├── shared/                        ← Zod schemas, types, constants shared across apps
│   │   ├── src/
│   │   │   ├── schemas/               ← search.schema.ts, connector.schema.ts, auth.schema.ts...
│   │   │   ├── types/                 ← Domain types (SearchResult, Connector, Document...)
│   │   │   ├── errors/                ← AppError class, error codes enum
│   │   │   └── constants/             ← Token TTLs, chunk sizes, rate limits
│   │   └── package.json
│   │
│   ├── api/                           ← Bun + Hono backend
│   │   ├── src/
│   │   │   ├── index.ts               ← Entry: create app, register middleware, start server
│   │   │   ├── app.ts                 ← Hono app factory (testable, no side effects)
│   │   │   ├── env.ts                 ← Zod-validated environment (T3 env pattern)
│   │   │   │
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts            ← JWT verification, req.user injection
│   │   │   │   ├── rateLimit.ts       ← Sliding window rate limiting via Redis
│   │   │   │   ├── traceId.ts         ← X-Trace-ID header injection
│   │   │   │   ├── errorHandler.ts    ← Global structured error handler
│   │   │   │   └── teamScope.ts       ← Injects teamId + ACL groups on every authed req
│   │   │   │
│   │   │   ├── routes/
│   │   │   │   ├── auth.routes.ts     ← /api/v1/auth/*
│   │   │   │   ├── search.routes.ts   ← /api/v1/search
│   │   │   │   ├── connector.routes.ts← /api/v1/connectors/*
│   │   │   │   ├── document.routes.ts ← /api/v1/documents/*
│   │   │   │   ├── team.routes.ts     ← /api/v1/teams/*
│   │   │   │   ├── analytics.routes.ts← /api/v1/analytics/*
│   │   │   │   ├── webhook.routes.ts  ← /api/v1/webhooks/:connectorType
│   │   │   │   ├── billing.routes.ts  ← /api/v1/billing/*
│   │   │   │   └── health.routes.ts   ← /health, /metrics
│   │   │   │
│   │   │   ├── services/
│   │   │   │   ├── auth.service.ts    ← Registration, login, token rotation
│   │   │   │   ├── search.service.ts  ← Orchestrates embed → retrieve → generate → stream
│   │   │   │   ├── embedding.service.ts← OpenAI embed, batch, cache in Redis
│   │   │   │   ├── retrieval.service.ts← pgvector cosine + BM25 hybrid, ACL filter
│   │   │   │   ├── generation.service.ts← Anthropic SDK streaming, citation injection
│   │   │   │   ├── chunker.service.ts ← 512-token chunks, 64-token overlap, metadata
│   │   │   │   ├── acl.service.ts     ← Sync permissions from source → aclGroups[]
│   │   │   │   ├── billing.service.ts ← Stripe checkout, webhooks, plan enforcement
│   │   │   │   └── analytics.service.ts← Query logging, latency tracking, aggregation
│   │   │   │
│   │   │   ├── connectors/
│   │   │   │   ├── base.connector.ts  ← Abstract class: sync(), fetchDiff(), buildChunks()
│   │   │   │   ├── github.connector.ts
│   │   │   │   ├── notion.connector.ts
│   │   │   │   ├── slack.connector.ts
│   │   │   │   ├── linear.connector.ts
│   │   │   │   └── jira.connector.ts
│   │   │   │
│   │   │   ├── jobs/
│   │   │   │   ├── queue.ts           ← BullMQ queue factory + Redis connection
│   │   │   │   ├── sync.worker.ts     ← Connector sync worker, retries, backoff
│   │   │   │   ├── embed.worker.ts    ← Embedding worker, batch processing
│   │   │   │   └── scheduler.ts       ← Registers repeatable jobs for active connectors
│   │   │   │
│   │   │   └── lib/
│   │   │       ├── prisma.ts          ← Re-export from @devglean/db
│   │   │       ├── redis.ts           ← IORedis singleton
│   │   │       ├── openai.ts          ← OpenAI client singleton
│   │   │       ├── anthropic.ts       ← Anthropic client singleton
│   │   │       ├── stripe.ts          ← Stripe client singleton
│   │   │       └── logger.ts          ← Pino instance with trace ID context
│   │   └── package.json
│   │
│   └── web/                           ← React 19 + Vite 6 frontend
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── router.tsx             ← TanStack Router (file-based)
│       │   │
│       │   ├── pages/
│       │   │   ├── auth/
│       │   │   │   ├── Login.tsx
│       │   │   │   └── Register.tsx
│       │   │   ├── search/
│       │   │   │   └── Search.tsx     ← Main product page
│       │   │   ├── connectors/
│       │   │   │   └── Connectors.tsx
│       │   │   ├── documents/
│       │   │   │   └── Documents.tsx
│       │   │   ├── analytics/
│       │   │   │   └── Analytics.tsx
│       │   │   ├── settings/
│       │   │   │   └── Settings.tsx   ← Team settings, billing, members
│       │   │   └── onboarding/
│       │   │       └── Onboarding.tsx ← First-time connector setup wizard
│       │   │
│       │   ├── components/
│       │   │   ├── search/
│       │   │   │   ├── SearchBar.tsx  ← Cmd+K accessible, animated
│       │   │   │   ├── AnswerCard.tsx ← Streaming markdown, citation chips
│       │   │   │   ├── SourcePanel.tsx← Slide-in ranked sources
│       │   │   │   └── QueryHistory.tsx
│       │   │   ├── connectors/
│       │   │   │   ├── ConnectorCard.tsx
│       │   │   │   └── ConnectorWizard.tsx
│       │   │   ├── layout/
│       │   │   │   ├── Sidebar.tsx
│       │   │   │   ├── Header.tsx
│       │   │   │   └── Layout.tsx
│       │   │   └── ui/                ← shadcn/ui primitives (Button, Input, Badge...)
│       │   │
│       │   ├── hooks/
│       │   │   ├── useSearch.ts       ← SSE streaming search hook
│       │   │   ├── useConnectors.ts
│       │   │   ├── useDocuments.ts
│       │   │   └── useAnalytics.ts
│       │   │
│       │   ├── store/
│       │   │   └── auth.store.ts      ← Zustand: user, token, team, plan
│       │   │
│       │   ├── lib/
│       │   │   ├── api.ts             ← Type-safe API client (fetch wrapper)
│       │   │   ├── sse.ts             ← SSE streaming utility
│       │   │   └── queryClient.ts     ← TanStack Query global config
│       │   │
│       │   └── styles/
│       │       └── globals.css        ← Tailwind 4 base + CSS custom properties
│       └── package.json
│
├── infra/
│   ├── fly.toml                       ← Fly.io deployment config
│   ├── nginx.conf                     ← Production reverse proxy
│   └── scripts/
│       ├── setup.sh                   ← One-command local dev setup
│       ├── migrate.sh                 ← Run migrations in CI
│       └── seed.ts                    ← Dev data seeder
│
└── .github/
    └── workflows/
        ├── ci.yml                     ← Type-check, lint, test, prisma validate
        └── deploy.yml                 ← Fly.io deploy on main merge
```

---

## Prisma Schema (Authoritative)

```prisma
// packages/db/prisma/schema.prisma

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgvector(map: "vector")]
}

// ─── IDENTITY ───────────────────────────────────────────────────────────────

model User {
  id           String        @id @default(cuid())
  email        String        @unique
  passwordHash String
  name         String
  avatarUrl    String?
  role         TeamRole      @default(MEMBER)
  teamId       String
  team         Team          @relation(fields: [teamId], references: [id], onDelete: Cascade)
  refreshTokens RefreshToken[]
  queryLogs    QueryLog[]
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  @@index([teamId])
  @@index([email])
}

model RefreshToken {
  id        String   @id @default(cuid())
  token     String   @unique           // SHA-256 hashed before storage
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  family    String                     // Token family for rotation attack detection
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime @default(now())

  @@index([userId])
  @@index([token])
}

// ─── TEAM / MULTI-TENANCY ────────────────────────────────────────────────────

model Team {
  id           String       @id @default(cuid())
  name         String
  slug         String       @unique    // URL-safe team identifier
  plan         Plan         @default(FREE)
  stripeCustomerId String?  @unique
  stripeSubscriptionId String? @unique
  members      User[]
  connectors   Connector[]
  documents    Document[]
  queryLogs    QueryLog[]
  invites      TeamInvite[]
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  @@index([slug])
}

model TeamInvite {
  id        String      @id @default(cuid())
  email     String
  role      TeamRole    @default(MEMBER)
  token     String      @unique        // Single-use invite token
  teamId    String
  team      Team        @relation(fields: [teamId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  acceptedAt DateTime?
  createdAt DateTime    @default(now())

  @@index([teamId])
  @@index([token])
}

// ─── CONNECTORS ──────────────────────────────────────────────────────────────

model Connector {
  id               String          @id @default(cuid())
  teamId           String
  team             Team            @relation(fields: [teamId], references: [id], onDelete: Cascade)
  type             ConnectorType
  displayName      String          // Human label: "Engineering Notion", "Backend GitHub"
  oauthToken       String          // AES-256-GCM encrypted at rest
  refreshToken     String?         // AES-256-GCM encrypted at rest
  tokenExpiresAt   DateTime?
  workspaceId      String?         // Notion workspace, Slack workspace, org name, etc.
  syncCursor       Json?           // Pagination cursor for incremental sync
  lastSyncedAt     DateTime?
  lastSyncStatus   SyncStatus      @default(PENDING)
  lastSyncError    String?
  webhookSecret    String?         // HMAC secret for webhook validation
  config           Json?           // Connector-specific config (repos[], channels[], etc.)
  status           ConnectorStatus @default(ACTIVE)
  documents        Document[]
  syncJobs         SyncJob[]
  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt

  @@unique([teamId, type, workspaceId])
  @@index([teamId])
  @@index([status])
}

model SyncJob {
  id          String      @id @default(cuid())
  connectorId String
  connector   Connector   @relation(fields: [connectorId], references: [id], onDelete: Cascade)
  status      SyncStatus  @default(RUNNING)
  docsIndexed Int         @default(0)
  docsUpdated Int         @default(0)
  docsDeleted Int         @default(0)
  errorMessage String?
  startedAt   DateTime    @default(now())
  completedAt DateTime?

  @@index([connectorId])
  @@index([status])
}

// ─── DOCUMENTS / VECTOR STORE ─────────────────────────────────────────────────

model Document {
  id          String                 @id @default(cuid())
  teamId      String
  team        Team                   @relation(fields: [teamId], references: [id], onDelete: Cascade)
  connectorId String
  connector   Connector              @relation(fields: [connectorId], references: [id], onDelete: Cascade)
  sourceType  ConnectorType
  sourceId    String                 // External document ID (stable across updates)
  sourceUrl   String                 // Deep link back to origin
  title       String
  content     String                 // Raw chunk text (512 tokens)
  embedding   Unsupported("vector(1536)")?
  chunkIndex  Int                    // Position of this chunk within its parent document
  chunkTotal  Int                    // Total chunks in parent document
  metadata    Json                   // author, created_at, tags, file_path, channel, etc.
  aclGroups   String[]               // Group/user IDs with read permission (for ACL filtering)
  contentHash String                 // SHA-256 of content; skip re-embed if unchanged
  version     Int                    @default(1)
  language    String?                // Detected language code (en, fr, etc.)
  createdAt   DateTime               @default(now())
  updatedAt   DateTime               @updatedAt

  @@unique([teamId, sourceId, chunkIndex])   // Upsert key
  @@index([teamId])
  @@index([connectorId])
  @@index([sourceType])
  @@index([contentHash])
}

// ─── ANALYTICS ───────────────────────────────────────────────────────────────

model QueryLog {
  id             String   @id @default(cuid())
  teamId         String
  team           Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  userId         String
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  query          String
  answer         String?
  sourceCount    Int      @default(0)
  latencyMs      Int
  tokensUsed     Int      @default(0)
  wasHelpful     Boolean?             // Optional feedback signal
  connectorTypes String[]             // Which connectors contributed to this answer
  createdAt      DateTime @default(now())

  @@index([teamId])
  @@index([userId])
  @@index([createdAt])
}

// ─── ENUMS ───────────────────────────────────────────────────────────────────

enum TeamRole {
  OWNER
  ADMIN
  MEMBER
}

enum Plan {
  FREE        // 1 connector, 1000 queries/month
  PRO         // $29/mo — unlimited connectors, 10k queries/month
  ENTERPRISE  // Custom
}

enum ConnectorType {
  GITHUB
  NOTION
  SLACK
  LINEAR
  JIRA
  CONFLUENCE
  GITLAB
}

enum ConnectorStatus {
  ACTIVE
  PAUSED
  ERROR
  DISCONNECTED
}

enum SyncStatus {
  PENDING
  RUNNING
  SUCCESS
  FAILED
}
```

---

## API Gateway (Complete Route Manifest)

### Auth — `/api/v1/auth`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/register` | Public | Create account + team. Body: `{email, password, name, teamName}`. Returns `{user, team, accessToken}`. Sets refresh token in HTTP-only cookie. |
| POST | `/login` | Public | Authenticate. Body: `{email, password}`. Returns `{user, accessToken}`. Rotates refresh token family. |
| POST | `/refresh` | Cookie | Issue new access token from refresh token cookie. Implements token family rotation — revokes entire family on reuse attack. |
| POST | `/logout` | JWT | Revokes current refresh token. Clears cookie. |
| POST | `/logout-all` | JWT | Revokes all refresh token families for user. |
| POST | `/invite/accept` | Public | Accept team invite by token. Body: `{token, password, name}`. |
| POST | `/password/reset-request` | Public | Send password reset email. |
| POST | `/password/reset` | Public | Consume reset token, set new password. |

### Teams — `/api/v1/teams`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | JWT | Get current user's team with member count and plan info. |
| PATCH | `/` | JWT+ADMIN | Update team name or slug. |
| GET | `/members` | JWT | List team members with roles and join dates. |
| POST | `/members/invite` | JWT+ADMIN | Send invite email. Body: `{email, role}`. |
| DELETE | `/members/:userId` | JWT+ADMIN | Remove a team member. |
| PATCH | `/members/:userId/role` | JWT+OWNER | Change member role. |
| DELETE | `/` | JWT+OWNER | Delete team and all data (GDPR). Requires confirmation string. |

### Connectors — `/api/v1/connectors`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | JWT | List all connectors for team with sync status, doc count, last synced. |
| GET | `/:id` | JWT | Single connector detail with recent sync jobs. |
| POST | `/:type/oauth/start` | JWT | Generate OAuth2 authorization URL for connector type. Returns `{authUrl, state}`. |
| POST | `/:type/oauth/callback` | JWT | Exchange OAuth code for token. Creates connector record. Triggers initial sync job. |
| PATCH | `/:id` | JWT+ADMIN | Update connector config (repos filter, channels filter, etc.). |
| DELETE | `/:id` | JWT+ADMIN | Disconnect connector. Deletes all indexed documents for this connector. |
| POST | `/:id/sync` | JWT+ADMIN | Trigger manual full re-sync. Returns `{jobId}`. |
| POST | `/:id/pause` | JWT+ADMIN | Pause scheduled sync. |
| POST | `/:id/resume` | JWT+ADMIN | Resume scheduled sync. |
| GET | `/:id/jobs` | JWT | List sync job history (paginated). |

### Search — `/api/v1/search`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/` | JWT | Core RAG endpoint. Body: `{query, filters?: {connectorIds?, sourceTypes?, dateRange?}, stream?: boolean}`. Streams SSE if `stream: true`. Returns `{answer, sources[], latencyMs, queryId}`. |
| GET | `/history` | JWT | User's recent queries with answers (paginated, searchable). |
| POST | `/:queryId/feedback` | JWT | Submit thumbs up/down feedback. Body: `{helpful: boolean, comment?: string}`. |
| GET | `/suggestions` | JWT | Query autocomplete suggestions from team's query history. |

### Documents — `/api/v1/documents`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | JWT | Paginated document browser. Filters: `?connectorId=&sourceType=&q=&page=&limit=`. |
| GET | `/:id` | JWT | Single document chunk with embedding metadata (for debugging). |
| DELETE | `/:id` | JWT+ADMIN | Manually remove a document chunk from the index. |
| POST | `/reindex` | JWT+ADMIN | Trigger full re-embedding of all docs (e.g., after model upgrade). Body: `{connectorId?}`. |

### Analytics — `/api/v1/analytics`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/overview` | JWT+ADMIN | Team-level metrics: total queries, avg latency, doc count, connector health. |
| GET | `/queries` | JWT+ADMIN | Query volume over time. Query params: `?from=&to=&granularity=day\|week`. |
| GET | `/queries/top` | JWT+ADMIN | Top N most frequent queries. |
| GET | `/queries/slow` | JWT+ADMIN | Queries with P95+ latency. |
| GET | `/connectors/health` | JWT+ADMIN | Per-connector sync success rate, doc count, last error. |
| GET | `/usage` | JWT | Current month usage vs plan limits (queries, connectors). |

### Billing — `/api/v1/billing`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | JWT | Current plan, usage, next billing date. |
| POST | `/checkout` | JWT+OWNER | Create Stripe Checkout session for PRO plan. Returns `{checkoutUrl}`. |
| POST | `/portal` | JWT+OWNER | Create Stripe Customer Portal session. Returns `{portalUrl}`. |
| DELETE | `/subscription` | JWT+OWNER | Cancel subscription at period end. |

### Webhooks — `/api/v1/webhooks`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/github` | HMAC | GitHub push/PR events → trigger incremental sync. Validates `X-Hub-Signature-256`. |
| POST | `/notion` | HMAC | Notion page updated events. |
| POST | `/slack` | HMAC | Slack event API callbacks. |
| POST | `/linear` | HMAC | Linear issue/comment updates. |
| POST | `/stripe` | HMAC | Stripe subscription lifecycle events (payment, cancel, upgrade). Validates `Stripe-Signature`. |

### Health — `/health`, `/metrics`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | Public | `{status: "ok", db: "ok", redis: "ok", version: "x.y.z"}`. Used by load balancer. |
| GET | `/health/deep` | Internal | Full dependency health check with latency measurements. |
| GET | `/metrics` | Internal | Prometheus-compatible metrics (request count, latency histograms, queue depths). |

---

## Auth Strategy (Full Specification)

### Token Architecture

```
Access Token  — JWT, HS256, 15 minutes TTL
              — Payload: { sub: userId, teamId, role, plan, iat, exp }
              — Sent in Authorization: Bearer header
              — Never stored in DB

Refresh Token — Opaque random bytes (32 bytes → hex string)
              — SHA-256 hashed before DB storage (never store plaintext)
              — 7-day TTL, stored in DB with family ID
              — Sent in HttpOnly, Secure, SameSite=Strict cookie
              — Never in response body, never accessible to JavaScript

Token Family  — UUIDv4 per login session
              — On refresh: old token revoked, new token issued same family
              — On REUSE DETECTED: entire family revoked → user forced to login
              — This prevents refresh token theft/replay attacks
```

### ACL Model

```
Every Document has: aclGroups: String[]
  → Array of identifiers representing who can read this document

On search: WHERE acl_groups && userAclGroups
  → PostgreSQL array overlap operator — O(1) with GIN index

userAclGroups is built per-request:
  → Always includes: [teamId, userId]
  → Plus: connector-specific groups synced from source
     GitHub: repo collaborator usernames
     Notion: page member emails hashed to IDs
     Slack: channel member IDs
     Linear: team member IDs

ACL synced on every connector sync job (background, not blocking search)
```

### OAuth2 Flow (per connector)

```
1. Client: GET /api/v1/connectors/:type/oauth/start
   → Server generates state = crypto.randomUUID() + teamId (HMAC-signed)
   → Stores state in Redis with 10-min TTL
   → Returns { authUrl } pointing to provider OAuth consent screen

2. Provider redirects to: GET /api/v1/connectors/:type/oauth/callback?code=&state=
   → Server validates state from Redis (replay protection)
   → Exchanges code for access + refresh tokens
   → Encrypts tokens with AES-256-GCM (key from env)
   → Creates Connector record
   → Enqueues initial full sync job
   → Redirects client to /connectors?success=true
```

---

## RAG Pipeline (Detailed)

### Ingestion Pipeline

```
ConnectorEngine.sync(connectorId):
  1. Fetch Connector from DB, decrypt OAuth tokens
  2. Call connector.fetchDiff(syncCursor) → RawDocument[]
     - Uses If-Modified-Since / ETag / cursor pagination (connector-specific)
     - Handles pagination, retries with exponential backoff
  3. For each RawDocument:
     a. DocumentChunker.chunk(doc) → Chunk[]
        - Split on sentence boundaries near 512-token mark
        - 64-token overlap for context preservation
        - Attach metadata: { title, url, author, createdAt, updatedAt, filePath, section }
        - Compute SHA-256(content) → contentHash
     b. Skip if contentHash matches existing document (no change)
     c. EmbeddingService.embedBatch(chunks[].content) → float[1536][]
        - OpenAI text-embedding-3-small
        - Max 100 chunks per API call
        - Redis cache: key = sha256(content), TTL = 30 days
        - Reduces OpenAI costs by ~60% on re-index
     d. Upsert into Document table (ON CONFLICT sourceId,chunkIndex DO UPDATE)
     e. ACL: fetch source permissions → update aclGroups on all chunks for this doc
  4. Update Connector.syncCursor, lastSyncedAt, lastSyncStatus
  5. Log SyncJob completion with doc counts
```

### Search Pipeline

```
SearchService.search(query, user):
  1. Rate check: user's team plan vs monthly query count (Redis counter)
  2. EmbeddingService.embed(query) → float[1536]
     - Redis cache: key = sha256(query), TTL = 5 min (queries repeat frequently)
  3. RetrievalService.retrieve(queryVector, teamId, userAclGroups):
     a. Hybrid search: 70% pgvector + 30% PostgreSQL full-text (ts_rank)
        SQL:
          SELECT *, 
            (0.7 * (1 - (embedding <=> $queryVec)) + 
             0.3 * ts_rank(to_tsvector(content), plainto_tsquery($query))) AS score
          FROM documents
          WHERE team_id = $teamId
            AND acl_groups && $userAclGroups
            AND status = 'ACTIVE'
          ORDER BY score DESC
          LIMIT 8
     b. Returns Chunk[] with score, sourceUrl, metadata
  4. GenerationService.generate(query, chunks):
     a. Format system prompt with citation instructions
     b. Build context block from chunks (ordered by score)
     c. Call Anthropic claude-sonnet-4-20250514 with stream: true
     d. Inject [Source N] citation markers from chunk metadata
     e. Stream tokens via SSE as they arrive
  5. Log: QueryLog.create({teamId, userId, query, answer, latencyMs, tokensUsed, sourceCount})
```

---

## Environment Variables

```bash
# Application
NODE_ENV=development
PORT=3001
API_BASE_URL=http://localhost:3001
WEB_BASE_URL=http://localhost:5173
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://devglean:devglean@localhost:5432/devglean

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=                        # 64-char random hex
JWT_REFRESH_SECRET=                # 64-char random hex (different from JWT_SECRET)

# Encryption (AES-256-GCM for OAuth tokens at rest)
ENCRYPTION_KEY=                    # 64-char hex (32 bytes)

# OpenAI
OPENAI_API_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# GitHub OAuth App
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_WEBHOOK_SECRET=

# Notion OAuth App
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=

# Slack OAuth App
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_SIGNING_SECRET=

# Linear OAuth App
LINEAR_CLIENT_ID=
LINEAR_CLIENT_SECRET=
LINEAR_WEBHOOK_SECRET=

# Jira OAuth App
JIRA_CLIENT_ID=
JIRA_CLIENT_SECRET=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRO_PRICE_ID=

# Email (Resend)
RESEND_API_KEY=
FROM_EMAIL=noreply@devglean.io
```

---

## Technology Stack (Final)

| Layer | Technology | Rationale |
|---|---|---|
| Runtime | **Bun 1.x** | Native TypeScript, 22% P99 latency improvement, built-in test runner |
| API Framework | **Hono 4.x** | Faster than Express, edge-ready, first-class Bun support, typed RPC |
| Frontend | **React 19 + Vite 6** | Concurrent rendering, streaming RSC-ready |
| Routing (web) | **TanStack Router** | Fully type-safe routes, file-based, no code-gen step |
| Server State | **TanStack Query v5** | Stale-while-revalidate, optimistic updates, prefetching |
| Client State | **Zustand 5** | Minimal, selector-based, no boilerplate |
| Styling | **Tailwind CSS 4 + shadcn/ui** | Utility-first, zero-runtime, accessible primitives |
| Animation | **Framer Motion 11** | Production-grade, layout animations, gesture support |
| Charts | **Recharts 2** | React-native, composable, accessible |
| ORM | **Prisma 6** | Type-safe, migration-first, pgvector support |
| Database | **PostgreSQL 16** | pgvector extension, full-text search, JSONB, ACID |
| Vector Search | **pgvector 0.7** | Cosine + L2, IVFFlat index, avoids separate vector DB |
| Cache + Queue | **Redis 7 + BullMQ 5** | Atomic ops, pub/sub, job queues with retry/backoff |
| Embeddings | **OpenAI text-embedding-3-small** | 1536-dim, best quality/cost ratio, ~$0.02/1M tokens |
| LLM | **Anthropic claude-sonnet-4-20250514** | Citation grounding, 200K context, streaming SDK |
| Auth | **jose (JWT) + custom refresh rotation** | Lightweight, edge-compatible, no Passport overhead |
| Validation | **Zod 3** | Runtime + compile-time, error messages, transforms |
| Logging | **Pino 9** | 5x faster than Winston, JSON structured, child loggers |
| HTTP Security | **Hono built-ins + custom middleware** | CORS, CSRF, rate-limit, CSP |
| Encryption | **Node.js crypto (AES-256-GCM)** | Native, no extra dependency for token encryption |
| Email | **Resend** | Developer-first, React Email templates |
| Billing | **Stripe** | Subscription billing, webhooks, customer portal |
| Monorepo | **Turborepo** | Incremental builds, task graph, caching |
| Package Manager | **Bun workspaces** | Native workspace support, fast installs |
| Containerisation | **Docker + Docker Compose** | Reproducible local dev, pgvector:pg16 image |
| Deployment | **Fly.io** | Global edge, Dockerfile-based, auto-scaling, free tier |
| CI/CD | **GitHub Actions** | Type-check, lint, test, migrate, deploy |
| Monitoring | **Sentry + built-in Prometheus metrics** | Error tracking, custom dashboards |

---

## Phase Checklist

- [ ] **Phase 0** — CLAUDE.md created, repo scaffolded, Docker up, env validated
- [ ] **Phase 1** — DB schema migrated, Auth system complete (register/login/refresh/logout/invite)
- [ ] **Phase 2** — GitHub connector (OAuth + sync + chunking + embedding + upsert)
- [ ] **Phase 3** — Core search (embed → pgvector hybrid → Claude stream → SSE)
- [ ] **Phase 4** — Remaining connectors (Notion, Slack, Linear, Jira) + BullMQ scheduler
- [ ] **Phase 5** — React frontend (Search, Connectors, Analytics, Settings, Onboarding)
- [ ] **Phase 6** — Billing (Stripe), team invites (Resend), analytics endpoints
- [ ] **Phase 7** — Production hardening (rate limits, Sentry, metrics, Fly.io deploy, CI/CD)

---

## Key Engineering Decisions (ADR Log)

| # | Decision | Rationale |
|---|---|---|
| ADR-001 | Hono over Express | 3x faster, edge-compatible, first-class Bun support, typed RPC eliminates API client drift |
| ADR-002 | pgvector over Pinecone/Weaviate | Eliminates separate vector DB infra; unified PostgreSQL operational model; good enough at <1M docs |
| ADR-003 | Hybrid search (vector + BM25) | Pure vector search fails on exact entity names (function names, ticket IDs); BM25 fills the gap |
| ADR-004 | Token family refresh rotation | Prevents refresh token theft without sessions; any reuse revokes entire family |
| ADR-005 | AES-256-GCM for OAuth tokens | OAuth tokens are long-lived credentials; must be encrypted at rest, not just in transit |
| ADR-006 | Embedding cache in Redis | ~60% of queries are repeats within a team; caching cuts OpenAI costs significantly |
| ADR-007 | SSE over WebSocket for streaming | LLM output is unidirectional; SSE is simpler, HTTP/2 multiplexes it, no WS handshake overhead |
| ADR-008 | Turborepo monorepo | Shared DB types and Zod schemas between api and web without drift; incremental builds |
| ADR-009 | SHA-256 content hash on chunks | Skip re-embedding if content unchanged; critical for cost control on large repos |
| ADR-010 | TanStack Router over React Router | Full type-safety on route params and search params eliminates a class of runtime errors |

---

## Last Updated

Phase 0 — Project initialized. CLAUDE.md created.
```

---

## BUILD SEQUENCE

Execute the following phases in order, continuously, without stopping.

---

### PHASE 0 — Scaffold & Infrastructure

```bash
# Create root structure
mkdir devglean && cd devglean
git init
```

Create `package.json` (workspace root with Turborepo):
```json
{
  "name": "devglean",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "typecheck": "turbo typecheck",
    "lint": "turbo lint"
  },
  "devDependencies": {
    "turbo": "latest",
    "typescript": "^5.5.0"
  }
}
```

Create `turbo.json` with task pipeline for `dev`, `build`, `typecheck`, `lint`.

Create `docker-compose.yml`:
```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: devglean
      POSTGRES_PASSWORD: devglean
      POSTGRES_DB: devglean
    ports: ["5432:5432"]
    volumes: [postgres_data:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U devglean"]
      interval: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes: [redis_data:/data]
    command: redis-server --appendonly yes

  pgadmin:
    image: dpage/pgadmin4:latest
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@devglean.io
      PGADMIN_DEFAULT_PASSWORD: admin
    ports: ["5050:80"]
    depends_on: [postgres]

volumes:
  postgres_data:
  redis_data:
```

Run: `docker-compose up -d`
Run: `docker-compose ps` — verify all services healthy before proceeding.

Create `packages/db/`, `packages/shared/`, `packages/api/`, `packages/web/` directories.
Initialize each with its `package.json`.

Create `.env.example` with all variables from the Environment Variables section above.
Create `.env` by copying `.env.example` and filling development defaults.

Create `packages/db/prisma/schema.prisma` with the full schema from the Prisma Schema section above.

Install db package deps: `bun add prisma @prisma/client`
Run: `bunx prisma migrate dev --name init`
Run: `bunx prisma generate`

Verify pgvector extension active:
```sql
-- Run via prisma.$executeRaw
CREATE EXTENSION IF NOT EXISTS vector;
```

Create GIN index for ACL array overlap queries:
```sql
CREATE INDEX IF NOT EXISTS documents_acl_groups_idx ON documents USING GIN (acl_groups);
```

Create IVFFlat index for vector similarity (after 10k+ rows; add creation script):
```sql
CREATE INDEX IF NOT EXISTS documents_embedding_idx ON documents 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

Update CLAUDE.md: Phase 0 ✅

---

### PHASE 1 — Authentication System

Build `packages/api/`:
- `src/env.ts` — Zod-validated environment (throw on startup if any required var missing)
- `src/lib/logger.ts` — Pino with `traceId` context binding
- `src/lib/redis.ts` — IORedis singleton
- `src/lib/prisma.ts` — Prisma singleton
- `src/lib/anthropic.ts` — Anthropic client
- `src/lib/openai.ts` — OpenAI client
- `src/lib/crypto.ts` — `encrypt(text)` / `decrypt(cipher)` using AES-256-GCM
- `src/middleware/traceId.ts` — Generate UUID, attach to ctx, set X-Trace-ID response header
- `src/middleware/auth.ts` — Verify JWT, attach `c.set('user', payload)`, 401 on failure
- `src/middleware/errorHandler.ts` — Catch AppError and unknown errors, return structured JSON
- `src/middleware/rateLimit.ts` — Sliding window using Redis ZADD/ZCOUNT

Build `packages/shared/src/errors/`:
```typescript
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly message: string,
    public readonly statusCode: number,
    public readonly details?: unknown
  ) { super(message) }
}
export enum ErrorCode {
  UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR,
  RATE_LIMITED, INTERNAL, CONNECTOR_AUTH_FAILED,
  PLAN_LIMIT_EXCEEDED, TEAM_NOT_FOUND, ...
}
```

Build `AuthService` with:
- `register({email, password, name, teamName})` → creates User + Team atomically in transaction
- `login({email, password})` → verifies password, creates refresh token family, returns tokens
- `refreshTokens(rawToken)` → hashes token, finds in DB, validates family, rotates, returns new pair
- `logout(rawToken)` → revokes single token
- `logoutAll(userId)` → revokes all user tokens
- Password hashing: `bcryptjs` with 12 rounds (use argon2 if available in Bun)

Build all auth routes per API Gateway specification.
Wire to Hono app with `/api/v1/auth` prefix.

Update CLAUDE.md: Phase 1 ✅

---

### PHASE 2 — GitHub Connector + Ingestion Pipeline

Build `packages/api/src/connectors/base.connector.ts`:
```typescript
export abstract class BaseConnector {
  abstract readonly type: ConnectorType
  abstract fetchDiff(cursor: unknown): Promise<{ docs: RawDocument[], nextCursor: unknown }>
  abstract buildOAuthUrl(state: string): string
  abstract exchangeCode(code: string): Promise<OAuthTokens>
  abstract validateWebhook(payload: Buffer, signature: string): boolean
}
```

Build `ChunkerService`:
- Input: `{title, content, url, metadata}`
- Split on sentence boundaries using character heuristic (512 tokens ≈ 2048 chars)
- 64-token (256 char) overlap between consecutive chunks
- Attach `{chunkIndex, chunkTotal, sourceUrl, title, author, ...metadata}` to each chunk
- Compute `SHA-256(content)` as `contentHash`

Build `EmbeddingService`:
- `embed(text: string): Promise<number[]>` — single embedding with Redis cache
- `embedBatch(texts: string[]): Promise<number[][]>` — batch up to 100, cache each
- Cache key: `embed:v1:${sha256(text)}`, TTL: 30 days

Build `SyncWorker` (BullMQ):
- Queue name: `connector-sync`
- Worker processes jobs: `{ connectorId, fullSync: boolean }`
- Implements full pipeline: fetch → chunk → embed → upsert
- Exponential backoff: 3 retries, 2^attempt seconds delay
- Updates SyncJob table on start/complete/fail
- Concurrency: 3 workers per process

Build `GitHub` connector:
- OAuth: scopes `repo,read:org,read:user`
- Fetch: repos list → for each repo: README.md, recent commits, open issues, pull requests
- Incremental: use `since` param (last sync timestamp) + ETag headers
- Webhook: validate `X-Hub-Signature-256`, process `push` and `pull_request` events

Build connector routes per API Gateway spec.

Update CLAUDE.md: Phase 2 ✅

---

### PHASE 3 — Search Engine (The Core Product)

Build `RetrievalService`:
```typescript
// Hybrid search: vector + full-text
const results = await prisma.$queryRaw<SearchRow[]>`
  SELECT 
    id, title, content, source_url, source_type, metadata,
    (0.7 * (1 - (embedding <=> ${queryVector}::vector)) + 
     0.3 * ts_rank(to_tsvector('english', content), plainto_tsquery('english', ${query}))) AS score
  FROM documents
  WHERE team_id = ${teamId}
    AND acl_groups && ${userAclGroups}::text[]
  ORDER BY score DESC
  LIMIT 8
`
```

Build `GenerationService`:
```typescript
// System prompt enforcing grounded citations
const systemPrompt = `You are DevGlean, an AI assistant for engineering teams.
Answer the user's question using ONLY the provided context.
For every claim, cite the source using [Source N] format where N is the source number.
If the context does not contain the answer, say so explicitly — do not hallucinate.
Be concise, technical, and precise.`
```
- Use Anthropic SDK `stream()` method
- Map each streamed `text_delta` event to SSE `data:` line
- Final SSE event: `data: [DONE]` with `{sources: [], latencyMs, queryId}`

Build `SearchService` orchestrating the full pipeline:
- Plan enforcement: check Redis counter `team:${teamId}:queries:${month}` vs plan limit
- Query embedding with cache
- Hybrid retrieval with ACL filter
- Claude streaming generation
- Async query logging (don't block response)

Build search routes. Implement SSE properly:
```typescript
c.header('Content-Type', 'text/event-stream')
c.header('Cache-Control', 'no-cache')
c.header('Connection', 'keep-alive')
c.header('X-Accel-Buffering', 'no')  // Critical for nginx
```

Update CLAUDE.md: Phase 3 ✅

---

### PHASE 4 — Remaining Connectors

Build connectors following the `BaseConnector` interface:

**Notion** — OAuth, fetch pages + databases from workspace, extract block content recursively.
**Slack** — OAuth, fetch public + private channel messages (user is member of), thread replies.
**Linear** — OAuth, fetch issues + comments + project docs from team.
**Jira** — OAuth 2.0 (Atlassian), fetch issues + comments + attachments from projects.

For each connector:
- Full OAuth flow
- Incremental sync via cursor/timestamp
- Webhook handler for real-time updates
- ACL extraction from source permissions

Build `Scheduler`:
- On connector creation/resume: register repeatable BullMQ job every 15 minutes
- On connector pause/delete: remove repeatable job
- On server startup: re-register jobs for all ACTIVE connectors

Update CLAUDE.md: Phase 4 ✅

---

### PHASE 5 — React Frontend

**Design System**:
- Palette: `#060911` base · `#0EA5E9` sky-blue primary · `#10B981` emerald for success
  · `#F59E0B` amber for citations · `#EF4444` for errors
- Typography: `Berkeley Mono` (monospace, queries/code) + `Cal Sans` (display/headings) 
  + `Geist` (body). Import via Fontsource.
- Motion: Framer Motion for page transitions, answer card reveal, search bar expansion
- Aesthetic: IDE-meets-Raycast. Dark, high-contrast, monospaced where it matters.
  The search bar is the hero. Everything else is secondary.

**Pages to build (all fully functional, no placeholder screens)**:

`/login` and `/register` — Centered cards, animated input focus ring, error states,
  redirect to `/onboarding` on first login.

`/onboarding` — 3-step wizard:
  1. "Connect your first source" — connector type selector
  2. OAuth flow result + sync progress indicator (SSE for real-time sync status)
  3. "Run your first search" — pre-populated example query

`/search` — The product's soul:
  - Full-width search bar, placeholder cycles through example queries every 4s
  - Keyboard shortcut: `Cmd+K` / `Ctrl+K` focuses from anywhere
  - Submit: streaming answer appears token by token in `<AnswerCard>`
  - `<AnswerCard>`: renders markdown, `[Source N]` citations become amber `<SourceChip>` links
  - `<SourcePanel>`: slides in from right on answer completion, shows ranked sources with
    connector icon, title, score bar, deep link
  - Query history in left sidebar (collapsible)

`/connectors` — Grid of connector cards:
  - Unconnected: ghost card with icon + "Connect" CTA
  - Connected: status badge (Active/Syncing/Error), doc count, last synced, progress ring
  - Sync log modal on click

`/documents` — Searchable, filterable data table:
  - Columns: Source icon, Title, Connector, Chunk count, Last indexed
  - Filters: by connector, by source type, by date
  - Click → document detail modal with content preview

`/analytics` — Admin dashboard:
  - KPI cards: Total queries, Avg latency, Docs indexed, Active connectors
  - Line chart: queries per day (Recharts, 30-day window)
  - Table: Top 10 queries this week
  - Connector health table: sync success rate per connector

`/settings` — Tabs:
  - Team: name, slug, danger zone (delete team)
  - Members: list + invite form + role management
  - Billing: current plan, usage bars, Upgrade/Manage buttons → Stripe

**Global components**:
- `<Sidebar>` — `DG` monogram logo, nav items with animated active indicator
- `<CommandPalette>` — `Cmd+K` global search overlay
- `<ThemeProvider>` — dark mode only (no toggle needed)

Update CLAUDE.md: Phase 5 ✅

---

### PHASE 6 — Billing, Invites, Analytics API

Build `BillingService`:
- `createCheckoutSession(teamId)` → Stripe Checkout in `subscription` mode, PRO price
- `createPortalSession(teamId)` → Stripe Customer Portal
- Stripe webhook handler: `customer.subscription.created/updated/deleted` → update `Team.plan`
- Plan enforcement in `SearchService` (query limits) and `ConnectorService` (connector count)

Build `TeamInvite` flow:
- Admin invites member → generate secure token → send email via Resend
- React Email template for invite email (clean, branded)
- `/auth/invite/accept` route validates token, creates user, assigns team + role

Build all Analytics service methods per API Gateway spec.

Update CLAUDE.md: Phase 6 ✅

---

### PHASE 7 — Production Hardening

**Security audit**:
- All routes have appropriate rate limits (auth routes: 10/min, search: 60/min)
- All webhook endpoints validate HMAC signatures before processing
- OAuth state params validated against Redis store (CSRF protection)
- All SQL queries go through Prisma or parameterized `$queryRaw` (no string interpolation)
- Response headers: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` via Hono middleware

**Observability**:
- Sentry: init in API entry point, capture unhandled exceptions with request context
- Prometheus metrics at `/metrics`:
  - `devglean_requests_total` (counter, by route + status)
  - `devglean_request_duration_seconds` (histogram, by route)
  - `devglean_search_latency_seconds` (histogram)
  - `devglean_queue_depth` (gauge, by queue name)
  - `devglean_documents_total` (gauge, by team — sampled)

**Production Dockerfile** (multi-stage):
```dockerfile
FROM oven/bun:1 AS builder
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
RUN bun run build

FROM oven/bun:1-slim AS runner
WORKDIR /app
COPY --from=builder /app/packages/api/dist ./dist
COPY --from=builder /app/packages/db/prisma ./prisma
EXPOSE 3001
CMD ["bun", "run", "dist/index.js"]
```

**`fly.toml`** for Fly.io deployment with health check on `/health`.

**GitHub Actions CI** (`ci.yml`):
- `bun install`
- `bunx tsc --noEmit` (all packages)
- `bunx prisma validate`
- `bun test`
- Build Docker image

**GitHub Actions Deploy** (`deploy.yml`):
- Trigger on push to `main`
- Run CI → `bunx prisma migrate deploy` → `flyctl deploy`

**`infra/scripts/setup.sh`** — One command to go from clone to running dev environment:
```bash
#!/bin/bash
set -e
cp .env.example .env
docker-compose up -d
bun install
bunx prisma migrate dev
bunx prisma db seed
echo "✅ DevGlean is ready. Run: bun dev"
```

**`infra/scripts/seed.ts`** — Creates a demo team, demo user (dev@devglean.io / password),
and a mock connector with 50 seeded documents so search works immediately in dev.

Update CLAUDE.md: All phases complete.

---

### FINAL DELIVERABLE

When all phases are complete:

1. Run `bun typecheck` across all packages — zero errors.
2. Run `bun test` — all tests pass.
3. Run `docker-compose up -d && bun dev` — both API and web start without errors.
4. Verify: `POST /api/v1/auth/register` → `POST /api/v1/search` → SSE stream returns answer.
5. Print a summary to CLAUDE.md under a "Completion Report" section:
   - Total files created
   - Total routes implemented
   - Connectors built
   - Database tables
   - Test coverage %

The product is production-ready. A developer clones this repo, runs `./infra/scripts/setup.sh`,
and is searching their GitHub repos within 5 minutes. That is the bar.

**Begin. Build DevGlean.**
```
