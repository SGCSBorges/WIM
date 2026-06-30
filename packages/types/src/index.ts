/**
 * Shared domain types for WIM.
 *
 * These describe the shape of objects exchanged between the API and the web
 * client. **Keep this file framework-free** — no Zod, no `@prisma/client`,
 * no React, no Node-only types — so it can be imported from both Node and
 * browser bundles without pulling extra deps.
 *
 * Two patterns live here:
 *
 *   1. Plain interfaces for response shapes (`Article`, `FetchedArticle`,
 *      `ShareInviteItem`, `DashboardStatistics`, …). The API layer wraps
 *      each in a Zod schema (apps/api/src/modules/&#42;&#42;/&#42;.schemas.ts) — that's
 *      where parsing + refinements live.
 *   2. `as const` tuples (AUDIT_ACTIONS, AUDIT_ENTITIES, ARTICLE_NOTE_KINDS,
 *      ATTACHMENT_TYPES, INVITE_STATUSES, SHARE_PERMISSIONS) — the single
 *      source of truth for string unions appearing on both sides. The tuple
 *      is iterable at runtime (e.g. to populate a &lt;select&gt;) and the
 *      derived `(typeof TUPLE)[number]` type stays in lock-step with no
 *      extra maintenance. New value? Add it to the tuple here and any
 *      consumer that iterated for a dropdown picks it up automatically.
 */

/** A user-owned location (a place the user keeps things). Articles join to
 *  Location through the ArticleLocation junction; a location may carry
 *  many articles, and an article may sit in many locations. */
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
  "WARRANTY_RENEW",
  "WARRANTY_EXTEND",
  "ARTICLE_TRANSFER_INIT",
  "ARTICLE_TRANSFER_ACCEPT",
  "ARTICLE_TRANSFER_REJECT",
  "ARTICLE_TRANSFER_REVOKE",
  "MESSAGE_THREAD_CREATE",
  "MESSAGE_SEND",
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
  "ArticleTransfer",
  "MessageThread",
  "Loan",
  "InsurancePolicy",
  "ServiceRecord",
] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

/** Warranty claim workflow state. NONE = no claim opened yet; the others
 *  trace a workflow from filing through resolution. Surfaced on the
 *  warranty row + the article timeline + the iCal feed. */
export type ClaimStatus =
  | "NONE"
  | "OPEN"
  | "APPROVED"
  | "REJECTED"
  | "RESOLVED";

/** Warranty as embedded on an Article response (1:1 — at most one
 *  warranty per article). Includes provider contact metadata that prints
 *  on the claim PDF. */
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
  providerName?: string | null;
  providerPhone?: string | null;
  providerUrl?: string | null;
  /** Set the first time the warranty is renewed or extended; null = never. */
  renewedAt?: string | null;
  garantieImageAttachment?: {
    fileName: string;
    mimeType: string;
    fileUrl: string;
  } | null;
}

/** The main inventory item. articleId is optional because the same shape
 *  serves both create-request bodies (no id) and read responses
 *  (`FetchedArticle` narrows it to required). The write-side uses
 *  `locationIds` + `tagIds`; the read-side carries the joined arrays. */
export interface Article {
  articleId?: number;
  articleNom: string;
  articleModele: string;
  articleDescription?: string | null;
  serialNumber?: string | null;
  brand?: string | null;
  productImageUrl?: string | null;
  // Purchase price for inventory-value tracking. Serialized as a string
  // (Prisma Decimal) on reads; accepts number on writes.
  purchasePrice?: string | number | null;
  // Annual straight-line depreciation rate as a percentage (0–100). Null/
  // absent = no depreciation. String on reads (Prisma Decimal), number on writes.
  depreciationRate?: string | number | null;
  sharedWithPowerUsers?: boolean;
  // Lifecycle state. Defaults to ACTIVE server-side; absent on legacy writes.
  status?: ArticleStatus;
  // Optional broad category (null/absent = uncategorized).
  category?: ArticleCategory | null;
  locationIds?: number[];
  locations?: Array<{ locationId: number; location?: { name: string } }>;
  // Tags: write via tagIds; reads carry the joined tags array.
  tagIds?: number[];
  tags?: Array<{ tagId: number; tag?: { name: string } }>;
  garantie?: ArticleWarranty | null;
}

/** Tag as returned by GET /api/tags. `articleCount` is the per-tag size
 *  rendered in the Tags manager and the tag dropdowns. */
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

/** Sortable column on the articles list. Keep in sync with the API's
 *  Prisma `orderBy` whitelist in `article.service.ts`. */
export type ArticleSort =
  | "articleId"
  | "articleNom"
  | "purchasePrice"
  | "createdAt";

