import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    article: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    attachment: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    location: {
      count: vi.fn(),
    },
    tag: {
      count: vi.fn(),
    },
    articleLocation: {
      createMany: vi.fn(),
    },
    articleTag: {
      createMany: vi.fn(),
    },
    // create()/bulkAssign() wrap ownership + writes in a transaction; the
    // test's tx client mirrors prisma's surface so callbacks reach the
    // mocked methods.
    $transaction: vi.fn(async (cb: unknown) => {
      // Array form (used by list): resolve the batch of queries.
      if (Array.isArray(cb)) return Promise.all(cb);
      if (typeof cb !== "function") return undefined;
      const p = prisma as unknown as Record<
        string,
        Record<string, ReturnType<typeof vi.fn>>
      >;
      const tx = {
        location: { count: p.location.count },
        tag: { count: p.tag.count },
        attachment: { findFirst: p.attachment.findFirst },
        article: { create: p.article.create, findMany: p.article.findMany },
        articleLocation: { createMany: p.articleLocation.createMany },
        articleTag: { createMany: p.articleTag.createMany },
      };
      return (cb as (tx: unknown) => Promise<unknown>)(tx);
    }),
  },
}));

vi.mock("../../modules/alerts/alert.service", () => ({
  AlertService: {
    cancelForWarranty: vi.fn().mockResolvedValue(undefined),
    cancelCustomForArticle: vi.fn().mockResolvedValue(undefined),
    rearmCustomForArticle: vi.fn().mockResolvedValue(undefined),
    scheduleForWarranty: vi.fn().mockResolvedValue(undefined),
  },
}));

import { prisma } from "../../libs/prisma";
import { AlertService } from "../../modules/alerts/alert.service";
import { ArticleService } from "../../modules/articles/article.service";

const mockPrisma = prisma as unknown as {
  article: Record<string, ReturnType<typeof vi.fn>>;
  attachment: Record<string, ReturnType<typeof vi.fn>>;
  location: Record<string, ReturnType<typeof vi.fn>>;
  tag: Record<string, ReturnType<typeof vi.fn>>;
  articleLocation: Record<string, ReturnType<typeof vi.fn>>;
  articleTag: Record<string, ReturnType<typeof vi.fn>>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ArticleService.remove", () => {
  it("throws 404 when article not found or not owned", async () => {
    mockPrisma.article.findFirst.mockResolvedValue(null);
    await expect(ArticleService.remove(99, 1)).rejects.toMatchObject({
      status: 404,
      message: "Article not found",
    });
    expect(AlertService.cancelForWarranty).not.toHaveBeenCalled();
  });

  it("cancels warranty alerts before soft-deleting an article that has a warranty", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({
      articleId: 5,
      garantie: { garantieId: 42 },
    });
    mockPrisma.article.update.mockResolvedValue({ articleId: 5 });

    await ArticleService.remove(5, 1);

    expect(AlertService.cancelForWarranty).toHaveBeenCalledWith({
      ownerUserId: 1,
      garantieId: 42,
    });
    expect(AlertService.cancelCustomForArticle).toHaveBeenCalledWith(1, 5);
    const updateCall = mockPrisma.article.update.mock.calls[0][0];
    expect(updateCall.where).toEqual({ articleId: 5 });
    expect(updateCall.data.deletedAt).toBeInstanceOf(Date);
  });

  it("soft-deletes without the warranty cancel when there is no warranty (custom alerts still cancelled)", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({
      articleId: 7,
      garantie: null,
    });
    mockPrisma.article.update.mockResolvedValue({ articleId: 7 });

    await ArticleService.remove(7, 1);

    expect(AlertService.cancelForWarranty).not.toHaveBeenCalled();
    expect(AlertService.cancelCustomForArticle).toHaveBeenCalledWith(1, 7);
    const updateCall = mockPrisma.article.update.mock.calls[0][0];
    expect(updateCall.where).toEqual({ articleId: 7 });
    expect(updateCall.data.deletedAt).toBeInstanceOf(Date);
  });
});

describe("ArticleService.create — location ownership", () => {
  it("rejects when any locationId is not owned by the caller", async () => {
    mockPrisma.location.count.mockResolvedValue(1); // owns only 1 of the 2 ids
    await expect(
      ArticleService.create({
        ownerUserId: 1,
        articleNom: "A",
        articleModele: "M",
        locationIds: [10, 99],
      })
    ).rejects.toMatchObject({ status: 403 });
    expect(mockPrisma.article.create).not.toHaveBeenCalled();
  });
});

