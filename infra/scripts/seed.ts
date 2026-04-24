import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "crypto";

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  // Use bcryptjs-compatible hash for seeding
  const bcrypt = await import("bcryptjs");
  return bcrypt.hash(password, 12);
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

async function main() {
  console.log("🌱 Seeding DevGlean development database...\n");

  // Clean existing data
  await prisma.queryLog.deleteMany();
  await prisma.document.deleteMany();
  await prisma.syncJob.deleteMany();
  await prisma.connector.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.teamInvite.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();

  // Create demo team
  const team = await prisma.team.create({
    data: {
      name: "DevGlean Demo",
      slug: "devglean-demo",
      plan: "PRO",
    },
  });
  console.log(`✅ Team: ${team.name} (${team.slug})`);

  // Create demo user
  const passwordHash = await hashPassword("Password1!");
  const user = await prisma.user.create({
    data: {
      email: "dev@devglean.io",
      passwordHash,
      name: "Demo Developer",
      role: "OWNER",
      teamId: team.id,
    },
  });
  console.log(`✅ User: ${user.email} / Password1!`);

  // Create a mock GitHub connector
  const connector = await prisma.connector.create({
    data: {
      teamId: team.id,
      type: "GITHUB",
      displayName: "Demo GitHub",
      oauthToken: "mock:encrypted:token",
      workspaceId: "devglean",
      status: "ACTIVE",
      lastSyncStatus: "SUCCESS",
      lastSyncedAt: new Date(),
    },
  });
  console.log(`✅ Connector: ${connector.displayName}`);

  // Seed 50 demo documents
  const documents = [
    { title: "Architecture Decision: BullMQ over Kafka", content: "We evaluated Kafka vs BullMQ for our job queue. Given our scale (<10k jobs/day) and the operational overhead of running Kafka, we chose BullMQ backed by Redis. Key factors: 1) Redis is already in our stack for caching 2) BullMQ has excellent retry/backoff support 3) No JVM dependency 4) Dashboard available via bull-board. For teams processing >100k events/day, Kafka would be the better choice.", sourceType: "GITHUB", sourceUrl: "https://github.com/devglean/backend/blob/main/docs/adr/002-bullmq-over-kafka.md" },
    { title: "PR #234: Migrate auth to JWT + refresh tokens", content: "This PR replaces our session-based auth with JWT access tokens (15min TTL) and refresh token rotation. Refresh tokens are SHA-256 hashed before storage, grouped by 'family' for reuse detection. If a refresh token is used twice, the entire family is revoked. This prevents token theft replay attacks without requiring server-side session state for every request.", sourceType: "GITHUB", sourceUrl: "https://github.com/devglean/backend/pull/234" },
    { title: "Why we chose pgvector over Pinecone", content: "After evaluating Pinecone, Weaviate, and pgvector for our vector search, we went with pgvector. Rationale: 1) Single database for all data (operational simplicity) 2) We're well under 1M vectors 3) ACID transactions with our relational data 4) No vendor lock-in 5) Cost: $0 additional. Trade-off: We lose Pinecone's managed horizontal scaling, but at our scale that's irrelevant.", sourceType: "NOTION", sourceUrl: "https://notion.so/devglean/pgvector-decision-abc123" },
    { title: "#backend: Discussion about rate limiting strategy", content: "Sarah: We need to implement rate limiting on the API. I'm thinking sliding window with Redis ZADD. \nMike: +1 on sliding window. Fixed window has the burst problem at window boundaries. \nSarah: Exactly. Plan is: auth routes at 10/min, search at 60/min, general API at 120/min. Using sorted sets for O(1) lookups. \nMike: Should we use user ID or IP as the key? \nSarah: Both - user ID for authenticated requests, IP for public endpoints.", sourceType: "SLACK", sourceUrl: "https://slack.com/archives/C0123456/p123456789" },
    { title: "Issue: Implement hybrid search (vector + full-text)", content: "Pure vector search fails on exact entity names like function names, ticket IDs, and error codes. We need to combine pgvector cosine similarity with PostgreSQL full-text search (ts_rank). Proposed weights: 70% vector, 30% BM25 full-text. This ensures semantic understanding while preserving exact match capability. Status: Done.", sourceType: "LINEAR", sourceUrl: "https://linear.app/devglean/issue/DEV-89" },
    { title: "README: DevGlean Backend Service", content: "DevGlean Backend is a Bun + Hono API server providing RAG-based search over engineering knowledge. Stack: Bun 1.x, Hono 4, PostgreSQL 16 + pgvector, Redis 7 + BullMQ, Prisma 6. Getting started: 1) Clone repo 2) Run ./setup.sh 3) bun dev. API docs at /api/v1. Health check at /health.", sourceType: "GITHUB", sourceUrl: "https://github.com/devglean/backend/blob/main/README.md" },
    { title: "How to add a new connector", content: "To add a new data source connector: 1) Create a class extending BaseConnector in src/connectors/ 2) Implement buildOAuthUrl(), exchangeCode(), fetchDiff(), validateWebhook() 3) Register in the connectorMap in connector.routes.ts and sync.worker.ts 4) Add the connector type to the ConnectorType enum in Prisma schema 5) Add OAuth credentials to .env 6) Create webhook route if needed.", sourceType: "NOTION", sourceUrl: "https://notion.so/devglean/adding-connectors-def456" },
    { title: "Incident: Embedding cache TTL too short", content: "On 2024-01-15 we noticed OpenAI costs spiking 3x. Root cause: embedding cache TTL was set to 1 hour instead of 30 days. This meant every connector sync was re-embedding all unchanged documents. Fix: Updated EMBEDDING_CACHE_TTL_SECONDS from 3600 to 2592000 (30 days). Also added content hash comparison to skip re-embedding when document content hasn't changed.", sourceType: "SLACK", sourceUrl: "https://slack.com/archives/C0123456/p234567890" },
    { title: "Sprint 12 Planning: Search quality improvements", content: "Goals for Sprint 12: 1) Implement answer feedback loop (thumbs up/down → fine-tune retrieval weights) 2) Add query suggestion autocomplete from team history 3) Improve chunking: switch from fixed-size to sentence-boundary splitting with 64-token overlap 4) Add source type filtering in search UI 5) Build analytics dashboard for query volume and latency tracking.", sourceType: "LINEAR", sourceUrl: "https://linear.app/devglean/project/sprint-12" },
    { title: "Deployment Guide: Fly.io", content: "DevGlean deploys to Fly.io using Docker. Steps: 1) fly launch (first time) 2) Set secrets: fly secrets set DATABASE_URL=... 3) Deploy: fly deploy 4) Run migrations: fly ssh console -C 'bunx prisma migrate deploy' 5) Monitor: fly logs. Health check configured on /health. Auto-scaling: min 1, max 3 instances. RAM: 512MB per instance. Region: iad (US East).", sourceType: "GITHUB", sourceUrl: "https://github.com/devglean/infra/blob/main/DEPLOY.md" },
  ];

  // Add more documents to reach ~50
  const additionalDocs = Array.from({ length: 40 }, (_, i) => ({
    title: `Engineering Doc ${i + 1}: ${["API Design Guidelines", "Error Handling Best Practices", "Database Migration Strategy", "Test Coverage Standards", "Code Review Checklist", "Security Audit Report", "Performance Optimization Notes", "CI/CD Pipeline Config"][i % 8]}`,
    content: `This document covers engineering best practices and standards used across the DevGlean codebase. Section ${i + 1} focuses on ${["input validation", "error boundary patterns", "index optimization", "mock strategies", "naming conventions", "OWASP compliance", "query optimization", "deployment automation"][i % 8]}. Last updated by the platform team.`,
    sourceType: (["GITHUB", "NOTION", "SLACK", "LINEAR", "JIRA"] as const)[i % 5] as string,
    sourceUrl: `https://example.com/doc/${i + 1}`,
  }));

  const allDocs = [...documents, ...additionalDocs];

  for (let i = 0; i < allDocs.length; i++) {
    const doc = allDocs[i]!;
    const contentHash = sha256(doc.content);

    await prisma.document.create({
      data: {
        teamId: team.id,
        connectorId: connector.id,
        sourceType: doc.sourceType as "GITHUB" | "NOTION" | "SLACK" | "LINEAR" | "JIRA",
        sourceId: `seed:${i}`,
        sourceUrl: doc.sourceUrl,
        title: doc.title,
        content: doc.content,
        chunkIndex: 0,
        chunkTotal: 1,
        metadata: { seeded: true },
        aclGroups: [team.id, user.id],
        contentHash,
      },
    });
  }

  console.log(`✅ Documents: ${allDocs.length} seeded`);

  // Create some query logs for analytics
  const sampleQueries = [
    "Why did we choose BullMQ?",
    "How does auth token rotation work?",
    "What is the rate limiting strategy?",
    "How to deploy to production?",
    "What's our search architecture?",
  ];

  for (let day = 0; day < 30; day++) {
    const queriesPerDay = Math.floor(Math.random() * 15) + 3;
    for (let q = 0; q < queriesPerDay; q++) {
      const query = sampleQueries[Math.floor(Math.random() * sampleQueries.length)]!;
      await prisma.queryLog.create({
        data: {
          teamId: team.id,
          userId: user.id,
          query,
          answer: `Answer for: ${query}`,
          sourceCount: Math.floor(Math.random() * 5) + 1,
          latencyMs: Math.floor(Math.random() * 3000) + 500,
          tokensUsed: Math.floor(Math.random() * 2000) + 200,
          wasHelpful: Math.random() > 0.3 ? true : Math.random() > 0.5 ? false : null,
          connectorTypes: ["GITHUB"],
          createdAt: new Date(Date.now() - day * 24 * 60 * 60 * 1000 - Math.random() * 86400000),
        },
      });
    }
  }

  console.log(`✅ Query logs: ~30 days of analytics data`);

  // Create a sync job
  await prisma.syncJob.create({
    data: {
      connectorId: connector.id,
      status: "SUCCESS",
      docsIndexed: allDocs.length,
      docsUpdated: 0,
      docsDeleted: 0,
      completedAt: new Date(),
    },
  });

  console.log(`\n🎉 Seed complete!`);

  // Seed OSS cache entries for development
  const ossTopics = [
    { query: "react hydration mismatch error", repo: "facebook/react", title: "Fix hydration mismatch in React 18 Suspense", stars: 220000 },
    { query: "pgvector index corruption postgresql 16", repo: "pgvector/pgvector", title: "IVFFlat index returns wrong results after vacuum", stars: 9500 },
    { query: "redis memory leak connection pool", repo: "redis/redis", title: "Connection pool exhaustion under high concurrency", stars: 64000 },
    { query: "docker compose healthcheck not working", repo: "docker/compose", title: "depends_on with healthcheck ignored in v2", stars: 33000 },
    { query: "typescript strict null checks error", repo: "microsoft/TypeScript", title: "Object is possibly undefined with optional chaining", stars: 98000 },
    { query: "nextjs build out of memory", repo: "vercel/next.js", title: "OOM during static generation with large data", stars: 120000 },
    { query: "prisma migration failed column already exists", repo: "prisma/prisma", title: "Migration drift detection false positive", stars: 37000 },
    { query: "bun install frozen lockfile fails", repo: "oven-sh/bun", title: "Frozen lockfile install fails with workspace deps", stars: 71000 },
    { query: "hono middleware order matters", repo: "honojs/hono", title: "Auth middleware not running before route handler", stars: 16000 },
    { query: "tailwind css classes not applying", repo: "tailwindlabs/tailwindcss", title: "JIT mode purges dynamic class names", stars: 79000 },
    { query: "vite hmr not updating", repo: "vitejs/vite", title: "HMR stops working after moving files", stars: 65000 },
    { query: "zustand persist middleware ssr", repo: "pmndrs/zustand", title: "Persist middleware causes hydration mismatch", stars: 44000 },
    { query: "bullmq job stuck in active state", repo: "taskforcesh/bullmq", title: "Jobs stuck in active after worker crash", stars: 5200 },
    { query: "zod transform type inference", repo: "colinhacks/zod", title: "Transform output type not inferred correctly", stars: 31000 },
    { query: "framer motion layout animation flash", repo: "framer/motion", title: "Layout animation causes white flash", stars: 22000 },
    { query: "tanstack query stale while revalidate", repo: "TanStack/query", title: "Stale data shown after mutation", stars: 40000 },
    { query: "postgres jsonb index not used", repo: "postgres/postgres", title: "GIN index on JSONB column ignored by planner", stars: 14000 },
    { query: "cors preflight request blocked", repo: "expressjs/cors", title: "OPTIONS request returns 404 on nested routes", stars: 6000 },
    { query: "jwt token expired refresh flow", repo: "auth0/node-jsonwebtoken", title: "Race condition in token refresh with concurrent requests", stars: 17000 },
    { query: "openai embeddings rate limit", repo: "openai/openai-node", title: "Rate limit handling with batch embeddings", stars: 7000 },
  ];

  let ossSeededCount = 0;
  for (const topic of ossTopics) {
    // Create 10 variations per topic to reach ~200 entries
    for (let v = 0; v < 10; v++) {
      const queryVariant = v === 0 ? topic.query : `${topic.query} variant ${v}`;
      const queryHash = sha256(queryVariant);

      try {
        await prisma.oSSIssueCache.create({
          data: {
            queryHash,
            normalizedQuery: queryVariant,
            results: JSON.stringify([
              {
                id: `oss-${sha256(topic.repo + v).slice(0, 12)}`,
                title: `${topic.title}${v > 0 ? ` (variation ${v})` : ""}`,
                body: `This is a resolved ${topic.repo} issue about: ${topic.query}. The community identified the root cause and provided a fix via a merged PR.`,
                htmlUrl: `https://github.com/${topic.repo}/issues/${1000 + v}`,
                repoFullName: topic.repo,
                repoUrl: `https://github.com/${topic.repo}`,
                repoStars: topic.stars,
                reactionCount: Math.floor(Math.random() * 200) + 10,
                commentCount: Math.floor(Math.random() * 30) + 3,
                linkedPRMerged: Math.random() > 0.3,
                linkedPRUrl: Math.random() > 0.3 ? `https://github.com/${topic.repo}/pull/${2000 + v}` : null,
                hasCodeBlock: Math.random() > 0.2,
                hasAcceptedLabel: Math.random() > 0.4,
                closedAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
                labels: ["bug", "resolved"],
                author: "community-contributor",
                source: "github" as const,
                issueScore: Math.random() * 0.7 + 0.3,
              },
            ]),
            hitCount: Math.floor(Math.random() * 50) + 1,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
          },
        });
        ossSeededCount++;
      } catch {
        // Skip duplicates
      }
    }
  }
  console.log(`✅ OSS Cache: ${ossSeededCount} entries seeded`);

  // Seed OSS query logs
  for (let day = 0; day < 30; day++) {
    const queriesPerDay = Math.floor(Math.random() * 8) + 2;
    for (let q = 0; q < queriesPerDay; q++) {
      const topic = ossTopics[Math.floor(Math.random() * ossTopics.length)]!;
      try {
        await prisma.oSSQueryLog.create({
          data: {
            teamId: team.id,
            query: topic.query,
            cacheHit: Math.random() > 0.3,
            resultCount: Math.floor(Math.random() * 10) + 1,
            topRepoUrl: `https://github.com/${topic.repo}`,
            latencyMs: Math.floor(Math.random() * 2000) + 200,
            createdAt: new Date(Date.now() - day * 24 * 60 * 60 * 1000 - Math.random() * 86400000),
          },
        });
      } catch {
        // Skip on error
      }
    }
  }
  console.log(`✅ OSS Query Logs: ~30 days of analytics data`);

  console.log(`\n🎉 Seed complete!`);
  console.log(`\n   Login: dev@devglean.io / Password1!\n`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
