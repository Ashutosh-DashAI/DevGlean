import { z } from "zod";

export const suggestionsQuerySchema = z.object({
  q: z.string().min(1).max(100).trim(),
});
