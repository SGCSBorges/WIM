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
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// Audit log action / entity unions. Defined as const tuples so both the API
// (which logs and validates them) and the web (which renders filter
// dropdowns) read from a single source of truth — no drift.
export const AUDIT_ACTIONS = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "LOGIN",
  "LOGOUT",
  "ACCEPT",
  "FORCE_LOGOUT",
  "BILLING_CHECKOUT_STARTED",
  "BILLING_PORTAL_OPENED",
  "BILLING_CANCEL_REQUESTED",
  "BILLING_UPGRADE",
  "BILLING_DOWNGRADE",
  "DB_EXPORT",
  "DB_IMPORT",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITIES = [
  "Article",
  "Garantie",
  "Alerte",
  "User",
  "Location",
  "Attachment",
  "ShareInvite",
  "InventoryShare",
  "ArticleLocation",
  "Tag",
  "ArticleNote",
  "SavedView",
  "Database",
] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

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

export type ArticleSort =
  | "articleId"
  | "articleNom"
  | "purchasePrice"
  | "createdAt";

export interface ArticleListParams {
  locationId?: number;
  tagId?: number;
  q?: string;
  warrantyStatus?: "valid" | "expiringSoon" | "expired" | "none";
  priceMin?: number;
  priceMax?: number;
  // Inclusive createdAt range; ISO date strings (YYYY-MM-DD or full ISO).
  createdFrom?: string;
  createdTo?: string;
  sort?: ArticleSort;
  dir?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface ArticleListResult {
  items: FetchedArticle[];
  total: number;
  page: number;
  limit: number;
}

export type ArticleNoteKind =
  | "SERVICE"
  | "WARRANTY_CLAIM"
  | "MAINTENANCE"
  | "OTHER";

export const ARTICLE_NOTE_KINDS: ArticleNoteKind[] = [
  "SERVICE",
  "WARRANTY_CLAIM",
  "MAINTENANCE",
  "OTHER",
];

export interface ArticleNote {
  noteId: number;
  articleId: number;
  content: string;
  kind?: ArticleNoteKind;
  createdAt: string;
  updatedAt?: string;
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

export type AlertStatus = "SCHEDULED" | "SENT" | "CANCELLED" | "FAILED";
export type AlertKind = "WARRANTY" | "CUSTOM";

export interface AlertItem {
  alerteId: number;
  alerteNom: string;
  alerteDate: string;
  alerteDescription?: string | null;
  status: AlertStatus;
  kind?: AlertKind;
  recurrenceMonths?: number | null;
  snoozedUntil?: string | null;
  sentAt?: string | null;
  failedAt?: string | null;
  errorMessage?: string | null;
  alerteGarantieId?: number | null;
  alerteArticleId?: number | null;
  garantie?: {
    garantieId: number;
    garantieNom: string;
  } | null;
  article?: {
    articleId: number;
    articleNom: string;
    articleModele: string;
  } | null;
}

export type AttachmentType = "INVOICE" | "WARRANTY" | "OTHER";

export interface AttachmentItem {
  attachmentId: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileUrl: string;
  thumbUrl?: string | null;
  type: AttachmentType;
  createdAt: string;
  updatedAt?: string;
  articleId?: number | null;
  garantieId?: number | null;
  article?: {
    articleId: number;
    articleNom: string;
    articleModele: string;
  } | null;
  garantie?: {
    garantieId: number;
    garantieNom: string;
  } | null;
}

/** Monthly bucket for dashboard time-series. `month` is `YYYY-MM`. */
export interface MonthlyBucket {
  month: string;
  count: number;
}

export interface DashboardStatistics {
  articles: {
    total: number;
    withWarranty: number;
    withoutWarranty: number;
  };
  locations: {
    byLocation: Array<{
      locationId: number;
      name: string;
      articlesCount: number;
    }>;
    unassigned: number;
  };
  warranties: {
    total: number;
    active: number;
    expired: number;
    expiringSoon: number;
    withAttachment: number;
  };
  alerts: {
    total: number;
  };
  sharing: {
    ownedSharedArticles: number;
    totalSharedArticles: number;
  };
  inventoryValue: {
    total: number;
    currentTotal: number;
    atRisk: number;
    byLocation: Array<{ locationId: number; name: string; value: number }>;
    byTag: Array<{ tagId: number; name: string; value: number }>;
  };
  // Populated by F3 dashboard forecasting; optional so consumers guard with ?? [].
  warrantyExpirationsByMonth?: MonthlyBucket[];
  articlesAddedByMonth?: MonthlyBucket[];
}
