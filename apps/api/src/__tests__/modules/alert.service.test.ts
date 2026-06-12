import { describe, it, expect, vi, beforeEach } from "vitest";
import { AlerteStatus } from "@prisma/client";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    alerte: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// vi.hoisted ensures these refs exist when the vi.mock factory runs (factories are hoisted).
const queueRef = vi.hoisted(() => ({
  getJob: vi.fn(),
  add: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../jobs/queues", () => ({
  alertQueue: {
    add: queueRef.add,
    getJob: queueRef.getJob,
  },
}));

vi.mock("../../config/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { prisma } from "../../libs/prisma";
import { AlertService } from "../../modules/alerts/alert.service";

const mockPrisma = prisma as unknown as {
  alerte: Record<string, ReturnType<typeof vi.fn>>;
};

beforeEach(() => {
  vi.clearAllMocks();
  queueRef.add.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// cancelForWarranty
// ---------------------------------------------------------------------------

describe("AlertService.cancelForWarranty", () => {
  it("does nothing when there are no scheduled alerts", async () => {
    mockPrisma.alerte.findMany.mockResolvedValue([]);
    await AlertService.cancelForWarranty({ ownerUserId: 1, garantieId: 5 });
    expect(queueRef.getJob).not.toHaveBeenCalled();
    expect(mockPrisma.alerte.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: AlerteStatus.CANCELLED } })
    );
  });

  it("removes BullMQ jobs for each scheduled alert", async () => {
    const alertDate = new Date("2026-06-01");
    mockPrisma.alerte.findMany.mockResolvedValue([
      { alerteId: 10, alerteDate: alertDate },
    ]);
    const mockJob = { remove: vi.fn().mockResolvedValue(undefined) };
    // Return a job for J30, null for J7/J1
    queueRef.getJob
      .mockResolvedValueOnce(mockJob)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await AlertService.cancelForWarranty({ ownerUserId: 1, garantieId: 5 });

    // 3 warranty-keyed candidates + 1 generic per-alert job id
    expect(queueRef.getJob).toHaveBeenCalledTimes(4);
    expect(mockJob.remove).toHaveBeenCalledTimes(1);

    expect(mockPrisma.alerte.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          alerteGarantieId: 5,
          ownerUserId: 1,
          status: AlerteStatus.SCHEDULED,
        }),
        data: { status: AlerteStatus.CANCELLED },
      })
    );
  });
});

// ---------------------------------------------------------------------------
// markSent / markFailed
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// createCustom / snooze / cancel
// ---------------------------------------------------------------------------

describe("AlertService.createCustom", () => {
  it("creates a CUSTOM alert and enqueues a job", async () => {
    const when = new Date(Date.now() + 86_400_000);
    mockPrisma.alerte.create.mockResolvedValue({
      alerteId: 42,
      ownerUserId: 1,
      alerteDate: when,
    });

    const created = await AlertService.createCustom({
      ownerUserId: 1,
      alerteNom: "Filter swap",
      alerteDate: when,
      recurrenceMonths: 3,
    });

    expect(created.alerteId).toBe(42);
    expect(mockPrisma.alerte.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "CUSTOM",
          recurrenceMonths: 3,
          status: AlerteStatus.SCHEDULED,
        }),
      })
    );
    expect(queueRef.add).toHaveBeenCalledWith(
      "reminder",
      expect.objectContaining({ type: "custom_alert", alerteId: 42 }),
      expect.objectContaining({ jobId: "alert:42" })
    );
  });
});

