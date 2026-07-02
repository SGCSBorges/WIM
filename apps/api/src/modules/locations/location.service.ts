/**
 * Location service. Owner-scoped CRUD + paginated articles-in-location
 * reads. `listArticles` and `get` both return `{ items, total, page,
 * limit }` and filter `article.deletedAt: null` so trashed items don't
 * appear in a location's roster.
 */
import { prisma } from "../../libs/prisma";
import { LocationCreateInput, LocationUpdateInput } from "./location.schemas";
import { createHttpError } from "../../utils/http-error";

// Guard for the parent link: the parent must exist and belong to the same
// owner, and (on update) the proposed parent must not be the location itself
// or one of its descendants — walking up the ancestor chain from the parent
// must never reach `locationId`. The walk is capped so a corrupted chain
// can't loop forever.
async function assertValidParent(
  ownerUserId: number,
  parentLocationId: number,
  locationId?: number
) {
  if (locationId !== undefined && parentLocationId === locationId)
    throw createHttpError(400, "A location cannot be its own parent");

  const parent = await prisma.location.findFirst({
    where: { locationId: parentLocationId, ownerUserId },
    select: { locationId: true, parentLocationId: true },
  });
  if (!parent) throw createHttpError(404, "Parent location not found");

  if (locationId === undefined) return;

  let cursor = parent.parentLocationId;
  for (let depth = 0; cursor !== null && depth < 50; depth++) {
    if (cursor === locationId)
      throw createHttpError(
        400,
        "Cannot move a location under one of its own sub-locations"
      );
    const next: { parentLocationId: number | null } | null =
      await prisma.location.findFirst({
        where: { locationId: cursor, ownerUserId },
        select: { parentLocationId: true },
      });
    cursor = next?.parentLocationId ?? null;
  }
}

export const LocationService = {
  // The list response carries each location's article count and the sum of
  // its articles' purchase prices, so the Locations page can render
  // "{count} · {money}" without N+1 round-trips.
  list: async (ownerUserId: number, page = 1, limit = 50) => {
    const locations = await prisma.location.findMany({
      where: { ownerUserId },
      take: limit,
      skip: (page - 1) * limit,
      orderBy: { updatedAt: "desc" },
      include: {
        // Count only live articles — `get`/`listArticles` exclude trash, so
        // an unfiltered count here would disagree with the location's own
        // roster until the purge job runs.
        _count: {
          select: { articles: { where: { article: { deletedAt: null } } } },
        },
      },
    });
    if (locations.length === 0) {
      return locations.map((l) => ({ ...l, totalValue: 0 }));
    }

    const ids = locations.map((l) => l.locationId);
    // Restrict to live articles the caller owns (defence-in-depth —
    // locations are owner-scoped above already).
    const rows = await prisma.articleLocation.findMany({
      where: {
        locationId: { in: ids },
        article: { ownerUserId, deletedAt: null },
      },
      select: {
        locationId: true,
        article: { select: { purchasePrice: true } },
      },
    });

    const sums = new Map<number, number>();
    for (const r of rows) {
      const price = r.article.purchasePrice
        ? Number(r.article.purchasePrice)
        : 0;
      sums.set(r.locationId, (sums.get(r.locationId) ?? 0) + price);
    }

    return locations.map((l) => ({
      ...l,
      totalValue: sums.get(l.locationId) ?? 0,
    }));
  },

  // Returns the location plus a paginated slice of its (live) articles.
  // Previously this method silently capped at 500 articles with no way to see
  // the rest; large locations now expose `{ items, total, page, limit }` so
  // the UI can page through every owned article in the location.
  get: async (
    locationId: number,
    ownerUserId: number,
    page = 1,
    limit = 50
  ) => {
    const location = await prisma.location.findFirst({
      where: { locationId, ownerUserId },
    });
    if (!location) return null;

    const articleWhere = {
      locationId,
      article: { ownerUserId, deletedAt: null },
    };
    const [rows, total] = await prisma.$transaction([
      prisma.articleLocation.findMany({
        where: articleWhere,
        take: limit,
        skip: (page - 1) * limit,
        orderBy: { assignedAt: "desc" },
        select: {
          articleId: true,
          assignedAt: true,
          article: { select: { articleNom: true, articleModele: true } },
        },
      }),
      prisma.articleLocation.count({ where: articleWhere }),
    ]);

    return {
      ...location,
      articles: { items: rows, total, page, limit },
    };
  },

  create: async (data: LocationCreateInput) => {
    if (data.parentLocationId != null)
      await assertValidParent(data.ownerUserId, data.parentLocationId);
    return prisma.location.create({
      data,
    });
  },

  update: async (
    locationId: number,
    ownerUserId: number,
    data: LocationUpdateInput
  ) => {
    const existing = await prisma.location.findFirst({
      where: { locationId, ownerUserId },
    });
    if (!existing) throw createHttpError(404, "Location not found");
    if (data.parentLocationId != null)
      await assertValidParent(ownerUserId, data.parentLocationId, locationId);
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
      prisma.article.findFirst({
        where: { articleId, ownerUserId, deletedAt: null },
      }),
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

    // No deletedAt filter: detaching a *trashed* article from a location is
    // legitimate housekeeping (and the only way to fix its link manually).
    const article = await prisma.article.findFirst({
      where: { articleId, ownerUserId },
      select: { articleId: true },
    });
    if (!article)
      throw createHttpError(404, "Article not found or not owned by you");

    // deleteMany so a missing link is a clean 404 instead of a P2025 throw.
    const { count } = await prisma.articleLocation.deleteMany({
      where: { articleId, locationId },
    });
    if (count === 0)
      throw createHttpError(404, "Article is not in this location");
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

    // Trashed articles (deletedAt != null) must not appear in the location
    // view — same scoping as buildArticleWhere in article.service.ts.
    const where = {
      locationId,
      article: { ownerUserId, deletedAt: null },
    };
    const [rows, total] = await prisma.$transaction([
      prisma.articleLocation.findMany({
        where,
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
      }),
      prisma.articleLocation.count({ where }),
    ]);

    return {
      items: rows.map((r) => ({ ...r.article, assignedAt: r.assignedAt })),
      total,
      page,
      limit,
    };
  },
};
