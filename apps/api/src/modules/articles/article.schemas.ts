import { z } from "zod";
import { ARTICLE_STATUSES, ARTICLE_CATEGORIES } from "@wim/types";

export const ArticleStatusSchema = z.enum(ARTICLE_STATUSES);
export const ArticleCategorySchema = z.enum(ARTICLE_CATEGORIES);

// User-defined attributes: an ordered list of { key, value } pairs stored as
// JSONB. Bounded so a hostile payload can't bloat the row; private like
// purchasedFrom/orderRef (never selected across the sharing boundary).
export const CustomFieldsSchema = z
  .array(
    z.object({
      key: z.string().trim().min(1).max(40),
      value: z.string().trim().min(1).max(500),
    })
  )
  .max(20);

export const ArticleCreateSchema = z.object({
  articleNom: z.string().trim().min(1).max(100),
  articleModele: z.string().trim().min(1).max(100),
  articleDescription: z.string().trim().max(255).optional().nullable(),
  // Identity fields — optional, folded into the substring search.
  serialNumber: z.string().trim().max(120).optional().nullable(),
  brand: z.string().trim().max(120).optional().nullable(),
  // Purchase provenance — retailer/store + the order or receipt reference,
  // the two facts a warranty claim or insurance filing always asks for.
  purchasedFrom: z.string().trim().max(150).optional().nullable(),
  orderRef: z.string().trim().max(100).optional().nullable(),
  productImageUrl: z
    .string()
    .url()
    .max(500)
    .refine((u) => /^https?:\/\//i.test(u), {
      message: "productImageUrl must be an http(s) URL",
    })
    .optional()
    .nullable(),
  // Purchase price for inventory-value tracking (optional).
  purchasePrice: z.coerce
    .number()
    .nonnegative()
    .max(10_000_000_000)
    .optional()
    .nullable(),
  // Annual straight-line depreciation rate as a percentage (0–100).
  depreciationRate: z.coerce.number().min(0).max(100).optional().nullable(),
  // Lifecycle state. Omitted on create defaults to ACTIVE (DB default).
  status: ArticleStatusSchema.optional(),
  // Optional broad category (null clears it).
  category: ArticleCategorySchema.optional().nullable(),
  // User-defined attributes (null clears them all).
  customFields: CustomFieldsSchema.optional().nullable(),
  // An article must belong to at least one location
  locationIds: z.array(z.number().int().positive()).min(1),
  // Optional tags (owner-scoped). Empty/absent = no tags.
  tagIds: z.array(z.number().int().positive()).optional(),
  // Optional warranty created alongside the article
  garantie: z
    .object({
      garantieNom: z.string().trim().min(1).max(100),
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
      garantieNom: z.string().trim().min(1).max(100).optional(),
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
