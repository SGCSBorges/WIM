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
      expect.objectContaining({ where: { locationId: 5 }, data: { name: "New" } })
    );
  });
});

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

describe("LocationService.remove", () => {
  it("rejects with 404 when location not found or not owned", async () => {
    mockPrisma.location.findFirst.mockResolvedValue(null);
    await expect(LocationService.remove(99, 1)).rejects.toMatchObject({ status: 404 });
    expect(mockPrisma.location.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes the location when ownership is confirmed", async () => {
    mockPrisma.location.findFirst.mockResolvedValue({ locationId: 3, ownerUserId: 1 });
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
    mockPrisma.articleLocation.upsert.mockResolvedValue({ articleId: 7, locationId: 2 });

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
