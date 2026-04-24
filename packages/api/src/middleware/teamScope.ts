import { createMiddleware } from "hono/factory";
import type { Context, Next } from "hono";

/**
 * Injects teamId and builds ACL groups for the current user.
 * Must run after authMiddleware.
 */
export const teamScopeMiddleware = createMiddleware(async (c: Context, next: Next) => {
  const teamId = c.get("teamId") as string;
  const userId = c.get("userId") as string;

  if (!teamId || !userId) {
    await next();
    return;
  }

  // Build base ACL groups — always includes team and user
  const aclGroups: string[] = [teamId, userId];
  c.set("aclGroups", aclGroups);

  await next();
});
