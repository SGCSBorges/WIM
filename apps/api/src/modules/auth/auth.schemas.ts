import { z } from "zod";
import { normalizedEmail } from "../common/schemas";

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(
    /[^A-Za-z0-9]/,
    "Password must contain at least one special character"
  );

export const RegisterSchema = z.object({
  email: normalizedEmail,
  password: passwordSchema,
  // Public registration is USER-only; POWER_USER/ADMIN are granted via billing/admin.
  role: z.literal("USER").default("USER"),
});

export const LoginSchema = z.object({
  email: normalizedEmail,
  password: z.string().min(1),
});

export const ForgotPasswordSchema = z.object({
  email: normalizedEmail,
});

export const ResetPasswordSchema = z.object({
  // 64 hex chars (32-byte token in `randomBytes(32).toString("hex")`).
  token: z.string().regex(/^[a-f0-9]{64}$/, "Invalid token"),
  newPassword: passwordSchema,
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
