import { z } from "zod";

export const ArticleCreateSchema = z.object({
  articleNom: z.string().min(1).max(30),
  articleModele: z.string().min(1).max(30),
  articleDescription: z.string().max(255).optional().nullable(),
});

export const ArticleUpdateSchema = ArticleCreateSchema.partial();

export type ArticleCreateInput = z.infer<typeof ArticleCreateSchema>;
export type ArticleUpdateInput = z.infer<typeof ArticleUpdateSchema>;
