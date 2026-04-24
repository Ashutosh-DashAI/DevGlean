FROM oven/bun:1 AS builder
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
RUN cd packages/db && bunx prisma generate
RUN cd packages/api && bun build src/index.ts --outdir dist --target bun

FROM oven/bun:1-slim AS runner
WORKDIR /app
COPY --from=builder /app/packages/api/dist ./dist
COPY --from=builder /app/packages/db/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
EXPOSE 3001
CMD ["bun", "run", "dist/index.js"]
