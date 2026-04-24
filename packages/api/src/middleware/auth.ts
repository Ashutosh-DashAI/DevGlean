import { createMiddleware } from "hono/factory";
import * as jose from "jose";
import { env } from "../env";
import { AppError } from "@devglean/shared";
import type { Context, Next } from "hono";
import type { JwtPayload } from "@devglean/shared";

export const authMiddleware = createMiddleware(async (c: Context, next: Next) => {
  const authHeader = c.req.header("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw AppError.unauthorized("Missing or invalid Authorization header");
  }

  const token = authHeader.slice(7);

  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const { payload } = await jose.jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });

    const user: JwtPayload = {
      sub: payload.sub as string,
      teamId: payload.teamId as string,
      role: payload.role as string,
      plan: payload.plan as string,
      iat: payload.iat as number,
      exp: payload.exp as number,
    };

    c.set("user", user);
    c.set("userId", user.sub);
    c.set("teamId", user.teamId);
    c.set("role", user.role);
    c.set("plan", user.plan);

    await next();
  } catch (err) {
    if (err instanceof jose.errors.JWTExpired) {
      throw AppError.unauthorized("Access token expired");
    }
    if (err instanceof jose.errors.JWTClaimValidationFailed) {
      throw AppError.unauthorized("Invalid token claims");
    }
    if (err instanceof AppError) {
      throw err;
    }
    throw AppError.unauthorized("Invalid access token");
  }
});

/**
 * Middleware that requires a minimum role level.
 * Role hierarchy: OWNER > ADMIN > MEMBER
 */
export function requireRole(...allowedRoles: string[]) {
  return createMiddleware(async (c: Context, next: Next) => {
    const role = c.get("role") as string | undefined;

    if (!role || !allowedRoles.includes(role)) {
      throw AppError.forbidden(
        `This action requires one of: ${allowedRoles.join(", ")}`
      );
    }

    await next();
  });
}
