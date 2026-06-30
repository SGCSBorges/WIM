import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    articleTemplate: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { prisma } from "../../libs/prisma";
import { ArticleTemplateService } from "../../modules/articles/template.service";

const mockPrisma = prisma as unknown as {
  articleTemplate: Record<string, ReturnType<typeof vi.fn>>;
};

const OWNER = 7;

beforeEach(() => vi.resetAllMocks());

describe("ArticleTemplateService", () => {
  it("list is owner-scoped, newest first", async () => {
    mockPrisma.articleTemplate.findMany.mockResolvedValue([]);
    await ArticleTemplateService.list(OWNER);
    expect(mockPrisma.articleTemplate.findMany).toHaveBeenCalledWith({
      where: { ownerUserId: OWNER },
      orderBy: { updatedAt: "desc" },
    });
  });

  it("get returns an owned row", async () => {
    mockPrisma.articleTemplate.findFirst.mockResolvedValue({ id: 1, name: "T" });
    const row = await ArticleTemplateService.get(1, OWNER);
    expect(row).toEqual({ id: 1, name: "T" });
    expect(mockPrisma.articleTemplate.findFirst).toHaveBeenCalledWith({
      where: { id: 1, ownerUserId: OWNER },
    });
  });

  it("get 404s a row the caller doesn't own", async () => {
    mockPrisma.articleTemplate.findFirst.mockResolvedValue(null);
    await expect(ArticleTemplateService.get(1, OWNER)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("create stores the payload under the owner", async () => {
    mockPrisma.articleTemplate.create.mockResolvedValue({ id: 3 });
    await ArticleTemplateService.create(OWNER, "Laptop", {
      articleModele: "X1",
      tagNames: ["work"],
    });
    expect(mockPrisma.articleTemplate.create).toHaveBeenCalledWith({
      data: {
        ownerUserId: OWNER,
        name: "Laptop",
        payload: { articleModele: "X1", tagNames: ["work"] },
      },
    });
  });

  it("update 404s when the row isn't owned (no write attempted)", async () => {
    mockPrisma.articleTemplate.findFirst.mockResolvedValue(null);
    await expect(
      ArticleTemplateService.update(1, OWNER, { name: "New" })
    ).rejects.toMatchObject({ status: 404 });
    expect(mockPrisma.articleTemplate.update).not.toHaveBeenCalled();
  });

  it("update applies only the provided fields", async () => {
    mockPrisma.articleTemplate.findFirst.mockResolvedValue({ id: 1 });
    mockPrisma.articleTemplate.update.mockResolvedValue({ id: 1, name: "New" });
    await ArticleTemplateService.update(1, OWNER, { name: "New" });
    expect(mockPrisma.articleTemplate.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { name: "New" }, // payload omitted → not in the patch
    });
  });

  it("remove 404s when nothing owned matched", async () => {
    mockPrisma.articleTemplate.deleteMany.mockResolvedValue({ count: 0 });
    await expect(
      ArticleTemplateService.remove(1, OWNER)
    ).rejects.toMatchObject({ status: 404 });
  });

  it("remove deletes scoped to the owner", async () => {
    mockPrisma.articleTemplate.deleteMany.mockResolvedValue({ count: 1 });
    await ArticleTemplateService.remove(1, OWNER);
    expect(mockPrisma.articleTemplate.deleteMany).toHaveBeenCalledWith({
      where: { id: 1, ownerUserId: OWNER },
    });
  });
});
