import { prisma } from "../../libs/prisma";
import {
  AttachmentCreateInput,
  AttachmentUpdateInput,
} from "./attachment.schemas";

export const AttachmentService = {
  list: (
    ownerUserId: number,
    filters?: { articleId?: number; garantieId?: number }
  ) =>
    prisma.attachment.findMany({
      where: {
        ownerUserId,
        ...(filters?.articleId && { articleId: filters.articleId }),
        ...(filters?.garantieId && { garantieId: filters.garantieId }),
      },
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

  create: (data: AttachmentCreateInput) =>
    prisma.attachment.create({
      data,
    }),

  update: (id: number, ownerUserId: number, data: AttachmentUpdateInput) =>
    prisma.attachment.updateMany({
      where: { attachmentId: id, ownerUserId },
      data: { ...data },
    }),

  remove: (id: number, ownerUserId: number) =>
    prisma.attachment.delete({
      where: { attachmentId: id, ownerUserId },
    }),

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