/** Query parameters accepted by `GET /api/articles`. Every field is
 *  optional; omitting them returns the full owner-scoped list. `q` runs
 *  the trigram search; the warranty/price/createdAt filters compose via
 *  AND with each other and with `locationId`/`tagId`. */
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
  // Filter to a single lifecycle status (e.g. only SOLD, or only ACTIVE).
  status?: ArticleStatus;
  // Filter to a single category.
  category?: ArticleCategory;
  sort?: ArticleSort;
  dir?: "asc" | "desc";
  page?: number;
  limit?: number;
}

/** Paginated list payload returned by `GET /api/articles`. `total` is
 *  the count after filters (not the owner's grand total) so the UI can
 *  compute "page N of M". */
export interface ArticleListResult {
  items: FetchedArticle[];
  total: number;
  page: number;
  limit: number;
}

/** Per-note category surfaced on the article timeline. Drives the
 *  badge color + the icon, nothing else — kind is informational only. */
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

/** Lifecycle state of an item. ACTIVE is the default; the rest are
 *  organizational (kept in the inventory, surfaced as a badge + list filter).
 *  Mirrors the Prisma `ArticleStatus` enum — keep both in lock-step. */
export const ARTICLE_STATUSES = [
  "ACTIVE",
  "IN_REPAIR",
  "LOANED",
  "SOLD",
  "DISPOSED",
  "LOST",
] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

/** Statuses where the item has left the owner's possession. These are kept in
 *  the inventory for the record but are excluded from "what you currently own"
 *  value totals (dashboard inventory value + insurance portfolio report).
 *  IN_REPAIR / LOANED are still owned, so they continue to count. */
export const NOT_OWNED_STATUSES: ArticleStatus[] = ["SOLD", "DISPOSED", "LOST"];

/** Broad top-level category — a structured complement to free-form tags.
 *  Optional on an article (absent = uncategorized). Mirrors the Prisma
 *  `ArticleCategory` enum — keep both in lock-step. */
export const ARTICLE_CATEGORIES = [
  "ELECTRONICS",
  "APPLIANCE",
  "FURNITURE",
  "TOOL",
  "VEHICLE",
  "CLOTHING",
  "JEWELRY",
  "SPORTS",
  "COLLECTIBLE",
  "OTHER",
] as const;
export type ArticleCategory = (typeof ARTICLE_CATEGORIES)[number];

/** A free-form note attached to an article (service log, warranty
 *  claim record, etc.). Ordered newest-first by the article detail
 *  view. */
export interface ArticleNote {
  noteId: number;
  articleId: number;
  content: string;
  kind?: ArticleNoteKind;
  createdAt: string;
  updatedAt?: string;
}

/** A persisted "search/filter preset" — the serialized querystring
 *  the user named (e.g. "expiring this month"). The web client
 *  re-applies `query` directly to the URL on click. */
export interface SavedView {
  id: number;
  name: string;
  query: string;
}

/** Warranty as returned by `GET /api/warranties` (the standalone list,
 *  not the embedded `Article.garantie`). `garantieArticleId` is
 *  nullable for warranties created before the article-link feature. */
export interface WarrantyItem {
  garantieId: number;
  garantieNom: string;
  garantieDateAchat: string;
  garantieDuration: number;
  garantieFin: string;
  garantieIsValide: boolean;
  garantieArticleId: number | null;
  /** Set the first time the warranty is renewed or extended; null = never. */
  renewedAt?: string | null;
}

/** Renew = replace the live warranty's dates outright (new contract).
 *  Extend = roll the existing end date forward by N months (in-place).
 *  Both snapshot the prior state into WarrantyHistory. */
export type WarrantyHistoryEvent = "RENEWED" | "EXTENDED" | "REPLACED";

/** One entry in a warranty's renewal/extension audit. `prior*` fields pin
 *  what the warranty looked like *before* the change so the UI can walk the
 *  chain backwards through time. */
export interface WarrantyHistoryItem {
  id: number;
  garantieId: number;
  event: WarrantyHistoryEvent;
  priorDateAchat: string;
  priorDuration: number;
  priorFin: string;
  note?: string | null;
  createdAt: string;
}

export interface WarrantyRenewRequest {
  garantieDateAchat: string;
  garantieDuration: number;
  providerName?: string | null;
  providerPhone?: string | null;
  providerUrl?: string | null;
  note?: string | null;
}

export interface WarrantyExtendRequest {
  months: number;
  note?: string | null;
}

/** A per-user inventory share as seen by the *owner*. `active=false`
 *  means the share was deactivated (role downgrade or owner revoke)
 *  but the row is kept for audit. The recipient view uses
 *  `SharedArticleRow` instead. */
export interface ShareItem {
  inventoryShareId: number;
  permission: "READ" | "WRITE";
  active: boolean;
  createdAt: string;
  updatedAt: string;
  target: { userId: number; email: string };
}

export const INVITE_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "REVOKED",
  "EXPIRED",
] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

