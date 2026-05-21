import { z } from "zod";
import { prisma } from "../../libs/prisma";
import { createHttpError } from "../../utils/http-error";
import { logger } from "../../config/logger";

// Bumped whenever the on-disk JSON shape changes in a backwards-incompatible
// way. Imports against a higher version are refused so a newer dump never
// silently writes rows into an older deployment.
const FORMAT_VERSION = 1;

// ----- Zod shapes for the import file --------------------------------------
//
// These mirror the columns this service reads/writes; tighter than the Prisma
// types because we want to reject bogus payloads (wrong field names, missing
// required values, junk in JSON metadata) BEFORE we wipe the existing data.

const DateLike = z.union([z.string(), z.date()]).transform((v) => new Date(v));
const NullableDate = z
  .union([z.string(), z.date(), z.null()])
  .nullable()
  .transform((v) => (v == null ? null : new Date(v)));

const UserSchema = z.object({
  userId: z.number().int().positive(),
  email: z.string(),
  password: z.string(),
  role: z.enum(["USER", "POWER_USER", "ADMIN"]),
  tokenVersion: z.number().int().nonnegative().default(0),
  stripeCustomerId: z.string().nullable().optional(),
  stripeSubscriptionId: z.string().nullable().optional(),
  createdAt: DateLike,
  updatedAt: DateLike,
});

const LocationSchema = z.object({
  locationId: z.number().int().positive(),
  ownerUserId: z.number().int().positive(),
  name: z.string(),
  description: z.string().nullable().optional(),
  createdAt: DateLike,
  updatedAt: DateLike,
});

const ArticleSchema = z.object({
  articleId: z.number().int().positive(),
  ownerUserId: z.number().int().positive(),
  articleNom: z.string(),
  articleModele: z.string(),
  articleDescription: z.string().nullable().optional(),
  productImageUrl: z.string().nullable().optional(),
  sharedWithPowerUsers: z.boolean().default(false),
  createdAt: DateLike,
  updatedAt: DateLike,
});

const ArticleLocationSchema = z.object({
  articleId: z.number().int().positive(),
  locationId: z.number().int().positive(),
  assignedAt: DateLike,
});

const GarantieSchema = z.object({
  garantieId: z.number().int().positive(),
  ownerUserId: z.number().int().positive(),
  garantieArticleId: z.number().int().positive().nullable().optional(),
  garantieNom: z.string(),
  garantieDateAchat: DateLike,
  garantieDuration: z.number().int(),
  garantieFin: DateLike,
  garantieIsValide: z.boolean().default(true),
  garantieImageAttachmentId: z.number().int().positive().nullable().optional(),
  createdAt: DateLike,
  updatedAt: DateLike,
});

const AttachmentSchema = z.object({
  attachmentId: z.number().int().positive(),
  ownerUserId: z.number().int().positive(),
  type: z.enum(["INVOICE", "WARRANTY", "OTHER"]).default("INVOICE"),
  articleId: z.number().int().positive().nullable().optional(),
  garantieId: z.number().int().positive().nullable().optional(),
  fileName: z.string(),
  mimeType: z.string(),
  fileSize: z.number().int(),
  fileUrl: z.string(),
  createdAt: DateLike,
  updatedAt: DateLike,
});

const AlerteSchema = z.object({
  alerteId: z.number().int().positive(),
  ownerUserId: z.number().int().positive(),
  alerteNom: z.string(),
  alerteDate: DateLike,
  alerteDescription: z.string().nullable().optional(),
  status: z
    .enum(["SCHEDULED", "SENT", "CANCELLED", "FAILED"])
    .default("SCHEDULED"),
  sentAt: NullableDate.optional(),
  failedAt: NullableDate.optional(),
  errorMessage: z.string().nullable().optional(),
  errorStack: z.string().nullable().optional(),
  alerteGarantieId: z.number().int().positive().nullable().optional(),
  alerteArticleId: z.number().int().positive().nullable().optional(),
  createdAt: DateLike,
  updatedAt: DateLike,
});

const InventoryShareSchema = z.object({
  inventoryShareId: z.number().int().positive(),
  ownerUserId: z.number().int().positive(),
  targetUserId: z.number().int().positive(),
  permission: z.enum(["READ", "WRITE"]).default("READ"),
  active: z.boolean().default(true),
  createdAt: DateLike,
  updatedAt: DateLike,
});

const ShareInviteSchema = z.object({
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
});

const AuditLogSchema = z.object({
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
});

const ProcessedStripeEventSchema = z.object({
  eventId: z.string(),
  type: z.string(),
  processedAt: DateLike,
});

