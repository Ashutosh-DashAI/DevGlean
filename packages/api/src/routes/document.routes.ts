import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { authMiddleware, requireRole } from "../middleware/auth";
import { teamScopeMiddleware } from "../middleware/teamScope";
import { documentListQuerySchema, AppError } from "@devglean/shared";

const documentRoutes = new Hono();

documentRoutes.use("*", authMiddleware, teamScopeMiddleware);

// GET /api/v1/documents
documentRoutes.get("/", async (c) => {
  const teamId = c.get("teamId") as string;
  const query = documentListQuerySchema.parse(c.req.query());

  const where: Record<string, unknown> = { teamId };

  if (query.connectorId) {
    where.connectorId = query.connectorId;
  }

  if (query.sourceType) {
    where.sourceType = query.sourceType;
  }

  if (query.q) {
    where.OR = [
      { title: { contains: query.q, mode: "insensitive" } },
      { content: { contains: query.q, mode: "insensitive" } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true,
        title: true,
        sourceType: true,
        sourceUrl: true,
        chunkIndex: true,
        chunkTotal: true,
        connectorId: true,
        contentHash: true,
        language: true,
        createdAt: true,
        updatedAt: true,
        connector: {
          select: { displayName: true },
        },
      },
    }),
    prisma.document.count({ where }),
  ]);

  return c.json({
    items: items.map((doc) => ({
      ...doc,
      connectorName: doc.connector.displayName,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    })),
    total,
    page: query.page,
    limit: query.limit,
    totalPages: Math.ceil(total / query.limit),
  });
});

// GET /api/v1/documents/:id
documentRoutes.get("/:id", async (c) => {
  const teamId = c.get("teamId") as string;
  const id = c.req.param("id");

  const doc = await prisma.document.findFirst({
    where: { id, teamId },
    include: {
      connector: {
        select: { displayName: true, type: true },
      },
    },
  });

  if (!doc) {
    throw AppError.notFound("Document");
  }

  return c.json({
    id: doc.id,
    title: doc.title,
    content: doc.content,
    sourceType: doc.sourceType,
    sourceUrl: doc.sourceUrl,
    sourceId: doc.sourceId,
    chunkIndex: doc.chunkIndex,
    chunkTotal: doc.chunkTotal,
    metadata: doc.metadata,
    aclGroups: doc.aclGroups,
    contentHash: doc.contentHash,
    version: doc.version,
    language: doc.language,
    connectorName: doc.connector.displayName,
    connectorType: doc.connector.type,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  });
});

// DELETE /api/v1/documents/:id
documentRoutes.delete("/:id", requireRole("ADMIN", "OWNER"), async (c) => {
  const teamId = c.get("teamId") as string;
  const id = c.req.param("id");

  const doc = await prisma.document.findFirst({
    where: { id, teamId },
    select: { id: true },
  });

  if (!doc) {
    throw AppError.notFound("Document");
  }

  await prisma.document.delete({ where: { id } });

  return c.json({ success: true });
});

// POST /api/v1/documents/reindex
documentRoutes.post("/reindex", requireRole("ADMIN", "OWNER"), async (c) => {
  const teamId = c.get("teamId") as string;

  // Mark all documents for re-embedding by clearing content hash
  await prisma.document.updateMany({
    where: { teamId },
    data: { contentHash: "" },
  });

  return c.json({
    message: "Reindex scheduled. Documents will be re-embedded on next sync cycle.",
  });
});

export { documentRoutes };
