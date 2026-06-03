import { z } from "zod";

export const WarrantyCreateSchema = z.object({
  garantieArticleId: z.number().int().positive(),
  garantieNom: z.string().trim().min(1).max(100),
  garantieDateAchat: z.coerce.date(),
  garantieDuration: z.number().int().min(1).max(120),
  // Optional provider contact. URL is loose (http/https only); phone is free
  // text so international formats stay flexible.
  providerName: z.string().trim().max(120).optional().nullable(),
  providerPhone: z.string().trim().max(40).optional().nullable(),
  providerUrl: z
    .string()
    .trim()
    .max(2048)
    .url()
    .refine((u) => /^https?:\/\//i.test(u), {
      message: "providerUrl must be an http(s) URL",
    })
    .optional()
    .nullable(),
});

export const WarrantyUpdateSchema = WarrantyCreateSchema.partial();

export const ClaimUpdateSchema = z.object({
  status: z.enum(["NONE", "OPEN", "APPROVED", "REJECTED", "RESOLVED"]),
  note: z.string().trim().max(2000).optional().nullable(),
});

export type WarrantyCreateInput = z.infer<typeof WarrantyCreateSchema> & {
  ownerUserId: number;
};

export type WarrantyUpdateInput = z.infer<typeof WarrantyUpdateSchema>;
export type ClaimUpdateInput = z.infer<typeof ClaimUpdateSchema>;

// Renew = swap purchase date + duration with a fresh contract; provider
// metadata is patchable in the same step. Extend = roll the end date forward
// by N months in place. Both keep the same `garantieId` and snapshot the
// prior state into WarrantyHistory.
export const WarrantyRenewSchema = z.object({
  garantieDateAchat: z.coerce.date(),
  garantieDuration: z.number().int().min(1).max(120),
  providerName: z.string().trim().max(120).optional().nullable(),
  providerPhone: z.string().trim().max(40).optional().nullable(),
  providerUrl: z
    .string()
    .trim()
    .max(2048)
    .url()
    .refine((u) => /^https?:\/\//i.test(u), {
      message: "providerUrl must be an http(s) URL",
    })
    .optional()
    .nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});

export const WarrantyExtendSchema = z.object({
  months: z.number().int().min(1).max(120),
  note: z.string().trim().max(500).optional().nullable(),
});

export type WarrantyRenewInput = z.infer<typeof WarrantyRenewSchema>;
export type WarrantyExtendInput = z.infer<typeof WarrantyExtendSchema>;
