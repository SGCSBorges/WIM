import { prisma } from "../../libs/prisma";
import { LocationCreateInput, LocationUpdateInput } from "./location.schemas";

export const LocationService = {
  list: (ownerUserId: number) =>
    prisma.location.findMany({
      where: { ownerUserId },
      orderBy: { updatedAt: "desc" },
      include: {
        articles: {
          select: {
            articleId: true,
            assignedAt: true,
            article: { select: { articleNom: true, articleModele: true } },
          },
        },
      },
    }),

  get: (locationId: number, ownerUserId: number) =>
    prisma.location.findFirst({
      where: { locationId, ownerUserId },
      include: {
        articles: {
          select: {
            articleId: true,
            assignedAt: true,
            article: { select: { articleNom: true, articleModele: true } },
          },
        },
      },
    }),

  create: (data: LocationCreateInput) =>
    prisma.location.create({
      data,
    }),

  update: (
    locationId: number,
    ownerUserId: number,
    data: LocationUpdateInput
  ) =>
    prisma.location.update({
      where: { locationId, ownerUserId },
      data: { ...data, ownerUserId },
    }),

  remove: (locationId: number, ownerUserId: number) =>
    prisma.location.delete({
      where: { locationId, ownerUserId },
    }),

  addArticle: async (
    locationId: number,
    ownerUserId: number,
    articleId: number
  ) => {
    // Ensure both belong to the same owner
    const [location, article] = await Promise.all([
      prisma.location.findFirst({ where: { locationId, ownerUserId } }),
      prisma.article.findFirst({ where: { articleId, ownerUserId } }),
    ]);

    if (!location) {
      const err: any = new Error("Location not found");
      err.status = 404;
      throw err;
    }
    if (!article) {
      const err: any = new Error("Article not found");
      err.status = 404;
      throw err;
    }

    return prisma.articleLocation.upsert({
      where: { articleId_locationId: { articleId, locationId } },
      create: { articleId, locationId },
      update: {},
    });
  },

  removeArticle: async (
    locationId: number,
    ownerUserId: number,
    articleId: number
  ) => {
    const location = await prisma.location.findFirst({
      where: { locationId, ownerUserId },
    });
    if (!location) {
      const err: any = new Error("Location not found");
      err.status = 404;
      throw err;
    }
    await prisma.articleLocation.delete({
      where: { articleId_locationId: { articleId, locationId } },
    });
    return { ok: true };
  },

  listArticles: async (locationId: number, ownerUserId: number) => {
    const location = await prisma.location.findFirst({
      where: { locationId, ownerUserId },
    });
    if (!location) {
      const err: any = new Error("Location not found");
      err.status = 404;
      throw err;
    }

    const rows = await prisma.articleLocation.findMany({
      where: { locationId },
      orderBy: { assignedAt: "desc" },
      include: {
        article: {
          select: {
            articleId: true,
            articleNom: true,
            articleModele: true,
            articleDescription: true,
            productImageUrl: true,
          },
        },
      },
    });

    return rows.map((r) => ({ ...r.article, assignedAt: r.assignedAt }));
  },
};