export const ImportPayloadSchema = z.object({
  version: z.literal(FORMAT_VERSION),
  app: z.literal("wim").optional(),
  exportedAt: z.string().optional(),
  tables: z.object({
    users: z.array(UserSchema),
    locations: z.array(LocationSchema),
    articles: z.array(ArticleSchema),
    articleLocations: z.array(ArticleLocationSchema),
    garanties: z.array(GarantieSchema),
    attachments: z.array(AttachmentSchema),
    alertes: z.array(AlerteSchema),
    inventoryShares: z.array(InventoryShareSchema),
    shareInvites: z.array(ShareInviteSchema),
    auditLogs: z.array(AuditLogSchema),
    processedStripeEvents: z.array(ProcessedStripeEventSchema),
  }),
});

export type ImportPayload = z.infer<typeof ImportPayloadSchema>;

// Tables that own an autoincrement primary key. After bulk-inserting rows
// with explicit ids we need to advance the sequence past MAX(id), otherwise
// the next nextval() returns 1 and collides with row #1 from the dump.
const SEQUENCE_TABLES: Array<{ table: string; column: string }> = [
  { table: "User", column: "userId" },
  { table: "Location", column: "locationId" },
  { table: "Article", column: "articleId" },
  { table: "Garantie", column: "garantieId" },
  { table: "Attachment", column: "attachmentId" },
  { table: "Alerte", column: "alerteId" },
  { table: "InventoryShare", column: "inventoryShareId" },
  { table: "ShareInvite", column: "shareInviteId" },
  { table: "AuditLog", column: "id" },
];

export const AdminDbService = {
  /**
   * Export every row of every model as a single JSON document. Streaming
   * would be nicer for very large datasets, but personal-inventory installs
   * stay small and a single payload is far easier to validate on the way
   * back in.
   */
  async exportAll() {
    const [
      users,
      locations,
      articles,
      articleLocations,
      garanties,
      attachments,
      alertes,
      inventoryShares,
      shareInvites,
      auditLogs,
      processedStripeEvents,
    ] = await Promise.all([
      prisma.user.findMany(),
      prisma.location.findMany(),
      prisma.article.findMany(),
      prisma.articleLocation.findMany(),
      prisma.garantie.findMany(),
      prisma.attachment.findMany(),
      prisma.alerte.findMany(),
      prisma.inventoryShare.findMany(),
      prisma.shareInvite.findMany(),
      prisma.auditLog.findMany(),
      prisma.processedStripeEvent.findMany(),
    ]);

    return {
      version: FORMAT_VERSION,
      app: "wim" as const,
      exportedAt: new Date().toISOString(),
      counts: {
        users: users.length,
        locations: locations.length,
        articles: articles.length,
        articleLocations: articleLocations.length,
        garanties: garanties.length,
        attachments: attachments.length,
        alertes: alertes.length,
        inventoryShares: inventoryShares.length,
        shareInvites: shareInvites.length,
        auditLogs: auditLogs.length,
        processedStripeEvents: processedStripeEvents.length,
      },
      tables: {
        users,
        locations,
        articles,
        articleLocations,
        garanties,
        attachments,
        alertes,
        inventoryShares,
        shareInvites,
        auditLogs,
        processedStripeEvents,
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
   */
  async importAll(payload: ImportPayload) {
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

    const counts: Record<string, number> = {};

    await prisma.$transaction(
      async (tx) => {
        // Truncate everything in one statement so dependency order doesn't
        // matter. CASCADE handles FK dependents; RESTART IDENTITY zeroes
        // the autoincrement sequences before we re-set them below.
        await tx.$executeRawUnsafe(
          `TRUNCATE TABLE
            "AuditLog",
            "ProcessedStripeEvent",
            "ShareInvite",
            "InventoryShare",
            "Alerte",
            "Attachment",
            "Garantie",
            "ArticleLocation",
            "Article",
            "Location",
            "User"
           RESTART IDENTITY CASCADE`
        );

        if (t.users.length) {
          counts.users = (
            await tx.user.createMany({ data: t.users, skipDuplicates: false })
          ).count;
        }
        if (t.locations.length) {
          counts.locations = (
            await tx.location.createMany({ data: t.locations })
          ).count;
        }
        if (t.articles.length) {
          counts.articles = (
            await tx.article.createMany({ data: t.articles })
          ).count;
        }
        if (t.garanties.length) {
          // First pass: clear the cyclic FK so Attachment can land. We
          // remember which rows want their image ref set so we can patch
          // them after.
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
          (g) =>
            g.garantieImageAttachmentId != null &&
            g.garantieImageAttachmentId !== undefined
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
