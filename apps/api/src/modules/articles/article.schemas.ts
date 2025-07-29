import { z } from "zod";

export const ArticleCreateSchema = z.object({
  articleNom: z.string().min(1).max(100),
  articleModele: z.string().min(1).max(100),
  articleDescription: z.string().max(255).optional().nullable(),
  productImageUrl: z.string().url().max(255).optional().nullable(),
  // An article must belong to at least one location
  locationIds: z.array(z.number().int().positive()).min(1),
  // Optional warranty created alongside the article
  garantie: z
    .object({
      garantieNom: z.string().min(1).max(100),
      garantieDateAchat: z.coerce.date(),
      garantieDuration: z.number().int().min(1).max(120),
      // Optional proof attachment linked to the warranty
      garantieImageAttachmentId: z
        .number()
        .int()
        .positive()
        .optional()
        .nullable(),
    })
    .optional(),
  ownerUserId: z.number().int().positive(),
});

export const ArticleUpdateSchema = ArticleCreateSchema.partial().extend({
  // When updating you can patch the linked warranty or explicitly remove it.
  // If `garantie` is provided and the article has no warranty yet, it will be created.
  // If `removeGarantie` is true, the linked warranty (if any) will be deleted.
  garantie: z
    .object({
      garantieNom: z.string().min(1).max(100).optional(),
      garantieDateAchat: z.coerce.date().optional(),
      garantieDuration: z.number().int().min(1).max(120).optional(),
      // Allow setting/replacing/removing proof attachment
      garantieImageAttachmentId: z
        .number()
        .int()
        .positive()
        .optional()
        .nullable(),
    })
    .optional(),
  removeGarantie: z.boolean().optional(),
});

export type ArticleCreateInput = z.infer<typeof ArticleCreateSchema>;
export type ArticleUpdateInput = z.infer<typeof ArticleUpdateSchema>;
