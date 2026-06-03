/**
 * ArticleService.bulkUpdate: scalar field set patched across a selection,
 * only on owner-owned, non-trashed rows.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => {
  const tx = {
    article: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  return {
    prisma: {
      $transaction: vi.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
      __tx: tx,
    } as never,
  };
});

import { prisma } from "../../libs/prisma";
import { ArticleService } from "../../modules/articles/article.service";

const p = prisma as unknown as {
  __tx: {
    article: {
      findMany: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ArticleService.bulkUpdate", () => {
  it("no-ops with zero ids", async () => {
    const result = await ArticleService.bulkUpdate([], 7, { brand: "Bosch" });
    expect(result.count).toBe(0);
    expect(p.__tx.article.updateMany).not.toHaveBeenCalled();
  });

  it("no-ops with no fields", async () => {
    const result = await ArticleService.bulkUpdate([1, 2], 7, {});
    expect(result.count).toBe(0);
  });

  it("scopes to owner-owned, non-trashed rows and forwards the field set", async () => {
    p.__tx.article.findMany.mockResolvedValue([
      { articleId: 1 },
      { articleId: 2 },
    ]);
    p.__tx.article.updateMany.mockResolvedValue({ count: 2 });

    const result = await ArticleService.bulkUpdate([1, 2, 999], 7, {
      brand: "Bosch",
      purchasePrice: 199.99,
    });

    expect(p.__tx.article.findMany).toHaveBeenCalledWith({
      where: { articleId: { in: [1, 2, 999] }, ownerUserId: 7, deletedAt: null },
      select: { articleId: true },
    });
    expect(p.__tx.article.updateMany).toHaveBeenCalledWith({
      where: { articleId: { in: [1, 2] } },
      data: { brand: "Bosch", purchasePrice: 199.99 },
    });
    expect(result.count).toBe(2);
  });

  it("passes null through to clear a field", async () => {
    p.__tx.article.findMany.mockResolvedValue([{ articleId: 1 }]);
    p.__tx.article.updateMany.mockResolvedValue({ count: 1 });
    await ArticleService.bulkUpdate([1], 7, { serialNumber: null });
    expect(p.__tx.article.updateMany).toHaveBeenCalledWith({
      where: { articleId: { in: [1] } },
      data: { serialNumber: null },
    });
  });

  it("returns zero when nothing is owned by the caller", async () => {
    p.__tx.article.findMany.mockResolvedValue([]);
    const result = await ArticleService.bulkUpdate([1, 2], 7, {
      brand: "Bosch",
    });
    expect(result.count).toBe(0);
    expect(p.__tx.article.updateMany).not.toHaveBeenCalled();
  });
});
