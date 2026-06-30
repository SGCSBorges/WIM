import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    garantie: { findUnique: vi.fn() },
    alerte: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("../../modules/alerts/alert.service", () => ({
  AlertService: {
    markSent: vi.fn(),
    markFailed: vi.fn().mockResolvedValue(undefined),
    createRecurrenceFollowUp: vi.fn(),
  },
}));

vi.mock("../../modules/push/push.service", () => ({
  PushService: { sendToUser: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("../../modules/email/email.service", () => ({
  EmailService: {
    isConfigured: vi.fn().mockReturnValue(false),
    sendReminderEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../config/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { prisma } from "../../libs/prisma";
import { AlertService } from "../../modules/alerts/alert.service";
import { PushService } from "../../modules/push/push.service";
import { ReminderProcessor } from "../../jobs/processors/reminder.processor";

const push = PushService as unknown as {
  sendToUser: ReturnType<typeof vi.fn>;
};

const mockPrisma = prisma as unknown as {
  garantie: { findUnique: ReturnType<typeof vi.fn> };
  alerte: { findUnique: ReturnType<typeof vi.fn> };
};
const svc = AlertService as unknown as {
  markSent: ReturnType<typeof vi.fn>;
  createRecurrenceFollowUp: ReturnType<typeof vi.fn>;
};

// Minimal Job stub. `attemptsMade` + `opts.attempts` are read by the catch
// block's structured log; supply both so failure-path tests don't trip on a
// missing-property TypeError instead of the actual error they want to assert.
const job = (data: unknown) =>
  ({ id: "j1", data, attemptsMade: 0, opts: { attempts: 3 } }) as never;

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
    mockPrisma.alerte.findUnique.mockResolvedValue({ status: "SCHEDULED" });
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
    expect(push.sendToUser).toHaveBeenCalledWith(1, expect.any(Object));
  });

  it("skips a warranty reminder whose alert row is no longer SCHEDULED", async () => {
    mockPrisma.garantie.findUnique.mockResolvedValue({
      garantieId: 5,
      garantieNom: "W",
      garantieFin: new Date(),
    });
    mockPrisma.alerte.findUnique.mockResolvedValue({ status: "CANCELLED" });
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
    expect(push.sendToUser).not.toHaveBeenCalled();
    expect(svc.markSent).not.toHaveBeenCalled();
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

  it("does NOT markSent when push delivery fails (warranty path) so BullMQ retries", async () => {
    mockPrisma.garantie.findUnique.mockResolvedValue({
      garantieId: 5,
      garantieNom: "W",
      garantieFin: new Date(),
    });
    mockPrisma.alerte.findUnique.mockResolvedValue({ status: "SCHEDULED" });
    push.sendToUser.mockRejectedValueOnce(new Error("VAPID transient"));
    await expect(
      ReminderProcessor.handle(
        job({
          type: "warranty_reminder",
          ownerUserId: 1,
          garantieId: 5,
          reminderKind: "J30",
          executeAt: new Date().toISOString(),
          alerteId: 9,
        })
      )
    ).rejects.toThrow(/VAPID transient/);
    expect(svc.markSent).not.toHaveBeenCalled();
  });

  it("does NOT markSent when push delivery fails (custom path) so BullMQ retries", async () => {
    mockPrisma.alerte.findUnique.mockResolvedValue({
      alerteId: 21,
      status: "SCHEDULED",
      kind: "CUSTOM",
      ownerUserId: 1,
      alerteNom: "x",
      alerteDescription: null,
      alerteArticleId: null,
      recurrenceMonths: null,
    });
    push.sendToUser.mockRejectedValueOnce(new Error("VAPID transient"));
    await expect(
      ReminderProcessor.handle(
        job({
          type: "custom_alert",
          ownerUserId: 1,
          alerteId: 21,
          executeAt: new Date().toISOString(),
        })
      )
    ).rejects.toThrow(/VAPID transient/);
    expect(svc.markSent).not.toHaveBeenCalled();
  });

  it("redelivers a warranty reminder whose row is FAILED (a BullMQ retry)", async () => {
    // A prior attempt threw and markFailed flipped the row to FAILED; the
    // retry must still deliver, otherwise the `attempts: 3` policy is dead and
    // a single transient push error drops the notification forever.
    mockPrisma.garantie.findUnique.mockResolvedValue({
      garantieId: 5,
      garantieNom: "W",
      garantieFin: new Date(),
    });
    mockPrisma.alerte.findUnique.mockResolvedValue({ status: "FAILED" });
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
    expect(push.sendToUser).toHaveBeenCalledWith(1, expect.any(Object));
    expect(svc.markSent).toHaveBeenCalledWith(9);
  });

  it("redelivers a custom alert whose row is FAILED (a BullMQ retry)", async () => {
    mockPrisma.alerte.findUnique.mockResolvedValue({
      alerteId: 22,
      status: "FAILED",
      kind: "CUSTOM",
      ownerUserId: 1,
      alerteNom: "x",
      alerteDescription: null,
      alerteArticleId: null,
      recurrenceMonths: null,
    });
    await ReminderProcessor.handle(
      job({
        type: "custom_alert",
        ownerUserId: 1,
        alerteId: 22,
        executeAt: new Date().toISOString(),
      })
    );
    expect(push.sendToUser).toHaveBeenCalledWith(1, expect.any(Object));
    expect(svc.markSent).toHaveBeenCalledWith(22);
  });

  it("rebuilds warranty-specific push text for a snoozed warranty reminder", async () => {
    // Snooze re-enqueues every alert as a generic custom job, so a snoozed
    // warranty reminder reaches handleCustom with kind=WARRANTY + a garantie
    // link. The push must use the warranty name/end date, not the raw label
    // ("Rappel garantie J-30") + the generic "Maintenance reminder." body.
    mockPrisma.alerte.findUnique.mockResolvedValue({
      alerteId: 31,
      status: "SCHEDULED",
      kind: "WARRANTY",
      ownerUserId: 1,
      alerteNom: "Rappel garantie J-30",
      alerteDescription: null,
      alerteArticleId: 7,
      alerteGarantieId: 99,
      recurrenceMonths: null,
    });
    mockPrisma.garantie.findUnique.mockResolvedValue({
      garantieNom: "Sony TV",
      garantieFin: new Date("2026-08-01T00:00:00.000Z"),
    });
    await ReminderProcessor.handle(
      job({
        type: "custom_alert",
        ownerUserId: 1,
        alerteId: 31,
        executeAt: new Date().toISOString(),
      })
    );
    expect(push.sendToUser).toHaveBeenCalledWith(1, {
      title: "Warranty reminder: Sony TV",
      body: "Warranty expires 2026-08-01.",
      url: "/articles/7",
    });
    expect(svc.markSent).toHaveBeenCalledWith(31);
  });

  it("keeps the row's own text for a genuine custom alert (no warranty lookup)", async () => {
    mockPrisma.alerte.findUnique.mockResolvedValue({
      alerteId: 32,
      status: "SCHEDULED",
      kind: "CUSTOM",
      ownerUserId: 1,
      alerteNom: "Change smoke detector battery",
      alerteDescription: "Annual",
      alerteArticleId: null,
      alerteGarantieId: null,
      recurrenceMonths: null,
    });
    await ReminderProcessor.handle(
      job({
        type: "custom_alert",
        ownerUserId: 1,
        alerteId: 32,
        executeAt: new Date().toISOString(),
      })
    );
    expect(mockPrisma.garantie.findUnique).not.toHaveBeenCalled();
    expect(push.sendToUser).toHaveBeenCalledWith(1, {
      title: "Change smoke detector battery",
      body: "Annual",
      url: "/alerts",
    });
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
