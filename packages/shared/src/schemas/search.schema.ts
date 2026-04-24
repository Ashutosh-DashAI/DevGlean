import { z } from "zod";

export const searchQuerySchema = z.object({
  query: z
    .string()
    .min(1, "Search query is required")
    .max(2000, "Query must not exceed 2000 characters")
    .trim(),
  filters: z
    .object({
      connectorIds: z.array(z.string().cuid()).optional(),
      sourceTypes: z
        .array(
          z.enum([
            "GITHUB",
            "NOTION",
            "SLACK",
            "LINEAR",
            "JIRA",
            "CONFLUENCE",
            "GITLAB",
          ])
        )
        .optional(),
      dateRange: z
        .object({
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
        })
        .optional(),
    })
    .optional(),
  stream: z.boolean().default(true),
});

export const searchFeedbackSchema = z.object({
  helpful: z.boolean(),
  comment: z.string().max(1000).optional(),
});

export const searchHistoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().max(500).optional(),
});

export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
export type SearchFeedbackInput = z.infer<typeof searchFeedbackSchema>;
export type SearchHistoryQuery = z.infer<typeof searchHistoryQuerySchema>;
