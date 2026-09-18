import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    location: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    article: {
      findFirst: vi.fn(),
    },
    articleLocation: {
      upsert: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "../../libs/prisma";
import { LocationService } from "../../modules/locations/location.service";

const mockPrisma = prisma as unknown as {
  location: Record<string, ReturnType<typeof vi.fn>>;
  article: Record<string, ReturnType<typeof vi.fn>>;
  articleLocation: Record<string, ReturnType<typeof vi.fn>>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe("LocationService.list", () => {
  it("returns totalValue=0 with no extra queries when no locations exist", async () => {
    mockPrisma.location.findMany.mockResolvedValue([]);
    const result = await LocationService.list(1);
    expect(result).toEqual([]);
    expect(mockPrisma.articleLocation.findMany).not.toHaveBeenCalled();
  });

  it("sums purchasePrice per location and ignores null prices", async () => {
    mockPrisma.location.findMany.mockResolvedValue([
      { locationId: 1, name: "Home", _count: { articles: 3 } },
      { locationId: 2, name: "Office", _count: { articles: 1 } },
    ]);
    mockPrisma.articleLocation.findMany.mockResolvedValue([
      { locationId: 1, article: { purchasePrice: "100.50" } },
      { locationId: 1, article: { purchasePrice: 49.5 } },
      { locationId: 1, article: { purchasePrice: null } },
      { locationId: 2, article: { purchasePrice: "250" } },
    ]);

    const result = await LocationService.list(1);
    expect(result).toMatchObject([
      { locationId: 1, totalValue: 150 },
      { locationId: 2, totalValue: 250 },
    ]);
  });

  // totalValue is a VALUE figure, so it must reflect current holdings. The
  // _count beside it deliberately keeps SOLD/DISPOSED/LOST rows. Without the
  // exclusion here this page and /locations/value (getLocationBreakdown,
  // which does exclude them) disagreed the moment an item was marked sold.
  it("excludes not-owned statuses from the value query, but not the count", async () => {
    mockPrisma.location.findMany.mockResolvedValue([
      { locationId: 1, name: "Home", _count: { articles: 3 } },
    ]);
    mockPrisma.articleLocation.findMany.mockResolvedValue([]);

    await LocationService.list(1);

    expect(mockPrisma.articleLocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          article: expect.objectContaining({
            status: { notIn: ["SOLD", "DISPOSED", "LOST"] },
          }),
        }),
      })
    );
    // The count must NOT be narrowed the same way — you still own the record.
    const countArg = mockPrisma.location.findMany.mock.calls[0][0];
    expect(JSON.stringify(countArg)).not.toContain("SOLD");
  });

  // statistics.service accumulates in integer cents so repeated float
  // addition can't drift the dashboard totals; this surface has to match or
  // the two disagree by fractions of a cent on long lists.
  it("accumulates in integer cents like the dashboard does", async () => {
    mockPrisma.location.findMany.mockResolvedValue([
      { locationId: 1, name: "Home", _count: { articles: 3 } },
    ]);
    mockPrisma.articleLocation.findMany.mockResolvedValue([
      // 0.01 + 0.14 is one of the pairs where scaling to cents as floats and
      // adding gives 0.15000000000000002; rounding to integer cents first
      // gives exactly 0.15. Picked by search — most 2dp pairs do NOT drift,
      // so an arbitrary pair here would pass either way and prove nothing.
      { locationId: 1, article: { purchasePrice: "0.01", quantity: 1 } },
      { locationId: 1, article: { purchasePrice: "0.14", quantity: 1 } },
    ]);

    const result = await LocationService.list(1);
    expect(result[0].totalValue).toBe(0.15);
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe("LocationService.update", () => {
  it("rejects with 404 when location not found or not owned", async () => {
    mockPrisma.location.findFirst.mockResolvedValue(null);
    await expect(
      LocationService.update(99, 1, { name: "New" })
    ).rejects.toMatchObject({ status: 404, message: "Location not found" });
    expect(mockPrisma.location.update).not.toHaveBeenCalled();
  });

  it("updates and returns the location when ownership is confirmed", async () => {
    const loc = { locationId: 5, ownerUserId: 1, name: "Old" };
    const updated = { ...loc, name: "New" };
    mockPrisma.location.findFirst.mockResolvedValue(loc);
    mockPrisma.location.update.mockResolvedValue(updated);

    const result = await LocationService.update(5, 1, { name: "New" });
    expect(result).toEqual(updated);
    expect(mockPrisma.location.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { locationId: 5 },
        data: { name: "New" },
      })
    );
  });
});

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

