import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  API_BASE_URL: z.string().url().default("http://localhost:3001"),
  WEB_BASE_URL: z.string().url().default("http://localhost:5173"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),

  ENCRYPTION_KEY: z.string().length(64, "ENCRYPTION_KEY must be exactly 64 hex characters"),

  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),

  GITHUB_CLIENT_ID: z.string().default(""),
  GITHUB_CLIENT_SECRET: z.string().default(""),
  GITHUB_WEBHOOK_SECRET: z.string().default(""),

  NOTION_CLIENT_ID: z.string().default(""),
  NOTION_CLIENT_SECRET: z.string().default(""),

  SLACK_CLIENT_ID: z.string().default(""),
  SLACK_CLIENT_SECRET: z.string().default(""),
  SLACK_SIGNING_SECRET: z.string().default(""),

  LINEAR_CLIENT_ID: z.string().default(""),
  LINEAR_CLIENT_SECRET: z.string().default(""),
  LINEAR_WEBHOOK_SECRET: z.string().default(""),

  JIRA_CLIENT_ID: z.string().default(""),
  JIRA_CLIENT_SECRET: z.string().default(""),

  // GitHub App (OSS Intelligence — per-installation rate limits)
  GITHUB_APP_ID: z.string().default(""),
  GITHUB_APP_PRIVATE_KEY: z.string().default(""), // PEM base64
  GITHUB_APP_CLIENT_ID: z.string().default(""),
  GITHUB_APP_CLIENT_SECRET: z.string().default(""),
  GITHUB_APP_WEBHOOK_SECRET: z.string().default(""),

  // Stack Exchange API
  STACK_EXCHANGE_KEY: z.string().default(""),

  // OAuth state signing
  OAUTH_STATE_SECRET: z.string().default(""),

  STRIPE_SECRET_KEY: z.string().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().default(""),
  STRIPE_PRO_PRICE_ID: z.string().default(""),

  RESEND_API_KEY: z.string().default(""),
  FROM_EMAIL: z.string().email().default("noreply@devglean.io"),

  // Observability
  SENTRY_DSN: z.string().default(""),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.format();
    const errors = Object.entries(formatted)
      .filter(([key]) => key !== "_errors")
      .map(([key, value]) => {
        const errs = value as { _errors?: string[] };
        return `  ${key}: ${errs._errors?.join(", ") ?? "Invalid"}`;
      })
      .join("\n");

    console.error(`\n❌ Invalid environment variables:\n${errors}\n`);
    process.exit(1);
  }

  return result.data;
}

export const env = validateEnv();
