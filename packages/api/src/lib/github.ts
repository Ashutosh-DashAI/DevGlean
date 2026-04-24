import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { env } from "../env";
import { logger } from "./logger";

/**
 * Creates an Octokit client authenticated as a GitHub App installation.
 * Each team has its own installation ID, giving per-team rate limits.
 */
export function getInstallationClient(installationId: string): Octokit {
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: env.GITHUB_APP_ID,
      privateKey: Buffer.from(env.GITHUB_APP_PRIVATE_KEY, "base64").toString("utf-8"),
      installationId: parseInt(installationId, 10),
    },
    log: {
      debug: () => {},
      info: (msg: string) => logger.debug(msg),
      warn: (msg: string) => logger.warn(msg),
      error: (msg: string) => logger.error(msg),
    },
  });
}

/**
 * Creates a basic Octokit client using the App's client credentials.
 * Used for unauthenticated public search when no installation ID is available.
 */
export function getPublicClient(): Octokit {
  return new Octokit({
    auth: env.GITHUB_APP_CLIENT_SECRET || undefined,
    log: {
      debug: () => {},
      info: () => {},
      warn: (msg: string) => logger.warn(msg),
      error: (msg: string) => logger.error(msg),
    },
  });
}
