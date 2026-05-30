/**
 * Attachment service — owner-scoped Prisma helpers behind the file routes.
 * Article / warranty ownership is re-checked on create/update via
 * `assertArticleOwned` / `assertWarrantyOwned` so a forged FK can't slip
 * past the Multer layer.
 */
import { prisma } from "../../libs/prisma";
import { createHttpError } from "../../utils/http-error";
import { unlinkAttachmentFiles } from "./attachment.fs";
import {
  AttachmentCreateInput,
  AttachmentUpdateInput,
} from "./attachment.schemas";

// Reject create/update payloads that try to link an attachment to an article
// or warranty belonging to a different user. Without these checks the
// ownerUserId scoping on /api/attachments would still hold, but the FK row
// would silently surface someone else's attachment metadata in their
// per-article / per-warranty list.
async function assertArticleOwned(
  articleId: number | null | undefined,
  ownerUserId: number
) {
  if (articleId == null) return;
  const owned = await prisma.article.findFirst({
    where: { articleId, ownerUserId, deletedAt: null },
    select: { articleId: true },
  });
  if (!owned)
    throw createHttpError(403, "Article not found or not owned by you");
}

async function assertWarrantyOwned(
  garantieId: number | null | undefined,
  ownerUserId: number
) {
  if (garantieId == null) return;
  const owned = await prisma.garantie.findFirst({
    where: { garantieId, ownerUserId },
    select: { garantieId: true },
  });
  if (!owned)
    throw createHttpError(403, "Warranty not found or not owned by you");
}

export const AttachmentService = {
  list: (
    ownerUserId: number,
    filters?: { articleId?: number; garantieId?: number },
    page = 1,
    limit = 50
  ) =>
    prisma.attachment.findMany({
      where: {
        ownerUserId,
        ...(filters?.articleId && { articleId: filters.articleId }),
        ...(filters?.garantieId && { garantieId: filters.garantieId }),
      },
      take: limit,
      skip: (page - 1) * limit,
      orderBy: { createdAt: "desc" },
      include: {
        article: {
          select: {
            articleId: true,
            articleNom: true,
            articleModele: true,
          },
        },
        garantie: {
          select: {
            garantieId: true,
            garantieNom: true,
          },
        },
      },
    }),

  get: (id: number, ownerUserId: number) =>
    prisma.attachment.findFirst({
      where: { attachmentId: id, ownerUserId },
    }),

  create: async (data: AttachmentCreateInput) => {
    await assertArticleOwned(data.articleId, data.ownerUserId);
    await assertWarrantyOwned(data.garantieId, data.ownerUserId);
    return prisma.attachment.create({ data });
  },

  update: async (
    id: number,
    ownerUserId: number,
    data: AttachmentUpdateInput
  ) => {
    if (data.articleId !== undefined)
      await assertArticleOwned(data.articleId, ownerUserId);
    if (data.garantieId !== undefined)
      await assertWarrantyOwned(data.garantieId, ownerUserId);
    return prisma.attachment.updateMany({
      where: { attachmentId: id, ownerUserId },
      data: { ...data },
    });
  },

  remove: (id: number, ownerUserId: number) =>
    prisma.attachment.delete({
      where: { attachmentId: id, ownerUserId },
    }),

  // Bulk delete: silently skips ids the caller doesn't own (no separate
  // error per row — the user shouldn't have those ids in their UI anyway,
  // and exposing which-ids-existed leaks info). Best-effort `unlink` of the
  // on-disk file follows the round-8 article hardRemove pattern: a missing
  // file is logged in the helper and doesn't block the row delete. Returns
  // { count } of rows actually removed.
  bulkRemove: async (
    ids: number[],
    ownerUserId: number
  ): Promise<{ count: number }> => {
    if (ids.length === 0) return { count: 0 };
    const owned = await prisma.attachment.findMany({
      where: { attachmentId: { in: ids }, ownerUserId },
      select: { attachmentId: true, fileUrl: true, thumbUrl: true },
    });
    if (owned.length === 0) return { count: 0 };
    for (const a of owned) await unlinkAttachmentFiles(a);
    const result = await prisma.attachment.deleteMany({
      where: {
        attachmentId: { in: owned.map((a) => a.attachmentId) },
        ownerUserId,
      },
    });
    return { count: result.count };
  },

  // Warranty image/proof: a warranty references at most one attachment.
  // Return [] when none is linked.
  getForWarranty: async (garantieId: number, ownerUserId: number) => {
    const warranty = await prisma.garantie.findFirst({
      where: { garantieId, ownerUserId },
      select: { garantieImageAttachmentId: true },
    });
    if (!warranty?.garantieImageAttachmentId) return [];
    const attachment = await prisma.attachment.findFirst({
      where: {
        attachmentId: warranty.garantieImageAttachmentId,
        ownerUserId,
      },
    });
    return attachment ? [attachment] : [];
  },
};
