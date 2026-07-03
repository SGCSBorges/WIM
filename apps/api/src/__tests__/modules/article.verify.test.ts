/**
 * ArticleService.verify / bulkVerify: the physical inventory check stamp.
 * Both are atomic updateMany calls with the ownership + not-trashed
 * precondition in the WHERE clause (never read-then-update).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    article: {
      updateMany: vi.fn(),
    },
  } as never,
}));

import { prisma } from "../../libs/prisma";
import { ArticleService } from "../../modules/articles/article.service";

const p = prisma as unknown as {
  article: { updateMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ArticleService.verify", () => {
  it("stamps lastVerifiedAt with the precondition in the WHERE clause", async () => {
    p.article.updateMany.mockResolvedValue({ count: 1 });

    const stamp = await ArticleService.verify(42, 7);

    expect(stamp).toBeInstanceOf(Date);
    expect(p.article.updateMany).toHaveBeenCalledWith({
      where: { articleId: 42, ownerUserId: 7, deletedAt: null },
      data: { lastVerifiedAt: stamp },
    });
  });

  it("404s when the row is not owned (or trashed) — count 0", async () => {
    p.article.updateMany.mockResolvedValue({ count: 0 });

    await expect(ArticleService.verify(42, 7)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("ArticleService.bulkVerify", () => {
  it("no-ops with zero ids", async () => {
    const result = await ArticleService.bulkVerify([], 7);
    expect(result.count).toBe(0);
    expect(p.article.updateMany).not.toHaveBeenCalled();
  });

  it("scopes to owner-owned, non-trashed rows and reports the touched count", async () => {
    p.article.updateMany.mockResolvedValue({ count: 2 });

    const result = await ArticleService.bulkVerify([1, 2, 999], 7);

    expect(result.count).toBe(2);
    expect(result.lastVerifiedAt).toBeInstanceOf(Date);
    expect(p.article.updateMany).toHaveBeenCalledWith({
      where: {
        articleId: { in: [1, 2, 999] },
        ownerUserId: 7,
        deletedAt: null,
      },
      data: { lastVerifiedAt: result.lastVerifiedAt },
    });
  });
});
