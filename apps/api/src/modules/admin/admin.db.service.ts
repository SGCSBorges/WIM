/**
 * Full-database export + import. ADMIN-only operations exposed through
 * /api/admin/db/{export,import}. The export is a structured JSON dump of
 * every table; the import REPLACES every table (with a password tripwire
 * + optional Stripe-id stripping). Used for ops/maintenance — not a user-
 * facing feature.
 */
import { z } from "zod";
import { prisma } from "../../libs/prisma";
import { createHttpError } from "../../utils/http-error";
import { logger } from "../../config/logger";

// Bumped whenever the on-disk JSON shape changes in a backwards-incompatible
// way. Imports against a higher version are refused so a newer dump never
// silently writes rows into an older deployment.
const FORMAT_VERSION = 2;

// ----- Shared date coercions ------------------------------------------------

const DateLike = z.union([z.string(), z.date()]).transform((v) => new Date(v));
const NullableDate = z
  .union([z.string(), z.date(), z.null()])
  .nullable()
  .transform((v) => (v == null ? null : new Date(v)));

// ----- Zod shapes for the import file ----------------------------------------
//
// These mirror every column this service reads/writes. Stricter than "accept
// anything" but lenient enough to tolerate extra top-level keys the dumper
// wrote but this schema doesn't know about (backwards compatibility).
// Passthrough keeps unknown keys so future-schema dumps don't silently drop
// columns when restored against an older codebase.

const UserSchema = z
  .object({
    userId: z.number().int().positive(),
    email: z.string(),
    password: z.string(),
    role: z.enum(["USER", "POWER_USER", "ADMIN"]),
    tokenVersion: z.number().int().nonnegative().default(0),
    stripeCustomerId: z.string().nullable().optional(),
    stripeSubscriptionId: z.string().nullable().optional(),
    currency: z.string().default("USD"),
    calendarToken: z.string().nullable().optional(),
    emailReminders: z.boolean().default(true),
    weeklyDigest: z.boolean().default(false),
    theme: z.string().nullable().optional(),
    language: z.string().nullable().optional(),
    dateFormat: z.string().nullable().optional(),
    alertsSeenAt: NullableDate.optional(),
    totpEnabled: z.boolean().default(false),
    createdAt: DateLike,
    updatedAt: DateLike,
  })
  .passthrough();

const LocationSchema = z
  .object({
    locationId: z.number().int().positive(),
    ownerUserId: z.number().int().positive(),
    name: z.string(),
    description: z.string().nullable().optional(),
    createdAt: DateLike,
    updatedAt: DateLike,
  })
  .passthrough();

const TagSchema = z
  .object({
    tagId: z.number().int().positive(),
    ownerUserId: z.number().int().positive(),
    name: z.string(),
    createdAt: DateLike,
  })
  .passthrough();

const ArticleSchema = z
  .object({
    articleId: z.number().int().positive(),
    ownerUserId: z.number().int().positive(),
    articleNom: z.string(),
    articleModele: z.string(),
    articleDescription: z.string().nullable().optional(),
    productImageUrl: z.string().nullable().optional(),
    serialNumber: z.string().nullable().optional(),
    brand: z.string().nullable().optional(),
    // Prisma serialises Decimal as a string in JSON.
    purchasePrice: z.union([z.string(), z.number()]).nullable().optional(),
    depreciationRate: z.union([z.string(), z.number()]).nullable().optional(),
    sharedWithPowerUsers: z.boolean().default(false),
    deletedAt: NullableDate.optional(),
    createdAt: DateLike,
    updatedAt: DateLike,
  })
  .passthrough();

const ArticleTagSchema = z.object({
  articleId: z.number().int().positive(),
  tagId: z.number().int().positive(),
});

const ArticleLocationSchema = z.object({
  articleId: z.number().int().positive(),
  locationId: z.number().int().positive(),
  assignedAt: DateLike,
});

