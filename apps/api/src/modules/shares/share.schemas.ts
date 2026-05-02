import { z } from "zod";

export const InventoryShareCreateSchema = z.object({
  targetUserId: z.number().int().positive(),
  permission: z.enum(["READ", "WRITE"]).default("READ"),
  ownerUserId: z.number().int().positive(),
});

export const InventoryShareUpdateSchema = z.object({
  permission: z.enum(["READ", "WRITE"]),
  active: z.boolean(),
});

export const ShareInviteCreateSchema = z.object({
  email: z
    .string()
    .email()
    .max(255)
    .transform((s) => s.toLowerCase()),
  permission: z.enum(["READ", "WRITE"]).default("READ"),
  expiresAt: z.coerce
    .date()
    .refine((d) => d > new Date(), {
      message: "expiresAt must be in the future",
    })
    .refine((d) => d < new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), {
      message: "expiresAt must be within 1 year",
    }),
  ownerUserId: z.number().int().positive(),
});

export const ShareInviteAcceptSchema = z.object({
  token: z.string().min(1).max(128),
});

export const ShareUpdateSchema = z.object({
  permission: z.enum(["READ", "WRITE"]),
});

export type InventoryShareCreateInput = z.infer<
  typeof InventoryShareCreateSchema
>;
export type InventoryShareUpdateInput = z.infer<
  typeof InventoryShareUpdateSchema
>;
export type ShareInviteCreateInput = z.infer<typeof ShareInviteCreateSchema>;
export type ShareInviteAcceptInput = z.infer<typeof ShareInviteAcceptSchema>;
export type ShareUpdateInput = z.infer<typeof ShareUpdateSchema>;
