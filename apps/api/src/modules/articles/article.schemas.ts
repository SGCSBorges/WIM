import { z } from "zod";

export const ArticleCreateSchema = z.object({
  articleNom: z.string().min(1).max(100),
  articleModele: z.string().min(1).max(100),
  articleDescription: z.string().max(255).optional().nullable(),
  productImageUrl: z.string().url().max(255).optional().nullable(),
  ownerUserId: z.number().int().positive(),
});

export const ArticleUpdateSchema = ArticleCreateSchema.partial();

export type ArticleCreateInput = z.infer<typeof ArticleCreateSchema>;
export type ArticleUpdateInput = z.infer<typeof ArticleUpdateSchema>;
