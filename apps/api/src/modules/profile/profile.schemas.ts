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

export const UpdateWeeklyDigestSchema = z.object({
  enabled: z.boolean(),
});
export type UpdateWeeklyDigestInput = z.infer<typeof UpdateWeeklyDigestSchema>;

// Cross-device UI preferences. Every field is optional so the client can
// PATCH just the one that changed; `null` explicitly clears a preference
// back to "follow the device default". The enums mirror the client's theme
// list, supported languages, and the date-format options.
export const UpdatePreferencesSchema = z
  .object({
    theme: z.enum(["light", "dark", "ocean", "cyber"]).nullish(),
    language: z.enum(["en", "fr", "pt"]).nullish(),
    dateFormat: z
      .enum(["system", "dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd"])
      .nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "at least one preference is required",
  });
export type UpdatePreferencesInput = z.infer<typeof UpdatePreferencesSchema>;
