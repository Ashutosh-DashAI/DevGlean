import { z } from "zod";

export const connectorConfigSchema = z.object({
  repos: z.array(z.string()).optional(),
  channels: z.array(z.string()).optional(),
  projects: z.array(z.string()).optional(),
  databases: z.array(z.string()).optional(),
  includePRs: z.boolean().optional(),
  includeIssues: z.boolean().optional(),
  includeComments: z.boolean().optional(),
});

export const connectorUpdateSchema = z.object({
  displayName: z
    .string()
    .min(1)
    .max(100)
    .trim()
    .optional(),
  config: connectorConfigSchema.optional(),
});

export const connectorTypeParamSchema = z.enum([
  "github",
  "notion",
  "slack",
  "linear",
  "jira",
  "confluence",
  "gitlab",
]);

export const oauthCallbackSchema = z.object({
  code: z.string().min(1, "OAuth authorization code is required"),
  state: z.string().min(1, "OAuth state parameter is required"),
});

export type ConnectorConfig = z.infer<typeof connectorConfigSchema>;
export type ConnectorUpdateInput = z.infer<typeof connectorUpdateSchema>;
export type ConnectorTypeParam = z.infer<typeof connectorTypeParamSchema>;
export type OAuthCallbackInput = z.infer<typeof oauthCallbackSchema>;
