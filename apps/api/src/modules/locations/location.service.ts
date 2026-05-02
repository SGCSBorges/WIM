import { prisma } from "../../libs/prisma";
import { LocationCreateInput, LocationUpdateInput } from "./location.schemas";
import { createHttpError } from "../../utils/http-error";

export const LocationService = {
  list: (ownerUserId: number, page = 1, limit = 50) =>
    prisma.location.findMany({
      where: { ownerUserId },
      take: limit,
      skip: (page - 1) * limit,
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { articles: true } },
      },
    }),

  get: (locationId: number, ownerUserId: number) =>
    prisma.location.findFirst({
      where: { locationId, ownerUserId },
      include: {
        articles: {
          take: 500,
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

  update: async (
    locationId: number,
    ownerUserId: number,
    data: LocationUpdateInput
  ) => {
    const existing = await prisma.location.findFirst({
      where: { locationId, ownerUserId },
    });
    if (!existing) throw createHttpError(404, "Location not found");
    return prisma.location.update({
      where: { locationId },
      data,
    });
  },

  remove: async (locationId: number, ownerUserId: number) => {
    const existing = await prisma.location.findFirst({
      where: { locationId, ownerUserId },
    });
    if (!existing) throw createHttpError(404, "Location not found");
    await prisma.location.deleteMany({ where: { locationId, ownerUserId } });
  },

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

    if (!location) throw createHttpError(404, "Location not found");
    if (!article) throw createHttpError(404, "Article not found");

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
    if (!location) throw createHttpError(404, "Location not found");

    const article = await prisma.article.findFirst({
      where: { articleId, ownerUserId },
      select: { articleId: true },
    });
    if (!article)
      throw createHttpError(403, "Article not found or not owned by you");

    await prisma.articleLocation.delete({
      where: { articleId_locationId: { articleId, locationId } },
    });
    return { ok: true };
  },

  listArticles: async (
    locationId: number,
    ownerUserId: number,
    page = 1,
    limit = 50
  ) => {
    const location = await prisma.location.findFirst({
      where: { locationId, ownerUserId },
    });
    if (!location) throw createHttpError(404, "Location not found");

    const rows = await prisma.articleLocation.findMany({
      where: { locationId },
      take: limit,
      skip: (page - 1) * limit,
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
