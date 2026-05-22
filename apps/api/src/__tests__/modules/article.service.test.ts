import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    article: {
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    attachment: {
      findFirst: vi.fn(),
    },
    location: {
      count: vi.fn(),
    },
    // create() now wraps ownership + insert in a transaction; the test's
    // tx client mirrors prisma's surface so callbacks reach the mocked
    // location.count.
    $transaction: vi.fn(async (cb: unknown) => {
      if (typeof cb !== "function") return undefined;
      const tx = {
        location: {
          count: (
            prisma as unknown as {
              location: { count: ReturnType<typeof vi.fn> };
            }
          ).location.count,
        },
        attachment: {
          findFirst: (
            prisma as unknown as {
              attachment: { findFirst: ReturnType<typeof vi.fn> };
            }
          ).attachment.findFirst,
        },
        article: {
          create: (
            prisma as unknown as {
              article: { create: ReturnType<typeof vi.fn> };
            }
          ).article.create,
        },
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
