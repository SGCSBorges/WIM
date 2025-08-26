import { z } from "zod";

export const UpdateEmailSchema = z.object({
  email: z.string().email(),
  currentPassword: z.string().min(8),
});
export type UpdateEmailInput = z.infer<typeof UpdateEmailSchema>;

export const UpdatePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8),
});
export type UpdatePasswordInput = z.infer<typeof UpdatePasswordSchema>;

export const DeleteAccountSchema = z.object({
  currentPassword: z.string().min(8),
});
export type DeleteAccountInput = z.infer<typeof DeleteAccountSchema>;
