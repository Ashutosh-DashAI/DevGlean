#!/bin/bash
set -e

echo "🔧 Setting up DevGlean development environment..."

# Copy env if not exists
if [ ! -f .env ]; then
  cp .env.example .env
  echo "📋 Created .env from .env.example"
fi

# Start Docker services
echo "🐳 Starting Docker services..."
docker-compose up -d

# Wait for PostgreSQL
echo "⏳ Waiting for PostgreSQL..."
until docker-compose exec -T postgres pg_isready -U devglean > /dev/null 2>&1; do
  sleep 1
done
echo "✅ PostgreSQL ready"

# Wait for Redis
echo "⏳ Waiting for Redis..."
until docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; do
  sleep 1
done
echo "✅ Redis ready"

# Install dependencies
echo "📦 Installing dependencies..."
bun install

# Run Prisma migrations
echo "🗄️ Running database migrations..."
cd packages/db
bunx prisma migrate dev --name init
bunx prisma generate
cd ../..

# Create pgvector indexes
echo "🔍 Creating indexes..."
docker-compose exec -T postgres psql -U devglean -d devglean -c "
  CREATE EXTENSION IF NOT EXISTS vector;
  CREATE INDEX IF NOT EXISTS documents_acl_groups_idx ON \"Document\" USING GIN (\"aclGroups\");
"

# Run seed
echo "🌱 Seeding development data..."
bun run infra/scripts/seed.ts

echo ""
echo "✅ DevGlean is ready!"
echo ""
echo "  API:     http://localhost:3001"
echo "  Web:     http://localhost:5173"
echo "  pgAdmin: http://localhost:5050"
echo ""
echo "  Run: bun dev"
