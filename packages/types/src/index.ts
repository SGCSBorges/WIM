/**
 * Shared domain types for WIM.
 *
 * These describe the shape of objects exchanged between the API and the web
 * client. Keep this file framework-free (no Zod, no Prisma) so it can be
 * imported from both Node and browser bundles without pulling extra deps.
 */

export interface Location {
  locationId: number;
  name: string;
}

export interface ArticleWarranty {
  garantieId?: number;
  garantieNom: string;
  garantieDateAchat: string;
  garantieDuration: number;
  garantieFin?: string | null;
  garantieIsValide?: boolean;
  garantieImageAttachmentId?: number | null;
  garantieImageAttachment?: {
    fileName: string;
    mimeType: string;
    fileUrl: string;
  } | null;
}

export interface Article {
  articleId?: number;
  articleNom: string;
  articleModele: string;
  articleDescription?: string | null;
  productImageUrl?: string | null;
  // Purchase price for inventory-value tracking. Serialized as a string
  // (Prisma Decimal) on reads; accepts number on writes.
  purchasePrice?: string | number | null;
  sharedWithPowerUsers?: boolean;
  locationIds?: number[];
  locations?: Array<{ locationId: number; location?: { name: string } }>;
  // Tags: write via tagIds; reads carry the joined tags array.
  tagIds?: number[];
  tags?: Array<{ tagId: number; tag?: { name: string } }>;
  garantie?: ArticleWarranty | null;
}

export interface Tag {
  tagId: number;
  name: string;
  articleCount?: number;
}

/** Article as returned by the API — always has an articleId and timestamps. */
export interface FetchedArticle extends Article {
  articleId: number;
  createdAt: string;
  updatedAt: string;
}
