import { z } from "zod";

export const analyticsOverviewQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const analyticsQueriesQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  granularity: z.enum(["day", "week"]).default("day"),
});

export const analyticsTopQueriesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export type AnalyticsOverviewQuery = z.infer<typeof analyticsOverviewQuerySchema>;
export type AnalyticsQueriesQuery = z.infer<typeof analyticsQueriesQuerySchema>;
export type AnalyticsTopQueriesQuery = z.infer<typeof analyticsTopQueriesQuerySchema>;
