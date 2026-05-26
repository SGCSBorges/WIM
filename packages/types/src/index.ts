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

export type ClaimStatus =
  | "NONE"
  | "OPEN"
  | "APPROVED"
  | "REJECTED"
  | "RESOLVED";

export interface ArticleWarranty {
  garantieId?: number;
  garantieNom: string;
  garantieDateAchat: string;
  garantieDuration: number;
  garantieFin?: string | null;
  garantieIsValide?: boolean;
  garantieImageAttachmentId?: number | null;
  claimStatus?: ClaimStatus;
  claimNote?: string | null;
  claimUpdatedAt?: string | null;
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
  // Annual straight-line depreciation rate as a percentage (0–100). Null/
  // absent = no depreciation. String on reads (Prisma Decimal), number on writes.
  depreciationRate?: string | number | null;
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

export interface ArticleListParams {
  locationId?: number;
  tagId?: number;
  q?: string;
  warrantyStatus?: "valid" | "expiringSoon" | "expired" | "none";
  priceMin?: number;
  priceMax?: number;
  page?: number;
  limit?: number;
}

export interface ArticleListResult {
  items: FetchedArticle[];
  total: number;
  page: number;
  limit: number;
}

export interface ArticleNote {
  noteId: number;
  articleId: number;
  content: string;
  createdAt: string;
}

export interface SavedView {
  id: number;
  name: string;
  query: string;
}

export interface WarrantyItem {
  garantieId: number;
  garantieNom: string;
  garantieDateAchat: string;
  garantieDuration: number;
  garantieFin: string;
  garantieIsValide: boolean;
  garantieArticleId: number | null;
}

export interface ShareItem {
  inventoryShareId: number;
  permission: "READ" | "WRITE";
  active: boolean;
  createdAt: string;
  updatedAt: string;
  target: { userId: number; email: string };
}

export interface ShareInviteItem {
  shareInviteId: number;
  email: string;
  token: string;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  permission: "READ" | "WRITE";
  expiresAt: string;
  usedAt?: string;
  createdAt: string;
}

export interface SharedArticleRow {
  rowId: number;
  /** "user" = via per-user InventoryShare; "global" = via owner toggling sharedWithPowerUsers. */
  source: "user" | "global";
  permission: "READ" | "WRITE";
  owner: { userId: number; email: string };
  article: {
    articleId: number;
    articleNom: string;
    articleModele: string;
    articleDescription?: string | null;
    productImageUrl?: string | null;
    createdAt: string;
    updatedAt: string;
    garantie?: {
      garantieId: number;
      garantieNom: string;
      garantieFin: string;
      garantieIsValide: boolean;
    } | null;
    locations?: Array<{ locationId: number; location?: { name: string } }>;
    ownerUserId: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface BillingSubscription {
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: number | null;
  cancelAt: number | null;
  endedAt: number | null;
  plan: "monthly" | "yearly" | null;
}
