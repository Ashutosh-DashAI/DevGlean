import { z } from "zod";

export const documentListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  connectorId: z.string().cuid().optional(),
  sourceType: z
    .enum([
      "GITHUB",
      "NOTION",
      "SLACK",
      "LINEAR",
      "JIRA",
      "CONFLUENCE",
      "GITLAB",
    ])
    .optional(),
  q: z.string().max(500).optional(),
});

export const documentReindexSchema = z.object({
  connectorId: z.string().cuid().optional(),
});

export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;
export type DocumentReindexInput = z.infer<typeof documentReindexSchema>;
