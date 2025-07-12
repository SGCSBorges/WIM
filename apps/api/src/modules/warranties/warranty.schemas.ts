import { z } from "zod";

export const WarrantyCreateSchema = z.object({
  garantieArticleId: z.number().int().positive(),
  garantieNom: z.string().min(1).max(100),
  garantieDateAchat: z.coerce.date(),
  garantieDuration: z.number().int().min(1).max(120),
  ownerUserId: z.number().int().positive(),
});

export const WarrantyUpdateSchema = WarrantyCreateSchema.partial();

export type WarrantyCreateInput = z.infer<typeof WarrantyCreateSchema>;
export type WarrantyUpdateInput = z.infer<typeof WarrantyUpdateSchema>;
