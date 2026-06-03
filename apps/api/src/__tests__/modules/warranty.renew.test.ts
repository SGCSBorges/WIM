/**
 * Warranty renew / extend / history. Verifies the live row is rolled forward,
 * a WarrantyHistory snapshot is written for the prior state, and the
 * reminders are rescheduled against the new end date.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => {
  const tx = {
    warrantyHistory: { create: vi.fn() },
    garantie: { update: vi.fn() },
  };
  return {
    prisma: {
      garantie: {
        findFirst: vi.fn(),
      },
      warrantyHistory: {
        findMany: vi.fn(),
      },
      // The service passes a callback to $transaction; we hand it our shared
      // tx stub so the test can assert on the snapshot + update calls.
      $transaction: vi.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
      __tx: tx,
    } as never,
  };
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

const p = prisma as unknown as {
  garantie: { findFirst: ReturnType<typeof vi.fn> };
  warrantyHistory: { findMany: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
  __tx: {
    warrantyHistory: { create: ReturnType<typeof vi.fn> };
    garantie: { update: ReturnType<typeof vi.fn> };
  };
};

const alerts = AlertService as unknown as Record<
  string,
  ReturnType<typeof vi.fn>
>;

const baseWarranty = {
  garantieId: 42,
  ownerUserId: 7,
  garantieArticleId: 100,
  garantieNom: "Laptop",
  garantieDateAchat: new Date("2024-01-01"),
  garantieDuration: 24,
  garantieFin: new Date("2026-01-01"),
  garantieIsValide: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WarrantyService.renew", () => {
  it("snapshots the prior state then rolls the live row forward", async () => {
    p.garantie.findFirst.mockResolvedValue(baseWarranty);
    p.__tx.garantie.update.mockResolvedValue({
      ...baseWarranty,
      garantieDateAchat: new Date("2026-01-01"),
      garantieDuration: 12,
      garantieFin: new Date("2027-01-01"),
      renewedAt: new Date(),
    });

    await WarrantyService.renew(42, 7, {
      garantieDateAchat: new Date("2026-01-01"),
      garantieDuration: 12,
    });

    expect(p.__tx.warrantyHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        garantieId: 42,
        ownerUserId: 7,
        event: "RENEWED",
        priorDateAchat: baseWarranty.garantieDateAchat,
        priorDuration: 24,
        priorFin: baseWarranty.garantieFin,
      }),
    });
    expect(p.__tx.garantie.update).toHaveBeenCalledWith({
      where: { garantieId: 42 },
      data: expect.objectContaining({
        garantieDuration: 12,
        garantieIsValide: true,
      }),
    });
  });

  it("reschedules the J-30/J-7/J-1 alerts against the new end date", async () => {
    p.garantie.findFirst.mockResolvedValue(baseWarranty);
    p.__tx.garantie.update.mockResolvedValue({
      ...baseWarranty,
      garantieFin: new Date("2027-01-01"),
    });

    await WarrantyService.renew(42, 7, {
      garantieDateAchat: new Date("2026-01-01"),
      garantieDuration: 12,
    });

    expect(alerts.rescheduleForWarranty).toHaveBeenCalledWith(
      expect.objectContaining({
        garantieId: 42,
        garantieFin: new Date("2027-01-01"),
      })
    );
  });

  it("404s when the warranty is not owned by the caller", async () => {
    p.garantie.findFirst.mockResolvedValue(null);
    await expect(
      WarrantyService.renew(42, 7, {
        garantieDateAchat: new Date("2026-01-01"),
        garantieDuration: 12,
      })
    ).rejects.toThrow(/not found/i);
    expect(alerts.rescheduleForWarranty).not.toHaveBeenCalled();
  });
});

describe("WarrantyService.extend", () => {
  it("rolls garantieFin forward by N months and snapshots EXTENDED", async () => {
    p.garantie.findFirst.mockResolvedValue(baseWarranty);
    p.__tx.garantie.update.mockResolvedValue({
      ...baseWarranty,
      garantieDuration: 36,
      garantieFin: new Date("2027-01-01"),
    });

    await WarrantyService.extend(42, 7, { months: 12 });

    expect(p.__tx.warrantyHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event: "EXTENDED",
        priorDuration: 24,
      }),
    });
    expect(p.__tx.garantie.update).toHaveBeenCalledWith({
      where: { garantieId: 42 },
      data: expect.objectContaining({ garantieDuration: 36 }),
    });
    expect(alerts.rescheduleForWarranty).toHaveBeenCalled();
  });
});

describe("WarrantyService.getHistory", () => {
  it("returns the chain when the warranty is owned by the caller", async () => {
    p.garantie.findFirst.mockResolvedValue({ garantieId: 42 });
    p.warrantyHistory.findMany.mockResolvedValue([
      { id: 1, garantieId: 42, event: "RENEWED" },
    ]);
    const rows = await WarrantyService.getHistory(42, 7);
    expect(rows).toHaveLength(1);
    expect(p.warrantyHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { garantieId: 42, ownerUserId: 7 },
      })
    );
  });

  it("404s when the warranty is not owned", async () => {
    p.garantie.findFirst.mockResolvedValue(null);
    await expect(WarrantyService.getHistory(42, 7)).rejects.toThrow(
      /not found/i
    );
  });
});
