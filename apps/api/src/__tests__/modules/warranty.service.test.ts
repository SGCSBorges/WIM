import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    garantie: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    article: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("../../modules/alerts/alert.service", () => ({
  AlertService: {
    scheduleForWarranty: vi.fn().mockResolvedValue(undefined),
    cancelForWarranty: vi.fn().mockResolvedValue(undefined),
  },
}));

import { prisma } from "../../libs/prisma";
import { AlertService } from "../../modules/alerts/alert.service";
import { WarrantyService } from "../../modules/warranties/warranty.service";

const mockPrisma = prisma as unknown as {
  garantie: Record<string, ReturnType<typeof vi.fn>>;
  article: Record<string, ReturnType<typeof vi.fn>>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WarrantyService.create", () => {
  const baseInput = {
    garantieArticleId: 5,
    garantieNom: "AppleCare",
    garantieDateAchat: new Date("2024-01-01"),
    garantieDuration: 24,
    ownerUserId: 1,
  };

  it("rejects with 403 when article does not belong to user", async () => {
    mockPrisma.article.findFirst.mockResolvedValue(null);
    await expect(WarrantyService.create(baseInput)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("rejects with 409 when a warranty already exists for the article", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({ articleId: 5 });
    mockPrisma.garantie.findUnique.mockResolvedValue({ garantieId: 1, garantieArticleId: 5 });
    await expect(WarrantyService.create(baseInput)).rejects.toMatchObject({
      status: 409,
      message: "A warranty already exists for this article",
    });
  });

  it("creates warranty and schedules alerts on success", async () => {
    const created = {
      garantieId: 10,
      ownerUserId: 1,
      garantieArticleId: 5,
      garantieFin: new Date("2026-01-01"),
    };
    mockPrisma.article.findFirst.mockResolvedValue({ articleId: 5 });
    mockPrisma.garantie.findUnique.mockResolvedValue(null);
    mockPrisma.garantie.create.mockResolvedValue(created);

    const result = await WarrantyService.create(baseInput);

    expect(result).toEqual(created);
    expect(AlertService.scheduleForWarranty).toHaveBeenCalledWith(
      expect.objectContaining({ garantieId: 10, ownerUserId: 1 })
    );
  });
});