export const SHARE_PERMISSIONS = ["READ", "WRITE"] as const;
export type SharePermission = (typeof SHARE_PERMISSIONS)[number];

/** A pending/processed share invitation (POWER_USER → POWER_USER).
 *  `token` is the opaque accept link; `usedAt` is set when the invitee
 *  accepts and the matching `InventoryShare` is created. Status drives
 *  the owner's "manage invites" UI. */
export interface ShareInviteItem {
  shareInviteId: number;
  email: string;
  token: string;
  status: InviteStatus;
  permission: SharePermission;
  expiresAt: string;
  usedAt?: string;
  createdAt: string;
}

/** One row in the recipient's `/sharing` page. Collapses both share
 *  flavors into a uniform shape: `source` distinguishes a per-user
 *  InventoryShare from the owner's public toggle. `rowId` is synthetic
 *  (composed by the API) so React lists have a stable key across the
 *  two sources. */
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
    // Brand is public; the shared list exposes it for the read-only "view item"
    // hero card. Private fields (serialNumber / purchasePrice / depreciationRate
    // and warranty provider/claim details) are NOT serialized across the
    // sharing boundary — see sharedArticleSelect in shared.routes.ts.
    brand?: string | null;
    createdAt: string;
    updatedAt: string;
    garantie?: {
      garantieId: number;
      garantieNom: string;
      garantieDateAchat?: string;
      garantieFin: string;
      garantieIsValide: boolean;
    } | null;
    locations?: Array<{ locationId: number; location?: { name: string } }>;
    ownerUserId: number;
  };
  createdAt: string;
  updatedAt: string;
}

export type TransferStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "REVOKED"
  | "EXPIRED";
export type TransferDirection = "PUSH" | "PULL";

/** A transfer request as returned by GET /articles/transfers/incoming|outgoing */
export interface TransferItem {
  id: number;
  articleId: number;
  direction: TransferDirection;
  status: TransferStatus;
  token: string;
  message?: string | null;
  expiresAt: string;
  usedAt?: string | null;
  createdAt: string;
  article: {
    articleId: number;
    articleNom: string;
    articleModele: string;
    productImageUrl?: string | null;
  };
  requester: {
    userId: number;
    email: string;
  };
  owner: {
    userId: number;
    email: string;
  };
}

/** The user's live Stripe subscription as returned by
 *  `GET /api/billing/me`. Mirrors Stripe's terminology (status strings
 *  are Stripe's own — `active`, `past_due`, `canceled`, …). Unix
 *  epoch seconds, not ms, since they come straight from Stripe. */
export interface BillingSubscription {
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: number | null;
  cancelAt: number | null;
  endedAt: number | null;
  plan: "monthly" | "yearly" | null;
}

/** BullMQ-backed alert lifecycle. SCHEDULED rows have a pending job;
 *  SENT means the worker delivered (push/email); CANCELLED is a user
 *  snooze or warranty deletion; FAILED is set after retries exhaust. */
export type AlertStatus = "SCHEDULED" | "SENT" | "CANCELLED" | "FAILED";
/** WARRANTY = derived from a Garantie's J-30/J-7/J-1 reminders;
 *  CUSTOM = user-created standalone alert. The reminder worker reads
 *  this to decide which template to render. */
export type AlertKind = "WARRANTY" | "CUSTOM";

/** A scheduled or already-delivered reminder. Optional `garantie` and
 *  `article` joins let the UI link back without a second fetch. The
 *  legacy French `alerte*` field names are intentional — see the
 *  enum-rename note in `schema.prisma`. */
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

/** Notification-bell feed: scheduled alerts that are overdue or due within
 *  the next 30 days (soonest first, capped), plus the count created since
 *  the user last cleared the badge (`POST /api/alerts/mark-seen`). */
export interface AlertNotifications {
  items: AlertItem[];
  unseen: number;
}

/** Cross-device UI preferences persisted on the user. `null`/absent means
 *  "no server preference" — the client keeps its localStorage / system
 *  default. Enums mirror the client theme list, supported languages, and
 *  date-format options. */
export type ThemePref = "light" | "dark" | "ocean" | "cyber" | "sunset";
export type LanguagePref = "en" | "fr" | "pt" | "es" | "nl";
export type DateFormatPref =
  | "system"
  | "dd/MM/yyyy"
  | "MM/dd/yyyy"
  | "yyyy-MM-dd";

export interface UserPreferences {
  theme?: ThemePref | null;
  language?: LanguagePref | null;
  dateFormat?: DateFormatPref | null;
}

export const ATTACHMENT_TYPES = ["INVOICE", "WARRANTY", "OTHER"] as const;
export type AttachmentType = (typeof ATTACHMENT_TYPES)[number];

