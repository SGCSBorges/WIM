import { Prisma } from "@prisma/client";
import { prisma } from "../../libs/prisma";
import { ArticleCreateInput, ArticleUpdateInput } from "./article.schemas";
import { addMonths } from "../common/date";
import { createHttpError } from "../../utils/http-error";
import { AlertService } from "../alerts/alert.service";

export const ArticleService = {
  list: (ownerUserId: number, locationId?: number) =>
    prisma.article.findMany({
      where: {
        ownerUserId,
        ...(locationId
          ? {
              locations: {
                some: { locationId },
              },
            }
          : {}),
      },
      take: 500,
      orderBy: { articleId: "desc" },
      include: {
        garantie: true,
        locations: {
          select: {
            locationId: true,
            location: { select: { name: true } },
          },
        },
      },
    }),

  get: (id: number, ownerUserId: number) =>
    prisma.article.findFirst({
      where: { articleId: id, ownerUserId },
      include: {
        garantie: true,
        locations: {
          select: {
            locationId: true,
            location: { select: { name: true } },
          },
        },
      },
    }),

  create: async (data: ArticleCreateInput) => {
    const { locationIds, garantie, ...articleData } = data;

    if (garantie?.garantieImageAttachmentId) {
      const owned = await prisma.attachment.findFirst({
        where: { attachmentId: garantie.garantieImageAttachmentId, ownerUserId: articleData.ownerUserId },
        select: { attachmentId: true },
      });
      if (!owned) throw createHttpError(403, "Attachment not found or not owned by you");
    }

    return prisma.article.create({
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
      },
      include: {
        garantie: true,
        locations: {
          select: {
            locationId: true,
            location: { select: { name: true } },
          },
        },
      },
    });
  },

  update: async (id: number, ownerUserId: number, data: ArticleUpdateInput) => {
    const { locationIds, garantie, removeGarantie, ...patch } = data;

    // If updating locations, enforce at least one.
    if (locationIds && Array.isArray(locationIds) && locationIds.length === 0)
      throw createHttpError(400, "Article must have at least one location");

    // We need current warranty state to decide create vs update vs delete.
    type ArticleWithGarantie = Prisma.ArticleGetPayload<{ include: { garantie: true } }>;
    const existing: ArticleWithGarantie | null = await prisma.article.findFirst({
      where: { articleId: id, ownerUserId },
      include: { garantie: true },
    });
    if (!existing) throw createHttpError(404, "Article not found");

    return prisma.$transaction(async (tx) => {
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
            where: { attachmentId: garantie.garantieImageAttachmentId, ownerUserId },
            select: { attachmentId: true },
          });
          if (!owned) throw createHttpError(403, "Attachment not found or not owned by you");
        }

        const shouldRecomputeFin =
          garantie.garantieDateAchat !== undefined ||
          garantie.garantieDuration !== undefined;

        if (existing.garantie?.garantieId) {
          await tx.garantie.update({
            where: { garantieId: existing.garantie.garantieId },
            data: {
              ...garantie,
              ...(shouldRecomputeFin
                ? {
                    garantieFin: addMonths(
                      new Date(
                        garantie.garantieDateAchat ??
                          existing.garantie.garantieDateAchat
                      ),
                      garantie.garantieDuration ??
                        existing.garantie.garantieDuration
                    ),
                  }
                : {}),
            },
          });
        } else {
          // Create a warranty if article has none yet.
          if (
            garantie.garantieNom &&
            garantie.garantieDateAchat &&
            garantie.garantieDuration
          ) {
            await tx.garantie.create({
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
                garantieFin: addMonths(
                  new Date(garantie.garantieDateAchat),
                  garantie.garantieDuration
                ),
                garantieIsValide: true,
              },
            });
          } else {
            throw createHttpError(
              400,
              "To create a warranty you must provide garantieNom, garantieDateAchat and garantieDuration"
            );
          }
        }
      }

      return tx.article.update({
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
        },
        include: {
          garantie: true,
          locations: {
            select: {
              locationId: true,
              location: { select: { name: true } },
            },
          },
        },
      });
    });
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

    return prisma.article.delete({ where: { articleId: id } });
  },
};
