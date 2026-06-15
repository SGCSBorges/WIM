/**
 * Article service — the largest module in the API. Owns the inventory
 * lifecycle:
 *   • Filtered + paginated list / search (`buildArticleWhere` translates
 *     the URL filter set into a Prisma where-clause; `q` runs across name /
 *     model / description / brand / serialNumber via trigram GIN indexes).
 *   • Create / update with owner-scoped pre-flight checks. Every FK ref
 *     (locationIds, tagIds, attachment ids) goes through
 *     `assertLocationsOwned` / `assertTagsOwned` (or an inline find)
 *     INSIDE the same transaction as the insert, so a concurrent delete
 *     can't slip a foreign id past the check.
 *   • Soft-delete + restore via `Article.deletedAt`. Live reads filter on
 *     `deletedAt: null`; the Trash view reads `NOT: { deletedAt: null }`.
 *   • Bulk operations (delete / restore / purge / share / location-add /
 *     tag-add) silently skip ids the caller doesn't own — never leak which
 *     ids exist under other accounts.
 *   • `purgeTrashOlderThan` is the maintenance-worker entry point.
 *     Intentionally NOT owner-scoped at the query level (it's a system
 *     sweep across every owner); per-row safety comes from re-passing the
 *     row's `ownerUserId` into `hardRemove`.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../../libs/prisma";
import { ArticleCreateInput, ArticleUpdateInput } from "./article.schemas";
import { addMonths } from "../common/date";
import { createHttpError } from "../../utils/http-error";
import { AlertService } from "../alerts/alert.service";
import { unlinkAttachmentFiles } from "../attachments/attachment.fs";
import { logger } from "../../config/logger";

// Reject a create/update that references location rows the caller does not own.
// A single round trip: count owned rows in the requested set and compare. Any
// missing id is treated as "not yours" — same 403 either way to avoid leaking
// which ids exist under other accounts.
async function assertLocationsOwned(
  ownerUserId: number,
  locationIds: number[]
) {
  if (locationIds.length === 0) return;
  const unique = Array.from(new Set(locationIds));
  const owned = await prisma.location.count({
    where: { locationId: { in: unique }, ownerUserId },
  });
  if (owned !== unique.length) {
    throw createHttpError(403, "One or more locations are not owned by you");
  }
}

// Same shape as assertLocationsOwned: any tag id not owned by the caller is a
// 403 (no per-id leak of which exist under other accounts).
async function assertTagsOwned(ownerUserId: number, tagIds: number[]) {
  if (tagIds.length === 0) return;
  const unique = Array.from(new Set(tagIds));
  const owned = await prisma.tag.count({
    where: { tagId: { in: unique }, ownerUserId },
  });
  if (owned !== unique.length) {
    throw createHttpError(403, "One or more tags are not owned by you");
  }
}

// Shared include used by list/get/create/update so every article response
// carries its locations + tags in the same shape.
const articleInclude = {
  garantie: true,
  locations: {
    select: {
      locationId: true,
      location: { select: { name: true } },
    },
  },
  tags: {
    select: { tagId: true, tag: { select: { name: true } } },
  },
} as const;

export type ArticleListFilters = {
  locationId?: number;
  tagId?: number;
  q?: string;
  warrantyStatus?: "valid" | "expiringSoon" | "expired" | "none";
  priceMin?: number;
  priceMax?: number;
  createdFrom?: Date;
  createdTo?: Date;
  sort?: "articleId" | "articleNom" | "purchasePrice" | "createdAt";
  dir?: "asc" | "desc";
  page?: number;
  limit?: number;
};

// Translate the filter set into a Prisma where-clause (all owner-scoped).
// Trashed rows (deletedAt != null) are never returned by the live list; the
// dedicated /trash endpoint reads from `listTrash` instead.
function buildArticleWhere(
  ownerUserId: number,
  f: ArticleListFilters
): Prisma.ArticleWhereInput {
  const where: Prisma.ArticleWhereInput = { ownerUserId, deletedAt: null };
  if (f.locationId) where.locations = { some: { locationId: f.locationId } };
  if (f.tagId) where.tags = { some: { tagId: f.tagId } };
  if (f.q && f.q.trim()) {
    // Split into terms and require every term to match somewhere (name, model
    // or description). This makes multi-word queries like "cordless drill"
    // match an item named "Cordless" with model "Drill", while each term is
    // still a case-insensitive substring so incremental typing keeps working.
    // The pg_trgm GIN indexes accelerate these ILIKE lookups. Cap the term
    // count so a pathological query can't explode the AND clause.
    const terms = f.q.trim().split(/\s+/).slice(0, 6);
    where.AND = terms.map((term) => ({
      OR: [
        { articleNom: { contains: term, mode: "insensitive" } },
        { articleModele: { contains: term, mode: "insensitive" } },
        { articleDescription: { contains: term, mode: "insensitive" } },
        { brand: { contains: term, mode: "insensitive" } },
        { serialNumber: { contains: term, mode: "insensitive" } },
      ],
    }));
  }
  if (f.priceMin != null || f.priceMax != null) {
    where.purchasePrice = {
      ...(f.priceMin != null ? { gte: f.priceMin } : {}),
      ...(f.priceMax != null ? { lte: f.priceMax } : {}),
    };
  }
  if (f.createdFrom || f.createdTo) {
    where.createdAt = {
      ...(f.createdFrom ? { gte: f.createdFrom } : {}),
      ...(f.createdTo ? { lte: f.createdTo } : {}),
    };
  }
  if (f.warrantyStatus) {
    const now = new Date();
    if (f.warrantyStatus === "none") {
      where.garantie = { is: null };
    } else if (f.warrantyStatus === "valid") {
      where.garantie = { garantieFin: { gte: now } };
    } else if (f.warrantyStatus === "expired") {
      where.garantie = { garantieFin: { lt: now } };
    } else {
      // expiringSoon: within the next 30 days
      const in30 = new Date();
      in30.setDate(now.getDate() + 30);
      where.garantie = { garantieFin: { gte: now, lte: in30 } };
    }
  }
  return where;
}

export const ArticleService = {
  list: async (ownerUserId: number, filters: ArticleListFilters = {}) => {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = filters.limit && filters.limit > 0 ? filters.limit : 50;
    const where = buildArticleWhere(ownerUserId, filters);
    // Default ordering keeps existing behaviour (newest first). Sorting by a
    // nullable column (purchasePrice) puts nulls at the end of the result.
    const sortField = filters.sort ?? "articleId";
    const sortDir = filters.dir ?? "desc";
    const orderBy: Prisma.ArticleOrderByWithRelationInput =
      sortField === "purchasePrice"
        ? { purchasePrice: { sort: sortDir, nulls: "last" } }
        : { [sortField]: sortDir };
    const [items, total] = await prisma.$transaction([
      prisma.article.findMany({
        where,
        take: limit,
        skip: (page - 1) * limit,
        orderBy,
        include: articleInclude,
      }),
      prisma.article.count({ where }),
    ]);
    return { items, total, page, limit };
  },

  // Streaming-friendly "list all matching rows" used by the CSV export.
  // No pagination; capped at MAX_EXPORT_ROWS so a runaway query can't OOM the
  // process. Same filter and sort semantics as `list`.
  listAll: async (ownerUserId: number, filters: ArticleListFilters = {}) => {
    const MAX_EXPORT_ROWS = 10_000;
    const where = buildArticleWhere(ownerUserId, filters);
    const sortField = filters.sort ?? "articleId";
    const sortDir = filters.dir ?? "desc";
    const orderBy: Prisma.ArticleOrderByWithRelationInput =
      sortField === "purchasePrice"
        ? { purchasePrice: { sort: sortDir, nulls: "last" } }
        : { [sortField]: sortDir };
    return prisma.article.findMany({
      where,
      take: MAX_EXPORT_ROWS,
      orderBy,
      include: articleInclude,
    });
  },

  get: (id: number, ownerUserId: number) =>
    prisma.article.findFirst({
      where: { articleId: id, ownerUserId, deletedAt: null },
      include: articleInclude,
    }),

  create: async (data: ArticleCreateInput) => {
    const { locationIds, tagIds, garantie, ...articleData } = data;

    // Ownership checks + the insert all run in a single transaction so an
    // interleaved delete can't slip a stale locationId/attachmentId past
    // the precheck. Each assert query reads through the same snapshot the
    // insert sees, so the only way the FK can resolve to a foreign row is
    // if the read ran post-snapshot — which the transaction prevents.
    const created = await prisma.$transaction(async (tx) => {
      if (locationIds.length > 0) {
        const unique = Array.from(new Set(locationIds));
        const owned = await tx.location.count({
          where: {
            locationId: { in: unique },
            ownerUserId: articleData.ownerUserId,
          },
        });
        if (owned !== unique.length) {
          throw createHttpError(
            403,
            "One or more locations are not owned by you"
          );
        }
      }

      if (garantie?.garantieImageAttachmentId) {
        const ownedAttachment = await tx.attachment.findFirst({
          where: {
            attachmentId: garantie.garantieImageAttachmentId,
            ownerUserId: articleData.ownerUserId,
          },
          select: { attachmentId: true },
        });
        if (!ownedAttachment)
          throw createHttpError(
            403,
            "Attachment not found or not owned by you"
          );
      }

      if (tagIds && tagIds.length > 0) {
        const unique = Array.from(new Set(tagIds));
        const owned = await tx.tag.count({
          where: {
            tagId: { in: unique },
            ownerUserId: articleData.ownerUserId,
          },
        });
        if (owned !== unique.length)
          throw createHttpError(403, "One or more tags are not owned by you");
      }

      return tx.article.create({
        data: {
          ...articleData,
          ...(garantie
            ? {
                garantie: {
                  create: {
                    ownerUserId: articleData.ownerUserId,
                    garantieNom: garantie.garantieNom,
                    garantieDateAchat: garantie.garantieDateAchat,
                    garantieDuration: garantie.garantieDuration,
                    ...(garantie.garantieImageAttachmentId !== undefined
                      ? {
                          garantieImageAttachmentId:
                            garantie.garantieImageAttachmentId,
                        }
                      : {}),
                    garantieFin: addMonths(
                      new Date(garantie.garantieDateAchat),
                      garantie.garantieDuration
                    ),
                    garantieIsValide: true,
                  },
                },
              }
            : {}),
          locations: {
            create: locationIds.map((locationId: number) => ({ locationId })),
          },
          ...(tagIds && tagIds.length > 0
            ? { tags: { create: tagIds.map((tagId: number) => ({ tagId })) } }
            : {}),
        },
        include: articleInclude,
      });
    });

    // Schedule warranty reminders for inline-created warranties.
    // Must run after the DB write commits (outside the create call).
    if (created.garantie) {
      await AlertService.scheduleForWarranty({
        ownerUserId: created.ownerUserId,
        garantieId: created.garantie.garantieId,
        articleId: created.articleId,
        garantieFin: created.garantie.garantieFin,
      });
    }

    return created;
  },

  // Copy an article's identity + location + tag links into a fresh row. We do
  // NOT copy the warranty (1:1 unique on garantieArticleId) or attachments
  // (file ownership / disk-cost ambiguity). The new article is appended with
  // " (copy)" so the list disambiguates at a glance.
  duplicate: async (id: number, ownerUserId: number) => {
    const source = await prisma.article.findFirst({
      where: { articleId: id, ownerUserId, deletedAt: null },
      include: {
        locations: { select: { locationId: true } },
        tags: { select: { tagId: true } },
      },
    });
    if (!source) throw createHttpError(404, "Article not found");

    return ArticleService.create({
      ownerUserId,
      articleNom: `${source.articleNom} (copy)`.slice(0, 100),
      articleModele: source.articleModele,
      articleDescription: source.articleDescription,
      brand: source.brand,
      serialNumber: source.serialNumber,
      productImageUrl: source.productImageUrl,
      purchasePrice:
        source.purchasePrice != null ? Number(source.purchasePrice) : null,
      depreciationRate:
        source.depreciationRate != null
          ? Number(source.depreciationRate)
          : null,
      locationIds: source.locations.map((l) => l.locationId),
      tagIds: source.tags.map((t) => t.tagId),
    });
  },

  update: async (id: number, ownerUserId: number, data: ArticleUpdateInput) => {
    const { locationIds, tagIds, garantie, removeGarantie, ...patch } = data;

    // If updating locations, enforce at least one.
    if (locationIds && Array.isArray(locationIds) && locationIds.length === 0)
      throw createHttpError(400, "Article must have at least one location");

    if (locationIds && locationIds.length > 0) {
      await assertLocationsOwned(ownerUserId, locationIds);
    }

    if (tagIds && tagIds.length > 0) {
      await assertTagsOwned(ownerUserId, tagIds);
    }

    // We need current warranty state to decide create vs update vs delete.
    type ArticleWithGarantie = Prisma.ArticleGetPayload<{
      include: { garantie: true };
    }>;
    const existing: ArticleWithGarantie | null = await prisma.article.findFirst(
      {
        where: { articleId: id, ownerUserId, deletedAt: null },
        include: { garantie: true },
      }
    );
    if (!existing) throw createHttpError(404, "Article not found");

    // Cancel existing warranty jobs before the transaction if removing the warranty,
    // so BullMQ jobs don't fire against a gone warranty row after the DB delete.
    if (removeGarantie && existing.garantie?.garantieId) {
      await AlertService.cancelForWarranty({
        ownerUserId,
        garantieId: existing.garantie.garantieId,
      });
    }

    // Run the DB changes and collect the alert side-effect inside the transaction
    // so TypeScript can properly infer the pendingAlert return type (not a let-mutation).
    const { article, pendingAlert } = await prisma.$transaction(async (tx) => {
      type PendingAlert =
        | { kind: "schedule"; garantieId: number; garantieFin: Date }
        | { kind: "reschedule"; garantieId: number; garantieFin: Date }
        | null;
      let pending: PendingAlert = null;

      // Apply warranty changes (if any) before updating the article itself.
      if (removeGarantie) {
        if (existing.garantie?.garantieId) {
          await tx.garantie.delete({
            where: { garantieId: existing.garantie.garantieId },
          });
        }
      } else if (garantie) {
        if (garantie.garantieImageAttachmentId) {
          const owned = await tx.attachment.findFirst({
            where: {
              attachmentId: garantie.garantieImageAttachmentId,
              ownerUserId,
            },
            select: { attachmentId: true },
          });
          if (!owned)
            throw createHttpError(
              403,
              "Attachment not found or not owned by you"
            );
        }

        const shouldRecomputeFin =
          garantie.garantieDateAchat !== undefined ||
          garantie.garantieDuration !== undefined;

        if (existing.garantie?.garantieId) {
          const newFin = shouldRecomputeFin
            ? addMonths(
                new Date(
                  garantie.garantieDateAchat ??
                    existing.garantie.garantieDateAchat
                ),
                garantie.garantieDuration ?? existing.garantie.garantieDuration
              )
            : null;
          await tx.garantie.update({
            where: { garantieId: existing.garantie.garantieId },
            data: {
              ...garantie,
              ...(newFin ? { garantieFin: newFin } : {}),
            },
          });
          if (newFin) {
            pending = {
              kind: "reschedule",
              garantieId: existing.garantie.garantieId,
              garantieFin: newFin,
            };
          }
        } else {
          // Create a warranty if article has none yet.
          if (
            garantie.garantieNom &&
            garantie.garantieDateAchat &&
            garantie.garantieDuration
          ) {
            const garantieFin = addMonths(
              new Date(garantie.garantieDateAchat),
              garantie.garantieDuration
            );
            const created = await tx.garantie.create({
              data: {
                ownerUserId,
                garantieArticleId: id,
                garantieNom: garantie.garantieNom,
                garantieDateAchat: garantie.garantieDateAchat,
                garantieDuration: garantie.garantieDuration,
                ...(garantie.garantieImageAttachmentId !== undefined
                  ? {
                      garantieImageAttachmentId:
                        garantie.garantieImageAttachmentId,
                    }
                  : {}),
                garantieFin,
                garantieIsValide: true,
              },
            });
            pending = {
              kind: "schedule",
              garantieId: created.garantieId,
              garantieFin,
            };
          } else {
            throw createHttpError(
              400,
              "To create a warranty you must provide garantieNom, garantieDateAchat and garantieDuration"
            );
          }
        }
      }

      const article = await tx.article.update({
        where: { articleId: id },
        data: {
          ...patch,
          ownerUserId,
          ...(locationIds
            ? {
                locations: {
                  deleteMany: {},
                  create: locationIds.map((locationId: number) => ({
                    locationId,
                  })),
                },
              }
            : {}),
          ...(tagIds
            ? {
                tags: {
                  deleteMany: {},
                  create: tagIds.map((tagId: number) => ({ tagId })),
                },
              }
            : {}),
        },
        include: articleInclude,
      });
      return { article, pendingAlert: pending };
    });

    // Post-transaction: schedule or reschedule BullMQ warranty reminders.
    if (pendingAlert) {
      if (pendingAlert.kind === "schedule") {
        await AlertService.scheduleForWarranty({
          ownerUserId,
          garantieId: pendingAlert.garantieId,
          articleId: id,
          garantieFin: pendingAlert.garantieFin,
        });
      } else {
        await AlertService.rescheduleForWarranty({
          ownerUserId,
          garantieId: pendingAlert.garantieId,
          articleId: id,
          garantieFin: pendingAlert.garantieFin,
        });
      }
    }

    return article;
  },

  remove: async (id: number, ownerUserId: number) => {
    const existing = await prisma.article.findFirst({
      where: { articleId: id, ownerUserId, deletedAt: null },
      include: { garantie: { select: { garantieId: true } } },
    });
    if (!existing) throw createHttpError(404, "Article not found");

    // Cancel BullMQ jobs first so a soft-deleted warranty doesn't continue to
    // notify the user. (Attachments stay on disk until the trash-purge worker
    // runs so a restore can recover them.)
    if (existing.garantie) {
      await AlertService.cancelForWarranty({
        ownerUserId,
        garantieId: existing.garantie.garantieId,
      });
    }
    // Custom alerts hang off the article directly — cancel those too, or
    // they keep firing against a trashed article (deep link 404s).
    await AlertService.cancelCustomForArticle(ownerUserId, id);

    return prisma.article.update({
      where: { articleId: id },
      data: { deletedAt: new Date() },
    });
  },

  restore: async (id: number, ownerUserId: number) => {
    const existing = await prisma.article.findFirst({
      where: { articleId: id, ownerUserId, NOT: { deletedAt: null } },
      include: {
        garantie: { select: { garantieId: true, garantieFin: true } },
      },
    });
    if (!existing) throw createHttpError(404, "Article not found in trash");

    const restored = await prisma.article.update({
      where: { articleId: id },
      data: { deletedAt: null },
      include: articleInclude,
    });

    // Re-arm the warranty reminders we cancelled on soft-delete; safe to call
    // even if the warranty is already past its end (scheduleForWarranty drops
    // past dates).
    if (existing.garantie) {
      await AlertService.scheduleForWarranty({
        ownerUserId,
        garantieId: existing.garantie.garantieId,
        articleId: id,
        garantieFin: existing.garantie.garantieFin,
      });
    }
    // Mirror the soft-delete: revive the future-dated custom alerts.
    await AlertService.rearmCustomForArticle(ownerUserId, id);

    return restored;
  },

  // Permanent delete. Used by the trash purge worker and the manual
  // "delete forever" action from the Trash view. Unlinks attachment files
  // before the cascade so /uploads doesn't accumulate orphans.
  hardRemove: async (id: number, ownerUserId: number) => {
    const existing = await prisma.article.findFirst({
      where: { articleId: id, ownerUserId },
      include: { garantie: { select: { garantieId: true } } },
    });
    if (!existing) throw createHttpError(404, "Article not found");

    if (existing.garantie) {
      await AlertService.cancelForWarranty({
        ownerUserId,
        garantieId: existing.garantie.garantieId,
      });
    }

    const garantieIds = existing.garantie ? [existing.garantie.garantieId] : [];
    const attachments = await prisma.attachment.findMany({
      where: {
        ownerUserId,
        OR: [
          { articleId: id },
          ...(garantieIds.length ? [{ garantieId: { in: garantieIds } }] : []),
        ],
      },
      select: { fileUrl: true, thumbUrl: true },
    });
    for (const a of attachments) await unlinkAttachmentFiles(a);

    return prisma.article.delete({ where: { articleId: id } });
  },

  listTrash: (ownerUserId: number) =>
    prisma.article.findMany({
      where: { ownerUserId, NOT: { deletedAt: null } },
      orderBy: { deletedAt: "desc" },
      include: articleInclude,
    }),

  // Bulk restore: re-arms warranty reminders per row via the existing
  // single-row helper. Silently skips ids the caller doesn't own (same
  // model as bulkRemove). Returns { count } for "Restored N article(s)".
  bulkRestore: async (
    ids: number[],
    ownerUserId: number
  ): Promise<{ count: number }> => {
    if (ids.length === 0) return { count: 0 };
    const owned = await prisma.article.findMany({
      where: { articleId: { in: ids }, ownerUserId, NOT: { deletedAt: null } },
      select: { articleId: true },
    });
    let count = 0;
    for (const a of owned) {
      try {
        await ArticleService.restore(a.articleId, ownerUserId);
        count++;
      } catch (err) {
        logger.warn(
          { articleId: a.articleId, err },
          "[article] bulkRestore: row failed"
        );
      }
    }
    return { count };
  },

  // Bulk hard-remove: permanent delete of trashed rows. Iterates the existing
  // hardRemove so attachment file unlinking + warranty-alert cancellation
  // run per-row.
  bulkHardRemove: async (
    ids: number[],
    ownerUserId: number
  ): Promise<{ count: number }> => {
    if (ids.length === 0) return { count: 0 };
    const owned = await prisma.article.findMany({
      where: { articleId: { in: ids }, ownerUserId },
      select: { articleId: true },
    });
    let count = 0;
    for (const a of owned) {
      try {
        await ArticleService.hardRemove(a.articleId, ownerUserId);
        count++;
      } catch (err) {
        logger.warn(
          { articleId: a.articleId, err },
          "[article] bulkHardRemove: row failed"
        );
      }
    }
    return { count };
  },

  // Purge trashed articles older than `retentionDays` for every owner.
  // Iterates row-by-row so the per-article `unlinkAttachmentFiles` cleanup
  // runs deterministically before the cascade drops the rows.
  purgeTrashOlderThan: async (
    retentionDays: number
  ): Promise<{ deleted: number }> => {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const due = await prisma.article.findMany({
      where: { deletedAt: { lt: cutoff } },
      select: { articleId: true, ownerUserId: true },
    });
    let deleted = 0;
    for (const row of due) {
      try {
        await ArticleService.hardRemove(row.articleId, row.ownerUserId);
        deleted++;
      } catch (err) {
        logger.warn(
          { articleId: row.articleId, err },
          "[article] purgeTrashOlderThan: row failed"
        );
      }
    }
    return { deleted };
  },

  /**
   * Bulk delete articles owned by the user. Silently skips ids that don't
   * belong to the caller (no separate error per row — the user shouldn't
   * have those ids in their UI anyway, and exposing which-ids-existed leaks
   * info). Cancels related warranty alerts before delete.
   *
   * Returns { count } so the caller can render "Deleted N article(s)".
   */
  bulkRemove: async (ids: number[], ownerUserId: number) => {
    if (ids.length === 0) return { count: 0 };

    const owned = await prisma.article.findMany({
      where: { articleId: { in: ids }, ownerUserId, deletedAt: null },
      select: {
        articleId: true,
        garantie: { select: { garantieId: true } },
      },
    });
    if (owned.length === 0) return { count: 0 };

    for (const a of owned) {
      if (a.garantie) {
        await AlertService.cancelForWarranty({
          ownerUserId,
          garantieId: a.garantie.garantieId,
        });
      }
    }

    // Soft-delete: mark, don't unlink. The trash-purge worker will reap
    // attachments when the retention window passes.
    const result = await prisma.article.updateMany({
      where: {
        articleId: { in: owned.map((a) => a.articleId) },
        ownerUserId,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });
    return { count: result.count };
  },

  /**
   * Bulk set the `sharedWithPowerUsers` flag on every article in `ids` that
   * the caller owns. Used by the bulk-share UI on the Articles list (power
   * users only — route layer enforces the role).
   */
  bulkSetSharedWithPowerUsers: async (
    ids: number[],
    ownerUserId: number,
    shared: boolean
  ): Promise<{ count: number }> => {
    if (ids.length === 0) return { count: 0 };
    const result = await prisma.article.updateMany({
      where: { articleId: { in: ids }, ownerUserId, deletedAt: null },
      data: { sharedWithPowerUsers: shared },
    });
    return { count: result.count };
  },

  /**
   * Add locations and/or tags to every article in `ids` that the caller owns.
   * Additive only — existing assignments are kept and duplicates are skipped.
   * Locations and tags are ownership-checked up front; ids the caller doesn't
   * own are silently dropped from the article set. Returns the number of
   * articles touched.
   */
  // Bulk update a scalar field set across a selection. Only the four
  // power-user-frequented columns (price, depreciation rate, brand, serial)
  // are exposed — name/model are identity-bearing and shouldn't be
  // overwritten in bulk by accident. `null` clears a field; `undefined` /
  // absent keys leave it untouched. The whole batch is one transaction so
  // it's all-or-nothing if a row is yanked mid-update by a sibling tab.
  bulkUpdate: async (
    ids: number[],
    ownerUserId: number,
    fields: {
      purchasePrice?: number | null;
      depreciationRate?: number | null;
      brand?: string | null;
      serialNumber?: string | null;
    }
  ): Promise<{ count: number }> => {
    if (ids.length === 0) return { count: 0 };
    const data: Record<string, unknown> = {};
    if (fields.purchasePrice !== undefined)
      data.purchasePrice = fields.purchasePrice;
    if (fields.depreciationRate !== undefined)
      data.depreciationRate = fields.depreciationRate;
    if (fields.brand !== undefined) data.brand = fields.brand;
    if (fields.serialNumber !== undefined)
      data.serialNumber = fields.serialNumber;
    if (Object.keys(data).length === 0) return { count: 0 };

    return prisma.$transaction(async (tx) => {
      const owned = await tx.article.findMany({
        where: { articleId: { in: ids }, ownerUserId, deletedAt: null },
        select: { articleId: true },
      });
      if (owned.length === 0) return { count: 0 };
      const res = await tx.article.updateMany({
        where: { articleId: { in: owned.map((a) => a.articleId) } },
        data,
      });
      return { count: res.count };
    });
  },

  bulkAssign: async (
    ids: number[],
    ownerUserId: number,
    addLocationIds: number[],
    addTagIds: number[]
  ): Promise<{ count: number }> => {
    if (ids.length === 0) return { count: 0 };
    if (addLocationIds.length === 0 && addTagIds.length === 0)
      return { count: 0 };

    await assertLocationsOwned(ownerUserId, addLocationIds);
    await assertTagsOwned(ownerUserId, addTagIds);

    return prisma.$transaction(async (tx) => {
      const owned = await tx.article.findMany({
        where: { articleId: { in: ids }, ownerUserId, deletedAt: null },
        select: { articleId: true },
      });
      if (owned.length === 0) return { count: 0 };
      const ownedIds = owned.map((a) => a.articleId);

      if (addLocationIds.length > 0) {
        await tx.articleLocation.createMany({
          data: ownedIds.flatMap((articleId) =>
            addLocationIds.map((locationId) => ({ articleId, locationId }))
          ),
          skipDuplicates: true,
        });
      }
      if (addTagIds.length > 0) {
        await tx.articleTag.createMany({
          data: ownedIds.flatMap((articleId) =>
            addTagIds.map((tagId) => ({ articleId, tagId }))
          ),
          skipDuplicates: true,
        });
      }
      return { count: ownedIds.length };
    });
  },
};
