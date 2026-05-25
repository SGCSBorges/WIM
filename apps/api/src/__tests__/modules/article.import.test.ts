import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    location: { upsert: vi.fn(), findMany: vi.fn() },
    tag: { upsert: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("../../modules/articles/article.service", () => ({
  ArticleService: { create: vi.fn() },
}));

import { prisma } from "../../libs/prisma";
import { ArticleService } from "../../modules/articles/article.service";
import { importArticles } from "../../modules/articles/article.import";

const mockPrisma = prisma as unknown as {
  location: {
    upsert: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  tag: {
    upsert: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
};
const mockCreate = ArticleService.create as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  // location/tag upsert echo a deterministic id derived from the name length.
  mockPrisma.location.upsert.mockImplementation(({ create }) =>
    Promise.resolve({ locationId: 100 + create.name.length })
  );
  mockPrisma.tag.upsert.mockImplementation(({ create }) =>
    Promise.resolve({ tagId: 200 + create.name.length })
  );
  // By default no names pre-exist, so the cap check counts every name as new.
  mockPrisma.location.findMany.mockResolvedValue([]);
  mockPrisma.tag.findMany.mockResolvedValue([]);
  mockCreate.mockResolvedValue({ articleId: 1 });
});

describe("importArticles", () => {
  it("creates valid rows and resolves locations + tags by name", async () => {
    const result = await importArticles(7, [
      {
        name: "Drill",
        model: "DW-100",
        locations: ["Garage"],
        tags: ["Tools"],
      },
    ]);

    expect(result).toMatchObject({ created: 1, errors: [] });
    expect(mockPrisma.location.upsert).toHaveBeenCalledTimes(1);
    expect(mockPrisma.tag.upsert).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        articleNom: "Drill",
        articleModele: "DW-100",
        locationIds: [106], // "Garage".length = 6 -> 100 + 6
        tagIds: [205], // "Tools".length = 5 -> 200 + 5
      })
    );
  });

  it("isolates per-row failures and reports them", async () => {
    const result = await importArticles(7, [
      { name: "OK", model: "M1", locations: ["Home"], tags: [] },
      { name: "", model: "M2", locations: ["Home"], tags: [] }, // missing name
      { name: "NoLoc", model: "M3", locations: [], tags: [] }, // no location
    ]);

    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[1].row).toBe(3);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("surfaces an ArticleService.create failure as a row error", async () => {
    mockCreate.mockRejectedValueOnce(new Error("boom"));
    const result = await importArticles(7, [
      { name: "X", model: "Y", locations: ["L"], tags: [] },
    ]);
    expect(result.created).toBe(0);
    expect(result.errors).toEqual([{ row: 1, message: "boom" }]);
  });

  it("dry run validates rows but writes nothing", async () => {
    const result = await importArticles(
      7,
      [
        { name: "OK", model: "M1", locations: ["Home"], tags: ["T"] },
        { name: "", model: "M2", locations: ["Home"], tags: [] }, // invalid
      ],
      { dryRun: true }
    );

    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.dryRun).toBe(true);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockPrisma.location.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.tag.upsert).not.toHaveBeenCalled();
  });

  it("rejects an import that would create more than 50 new locations", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({
      name: `A${i}`,
      model: "M",
      locations: [`Loc-${i}`],
      tags: [],
    }));

    await expect(importArticles(7, rows)).rejects.toMatchObject({
      status: 400,
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("does not count already-owned locations against the new-entity cap", async () => {
    // All 51 location names already exist → zero new, so no cap breach.
    mockPrisma.location.findMany.mockResolvedValue(
      Array.from({ length: 51 }, (_, i) => ({ name: `Loc-${i}` }))
    );
    const rows = Array.from({ length: 51 }, (_, i) => ({
      name: `A${i}`,
      model: "M",
      locations: [`Loc-${i}`],
      tags: [],
    }));

    const result = await importArticles(7, rows, { dryRun: true });
    expect(result.created).toBe(51);
  });
});
