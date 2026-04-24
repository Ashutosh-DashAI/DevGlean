import { createMiddleware } from "hono/factory";
import { randomUUID } from "crypto";
import type { Context, Next } from "hono";

export const traceIdMiddleware = createMiddleware(async (c: Context, next: Next) => {
  const traceId =
    (c.req.header("x-trace-id") as string | undefined) ?? randomUUID();

  c.set("traceId", traceId);
  c.header("X-Trace-ID", traceId);

  await next();
});
