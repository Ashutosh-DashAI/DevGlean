import pino from "pino";
import { env } from "../env";

export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === "development"
      ? {
          target: "pino/file",
          options: { destination: 1 },
        }
      : undefined,
  formatters: {
    level(label: string) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: "devglean-api",
    env: env.NODE_ENV,
  },
});

export function createChildLogger(bindings: Record<string, unknown>): pino.Logger {
  return logger.child(bindings);
}
