import { z } from "zod";

export const ShareInviteCreateSchema = z.object({
  email: z.string().email(),
  permission: z.enum(["RO", "RW"]).default("RO"),
  // optionnel: durée de validité (jours)
  ttlDays: z.number().int().min(1).max(30).default(7),
});

export const ShareInviteAcceptSchema = z.object({
  token: z.string().min(16),
});

export const ShareUpdateSchema = z.object({
  permission: z.enum(["RO", "RW"]),
});

export type ShareInviteCreateInput = z.infer<typeof ShareInviteCreateSchema>;
export type ShareInviteAcceptInput = z.infer<typeof ShareInviteAcceptSchema>;
export type ShareUpdateInput = z.infer<typeof ShareUpdateSchema>;
