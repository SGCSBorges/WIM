import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    garantie: { findUnique: vi.fn() },
    alerte: { findUnique: vi.fn() },
  },
}));

vi.mock("../../modules/alerts/alert.service", () => ({
  AlertService: {
    markSent: vi.fn(),
    markFailed: vi.fn(),
    createRecurrenceFollowUp: vi.fn(),
  },
}));

vi.mock("../../config/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { prisma } from "../../libs/prisma";
import { AlertService } from "../../modules/alerts/alert.service";
import { ReminderProcessor } from "../../jobs/processors/reminder.processor";

const mockPrisma = prisma as unknown as {
  garantie: { findUnique: ReturnType<typeof vi.fn> };
  alerte: { findUnique: ReturnType<typeof vi.fn> };
};
const svc = AlertService as unknown as {
  markSent: ReturnType<typeof vi.fn>;
  createRecurrenceFollowUp: ReturnType<typeof vi.fn>;
};

// Minimal Job stub.
const job = (data: unknown) => ({ id: "j1", data }) as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ReminderProcessor", () => {
  it("marks a warranty reminder sent", async () => {
    mockPrisma.garantie.findUnique.mockResolvedValue({
      garantieId: 5,
      garantieNom: "W",
      garantieFin: new Date(),
    });
    await ReminderProcessor.handle(
      job({
        type: "warranty_reminder",
        ownerUserId: 1,
        garantieId: 5,
        reminderKind: "J30",
        executeAt: new Date().toISOString(),
        alerteId: 9,
      })
    );
    expect(svc.markSent).toHaveBeenCalledWith(9);
  });

  it("skips a warranty reminder whose warranty was deleted", async () => {
    mockPrisma.garantie.findUnique.mockResolvedValue(null);
    await ReminderProcessor.handle(
      job({
        type: "warranty_reminder",
        ownerUserId: 1,
        garantieId: 5,
        reminderKind: "J7",
        executeAt: new Date().toISOString(),
        alerteId: 9,
      })
    );
    expect(svc.markSent).not.toHaveBeenCalled();
  });

  it("marks a recurring custom alert sent and spawns the next occurrence", async () => {
    mockPrisma.alerte.findUnique.mockResolvedValue({
      alerteId: 12,
      status: "SCHEDULED",
      kind: "CUSTOM",
      recurrenceMonths: 3,
    });
    await ReminderProcessor.handle(
      job({
        type: "custom_alert",
        ownerUserId: 1,
        alerteId: 12,
        executeAt: new Date().toISOString(),
      })
    );
    expect(svc.markSent).toHaveBeenCalledWith(12);
    expect(svc.createRecurrenceFollowUp).toHaveBeenCalledTimes(1);
  });

  it("does not spawn a follow-up for a non-recurring custom alert", async () => {
    mockPrisma.alerte.findUnique.mockResolvedValue({
      alerteId: 13,
      status: "SCHEDULED",
      kind: "CUSTOM",
      recurrenceMonths: null,
    });
    await ReminderProcessor.handle(
      job({
        type: "custom_alert",
        ownerUserId: 1,
        alerteId: 13,
        executeAt: new Date().toISOString(),
      })
    );
    expect(svc.markSent).toHaveBeenCalledWith(13);
    expect(svc.createRecurrenceFollowUp).not.toHaveBeenCalled();
  });

  it("skips a custom alert that is no longer scheduled", async () => {
    mockPrisma.alerte.findUnique.mockResolvedValue({
      alerteId: 14,
      status: "CANCELLED",
      kind: "CUSTOM",
      recurrenceMonths: 1,
    });
    await ReminderProcessor.handle(
      job({
        type: "custom_alert",
        ownerUserId: 1,
        alerteId: 14,
        executeAt: new Date().toISOString(),
      })
    );
    expect(svc.markSent).not.toHaveBeenCalled();
  });
});
