import type { Context } from "hono";
import { AppError } from "@devglean/shared";
import { logger } from "../lib/logger";

export function errorHandler(err: Error, c: Context): Response {
  const traceId = c.get("traceId") as string | undefined;

  if (err instanceof AppError) {
    logger.warn(
      {
        err: {
          code: err.code,
          message: err.message,
          statusCode: err.statusCode,
          details: err.details,
        },
        traceId,
        method: c.req.method,
        path: c.req.path,
      },
      `AppError: ${err.code}`
    );

    return c.json(err.toJSON(), err.statusCode as 400);
  }

  // Unexpected errors — log full stack, return generic message
  logger.error(
    {
      err: {
        message: err.message,
        stack: err.stack,
        name: err.name,
      },
      traceId,
      method: c.req.method,
      path: c.req.path,
    },
    "Unhandled error"
  );

  return c.json(
    {
      error: {
        code: "INTERNAL",
        message: "An unexpected error occurred",
      },
    },
    500
  );
}
