import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must not exceed 128 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must not exceed 100 characters")
    .trim(),
  teamName: z
    .string()
    .min(1, "Team name is required")
    .max(100, "Team name must not exceed 100 characters")
    .trim(),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const inviteAcceptSchema = z.object({
  token: z.string().min(1, "Invite token is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must not exceed 128 characters"),
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must not exceed 100 characters")
    .trim(),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const passwordResetSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must not exceed 128 characters"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type InviteAcceptInput = z.infer<typeof inviteAcceptSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;