describe("ArticleService.bulkAssign", () => {
  it("assigns a location only to owned ids and skips duplicate join rows", async () => {
    mockPrisma.location.count.mockResolvedValue(1); // owns the one location
    // Of the requested [5, 6, 7], the caller only owns 5 and 6.
    mockPrisma.article.findMany.mockResolvedValue([
      { articleId: 5 },
      { articleId: 6 },
    ]);
    mockPrisma.articleLocation.createMany.mockResolvedValue({ count: 2 });

    const result = await ArticleService.bulkAssign([5, 6, 7], 1, [10], []);

    expect(result).toEqual({ count: 2 });
    expect(mockPrisma.articleLocation.createMany).toHaveBeenCalledWith({
      data: [
        { articleId: 5, locationId: 10 },
        { articleId: 6, locationId: 10 },
      ],
      skipDuplicates: true,
    });
    expect(mockPrisma.articleTag.createMany).not.toHaveBeenCalled();
  });

  it("rejects when a tag is not owned by the caller", async () => {
    mockPrisma.tag.count.mockResolvedValue(0); // owns none of the requested tags
    await expect(
      ArticleService.bulkAssign([5], 1, [], [99])
    ).rejects.toMatchObject({ status: 403 });
    expect(mockPrisma.articleTag.createMany).not.toHaveBeenCalled();
  });

  it("scopes the owned-article lookup to live rows (skips trash)", async () => {
    mockPrisma.location.count.mockResolvedValue(1);
    mockPrisma.article.findMany.mockResolvedValue([{ articleId: 5 }]);
    mockPrisma.articleLocation.createMany.mockResolvedValue({ count: 1 });

    await ArticleService.bulkAssign([5], 1, [10], []);

    // A trashed article must not receive a bulk location/tag assignment —
    // the live-list action only touches deletedAt: null rows, matching the
    // other bulk operations (bulkRemove / bulkUpdate / bulkSetShared).
    const where = mockPrisma.article.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ ownerUserId: 1, deletedAt: null });
  });

  it("is a no-op when nothing to add", async () => {
    const result = await ArticleService.bulkAssign([5, 6], 1, [], []);
    expect(result).toEqual({ count: 0 });
    expect(mockPrisma.article.findMany).not.toHaveBeenCalled();
  });
});

describe("ArticleService.list — search", () => {
  beforeEach(() => {
    mockPrisma.article.findMany.mockResolvedValue([]);
    mockPrisma.article.count.mockResolvedValue(0);
  });

  it("requires every search term to match name, model, description, brand, or serial", async () => {
    await ArticleService.list(7, { q: "cordless drill" });

    const arg = mockPrisma.article.findMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ ownerUserId: 7 });
    expect(arg.where.AND).toHaveLength(2);
    expect(arg.where.AND[0]).toEqual({
      OR: [
        { articleNom: { contains: "cordless", mode: "insensitive" } },
        { articleModele: { contains: "cordless", mode: "insensitive" } },
        { articleDescription: { contains: "cordless", mode: "insensitive" } },
        { brand: { contains: "cordless", mode: "insensitive" } },
        { serialNumber: { contains: "cordless", mode: "insensitive" } },
      ],
    });
    expect(arg.where.AND[1].OR[0]).toEqual({
      articleNom: { contains: "drill", mode: "insensitive" },
    });
  });

  it("defaults to {articleId: desc} ordering when sort is unset", async () => {
    await ArticleService.list(7, {});
    const arg = mockPrisma.article.findMany.mock.calls[0][0];
    expect(arg.orderBy).toEqual({ articleId: "desc" });
  });

  it("passes sort=articleNom + dir=asc through to Prisma orderBy", async () => {
    await ArticleService.list(7, { sort: "articleNom", dir: "asc" });
    const arg = mockPrisma.article.findMany.mock.calls[0][0];
    expect(arg.orderBy).toEqual({ articleNom: "asc" });
  });

  it("nulls-last when sorting by purchasePrice (column is nullable)", async () => {
    await ArticleService.list(7, { sort: "purchasePrice", dir: "desc" });
    const arg = mockPrisma.article.findMany.mock.calls[0][0];
    expect(arg.orderBy).toEqual({
      purchasePrice: { sort: "desc", nulls: "last" },
    });
  });

  it("translates createdFrom/createdTo to a createdAt range", async () => {
    const from = new Date("2026-01-01");
    const to = new Date("2026-02-01");
    await ArticleService.list(7, { createdFrom: from, createdTo: to });
    const arg = mockPrisma.article.findMany.mock.calls[0][0];
    expect(arg.where.createdAt).toEqual({ gte: from, lte: to });
  });

  it("omits the text clause when no query is given", async () => {
    await ArticleService.list(7, { locationId: 3 });
    const arg = mockPrisma.article.findMany.mock.calls[0][0];
    expect(arg.where.AND).toBeUndefined();
    expect(arg.where.locations).toEqual({ some: { locationId: 3 } });
  });
});
