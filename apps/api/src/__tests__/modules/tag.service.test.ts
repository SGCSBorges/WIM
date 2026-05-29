import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    tag: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    articleTag: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "../../libs/prisma";
import { TagService } from "../../modules/tags/tag.service";

const mockPrisma = prisma as unknown as {
  tag: Record<string, ReturnType<typeof vi.fn>>;
  articleTag: Record<string, ReturnType<typeof vi.fn>>;
  $transaction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TagService", () => {
  it("list maps article counts", async () => {
    mockPrisma.tag.findMany.mockResolvedValue([
      { tagId: 1, name: "Tools", _count: { articles: 3 } },
      { tagId: 2, name: "Electronics", _count: { articles: 0 } },
    ]);

    const result = await TagService.list(7);

    expect(result).toEqual([
      { tagId: 1, name: "Tools", articleCount: 3 },
      { tagId: 2, name: "Electronics", articleCount: 0 },
    ]);
    expect(mockPrisma.tag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerUserId: 7 } })
    );
  });

  it("create persists under the owner", async () => {
    mockPrisma.tag.create.mockResolvedValue({ tagId: 9, name: "Garden" });
    const created = await TagService.create(7, "Garden");
    expect(created).toEqual({ tagId: 9, name: "Garden" });
    expect(mockPrisma.tag.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { ownerUserId: 7, name: "Garden" },
      })
    );
  });

  it("remove rejects a tag the caller does not own", async () => {
    mockPrisma.tag.findFirst.mockResolvedValue(null);
    await expect(TagService.remove(5, 7)).rejects.toMatchObject({
      status: 404,
    });
    expect(mockPrisma.tag.delete).not.toHaveBeenCalled();
  });

  it("remove deletes an owned tag", async () => {
    mockPrisma.tag.findFirst.mockResolvedValue({ tagId: 5 });
    await TagService.remove(5, 7);
    expect(mockPrisma.tag.delete).toHaveBeenCalledWith({
      where: { tagId: 5 },
    });
  });

  it("rename rejects a tag the caller does not own", async () => {
    mockPrisma.tag.findFirst.mockResolvedValue(null);
    await expect(TagService.rename(5, 7, "New")).rejects.toMatchObject({
      status: 404,
    });
    expect(mockPrisma.tag.update).not.toHaveBeenCalled();
  });

  it("rename updates an owned tag", async () => {
    mockPrisma.tag.findFirst.mockResolvedValue({ tagId: 5 });
    mockPrisma.tag.update.mockResolvedValue({ tagId: 5, name: "Tools v2" });
    const result = await TagService.rename(5, 7, "Tools v2");
    expect(result).toEqual({ tagId: 5, name: "Tools v2" });
    expect(mockPrisma.tag.update).toHaveBeenCalledWith({
      where: { tagId: 5 },
      data: { name: "Tools v2" },
      select: { tagId: true, name: true },
    });
  });

  it("merge rejects when fromId === intoId", async () => {
    await expect(TagService.merge(3, 3, 7)).rejects.toMatchObject({
      status: 400,
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("merge repoints article links, drops duplicates, deletes the source", async () => {
    // The service body runs inside prisma.$transaction(async (tx) => …).
    // Capture the callback, run it against a synchronous tx mock, then assert
    // the calls that hit the tx.
    const txTag = {
      findMany: vi.fn(),
      delete: vi.fn(),
    };
    const txArticleTag = {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
    };
    txTag.findMany.mockResolvedValue([{ tagId: 3 }, { tagId: 8 }]);
    // intoId=8 already on article 12; fromId=3 is on 12 and 17.
    txArticleTag.findMany.mockResolvedValue([{ articleId: 12 }]);
    txArticleTag.deleteMany.mockResolvedValue({ count: 1 });
    txArticleTag.updateMany.mockResolvedValue({ count: 1 });
    txTag.delete.mockResolvedValue({ tagId: 3 });

    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: unknown) => unknown) =>
        cb({ tag: txTag, articleTag: txArticleTag })
    );

    const result = await TagService.merge(3, 8, 7);

    expect(txTag.findMany).toHaveBeenCalledWith({
      where: { tagId: { in: [3, 8] }, ownerUserId: 7 },
      select: { tagId: true },
    });
    expect(txArticleTag.deleteMany).toHaveBeenCalledWith({
      where: { tagId: 3, articleId: { in: [12] } },
    });
    expect(txArticleTag.updateMany).toHaveBeenCalledWith({
      where: { tagId: 3 },
      data: { tagId: 8 },
    });
    expect(txTag.delete).toHaveBeenCalledWith({ where: { tagId: 3 } });
    expect(result).toEqual({ articlesAffected: 1 });
  });

  it("merge rejects 404 when either tag isn't owned by the caller", async () => {
    const txTag = { findMany: vi.fn() };
    txTag.findMany.mockResolvedValue([{ tagId: 3 }]); // only one returned
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: unknown) => unknown) => cb({ tag: txTag, articleTag: {} })
    );
    await expect(TagService.merge(3, 8, 7)).rejects.toMatchObject({
      status: 404,
    });
  });
});
