import { Prisma } from "@prisma/client";
import { prisma } from "../../libs/prisma";
import { ArticleCreateInput, ArticleUpdateInput } from "./article.schemas";
import { addMonths } from "../common/date";
import { createHttpError } from "../../utils/http-error";
import { AlertService } from "../alerts/alert.service";
import { unlinkAttachmentFiles } from "../attachments/attachment.fs";

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
  page?: number;
  limit?: number;
};

// Translate the filter set into a Prisma where-clause (all owner-scoped).
function buildArticleWhere(
  ownerUserId: number,
  f: ArticleListFilters
): Prisma.ArticleWhereInput {
  const where: Prisma.ArticleWhereInput = { ownerUserId };
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
      ],
    }));
  }
  if (f.priceMin != null || f.priceMax != null) {
    where.purchasePrice = {
      ...(f.priceMin != null ? { gte: f.priceMin } : {}),
      ...(f.priceMax != null ? { lte: f.priceMax } : {}),
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
    const [items, total] = await prisma.$transaction([
      prisma.article.findMany({
        where,
        take: limit,
        skip: (page - 1) * limit,
        orderBy: { articleId: "desc" },
        include: articleInclude,
      }),
      prisma.article.count({ where }),
    ]);
    return { items, total, page, limit };
  },

  get: (id: number, ownerUserId: number) =>
    prisma.article.findFirst({
      where: { articleId: id, ownerUserId },
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
        where: { articleId: id, ownerUserId },
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
      where: { articleId: id, ownerUserId },
      include: { garantie: { select: { garantieId: true } } },
    });
    if (!existing) throw createHttpError(404, "Article not found");

    // Cancel BullMQ jobs before cascade-delete removes the warranty from DB,
    // otherwise the jobs fire against a non-existent warranty.
    if (existing.garantie) {
      await AlertService.cancelForWarranty({
        ownerUserId,
        garantieId: existing.garantie.garantieId,
      });
    }

    // Unlink attachment files on disk before the DB cascade drops the rows —
    // covers both article-linked attachments and warranty-linked proofs so
    // /uploads doesn't accumulate orphans. Best-effort: a missing/unreadable
    // file is logged in the helper and doesn't block the delete.
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
      where: { articleId: { in: ids }, ownerUserId },
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

    // Same orphan-file cleanup as the single-article remove.
    const ownedArticleIds = owned.map((a) => a.articleId);
    const ownedGarantieIds = owned
      .map((a) => a.garantie?.garantieId)
      .filter((g): g is number => typeof g === "number");
    const attachments = await prisma.attachment.findMany({
      where: {
        ownerUserId,
        OR: [
          { articleId: { in: ownedArticleIds } },
          ...(ownedGarantieIds.length
            ? [{ garantieId: { in: ownedGarantieIds } }]
            : []),
        ],
      },
      select: { fileUrl: true, thumbUrl: true },
    });
    for (const a of attachments) await unlinkAttachmentFiles(a);

    const result = await prisma.article.deleteMany({
      where: {
        articleId: { in: owned.map((a) => a.articleId) },
        ownerUserId,
      },
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
      where: { articleId: { in: ids }, ownerUserId },
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
        where: { articleId: { in: ids }, ownerUserId },
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
