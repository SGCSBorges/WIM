import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    article: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    attachment: {
      findFirst: vi.fn(),
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

  it("cancels warranty alerts before deleting article that has a warranty", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({
      articleId: 5,
      garantie: { garantieId: 42 },
    });
    mockPrisma.article.delete.mockResolvedValue({});

    await ArticleService.remove(5, 1);

    expect(AlertService.cancelForWarranty).toHaveBeenCalledWith({
      ownerUserId: 1,
      garantieId: 42,
    });
    expect(mockPrisma.article.delete).toHaveBeenCalledWith({
      where: { articleId: 5 },
    });
  });

  it("deletes article without calling AlertService when there is no warranty", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({
      articleId: 7,
      garantie: null,
    });
    mockPrisma.article.delete.mockResolvedValue({});

    await ArticleService.remove(7, 1);

    expect(AlertService.cancelForWarranty).not.toHaveBeenCalled();
    expect(mockPrisma.article.delete).toHaveBeenCalledWith({
      where: { articleId: 7 },
    });
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

  it("is a no-op when nothing to add", async () => {
    const result = await ArticleService.bulkAssign([5, 6], 1, [], []);
    expect(result).toEqual({ count: 0 });
    expect(mockPrisma.article.findMany).not.toHaveBeenCalled();
  });
});