const ArticleNoteSchema = z
  .object({
    noteId: z.number().int().positive(),
    articleId: z.number().int().positive(),
    ownerUserId: z.number().int().positive(),
    content: z.string(),
    kind: z
      .enum(["SERVICE", "WARRANTY_CLAIM", "MAINTENANCE", "OTHER"])
      .default("OTHER"),
    createdAt: DateLike,
    updatedAt: DateLike,
  })
  .passthrough();

const ArticleTemplateSchema = z
  .object({
    id: z.number().int().positive(),
    ownerUserId: z.number().int().positive(),
    name: z.string(),
    payload: z.unknown().default({}),
    createdAt: DateLike,
    updatedAt: DateLike,
  })
  .passthrough();

const GarantieSchema = z
  .object({
    garantieId: z.number().int().positive(),
    ownerUserId: z.number().int().positive(),
    garantieArticleId: z.number().int().positive().nullable().optional(),
    garantieNom: z.string(),
    garantieDateAchat: DateLike,
    garantieDuration: z.number().int(),
    garantieFin: DateLike,
    garantieIsValide: z.boolean().default(true),
    garantieImageAttachmentId: z.number().int().positive().nullable().optional(),
    claimStatus: z
      .enum(["NONE", "OPEN", "APPROVED", "REJECTED", "RESOLVED"])
      .default("NONE"),
    claimNote: z.string().nullable().optional(),
    claimUpdatedAt: NullableDate.optional(),
    providerName: z.string().nullable().optional(),
    providerPhone: z.string().nullable().optional(),
    providerUrl: z.string().nullable().optional(),
    renewedAt: NullableDate.optional(),
    createdAt: DateLike,
    updatedAt: DateLike,
  })
  .passthrough();

const WarrantyHistorySchema = z
  .object({
    id: z.number().int().positive(),
    garantieId: z.number().int().positive(),
    ownerUserId: z.number().int().positive(),
    event: z.enum(["RENEWED", "EXTENDED", "REPLACED"]),
    priorDateAchat: DateLike,
    priorDuration: z.number().int(),
    priorFin: DateLike,
    note: z.string().nullable().optional(),
    createdAt: DateLike,
  })
  .passthrough();

const AttachmentSchema = z
  .object({
    attachmentId: z.number().int().positive(),
    ownerUserId: z.number().int().positive(),
    type: z.enum(["INVOICE", "WARRANTY", "OTHER"]).default("INVOICE"),
    articleId: z.number().int().positive().nullable().optional(),
    garantieId: z.number().int().positive().nullable().optional(),
    fileName: z.string(),
    mimeType: z.string(),
    fileSize: z.number().int(),
    fileUrl: z.string(),
    thumbUrl: z.string().nullable().optional(),
    createdAt: DateLike,
    updatedAt: DateLike,
  })
  .passthrough();

const AlerteSchema = z
  .object({
    alerteId: z.number().int().positive(),
    ownerUserId: z.number().int().positive(),
    alerteNom: z.string(),
    alerteDate: DateLike,
    alerteDescription: z.string().nullable().optional(),
    status: z
      .enum(["SCHEDULED", "SENT", "CANCELLED", "FAILED"])
      .default("SCHEDULED"),
    kind: z.enum(["WARRANTY", "CUSTOM"]).default("WARRANTY"),
    recurrenceMonths: z.number().int().nullable().optional(),
    snoozedUntil: NullableDate.optional(),
    sentAt: NullableDate.optional(),
    failedAt: NullableDate.optional(),
    errorMessage: z.string().nullable().optional(),
    errorStack: z.string().nullable().optional(),
    alerteGarantieId: z.number().int().positive().nullable().optional(),
    alerteArticleId: z.number().int().positive().nullable().optional(),
    createdAt: DateLike,
    updatedAt: DateLike,
  })
  .passthrough();

const TotpSecretSchema = z
  .object({
    id: z.number().int().positive(),
    userId: z.number().int().positive(),
    secret: z.string(),
    backupCodesHash: z.string(),
    verified: z.boolean().default(false),
    createdAt: DateLike,
    updatedAt: DateLike,
  })
  .passthrough();

const SavedViewSchema = z
  .object({
    id: z.number().int().positive(),
    ownerUserId: z.number().int().positive(),
    name: z.string(),
    query: z.string(),
    createdAt: DateLike,
  })
  .passthrough();

