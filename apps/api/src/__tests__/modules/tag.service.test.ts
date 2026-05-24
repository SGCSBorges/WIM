import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    tag: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from "../../libs/prisma";
import { TagService } from "../../modules/tags/tag.service";

const mockPrisma = prisma as unknown as {
  tag: Record<string, ReturnType<typeof vi.fn>>;
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
});
