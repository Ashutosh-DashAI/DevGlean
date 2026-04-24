import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { env } from "./env";
import { traceIdMiddleware } from "./middleware/traceId";
import { errorHandler } from "./middleware/errorHandler";
import { authRoutes } from "./routes/auth.routes";
import { healthRoutes } from "./routes/health.routes";
import { searchRoutes } from "./routes/search.routes";
import { connectorRoutes } from "./routes/connector.routes";
import { teamRoutes } from "./routes/team.routes";
import { documentRoutes } from "./routes/document.routes";
import { analyticsRoutes } from "./routes/analytics.routes";
import { billingRoutes } from "./routes/billing.routes";
import { webhookRoutes } from "./routes/webhook.routes";
import { ossRoutes } from "./routes/oss.routes";
import { API_PREFIX } from "@devglean/shared";

export function createApp(): Hono {
  const app = new Hono();

  // ──── Global Middleware ────────────────────────────────────────────────

  // Security headers
  app.use("*", secureHeaders({
    contentSecurityPolicy: env.NODE_ENV === "production" ? undefined : false,
    crossOriginEmbedderPolicy: false,
  }));

  // CORS
  app.use(
    "*",
    cors({
      origin: [env.WEB_BASE_URL],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-Trace-ID"],
      credentials: true,
      maxAge: 86400,
    })
  );

  // Trace ID on every request
  app.use("*", traceIdMiddleware);

  // ──── Routes ──────────────────────────────────────────────────────────

  // Health (no prefix, no auth)
  app.route("/health", healthRoutes);

  // API v1 routes
  app.route(`${API_PREFIX}/auth`, authRoutes);
  app.route(`${API_PREFIX}/search`, searchRoutes);
  app.route(`${API_PREFIX}/connectors`, connectorRoutes);
  app.route(`${API_PREFIX}/teams`, teamRoutes);
  app.route(`${API_PREFIX}/documents`, documentRoutes);
  app.route(`${API_PREFIX}/analytics`, analyticsRoutes);
  app.route(`${API_PREFIX}/billing`, billingRoutes);
  app.route(`${API_PREFIX}/webhooks`, webhookRoutes);
  app.route(`${API_PREFIX}/oss`, ossRoutes);

  // ──── Error Handler ───────────────────────────────────────────────────
  app.onError(errorHandler);

  // ──── 404 Handler ─────────────────────────────────────────────────────
  app.notFound((c) => {
    return c.json(
      {
        error: {
          code: "NOT_FOUND",
          message: `Route ${c.req.method} ${c.req.path} not found`,
        },
      },
      404
    );
  });

  return app;
}
