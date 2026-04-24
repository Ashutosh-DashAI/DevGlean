import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import {
  registerSchema,
  loginSchema,
  inviteAcceptSchema,
  AppError,
  COOKIE_NAMES,
  REFRESH_TOKEN_TTL_SECONDS,
  RATE_LIMITS,
} from "@devglean/shared";
import * as authService from "../services/auth.service";
import { authMiddleware } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import { env } from "../env";

const authRoutes = new Hono();

const authRateLimit = rateLimit(RATE_LIMITS.auth);

function setRefreshTokenCookie(c: { header: (name: string, value: string) => void }, token: string): void {
  // Manually set the cookie header for proper HttpOnly, Secure, SameSite handling
  const maxAge = REFRESH_TOKEN_TTL_SECONDS;
  const secure = env.NODE_ENV === "production" ? "; Secure" : "";
  const cookieValue = `${COOKIE_NAMES.refreshToken}=${token}; HttpOnly; SameSite=Strict; Path=/api/v1/auth${secure}; Max-Age=${maxAge}`;
  c.header("Set-Cookie", cookieValue);
}

function clearRefreshTokenCookie(c: { header: (name: string, value: string) => void }): void {
  const secure = env.NODE_ENV === "production" ? "; Secure" : "";
  const cookieValue = `${COOKIE_NAMES.refreshToken}=; HttpOnly; SameSite=Strict; Path=/api/v1/auth${secure}; Max-Age=0`;
  c.header("Set-Cookie", cookieValue);
}

// POST /api/v1/auth/register
authRoutes.post("/register", authRateLimit, async (c) => {
  const body = await c.req.json();
  const input = registerSchema.parse(body);

  const result = await authService.register(input);

  setRefreshTokenCookie(c, result.refreshToken);

  return c.json(
    {
      user: result.user,
      team: result.team,
      accessToken: result.accessToken,
    },
    201
  );
});

// POST /api/v1/auth/login
authRoutes.post("/login", authRateLimit, async (c) => {
  const body = await c.req.json();
  const input = loginSchema.parse(body);

  const result = await authService.login(input);

  setRefreshTokenCookie(c, result.refreshToken);

  return c.json({
    user: result.user,
    team: result.team,
    accessToken: result.accessToken,
  });
});

// POST /api/v1/auth/refresh
authRoutes.post("/refresh", async (c) => {
  const refreshToken = getCookie(c, COOKIE_NAMES.refreshToken);

  if (!refreshToken) {
    throw AppError.unauthorized("No refresh token provided");
  }

  const tokens = await authService.refreshTokens(refreshToken);

  setRefreshTokenCookie(c, tokens.refreshToken);

  return c.json({
    accessToken: tokens.accessToken,
  });
});

// POST /api/v1/auth/logout
authRoutes.post("/logout", authMiddleware, async (c) => {
  const refreshToken = getCookie(c, COOKIE_NAMES.refreshToken);

  if (refreshToken) {
    await authService.logout(refreshToken);
  }

  clearRefreshTokenCookie(c);

  return c.json({ success: true });
});

// POST /api/v1/auth/logout-all
authRoutes.post("/logout-all", authMiddleware, async (c) => {
  const userId = c.get("userId") as string;
  await authService.logoutAll(userId);

  clearRefreshTokenCookie(c);

  return c.json({ success: true });
});

// POST /api/v1/auth/invite/accept
authRoutes.post("/invite/accept", authRateLimit, async (c) => {
  const body = await c.req.json();
  const input = inviteAcceptSchema.parse(body);

  const result = await authService.acceptInvite(input);

  setRefreshTokenCookie(c, result.refreshToken);

  return c.json(
    {
      user: result.user,
      team: result.team,
      accessToken: result.accessToken,
    },
    201
  );
});

export { authRoutes };
