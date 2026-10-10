/**
 * `scheduleForWarranty` persists the reminder's display name into
 * `Alerte.alerteNom`. It is never re-translated afterwards, so it must be
 * written in the owner's language at creation time; otherwise a French user
 * sees "Warranty reminder J-30" in an otherwise French alerts list, agenda,
 * notification bell and data export.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    alerte: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      // Re-arms a CANCELLED row that already occupies the (garantie, date)
      // slot; irrelevant here but on the path.
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findFirst: vi.fn().mockResolvedValue({ alerteId: 1 }),
    },
  },
}));

const queueRef = vi.hoisted(() => ({
  add: vi.fn().mockResolvedValue(undefined),
  getJob: vi.fn(),
}));
vi.mock("../../jobs/queues", () => ({
  alertQueue: { add: queueRef.add, getJob: queueRef.getJob },
}));
vi.mock("../../config/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { prisma } from "../../libs/prisma";
import { AlertService } from "../../modules/alerts/alert.service";

const mockPrisma = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> };
  alerte: {
    createMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
};

/** One year out, so all three default offsets are still in the future. */
function inOneYear() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d;
}

function namesWritten(): string[] {
  return mockPrisma.alerte.createMany.mock.calls.map(
    (c) => (c[0] as { data: Array<{ alerteNom: string }> }).data[0].alerteNom
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.alerte.createMany.mockResolvedValue({ count: 1 });
  mockPrisma.alerte.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.alerte.findFirst.mockResolvedValue({ alerteId: 1 });
});

describe("AlertService.scheduleForWarranty — stored alert name", () => {
  it("writes J-30/J-7/J-1 names in the owner's language", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      warrantyReminderDays: null,
      language: "fr",
    });

    await AlertService.scheduleForWarranty({
      ownerUserId: 1,
      garantieId: 5,
      articleId: 9,
      garantieFin: inOneYear(),
    });

    expect(namesWritten()).toEqual([
      "Rappel garantie J-30",
      "Rappel garantie J-7",
      "Rappel garantie J-1",
    ]);
  });

  it("falls back to French when the owner has no language set", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      warrantyReminderDays: null,
      language: null,
    });

    await AlertService.scheduleForWarranty({
      ownerUserId: 1,
      garantieId: 5,
      garantieFin: inOneYear(),
    });

    expect(namesWritten()[0]).toBe("Rappel garantie J-30");
  });

  it("still falls back to French when the owner row can't be read", async () => {
    mockPrisma.user.findUnique.mockRejectedValue(new Error("db down"));

    await AlertService.scheduleForWarranty({
      ownerUserId: 1,
      garantieId: 5,
      garantieFin: inOneYear(),
    });

    // Reminders are still scheduled — a failed profile read must not cost
    // the user their warranty alerts.
    expect(namesWritten()[0]).toBe("Rappel garantie J-30");
  });

  it("selects the language alongside the custom offsets", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      warrantyReminderDays: "90",
      language: "pt",
    });

    await AlertService.scheduleForWarranty({
      ownerUserId: 1,
      garantieId: 5,
      garantieFin: inOneYear(),
    });

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { warrantyReminderDays: true, language: true },
      })
    );
    expect(namesWritten()).toEqual(["Lembrete de garantia J-90"]);
  });
});
