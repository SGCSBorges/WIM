import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    article: { findFirst: vi.fn() },
    insurancePolicy: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    articleInsurance: { upsert: vi.fn(), deleteMany: vi.fn() },
  },
}));

vi.mock("../../modules/alerts/alert.service", () => ({
  AlertService: { createCustom: vi.fn(), cancel: vi.fn() },
}));

import { prisma } from "../../libs/prisma";
import { AlertService } from "../../modules/alerts/alert.service";
import { InsuranceService } from "../../modules/insurance/insurance.service";

const mockPrisma = prisma as unknown as {
  article: Record<string, ReturnType<typeof vi.fn>>;
  insurancePolicy: Record<string, ReturnType<typeof vi.fn>>;
  articleInsurance: Record<string, ReturnType<typeof vi.fn>>;
};
const mockAlerts = AlertService as unknown as {
  createCustom: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("InsuranceService.list", () => {
  it("flattens the article join rows into a plain array", async () => {
    mockPrisma.insurancePolicy.findMany.mockResolvedValue([
      {
        policyId: 1,
        provider: "Acme",
        articles: [{ article: { articleId: 9, articleNom: "TV" } }],
      },
    ]);
    const res = await InsuranceService.list(7);
    expect(res[0].articles).toEqual([{ articleId: 9, articleNom: "TV" }]);
  });
});

describe("InsuranceService.create", () => {
  it("schedules a renewal reminder and stores its id", async () => {
    mockAlerts.createCustom.mockResolvedValue({ alerteId: 55 });
    mockPrisma.insurancePolicy.create.mockResolvedValue({
      policyId: 1,
      provider: "Acme",
      articles: [],
    });
    await InsuranceService.create(7, {
      provider: "Acme",
      renewalAt: new Date("2030-01-01"),
    });
    expect(mockAlerts.createCustom).toHaveBeenCalledTimes(1);
    expect(mockPrisma.insurancePolicy.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reminderAlerteId: 55 }),
      })
    );
  });

  it("stores a null reminder when scheduling throws (best-effort)", async () => {
    mockAlerts.createCustom.mockRejectedValue(new Error("redis"));
    mockPrisma.insurancePolicy.create.mockResolvedValue({
      policyId: 1,
      provider: "Acme",
      articles: [],
    });
    await InsuranceService.create(7, {
      provider: "Acme",
      renewalAt: new Date("2030-01-01"),
    });
    expect(mockPrisma.insurancePolicy.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reminderAlerteId: null }),
      })
    );
  });

  it("skips reminder scheduling without a renewal date", async () => {
    mockPrisma.insurancePolicy.create.mockResolvedValue({
      policyId: 1,
      provider: "Acme",
      articles: [],
    });
    await InsuranceService.create(7, { provider: "Acme" });
    expect(mockAlerts.createCustom).not.toHaveBeenCalled();
  });
});

describe("InsuranceService.update", () => {
  it("reschedules the reminder when the renewal date changes", async () => {
    mockPrisma.insurancePolicy.findFirst.mockResolvedValue({
      policyId: 1,
      provider: "Acme",
      reminderAlerteId: 10,
    });
    mockAlerts.createCustom.mockResolvedValue({ alerteId: 20 });
    mockAlerts.cancel.mockResolvedValue(undefined);
    mockPrisma.insurancePolicy.update.mockResolvedValue({
      policyId: 1,
      provider: "Acme",
      articles: [],
    });

    await InsuranceService.update(1, 7, { renewalAt: new Date("2031-01-01") });

    expect(mockAlerts.cancel).toHaveBeenCalledWith(10, 7);
    expect(mockAlerts.createCustom).toHaveBeenCalledTimes(1);
    expect(mockPrisma.insurancePolicy.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reminderAlerteId: 20 }),
      })
    );
  });

  it("throws 404 for a policy the caller doesn't own", async () => {
    mockPrisma.insurancePolicy.findFirst.mockResolvedValue(null);
    await expect(
      InsuranceService.update(1, 7, { provider: "X" })
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("InsuranceService.linkArticle / unlinkArticle", () => {
  it("upserts the join when both policy and article are owned", async () => {
    mockPrisma.insurancePolicy.findFirst.mockResolvedValue({ policyId: 1 });
    mockPrisma.article.findFirst.mockResolvedValue({ articleId: 9 });
    await InsuranceService.linkArticle(1, 7, 9);
    expect(mockPrisma.articleInsurance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { articleId_policyId: { articleId: 9, policyId: 1 } },
      })
    );
  });

  it("rejects linking an article the caller doesn't own", async () => {
    mockPrisma.insurancePolicy.findFirst.mockResolvedValue({ policyId: 1 });
    mockPrisma.article.findFirst.mockResolvedValue(null);
    await expect(InsuranceService.linkArticle(1, 7, 9)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("deletes the join on unlink", async () => {
    mockPrisma.insurancePolicy.findFirst.mockResolvedValue({ policyId: 1 });
    await InsuranceService.unlinkArticle(1, 7, 9);
    expect(mockPrisma.articleInsurance.deleteMany).toHaveBeenCalledWith({
      where: { policyId: 1, articleId: 9 },
    });
  });
});

describe("InsuranceService.remove", () => {
  it("cancels the reminder then deletes", async () => {
    mockPrisma.insurancePolicy.findFirst.mockResolvedValue({
      policyId: 1,
      reminderAlerteId: 33,
    });
    mockAlerts.cancel.mockResolvedValue(undefined);
    await InsuranceService.remove(1, 7);
    expect(mockAlerts.cancel).toHaveBeenCalledWith(33, 7);
    expect(mockPrisma.insurancePolicy.delete).toHaveBeenCalledWith({
      where: { policyId: 1 },
    });
  });
});
