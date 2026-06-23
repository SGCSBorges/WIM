import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    article: { findFirst: vi.fn() },
    serviceRecord: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("../../modules/alerts/alert.service", () => ({
  AlertService: { createCustom: vi.fn(), cancel: vi.fn() },
}));

import { prisma } from "../../libs/prisma";
import { AlertService } from "../../modules/alerts/alert.service";
import { ServiceRecordService } from "../../modules/service-records/service-record.service";

const mockPrisma = prisma as unknown as {
  article: Record<string, ReturnType<typeof vi.fn>>;
  serviceRecord: Record<string, ReturnType<typeof vi.fn>>;
};
const mockAlerts = AlertService as unknown as {
  createCustom: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("ServiceRecordService.create", () => {
  it("throws 404 when the article isn't owned", async () => {
    mockPrisma.article.findFirst.mockResolvedValue(null);
    await expect(
      ServiceRecordService.create(1, {
        articleId: 9,
        performedAt: new Date(),
        description: "Oil change",
      })
    ).rejects.toMatchObject({ status: 404 });
    expect(mockPrisma.serviceRecord.create).not.toHaveBeenCalled();
  });

  it("logs the record without a reminder when no next-due date", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({
      articleId: 9,
      articleNom: "Bike",
    });
    mockPrisma.serviceRecord.create.mockResolvedValue({ serviceId: 3 });
    await ServiceRecordService.create(1, {
      articleId: 9,
      performedAt: new Date(),
      description: "Tune-up",
    });
    expect(mockAlerts.createCustom).not.toHaveBeenCalled();
  });

  it("schedules a next-service reminder and stores its id", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({
      articleId: 9,
      articleNom: "Bike",
    });
    mockPrisma.serviceRecord.create.mockResolvedValue({ serviceId: 3 });
    mockAlerts.createCustom.mockResolvedValue({ alerteId: 88 });

    const rec = await ServiceRecordService.create(1, {
      articleId: 9,
      performedAt: new Date(),
      description: "Tune-up",
      nextDueAt: new Date("2030-01-01"),
    });

    expect(mockPrisma.serviceRecord.update).toHaveBeenCalledWith({
      where: { serviceId: 3 },
      data: { reminderAlerteId: 88 },
    });
    expect(rec.reminderAlerteId).toBe(88);
  });

  it("never fails the log when reminder scheduling throws", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({
      articleId: 9,
      articleNom: "Bike",
    });
    mockPrisma.serviceRecord.create.mockResolvedValue({ serviceId: 3 });
    mockAlerts.createCustom.mockRejectedValue(new Error("redis"));

    const rec = await ServiceRecordService.create(1, {
      articleId: 9,
      performedAt: new Date(),
      description: "Tune-up",
      nextDueAt: new Date("2030-01-01"),
    });

    expect(rec.serviceId).toBe(3);
    expect(mockPrisma.serviceRecord.update).not.toHaveBeenCalled();
  });
});

describe("ServiceRecordService.remove", () => {
  it("throws 404 when the record isn't found", async () => {
    mockPrisma.serviceRecord.findFirst.mockResolvedValue(null);
    await expect(ServiceRecordService.remove(3, 1)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("cancels the reminder then deletes", async () => {
    mockPrisma.serviceRecord.findFirst.mockResolvedValue({
      serviceId: 3,
      reminderAlerteId: 88,
    });
    mockAlerts.cancel.mockResolvedValue(undefined);
    await ServiceRecordService.remove(3, 1);
    expect(mockAlerts.cancel).toHaveBeenCalledWith(88, 1);
    expect(mockPrisma.serviceRecord.delete).toHaveBeenCalledWith({
      where: { serviceId: 3 },
    });
  });
});
