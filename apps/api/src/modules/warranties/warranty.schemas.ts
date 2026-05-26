import { z } from "zod";

export const WarrantyCreateSchema = z.object({
  garantieArticleId: z.number().int().positive(),
  garantieNom: z.string().trim().min(1).max(100),
  garantieDateAchat: z.coerce.date(),
  garantieDuration: z.number().int().min(1).max(120),
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