const InventoryShareSchema = z
  .object({
    inventoryShareId: z.number().int().positive(),
    ownerUserId: z.number().int().positive(),
    targetUserId: z.number().int().positive(),
    permission: z.enum(["READ", "WRITE"]).default("READ"),
    active: z.boolean().default(true),
    createdAt: DateLike,
    updatedAt: DateLike,
  })
  .passthrough();

const ShareInviteSchema = z
  .object({
    shareInviteId: z.number().int().positive(),
    ownerUserId: z.number().int().positive(),
    email: z.string(),
    token: z.string(),
    status: z
      .enum(["PENDING", "ACCEPTED", "REVOKED", "EXPIRED"])
      .default("PENDING"),
    permission: z.enum(["READ", "WRITE"]).default("READ"),
    expiresAt: DateLike,
    usedAt: NullableDate.optional(),
    createdAt: DateLike,
    updatedAt: DateLike,
  })
  .passthrough();

const ArticleTransferRequestSchema = z
  .object({
    id: z.number().int().positive(),
    articleId: z.number().int().positive(),
    requesterId: z.number().int().positive(),
    ownerId: z.number().int().positive(),
    direction: z.enum(["PUSH", "PULL"]),
    token: z.string(),
    status: z.string(),
    message: z.string().nullable().optional(),
    expiresAt: DateLike,
    usedAt: NullableDate.optional(),
    createdAt: DateLike,
    updatedAt: DateLike,
  })
  .passthrough();

const AuditLogSchema = z
  .object({
    id: z.number().int().positive(),
    userId: z.number().int().positive().nullable().optional(),
    action: z.string(),
    entity: z.string(),
    entityId: z.number().int().positive().nullable().optional(),
    ip: z.string().nullable().optional(),
    userAgent: z.string().nullable().optional(),
    method: z.string().nullable().optional(),
    path: z.string().nullable().optional(),
    status: z.number().int().nullable().optional(),
    metadata: z.unknown().default({}),
    createdAt: DateLike,
  })
  .passthrough();

const ProcessedStripeEventSchema = z.object({
  eventId: z.string(),
  type: z.string(),
  processedAt: DateLike,
});

const FeatureFlagSchema = z
  .object({
    id: z.number().int().positive(),
    featureKey: z.string(),
    requiredRole: z.enum(["USER", "POWER_USER", "ADMIN"]).default("USER"),
    updatedAt: DateLike,
  })
  .passthrough();

const FeatureTempGrantSchema = z
  .object({
    id: z.number().int().positive(),
    featureKey: z.string(),
    expiresAt: DateLike,
    note: z.string().nullable().optional(),
    createdAt: DateLike,
  })
  .passthrough();

export const ImportPayloadSchema = z.object({
  version: z.literal(FORMAT_VERSION),
  app: z.literal("wim").optional(),
  exportedAt: z.string().optional(),
  tables: z.object({
    users: z.array(UserSchema),
    locations: z.array(LocationSchema),
    tags: z.array(TagSchema),
    articles: z.array(ArticleSchema),
    articleTags: z.array(ArticleTagSchema),
    articleLocations: z.array(ArticleLocationSchema),
    articleNotes: z.array(ArticleNoteSchema),
    articleTemplates: z.array(ArticleTemplateSchema),
    garanties: z.array(GarantieSchema),
    warrantyHistory: z.array(WarrantyHistorySchema),
    attachments: z.array(AttachmentSchema),
    alertes: z.array(AlerteSchema),
    totpSecrets: z.array(TotpSecretSchema),
    savedViews: z.array(SavedViewSchema),
    inventoryShares: z.array(InventoryShareSchema),
    shareInvites: z.array(ShareInviteSchema),
    articleTransferRequests: z.array(ArticleTransferRequestSchema),
    auditLogs: z.array(AuditLogSchema),
    processedStripeEvents: z.array(ProcessedStripeEventSchema),
    featureFlags: z.array(FeatureFlagSchema),
    featureTempGrants: z.array(FeatureTempGrantSchema),
  }),
});

