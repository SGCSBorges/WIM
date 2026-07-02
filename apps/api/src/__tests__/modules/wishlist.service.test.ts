import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    wishlistItem: {
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { prisma } from "../../libs/prisma";
import { WishlistService } from "../../modules/wishlist/wishlist.service";

const mockPrisma = prisma as unknown as {
  wishlistItem: Record<string, ReturnType<typeof vi.fn>>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WishlistService", () => {
  it("list is owner-scoped with open wishes first", async () => {
    mockPrisma.wishlistItem.findMany.mockResolvedValue([]);
    await WishlistService.list(7);
    const arg = mockPrisma.wishlistItem.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ ownerUserId: 7 });
    expect(arg.orderBy[0]).toEqual({
      purchasedAt: { sort: "asc", nulls: "first" },
    });
  });

  it("update puts the ownership precondition in the WHERE and 404s on a miss", async () => {
    mockPrisma.wishlistItem.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      WishlistService.update(5, 7, { name: "TV" })
    ).rejects.toMatchObject({ status: 404 });
    expect(mockPrisma.wishlistItem.updateMany.mock.calls[0][0].where).toEqual({
      id: 5,
      ownerUserId: 7,
    });
    expect(mockPrisma.wishlistItem.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("setPurchased stamps purchasedAt atomically and clears it on undo", async () => {
    mockPrisma.wishlistItem.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.wishlistItem.findUniqueOrThrow.mockResolvedValue({ id: 5 });

    await WishlistService.setPurchased(5, 7, true);
    expect(
      mockPrisma.wishlistItem.updateMany.mock.calls[0][0].data.purchasedAt
    ).toBeInstanceOf(Date);

    await WishlistService.setPurchased(5, 7, false);
    expect(
      mockPrisma.wishlistItem.updateMany.mock.calls[1][0].data.purchasedAt
    ).toBeNull();
  });

  it("remove 404s when the row belongs to someone else", async () => {
    mockPrisma.wishlistItem.deleteMany.mockResolvedValue({ count: 0 });
    await expect(WishlistService.remove(5, 7)).rejects.toMatchObject({
      status: 404,
    });
    expect(mockPrisma.wishlistItem.deleteMany.mock.calls[0][0].where).toEqual({
      id: 5,
      ownerUserId: 7,
    });
  });
});