/** Uploaded file linked to an article and/or warranty. Both
 *  `articleId` and `garantieId` may be set (warranty attached to an
 *  article, then re-linked to the article timeline) or just one.
 *  `thumbUrl` is populated for image MIME types by the upload pipeline. */
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

/** Aggregated counters + buckets for the `/dashboard` view. Computed
 *  server-side per request (no caching) from a handful of grouped
 *  Prisma queries. Counts here are *owner-scoped* — shared-in
 *  articles are excluded so the dashboard reflects what the user owns. */
export interface DashboardStatistics {
  /** The owner's display currency (e.g. "USD"), carried on the payload so the
   *  client can format money without a second /profile/me round-trip. */
  currency: string;
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
  // Populated by F3 dashboard forecasting; always present in the API
  // response. Round 10 promoted these to required so the API + shared type
  // agree (the API used to declare them required locally; the local interface
  // was dropped in T1).
  warrantyExpirationsByMonth: MonthlyBucket[];
  articlesAddedByMonth: MonthlyBucket[];
}

/** One month in the spend time-series. `amount` is what was acquired that
 *  month (by purchase/acquisition date); `cumulative` is the running portfolio
 *  acquisition cost through that month (the "value over time" trend line). */
export interface SpendBucket {
  month: string; // YYYY-MM
  amount: number;
  cumulative: number;
}

/** A loan/borrow record as returned by `/api/loans`. Dates are ISO strings;
 *  `returnedAt === null` means the item is still out. */
export interface LoanItem {
  loanId: number;
  articleId: number;
  borrowerName: string;
  borrowerEmail: string | null;
  loanedAt: string;
  dueAt: string | null;
  returnedAt: string | null;
  note: string | null;
  article: {
    articleId: number;
    articleNom: string;
    articleModele: string;
    productImageUrl: string | null;
  };
}

/** The privacy-safe public view of an article, served unauthenticated from
 *  `GET /api/public/items/:token`. Deliberately omits price, serial, owner,
 *  location, and any other sensitive field — only what's safe to show to
 *  anyone who scans the QR label. */
export interface PublicItem {
  articleNom: string;
  brand: string | null;
  articleModele: string;
  articleDescription: string | null;
  productImageUrl: string | null;
  category: ArticleCategory | null;
  warrantyActive: boolean | null;
}

/** A service / maintenance log entry as returned by `/api/service-records`.
 *  Dates are ISO strings; `cost` is a Decimal string (or null). */
export interface ServiceRecordItem {
  serviceId: number;
  articleId: number;
  performedAt: string;
  description: string;
  cost: string | number | null;
  provider: string | null;
  nextDueAt: string | null;
  createdAt: string;
}

/** A "service coming due" row from `/api/service-records/due` — the latest
 *  service per article whose scheduled next-due falls within the window. */
export interface ServiceDueItem {
  serviceId: number;
  articleId: number;
  nextDueAt: string;
  article: { articleId: number; articleNom: string };
}

/** A minimal article reference embedded in insurance payloads. */
export interface InsuredArticleRef {
  articleId: number;
  articleNom: string;
  articleModele: string;
  productImageUrl: string | null;
}

/** An insurance policy as returned by `/api/insurance`. Money fields are
 *  Decimal strings (or null); `renewalAt` is an ISO string. `articles` lists
 *  the items this policy covers. */
export interface InsurancePolicyItem {
  policyId: number;
  provider: string;
  policyNumber: string | null;
  premium: string | number | null;
  coverageAmount: string | number | null;
  renewalAt: string | null;
  note: string | null;
  createdAt: string;
  articles: InsuredArticleRef[];
}

/** Spend-against-budget snapshot for the current calendar month and year.
 *  `budget === null` means no budget is set for that period; `spend` is always
 *  present (sum of purchase prices for items acquired in the period). */
export interface BudgetStatus {
  currency: string;
  monthlyBudget: number | null;
  monthlySpend: number;
  annualBudget: number | null;
  annualSpend: number;
}

/** A single article weighted by its current (depreciated) value. */
export interface ValuedArticle {
  articleId: number;
  name: string;
  value: number;
}

/** Payload for `GET /api/statistics/analytics` — the spending & value picture.
 *  All figures are owner-scoped and exclude NOT_OWNED_STATUSES (current
 *  holdings only), matching the dashboard's value rule. */
export interface PortfolioAnalytics {
  totalSpend: number; // sum of purchase prices
  currentValue: number; // sum of depreciated current values
  itemsPriced: number; // articles that carry a price
  spendByMonth: SpendBucket[];
  byLocation: Array<{ locationId: number; name: string; value: number }>;
  byTag: Array<{ tagId: number; name: string; value: number }>;
  // Spend grouped by category key (ARTICLE_CATEGORIES); "UNCATEGORIZED" for
  // items with no category. The client maps keys to localized labels.
  byCategory: Array<{ category: string; value: number }>;
  topItems: ValuedArticle[];
}