export type ImportPayload = z.infer<typeof ImportPayloadSchema>;

// Tables that own an autoincrement primary key. After bulk-inserting rows
// with explicit ids we need to advance the sequence past MAX(id), otherwise
// the next nextval() returns 1 and collides with row #1 from the dump.
const SEQUENCE_TABLES: Array<{ table: string; column: string }> = [
  { table: "User", column: "userId" },
  { table: "Location", column: "locationId" },
  { table: "Tag", column: "tagId" },
  { table: "Article", column: "articleId" },
  { table: "ArticleNote", column: "noteId" },
  { table: "ArticleTemplate", column: "id" },
  { table: "Garantie", column: "garantieId" },
  { table: "WarrantyHistory", column: "id" },
  { table: "Attachment", column: "attachmentId" },
  { table: "Alerte", column: "alerteId" },
  { table: "TotpSecret", column: "id" },
  { table: "SavedView", column: "id" },
  { table: "InventoryShare", column: "inventoryShareId" },
  { table: "ShareInvite", column: "shareInviteId" },
  { table: "ArticleTransferRequest", column: "id" },
  { table: "AuditLog", column: "id" },
  { table: "FeatureFlag", column: "id" },
  { table: "FeatureTempGrant", column: "id" },
];

export const AdminDbService = {
  /**
   * Export every row of every model as a single JSON document.
   *
   * Excluded intentionally (ephemeral / device-bound):
   *   - UserSession — sessions are device-specific; a fresh login on the
   *     target deployment is safer than carrying stale session tokens across.
   *   - PasswordResetToken — short-lived; useless after migration.
   *   - PushSubscription — endpoint URLs are device-registered; they won't
   *     work on a different server origin.
   */
  async exportAll() {
    const [
      users,
      locations,
      tags,
      articles,
      articleTags,
      articleLocations,
      articleNotes,
      articleTemplates,
      garanties,
      warrantyHistory,
      attachments,
      alertes,
      totpSecrets,
      savedViews,
      inventoryShares,
      shareInvites,
      articleTransferRequests,
      auditLogs,
      processedStripeEvents,
      featureFlags,
      featureTempGrants,
    ] = await Promise.all([
      prisma.user.findMany(),
      prisma.location.findMany(),
      prisma.tag.findMany(),
      prisma.article.findMany(),
      prisma.articleTag.findMany(),
      prisma.articleLocation.findMany(),
      prisma.articleNote.findMany(),
      prisma.articleTemplate.findMany(),
      prisma.garantie.findMany(),
      prisma.warrantyHistory.findMany(),
      prisma.attachment.findMany(),
      prisma.alerte.findMany(),
      prisma.totpSecret.findMany(),
      prisma.savedView.findMany(),
      prisma.inventoryShare.findMany(),
      prisma.shareInvite.findMany(),
      prisma.articleTransferRequest.findMany(),
      prisma.auditLog.findMany(),
      prisma.processedStripeEvent.findMany(),
      prisma.featureFlag.findMany(),
      prisma.featureTempGrant.findMany(),
    ]);

    const counts = {
      users: users.length,
      locations: locations.length,
      tags: tags.length,
      articles: articles.length,
      articleTags: articleTags.length,
      articleLocations: articleLocations.length,
      articleNotes: articleNotes.length,
      articleTemplates: articleTemplates.length,
      garanties: garanties.length,
      warrantyHistory: warrantyHistory.length,
      attachments: attachments.length,
      alertes: alertes.length,
      totpSecrets: totpSecrets.length,
      savedViews: savedViews.length,
      inventoryShares: inventoryShares.length,
      shareInvites: shareInvites.length,
      articleTransferRequests: articleTransferRequests.length,
      auditLogs: auditLogs.length,
      processedStripeEvents: processedStripeEvents.length,
      featureFlags: featureFlags.length,
      featureTempGrants: featureTempGrants.length,
    };

    return {
      version: FORMAT_VERSION,
      app: "wim" as const,
      exportedAt: new Date().toISOString(),
      counts,
      tables: {
        users,
        locations,
        tags,
        articles,
        articleTags,
        articleLocations,
        articleNotes,
        articleTemplates,
        garanties,
        warrantyHistory,
        attachments,
        alertes,
        totpSecrets,
        savedViews,
        inventoryShares,
        shareInvites,
        articleTransferRequests,
        auditLogs,
        processedStripeEvents,
        featureFlags,
        featureTempGrants,
      },
    };
  },

  /**
   * Wipe the database and replace it with the rows from `payload`. Caller
   * must already have validated the JSON shape via ImportPayloadSchema.
   *
   * Strategy:
   *   1. TRUNCATE every table with RESTART IDENTITY + CASCADE in one
   *      statement. Resets autoincrement sequences too.
   *   2. Insert rows in topological order with createMany (per-table bulk).
   *      Break the Garantie <-> Attachment FK cycle by inserting Garantie
   *      with garantieImageAttachmentId = null, then patching it after the
   *      attachments land.
   *   3. setval() each sequence to MAX(id) so subsequent inserts don't
   *      collide.
   *
   * Whole thing is wrapped in a single transaction so a failure rolls back
   * to the pre-import state (the truncate too).
   *
   * `keepStripeIds=false` (default) strips `stripeCustomerId` and
   * `stripeSubscriptionId` from User rows on the way in. Stripe is global,
   * so importing into a different environment with the same ids would
   * misroute future webhooks / cancellations.
   */
  async importAll(
    payload: ImportPayload,
    options: { keepStripeIds?: boolean } = {}
  ) {
    const keepStripeIds = options.keepStripeIds === true;
    if (payload.version !== FORMAT_VERSION) {
      throw createHttpError(
        400,
        `Unsupported export version ${payload.version} (this server expects ${FORMAT_VERSION})`
      );
    }
    const t = payload.tables;
    // Refuse imports without at least one ADMIN. Otherwise the operator
    // locks themselves out of their freshly migrated database.
    const hasAdmin = t.users.some((u) => u.role === "ADMIN");
    if (!hasAdmin) {
      throw createHttpError(
        400,
        "Refusing to import a dump that contains no ADMIN user — you would be locked out"
      );
    }

    const usersForInsert = keepStripeIds
      ? t.users
      : t.users.map((u) => ({
          ...u,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
        }));

    const counts: Record<string, number> = {};

    await prisma.$transaction(
      async (tx) => {
        // Truncate everything in one statement so dependency order doesn't
        // matter. CASCADE handles FK dependents (Tag, ArticleTag, ArticleNote,
        // SavedView, TotpSecret, WarrantyHistory, etc. all cascade from
        // User/Article/Garantie). FeatureFlag/FeatureTempGrant have no FK
        // so they must be listed explicitly.
        await tx.$executeRawUnsafe(
          `TRUNCATE TABLE
            "FeatureTempGrant",
            "FeatureFlag",
            "AuditLog",
            "ProcessedStripeEvent",
            "ArticleTransferRequest",
            "ShareInvite",
            "InventoryShare",
            "SavedView",
            "TotpSecret",
            "Alerte",
            "WarrantyHistory",
            "Attachment",
            "Garantie",
            "ArticleNote",
            "ArticleTag",
            "ArticleLocation",
            "ArticleTemplate",
            "Article",
            "Tag",
            "Location",
            "User"
           RESTART IDENTITY CASCADE`
        );

        if (usersForInsert.length) {
          counts.users = (
            await tx.user.createMany({
              data: usersForInsert,
              skipDuplicates: false,
            })
          ).count;
        }
        if (t.locations.length) {
          counts.locations = (
            await tx.location.createMany({ data: t.locations })
          ).count;
        }
        if (t.tags.length) {
          counts.tags = (await tx.tag.createMany({ data: t.tags })).count;
        }
        if (t.articles.length) {
          counts.articles = (
            await tx.article.createMany({ data: t.articles })
          ).count;
        }
        if (t.articleTemplates.length) {
          counts.articleTemplates = (
            await tx.articleTemplate.createMany({
              data: t.articleTemplates.map((r) => ({
                ...r,
                payload: (r.payload ?? {}) as object,
              })),
            })
          ).count;
        }
        if (t.totpSecrets.length) {
          counts.totpSecrets = (
            await tx.totpSecret.createMany({ data: t.totpSecrets })
          ).count;
        }
        if (t.savedViews.length) {
          counts.savedViews = (
            await tx.savedView.createMany({ data: t.savedViews })
          ).count;
        }
        if (t.garanties.length) {
          // First pass: clear the cyclic FK so Attachment can land first.
          const stripped = t.garanties.map((g) => ({
            ...g,
            garantieImageAttachmentId: null,
          }));
          counts.garanties = (
            await tx.garantie.createMany({ data: stripped })
          ).count;
        }
        if (t.attachments.length) {
          counts.attachments = (
            await tx.attachment.createMany({ data: t.attachments })
          ).count;
        }
        // Pass 2: re-link Garantie -> Attachment now that both exist.
        const garantiesWithImage = t.garanties.filter(
          (g) => g.garantieImageAttachmentId != null
        );
        for (const g of garantiesWithImage) {
          await tx.garantie.update({
            where: { garantieId: g.garantieId },
            data: { garantieImageAttachmentId: g.garantieImageAttachmentId },
          });
        }
        if (t.articleLocations.length) {
          counts.articleLocations = (
            await tx.articleLocation.createMany({ data: t.articleLocations })
          ).count;
        }
        if (t.articleTags.length) {
          counts.articleTags = (
            await tx.articleTag.createMany({ data: t.articleTags })
          ).count;
        }
        if (t.articleNotes.length) {
          counts.articleNotes = (
            await tx.articleNote.createMany({ data: t.articleNotes })
          ).count;
        }
        if (t.warrantyHistory.length) {
          counts.warrantyHistory = (
            await tx.warrantyHistory.createMany({ data: t.warrantyHistory })
          ).count;
        }
        if (t.alertes.length) {
          counts.alertes = (
            await tx.alerte.createMany({ data: t.alertes })
          ).count;
        }
        if (t.inventoryShares.length) {
          counts.inventoryShares = (
            await tx.inventoryShare.createMany({ data: t.inventoryShares })
          ).count;
        }
        if (t.shareInvites.length) {
          counts.shareInvites = (
            await tx.shareInvite.createMany({ data: t.shareInvites })
          ).count;
        }
        if (t.articleTransferRequests.length) {
          counts.articleTransferRequests = (
            await tx.articleTransferRequest.createMany({
              data: t.articleTransferRequests,
            })
          ).count;
        }
        if (t.auditLogs.length) {
          counts.auditLogs = (
            await tx.auditLog.createMany({
              data: t.auditLogs.map((row) => ({
                ...row,
                metadata: (row.metadata ?? {}) as object,
              })),
            })
          ).count;
        }
        if (t.processedStripeEvents.length) {
          counts.processedStripeEvents = (
            await tx.processedStripeEvent.createMany({
              data: t.processedStripeEvents,
            })
          ).count;
        }
        if (t.featureFlags.length) {
          counts.featureFlags = (
            await tx.featureFlag.createMany({ data: t.featureFlags })
          ).count;
        }
        if (t.featureTempGrants.length) {
          counts.featureTempGrants = (
            await tx.featureTempGrant.createMany({ data: t.featureTempGrants })
          ).count;
        }

        // Advance every autoincrement sequence past the highest inserted id.
        // setval(seq, n, true) makes the next nextval() return n + 1; if the
        // table is empty (n = 0) we use is_called=false so nextval() returns
        // 1 instead of 2.
        for (const { table, column } of SEQUENCE_TABLES) {
          await tx.$executeRawUnsafe(
            `SELECT setval(
               pg_get_serial_sequence('"${table}"', '${column}'),
               GREATEST(COALESCE((SELECT MAX("${column}") FROM "${table}"), 0), 1),
               (SELECT COUNT(*) FROM "${table}") > 0
             )`
          );
        }
      },
      { timeout: 120_000, maxWait: 10_000 }
    );

    logger.info({ counts }, "[admin.db] import complete");
    return { counts };
  },
};
