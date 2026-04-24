import bcrypt from "bcryptjs";
import * as jose from "jose";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { sha256, generateSecureToken } from "../lib/crypto";
import { env } from "../env";
import { logger } from "../lib/logger";
import {
  AppError,
  ErrorCode,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  BCRYPT_ROUNDS,
  COOKIE_NAMES,
} from "@devglean/shared";
import type { RegisterInput, LoginInput } from "@devglean/shared";
import type { User, Team } from "@devglean/db";

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    avatarUrl: string | null;
  };
  team: {
    id: string;
    name: string;
    slug: string;
    plan: string;
  };
  accessToken: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

async function generateUniqueSlug(baseName: string): Promise<string> {
  let slug = slugify(baseName);
  let suffix = 0;

  while (true) {
    const candidate = suffix === 0 ? slug : `${slug}-${suffix}`;
    const existing = await prisma.team.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }

    suffix++;
  }
}

async function createAccessToken(user: User, team: Team): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);

  return new jose.SignJWT({
    teamId: team.id,
    role: user.role,
    plan: team.plan,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

async function createRefreshToken(
  userId: string,
  family: string
): Promise<{ rawToken: string; hashedToken: string }> {
  const rawToken = generateSecureToken(32);
  const hashedToken = sha256(rawToken);

  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

  await prisma.refreshToken.create({
    data: {
      token: hashedToken,
      userId,
      family,
      expiresAt,
    },
  });

  return { rawToken, hashedToken };
}

export async function register(
  input: RegisterInput
): Promise<AuthResponse & { refreshToken: string }> {
  const existingUser = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });

  if (existingUser) {
    throw new AppError(
      ErrorCode.EMAIL_ALREADY_EXISTS,
      "An account with this email already exists",
      409
    );
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const slug = await generateUniqueSlug(input.teamName);
  const family = crypto.randomUUID();

  const result = await prisma.$transaction(async (tx) => {
    const team = await tx.team.create({
      data: {
        name: input.teamName,
        slug,
      },
    });

    const user = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name,
        role: "OWNER",
        teamId: team.id,
      },
    });

    return { user, team };
  });

  const accessToken = await createAccessToken(result.user, result.team);
  const { rawToken: refreshToken } = await createRefreshToken(
    result.user.id,
    family
  );

  logger.info(
    { userId: result.user.id, teamId: result.team.id },
    "User registered"
  );

  return {
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: result.user.role,
      avatarUrl: result.user.avatarUrl,
    },
    team: {
      id: result.team.id,
      name: result.team.name,
      slug: result.team.slug,
      plan: result.team.plan,
    },
    accessToken,
    refreshToken,
  };
}

export async function login(
  input: LoginInput
): Promise<AuthResponse & { refreshToken: string }> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { team: true },
  });

  if (!user) {
    throw new AppError(
      ErrorCode.INVALID_CREDENTIALS,
      "Invalid email or password",
      401
    );
  }

  const passwordValid = await bcrypt.compare(input.password, user.passwordHash);

  if (!passwordValid) {
    throw new AppError(
      ErrorCode.INVALID_CREDENTIALS,
      "Invalid email or password",
      401
    );
  }

  const family = crypto.randomUUID();
  const accessToken = await createAccessToken(user, user.team);
  const { rawToken: refreshToken } = await createRefreshToken(user.id, family);

  logger.info({ userId: user.id }, "User logged in");

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl,
    },
    team: {
      id: user.team.id,
      name: user.team.name,
      slug: user.team.slug,
      plan: user.team.plan,
    },
    accessToken,
    refreshToken,
  };
}

export async function refreshTokens(rawToken: string): Promise<AuthTokens> {
  const hashedToken = sha256(rawToken);

  const existingToken = await prisma.refreshToken.findUnique({
    where: { token: hashedToken },
    include: {
      user: {
        include: { team: true },
      },
    },
  });

  if (!existingToken) {
    throw AppError.unauthorized("Invalid refresh token");
  }

  // Check if token was already used (reuse attack detection)
  if (existingToken.revokedAt) {
    // Revoke entire token family — potential theft detected
    await prisma.refreshToken.updateMany({
      where: { family: existingToken.family },
      data: { revokedAt: new Date() },
    });

    logger.warn(
      {
        userId: existingToken.userId,
        family: existingToken.family,
      },
      "Refresh token reuse detected — entire family revoked"
    );

    throw new AppError(
      ErrorCode.TOKEN_REUSE_DETECTED,
      "Token reuse detected. Please log in again.",
      401
    );
  }

  // Check if token is expired
  if (existingToken.expiresAt < new Date()) {
    throw new AppError(
      ErrorCode.TOKEN_EXPIRED,
      "Refresh token expired. Please log in again.",
      401
    );
  }

  // Revoke the current token
  await prisma.refreshToken.update({
    where: { id: existingToken.id },
    data: { revokedAt: new Date() },
  });

  // Issue new tokens in the same family
  const accessToken = await createAccessToken(
    existingToken.user,
    existingToken.user.team
  );
  const { rawToken: newRefreshToken } = await createRefreshToken(
    existingToken.userId,
    existingToken.family
  );

  return {
    accessToken,
    refreshToken: newRefreshToken,
  };
}

export async function logout(rawToken: string): Promise<void> {
  const hashedToken = sha256(rawToken);

  await prisma.refreshToken.updateMany({
    where: { token: hashedToken, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function logoutAll(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  logger.info({ userId }, "All refresh tokens revoked");
}

export async function acceptInvite(input: {
  token: string;
  password: string;
  name: string;
}): Promise<AuthResponse & { refreshToken: string }> {
  const invite = await prisma.teamInvite.findUnique({
    where: { token: input.token },
    include: { team: true },
  });

  if (!invite) {
    throw new AppError(ErrorCode.NOT_FOUND, "Invite not found", 404);
  }

  if (invite.acceptedAt) {
    throw new AppError(
      ErrorCode.INVITE_ALREADY_ACCEPTED,
      "This invite has already been accepted",
      400
    );
  }

  if (invite.expiresAt < new Date()) {
    throw new AppError(
      ErrorCode.INVITE_EXPIRED,
      "This invite has expired",
      400
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: invite.email },
    select: { id: true },
  });

  if (existingUser) {
    throw new AppError(
      ErrorCode.EMAIL_ALREADY_EXISTS,
      "An account with this email already exists",
      409
    );
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const family = crypto.randomUUID();

  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        email: invite.email,
        passwordHash,
        name: input.name,
        role: invite.role,
        teamId: invite.teamId,
      },
    });

    await tx.teamInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });

    return newUser;
  });

  const accessToken = await createAccessToken(user, invite.team);
  const { rawToken: refreshToken } = await createRefreshToken(user.id, family);

  logger.info(
    { userId: user.id, teamId: invite.teamId },
    "Invite accepted"
  );

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl,
    },
    team: {
      id: invite.team.id,
      name: invite.team.name,
      slug: invite.team.slug,
      plan: invite.team.plan,
    },
    accessToken,
    refreshToken,
  };
}
