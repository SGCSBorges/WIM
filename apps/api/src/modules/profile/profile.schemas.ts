import { z } from "zod";
import { passwordSchema } from "../auth/auth.schemas";
import { normalizedEmail } from "../common/schemas";

export const UpdateEmailSchema = z.object({
  email: normalizedEmail,
  currentPassword: z.string().min(1),
});
export type UpdateEmailInput = z.infer<typeof UpdateEmailSchema>;

export const UpdatePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema, // same strength as registration
});
export type UpdatePasswordInput = z.infer<typeof UpdatePasswordSchema>;

export const DeleteAccountSchema = z.object({
  currentPassword: z.string().min(1),
});
export type DeleteAccountInput = z.infer<typeof DeleteAccountSchema>;

export const UpdateCurrencySchema = z.object({
  // ISO 4217 alpha code, e.g. USD, EUR, GBP.
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "currency must be a 3-letter ISO code"),
});
export type UpdateCurrencyInput = z.infer<typeof UpdateCurrencySchema>;

export const UpdateEmailRemindersSchema = z.object({
  enabled: z.boolean(),
});
export type UpdateEmailRemindersInput = z.infer<
  typeof UpdateEmailRemindersSchema
>;
