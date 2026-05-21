import { describe, it, expect, vi, beforeEach } from "vitest";
import { AlerteStatus } from "@prisma/client";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    alerte: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      findFirst: vi.fn(),
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

    // 3 candidate job IDs tried per alert
    expect(queueRef.getJob).toHaveBeenCalledTimes(3);
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