describe("LocationService.remove", () => {
  it("rejects with 404 when location not found or not owned", async () => {
    mockPrisma.location.findFirst.mockResolvedValue(null);
    await expect(LocationService.remove(99, 1)).rejects.toMatchObject({
      status: 404,
    });
    expect(mockPrisma.location.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes the location when ownership is confirmed", async () => {
    mockPrisma.location.findFirst.mockResolvedValue({
      locationId: 3,
      ownerUserId: 1,
    });
    mockPrisma.location.deleteMany.mockResolvedValue({ count: 1 });

    await LocationService.remove(3, 1);
    expect(mockPrisma.location.deleteMany).toHaveBeenCalledWith({
      where: { locationId: 3, ownerUserId: 1 },
    });
  });
});

// ---------------------------------------------------------------------------
// addArticle
// ---------------------------------------------------------------------------

describe("LocationService.addArticle", () => {
  it("rejects with 404 when location does not belong to user", async () => {
    mockPrisma.location.findFirst.mockResolvedValue(null);
    mockPrisma.article.findFirst.mockResolvedValue({ articleId: 1 });
    await expect(LocationService.addArticle(99, 1, 1)).rejects.toMatchObject({
      status: 404,
      message: "Location not found",
    });
    expect(mockPrisma.articleLocation.upsert).not.toHaveBeenCalled();
  });

  it("rejects with 404 when article does not belong to user", async () => {
    mockPrisma.location.findFirst.mockResolvedValue({ locationId: 1 });
    mockPrisma.article.findFirst.mockResolvedValue(null);
    await expect(LocationService.addArticle(1, 1, 99)).rejects.toMatchObject({
      status: 404,
      message: "Article not found",
    });
    expect(mockPrisma.articleLocation.upsert).not.toHaveBeenCalled();
  });

  it("upserts the article-location link when both belong to the user", async () => {
    mockPrisma.location.findFirst.mockResolvedValue({ locationId: 2 });
    mockPrisma.article.findFirst.mockResolvedValue({ articleId: 7 });
    mockPrisma.articleLocation.upsert.mockResolvedValue({
      articleId: 7,
      locationId: 2,
    });

    const result = await LocationService.addArticle(2, 1, 7);
    expect(result).toMatchObject({ articleId: 7, locationId: 2 });
    expect(mockPrisma.articleLocation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { articleId_locationId: { articleId: 7, locationId: 2 } },
        create: { articleId: 7, locationId: 2 },
      })
    );
  });
});

// ---------------------------------------------------------------------------
// nested locations — parent validation + cycle guard
// ---------------------------------------------------------------------------

describe("LocationService parent hierarchy", () => {
  it("create rejects a parent owned by someone else", async () => {
    mockPrisma.location.findFirst.mockResolvedValue(null);
    await expect(
      LocationService.create({
        ownerUserId: 1,
        name: "Shelf",
        parentLocationId: 99,
      })
    ).rejects.toMatchObject({ status: 404 });
    expect(mockPrisma.location.create).not.toHaveBeenCalled();
  });

  it("update rejects making a location its own parent", async () => {
    mockPrisma.location.findFirst.mockResolvedValueOnce({ locationId: 5 });
    await expect(
      LocationService.update(5, 1, { parentLocationId: 5 })
    ).rejects.toMatchObject({ status: 400 });
    expect(mockPrisma.location.update).not.toHaveBeenCalled();
  });

  it("update rejects moving a location under its own descendant", async () => {
    // Tree: 5 → 6 → 7. Moving 5 under 7 must fail: walking up from 7 hits 5.
    mockPrisma.location.findFirst
      .mockResolvedValueOnce({ locationId: 5 }) // ownership check for id=5
      .mockResolvedValueOnce({ locationId: 7, parentLocationId: 6 }) // parent row
      .mockResolvedValueOnce({ parentLocationId: 5 }); // walk: 6 → 5
    await expect(
      LocationService.update(5, 1, { parentLocationId: 7 })
    ).rejects.toMatchObject({ status: 400 });
    expect(mockPrisma.location.update).not.toHaveBeenCalled();
  });

  it("update accepts a valid re-parent", async () => {
    mockPrisma.location.findFirst
      .mockResolvedValueOnce({ locationId: 5 }) // ownership check
      .mockResolvedValueOnce({ locationId: 2, parentLocationId: null }); // root parent
    mockPrisma.location.update.mockResolvedValue({ locationId: 5 });
    await LocationService.update(5, 1, { parentLocationId: 2 });
    expect(mockPrisma.location.update).toHaveBeenCalledWith({
      where: { locationId: 5 },
      data: { parentLocationId: 2 },
    });
  });
});