describe("AlertService.snooze", () => {
  it("rejects a non-scheduled / non-owned alert", async () => {
    mockPrisma.alerte.findFirst.mockResolvedValue(null);
    await expect(AlertService.snooze(9, 1, 7)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("rejects when the atomic transition matches no SCHEDULED row", async () => {
    // Row exists (pre-read for jobId reconstruction succeeds) but the worker
    // flipped it to SENT before the updateMany — count 0 must 404, not
    // silently move the date of a SENT alert.
    mockPrisma.alerte.findFirst.mockResolvedValue({
      alerteId: 9,
      alerteGarantieId: null,
      alerteDate: new Date(),
      kind: "CUSTOM",
    });
    mockPrisma.alerte.updateMany.mockResolvedValue({ count: 0 });
    await expect(AlertService.snooze(9, 1, 7)).rejects.toMatchObject({
      status: 404,
    });
    expect(queueRef.add).not.toHaveBeenCalled();
  });

  it("removes the old job, moves the date, and re-enqueues", async () => {
    mockPrisma.alerte.findFirst.mockResolvedValue({
      alerteId: 9,
      alerteGarantieId: null,
      alerteDate: new Date(),
      kind: "CUSTOM",
    });
    const mockJob = { remove: vi.fn().mockResolvedValue(undefined) };
    queueRef.getJob.mockResolvedValue(mockJob);
    mockPrisma.alerte.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.alerte.findUniqueOrThrow.mockResolvedValue({ alerteId: 9 });

    await AlertService.snooze(9, 1, 7);

    expect(mockJob.remove).toHaveBeenCalled();
    expect(mockPrisma.alerte.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          alerteId: 9,
          ownerUserId: 1,
          status: AlerteStatus.SCHEDULED,
        }),
        data: expect.objectContaining({ snoozedUntil: expect.any(Date) }),
      })
    );
    expect(queueRef.add).toHaveBeenCalledWith(
      "reminder",
      expect.objectContaining({ type: "custom_alert", alerteId: 9 }),
      expect.objectContaining({ jobId: "alert:9" })
    );
  });
});

describe("AlertService.cancel", () => {
  it("cancels a scheduled alert and removes its job", async () => {
    mockPrisma.alerte.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.alerte.findUniqueOrThrow.mockResolvedValue({
      alerteId: 11,
      alerteGarantieId: null,
      alerteDate: new Date(),
      kind: "CUSTOM",
      status: "CANCELLED",
    });
    queueRef.getJob.mockResolvedValue(null);

    await AlertService.cancel(11, 1);

    expect(mockPrisma.alerte.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          alerteId: 11,
          ownerUserId: 1,
          status: AlerteStatus.SCHEDULED,
        }),
        data: { status: AlerteStatus.CANCELLED },
      })
    );
  });

  it("404s when the alert is not SCHEDULED (already sent or cancelled)", async () => {
    mockPrisma.alerte.updateMany.mockResolvedValue({ count: 0 });
    await expect(AlertService.cancel(11, 1)).rejects.toMatchObject({
      status: 404,
    });
    expect(queueRef.getJob).not.toHaveBeenCalled();
  });
});

describe("AlertService.markSent", () => {
  it("updates the alert to SENT with a sentAt timestamp", async () => {
    mockPrisma.alerte.update.mockResolvedValue({ alerteId: 7, status: "SENT" });
    await AlertService.markSent(7);
    expect(mockPrisma.alerte.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { alerteId: 7 },
        data: expect.objectContaining({ status: AlerteStatus.SENT }),
      })
    );
  });
});

describe("AlertService.markFailed", () => {
  it("stores error message and stack on failure", async () => {
    mockPrisma.alerte.update.mockResolvedValue({});
    const err = new Error("email failed");
    await AlertService.markFailed(3, err);
    expect(mockPrisma.alerte.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { alerteId: 3 },
        data: expect.objectContaining({
          status: AlerteStatus.FAILED,
          errorMessage: "email failed",
        }),
      })
    );
  });

  it("handles non-Error objects without throwing", async () => {
    mockPrisma.alerte.update.mockResolvedValue({});
    await AlertService.markFailed(4, "string error");
    expect(mockPrisma.alerte.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ errorMessage: "string error" }),
      })
    );
  });
});
