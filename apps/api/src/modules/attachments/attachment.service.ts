import { prisma } from "../../libs/prisma";
import {
  AttachmentCreateInput,
  AttachmentUpdateInput,
} from "./attachment.schemas";

export const AttachmentService = {
  list: (ownerUserId: number) =>
    prisma.attachment.findMany({
      where: { ownerUserId },
      orderBy: { createdAt: "desc" },
      include: {
        article: { select: { articleNom: true } },
        garantie: { select: { garantieNom: true } },
      },
    }),

  get: (id: number, ownerUserId: number) =>
    prisma.attachment.findFirst({
      where: { attachmentId: id, ownerUserId },
      include: {
        article: { select: { articleNom: true } },
        garantie: { select: { garantieNom: true } },
      },
    }),

  create: (data: AttachmentCreateInput) =>
    prisma.attachment.create({
      data,
      include: {
        article: { select: { articleNom: true } },
        garantie: { select: { garantieNom: true } },
      },
    }),

  update: (id: number, ownerUserId: number, data: AttachmentUpdateInput) =>
    prisma.attachment.update({
      where: { attachmentId: id },
      data: { ...data, ownerUserId }, // Ensure ownership
      include: {
        article: { select: { articleNom: true } },
        garantie: { select: { garantieNom: true } },
      },
    }),

  remove: (id: number, ownerUserId: number) =>
    prisma.attachment.delete({
      where: { attachmentId: id, ownerUserId },
    }),

  // Get attachments for specific article or warranty
  getForArticle: (articleId: number, ownerUserId: number) =>
    prisma.attachment.findMany({
      where: { articleId, ownerUserId },
      orderBy: { createdAt: "desc" },
    }),

  getForWarranty: (garantieId: number, ownerUserId: number) =>
    prisma.attachment.findMany({
      where: { garantieId, ownerUserId },
      orderBy: { createdAt: "desc" },
    }),
};
