import { z } from "zod";
import { passwordSchema } from "../auth/auth.schemas";

export const UpdateEmailSchema = z.object({
  email: z.string().email(),
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
