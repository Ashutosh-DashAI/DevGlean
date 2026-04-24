import { z } from "zod";

export const ossSearchSchema = z.object({
  query: z.string().min(3).max(500),
  filters: z
    .object({
      repos: z.array(z.string()).max(20).optional(),
      minStars: z.number().int().min(0).optional(),
      language: z.string().max(50).optional(),
      dateRange: z
        .object({
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
        })
        .optional(),
    })
    .optional(),
});
export type OSSSearchInput = z.infer<typeof ossSearchSchema>;

export const ossSynthesizeSchema = z.object({
  owner: z.string().min(1).max(100),
  repo: z.string().min(1).max(100),
  number: z.coerce.number().int().positive(),
});
export type OSSSynthesizeInput = z.infer<typeof ossSynthesizeSchema>;

export const ossTrendingSchema = z.object({
  language: z.string().max(50).optional(),
  timeframe: z.enum(["day", "week"]).default("week"),
});
export type OSSTrendingInput = z.infer<typeof ossTrendingSchema>;

export const ossIssueParamsSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  number: z.coerce.number().int().positive(),
});
export type OSSIssueParams = z.infer<typeof ossIssueParamsSchema>;
