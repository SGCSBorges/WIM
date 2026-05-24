import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    savedView: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { prisma } from "../../libs/prisma";
import { SavedViewService } from "../../modules/saved-views/saved-view.service";

const mockPrisma = prisma as unknown as {
  savedView: Record<string, ReturnType<typeof vi.fn>>;
};

beforeEach(() => vi.clearAllMocks());

describe("SavedViewService", () => {
  it("lists the owner's views", async () => {
    mockPrisma.savedView.findMany.mockResolvedValue([
      { id: 1, name: "Expiring", query: "warranty=expiringSoon" },
    ]);
    const out = await SavedViewService.list(7);
    expect(out).toHaveLength(1);
    expect(mockPrisma.savedView.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerUserId: 7 } })
    );
  });

  it("creates a view scoped to the owner", async () => {
    mockPrisma.savedView.create.mockResolvedValue({
      id: 2,
      name: "High value",
      query: "priceMin=1000",
    });
    await SavedViewService.create(7, "High value", "priceMin=1000");
    expect(mockPrisma.savedView.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { ownerUserId: 7, name: "High value", query: "priceMin=1000" },
      })
    );
  });

  it("remove rejects a view the caller doesn't own", async () => {
    mockPrisma.savedView.deleteMany.mockResolvedValue({ count: 0 });
    await expect(SavedViewService.remove(99, 7)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("remove deletes an owned view", async () => {
    mockPrisma.savedView.deleteMany.mockResolvedValue({ count: 1 });
    await SavedViewService.remove(5, 7);
    expect(mockPrisma.savedView.deleteMany).toHaveBeenCalledWith({
      where: { id: 5, ownerUserId: 7 },
    });
  });
});
