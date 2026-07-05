import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => {
  const mockClient = {
    garantie: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    article: {
      findFirst: vi.fn(),
    },
    // The service re-verifies ownership inside an interactive transaction;
    // the tx client shares the same garantie mocks as the outer one.
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(mockClient)),
  };
  return { prisma: mockClient };
});

vi.mock("../../modules/alerts/alert.service", () => ({
  AlertService: {
    scheduleForWarranty: vi.fn().mockResolvedValue(undefined),
    cancelForWarranty: vi.fn().mockResolvedValue(undefined),
    rescheduleForWarranty: vi.fn().mockResolvedValue(undefined),
  },
}));

import { prisma } from "../../libs/prisma";
import { AlertService } from "../../modules/alerts/alert.service";
import { WarrantyService } from "../../modules/warranties/warranty.service";

const mockPrisma = prisma as unknown as {
  garantie: Record<string, ReturnType<typeof vi.fn>>;
  article: Record<string, ReturnType<typeof vi.fn>>;
};

const mockAlertService = AlertService as unknown as Record<
  string,
  ReturnType<typeof vi.fn>
>;

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
    mockPrisma.garantie.findUnique.mockResolvedValue({
      garantieId: 1,
      garantieArticleId: 5,
    });
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

  it("persists optional provider contact fields on create", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({ articleId: 5 });
    mockPrisma.garantie.findUnique.mockResolvedValue(null);
    mockPrisma.garantie.create.mockResolvedValue({
      garantieId: 11,
      ownerUserId: 1,
      garantieArticleId: 5,
      garantieFin: new Date("2026-01-01"),
    });

    await WarrantyService.create({
      ...baseInput,
      providerName: "Acme Warranty Co",
      providerPhone: "+1-555-0100",
      providerUrl: "https://example.com/claims",
    });

    const call = mockPrisma.garantie.create.mock.calls[0][0];
    expect(call.data.providerName).toBe("Acme Warranty Co");
    expect(call.data.providerPhone).toBe("+1-555-0100");
    expect(call.data.providerUrl).toBe("https://example.com/claims");
  });
});

describe("WarrantyService.update", () => {
  const current = {
    garantieId: 1,
    ownerUserId: 1,
    garantieArticleId: 5,
    garantieDateAchat: new Date("2024-01-01"),
    garantieDuration: 24,
    garantieFin: new Date("2026-01-01"),
  };

  it("rejects with 404 when warranty not found or not owned", async () => {
    mockPrisma.garantie.findFirst.mockResolvedValue(null);
    await expect(
      WarrantyService.update(99, 1, { garantieNom: "new name" })
    ).rejects.toMatchObject({ status: 404, message: "Warranty not found" });
  });

  it("rejects with 403 when new articleId does not belong to user", async () => {
    mockPrisma.garantie.findFirst.mockResolvedValue(current);
    mockPrisma.article.findFirst.mockResolvedValue(null);
    await expect(
      WarrantyService.update(1, 1, { garantieArticleId: 99 })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects with 409 when new articleId already has a warranty", async () => {
    mockPrisma.garantie.findFirst.mockResolvedValue(current);
    mockPrisma.article.findFirst.mockResolvedValue({ articleId: 20 });
    mockPrisma.garantie.findUnique.mockResolvedValue({ garantieId: 77 }); // conflict
    await expect(
      WarrantyService.update(1, 1, { garantieArticleId: 20 })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("reschedules alerts when garantieFin changes (duration update)", async () => {
    const updated = {
      ...current,
      garantieDuration: 36,
      garantieFin: new Date("2027-01-01"),
    };
    mockPrisma.garantie.findFirst.mockResolvedValue(current);
    mockPrisma.garantie.findUnique.mockResolvedValue({ ownerUserId: 1 });
    mockPrisma.garantie.update.mockResolvedValue(updated);

    await WarrantyService.update(1, 1, { garantieDuration: 36 });

    expect(mockAlertService.rescheduleForWarranty).toHaveBeenCalledWith(
      expect.objectContaining({ garantieId: 1, ownerUserId: 1 })
    );
  });

  it("does not reschedule alerts when only the name changes", async () => {
    mockPrisma.garantie.findFirst.mockResolvedValue(current);
    mockPrisma.garantie.findUnique.mockResolvedValue({ ownerUserId: 1 });
    mockPrisma.garantie.update.mockResolvedValue({
      ...current,
      garantieNom: "Renamed",
    });

    await WarrantyService.update(1, 1, { garantieNom: "Renamed" });

    expect(mockAlertService.rescheduleForWarranty).not.toHaveBeenCalled();
  });
});

describe("WarrantyService.updateClaim", () => {
  it("throws 404 when the warranty isn't owned by the caller", async () => {
    mockPrisma.garantie.findFirst.mockResolvedValue(null);
    await expect(
      WarrantyService.updateClaim(9, 1, { status: "OPEN" })
    ).rejects.toMatchObject({ status: 404 });
    expect(mockPrisma.garantie.update).not.toHaveBeenCalled();
  });

  it("sets status + note and stamps claimUpdatedAt when opening a claim", async () => {
    mockPrisma.garantie.findFirst.mockResolvedValue({ garantieId: 5 });
    mockPrisma.garantie.findUnique.mockResolvedValue({ ownerUserId: 1 });
    mockPrisma.garantie.update.mockResolvedValue({});
    await WarrantyService.updateClaim(5, 1, { status: "OPEN", note: "ref-42" });
    const arg = mockPrisma.garantie.update.mock.calls[0][0];
    expect(arg.where).toEqual({ garantieId: 5 });
    expect(arg.data.claimStatus).toBe("OPEN");
    expect(arg.data.claimNote).toBe("ref-42");
    expect(arg.data.claimUpdatedAt).toBeInstanceOf(Date);
  });

  it("clears note + timestamp when resetting to NONE", async () => {
    mockPrisma.garantie.findFirst.mockResolvedValue({ garantieId: 5 });
    mockPrisma.garantie.findUnique.mockResolvedValue({ ownerUserId: 1 });
    mockPrisma.garantie.update.mockResolvedValue({});
    await WarrantyService.updateClaim(5, 1, { status: "NONE", note: "ignored" });
    const arg = mockPrisma.garantie.update.mock.calls[0][0];
    expect(arg.data.claimStatus).toBe("NONE");
    expect(arg.data.claimNote).toBeNull();
    expect(arg.data.claimUpdatedAt).toBeNull();
  });
});

describe("WarrantyService.distinctProviders", () => {
  it("dedups by name keeping the most-recent contact and sorts by name", async () => {
    // findMany returns newest-first (orderBy garantieId desc); the first row
    // seen for a name wins its phone/url.
    mockPrisma.garantie.findMany.mockResolvedValue([
      { providerName: "Sony", providerPhone: "111", providerUrl: "s.example" },
      { providerName: "Apple", providerPhone: "999", providerUrl: null },
      { providerName: "Sony", providerPhone: "OLD", providerUrl: "old" },
    ]);
    const result = await WarrantyService.distinctProviders(7);
    expect(mockPrisma.garantie.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerUserId: 7, providerName: { not: null } },
      })
    );
    expect(result).toEqual([
      { name: "Apple", phone: "999", url: null },
      { name: "Sony", phone: "111", url: "s.example" },
    ]);
  });
});
