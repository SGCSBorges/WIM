import { prisma } from "../../libs/prisma";
import { ArticleCreateInput, ArticleUpdateInput } from "./article.schemas";
import { addMonths } from "../common/date";

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
      orderBy: { articleId: "desc" },
      include: {
        garantie: true,
        locations: {
          select: {
            locationId: true,
            location: { select: { name: true } },
          },
        },
      } as any,
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
      } as any,
    }),

  create: async (data: ArticleCreateInput) => {
    const { locationIds, garantie, ...articleData } = data as any;
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
      } as any,
    });
  },

  update: async (id: number, ownerUserId: number, data: ArticleUpdateInput) => {
    const { locationIds, garantie, removeGarantie, ...patch } = data as any;

    // If updating locations, enforce at least one.
    if (locationIds && Array.isArray(locationIds) && locationIds.length === 0) {
      const err: any = new Error("Article must have at least one location");
      err.status = 400;
      throw err;
    }

    // We need current warranty state to decide create vs update vs delete.
    const existing: any = await prisma.article.findFirst({
      where: { articleId: id, ownerUserId },
      include: { garantie: true } as any,
    });
    if (!existing) {
      const err: any = new Error("Article non trouvé");
      err.status = 404;
      throw err;
    }

    // Apply warranty changes (if any) before updating the article itself.
    if (removeGarantie) {
      if (existing.garantie?.garantieId) {
        await prisma.garantie.delete({
          where: { garantieId: existing.garantie.garantieId },
        });
      }
    } else if (garantie) {
      const shouldRecomputeFin =
        garantie.garantieDateAchat !== undefined ||
        garantie.garantieDuration !== undefined;

      if (existing.garantie?.garantieId) {
        await prisma.garantie.update({
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
          await prisma.garantie.create({
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
          const err: any = new Error(
            "To create a warranty you must provide garantieNom, garantieDateAchat and garantieDuration"
          );
          err.status = 400;
          throw err;
        }
      }
    }

    return prisma.article.update({
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
      } as any,
    });
  },

  remove: (id: number, ownerUserId: number) =>
    prisma.article.delete({ where: { articleId: id, ownerUserId } }),
};
