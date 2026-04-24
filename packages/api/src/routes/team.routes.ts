import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { authMiddleware, requireRole } from "../middleware/auth";
import { teamScopeMiddleware } from "../middleware/teamScope";
import {
  teamUpdateSchema,
  teamInviteSchema,
  teamMemberRoleSchema,
  teamDeleteSchema,
  AppError,
} from "@devglean/shared";
import { generateSecureToken } from "../lib/crypto";
import { logger } from "../lib/logger";

const teamRoutes = new Hono();

teamRoutes.use("*", authMiddleware, teamScopeMiddleware);

// GET /api/v1/teams
teamRoutes.get("/", async (c) => {
  const teamId = c.get("teamId") as string;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      _count: {
        select: {
          members: true,
          connectors: true,
          documents: true,
        },
      },
    },
  });

  if (!team) {
    throw AppError.notFound("Team");
  }

  return c.json({
    id: team.id,
    name: team.name,
    slug: team.slug,
    plan: team.plan,
    memberCount: team._count.members,
    connectorCount: team._count.connectors,
    documentCount: team._count.documents,
    createdAt: team.createdAt.toISOString(),
  });
});

// PATCH /api/v1/teams
teamRoutes.patch("/", requireRole("ADMIN", "OWNER"), async (c) => {
  const teamId = c.get("teamId") as string;
  const body = await c.req.json();
  const input = teamUpdateSchema.parse(body);

  if (input.slug) {
    const existing = await prisma.team.findUnique({
      where: { slug: input.slug },
      select: { id: true },
    });

    if (existing && existing.id !== teamId) {
      throw AppError.validation("This slug is already taken");
    }
  }

  const updated = await prisma.team.update({
    where: { id: teamId },
    data: {
      ...(input.name && { name: input.name }),
      ...(input.slug && { slug: input.slug }),
    },
  });

  return c.json({
    id: updated.id,
    name: updated.name,
    slug: updated.slug,
  });
});

// GET /api/v1/teams/members
teamRoutes.get("/members", async (c) => {
  const teamId = c.get("teamId") as string;

  const members = await prisma.user.findMany({
    where: { teamId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      avatarUrl: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return c.json({ members });
});

// POST /api/v1/teams/members/invite
teamRoutes.post("/members/invite", requireRole("ADMIN", "OWNER"), async (c) => {
  const teamId = c.get("teamId") as string;
  const body = await c.req.json();
  const input = teamInviteSchema.parse(body);

  // Check if user already exists in team
  const existingMember = await prisma.user.findFirst({
    where: { email: input.email, teamId },
    select: { id: true },
  });

  if (existingMember) {
    throw AppError.validation("This user is already a member of the team");
  }

  const token = generateSecureToken(32);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const invite = await prisma.teamInvite.create({
    data: {
      email: input.email,
      role: input.role as "ADMIN" | "MEMBER",
      token,
      teamId,
      expiresAt,
    },
  });

  logger.info(
    { inviteId: invite.id, email: input.email, teamId },
    "Team invite created"
  );

  return c.json({
    inviteId: invite.id,
    inviteUrl: `${process.env["WEB_BASE_URL"]}/auth/invite?token=${token}`,
    expiresAt: expiresAt.toISOString(),
  }, 201);
});

// DELETE /api/v1/teams/members/:userId
teamRoutes.delete("/members/:userId", requireRole("ADMIN", "OWNER"), async (c) => {
  const teamId = c.get("teamId") as string;
  const userId = c.req.param("userId");
  const currentUserId = c.get("userId") as string;

  if (userId === currentUserId) {
    throw AppError.validation("You cannot remove yourself from the team");
  }

  const member = await prisma.user.findFirst({
    where: { id: userId, teamId },
    select: { role: true },
  });

  if (!member) {
    throw AppError.notFound("Team member");
  }

  if (member.role === "OWNER") {
    throw AppError.forbidden("Cannot remove the team owner");
  }

  await prisma.user.delete({ where: { id: userId } });

  return c.json({ success: true });
});

// PATCH /api/v1/teams/members/:userId/role
teamRoutes.patch("/members/:userId/role", requireRole("OWNER"), async (c) => {
  const teamId = c.get("teamId") as string;
  const userId = c.req.param("userId");
  const body = await c.req.json();
  const input = teamMemberRoleSchema.parse(body);

  const member = await prisma.user.findFirst({
    where: { id: userId, teamId },
  });

  if (!member) {
    throw AppError.notFound("Team member");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role: input.role },
  });

  return c.json({ success: true });
});

// DELETE /api/v1/teams (GDPR delete)
teamRoutes.delete("/", requireRole("OWNER"), async (c) => {
  const teamId = c.get("teamId") as string;
  const body = await c.req.json();
  const input = teamDeleteSchema.parse(body);

  await prisma.team.delete({ where: { id: teamId } });

  logger.info({ teamId }, "Team deleted (GDPR)");

  return c.json({ success: true });
});

export { teamRoutes };
