import { z } from "zod";

export const teamUpdateSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must be lowercase alphanumeric with hyphens"
    )
    .optional(),
});

export const teamInviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
});

export const teamMemberRoleSchema = z.object({
  role: z.enum(["OWNER", "ADMIN", "MEMBER"]),
});

export const teamDeleteSchema = z.object({
  confirmation: z.string().refine(
    (val) => val === "DELETE",
    "You must type DELETE to confirm"
  ),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type TeamUpdateInput = z.infer<typeof teamUpdateSchema>;
export type TeamInviteInput = z.infer<typeof teamInviteSchema>;
export type TeamMemberRoleInput = z.infer<typeof teamMemberRoleSchema>;
export type TeamDeleteInput = z.infer<typeof teamDeleteSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
