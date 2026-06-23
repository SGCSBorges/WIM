import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    article: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    loan: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
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
import { LoanService } from "../../modules/loans/loan.service";

const mockPrisma = prisma as unknown as {
  article: Record<string, ReturnType<typeof vi.fn>>;
  loan: Record<string, ReturnType<typeof vi.fn>>;
};
const mockAlerts = AlertService as unknown as {
  createCustom: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------
describe("LoanService.create", () => {
  it("throws 404 when the article isn't owned by the caller", async () => {
    mockPrisma.article.findFirst.mockResolvedValue(null);
    await expect(
      LoanService.create(1, { articleId: 9, borrowerName: "Sam" })
    ).rejects.toMatchObject({ status: 404 });
    expect(mockPrisma.loan.create).not.toHaveBeenCalled();
  });

  it("creates the loan and marks the article LOANED (no reminder without a due date)", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({
      articleId: 9,
      articleNom: "Drill",
    });
    mockPrisma.loan.create.mockResolvedValue({ loanId: 5, articleId: 9 });

    const loan = await LoanService.create(1, {
      articleId: 9,
      borrowerName: "Sam",
    });

    expect(loan.loanId).toBe(5);
    expect(mockPrisma.article.update).toHaveBeenCalledWith({
      where: { articleId: 9 },
      data: { status: "LOANED" },
    });
    expect(mockAlerts.createCustom).not.toHaveBeenCalled();
  });

  it("schedules a due-date reminder and stores its id", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({
      articleId: 9,
      articleNom: "Drill",
    });
    mockPrisma.loan.create.mockResolvedValue({ loanId: 5, articleId: 9 });
    mockAlerts.createCustom.mockResolvedValue({ alerteId: 77 });

    const loan = await LoanService.create(1, {
      articleId: 9,
      borrowerName: "Sam",
      dueAt: new Date("2030-01-01"),
    });

    expect(mockAlerts.createCustom).toHaveBeenCalledTimes(1);
    expect(mockPrisma.loan.update).toHaveBeenCalledWith({
      where: { loanId: 5 },
      data: { reminderAlerteId: 77 },
    });
    expect(loan.reminderAlerteId).toBe(77);
  });

  it("never fails the loan when reminder scheduling throws", async () => {
    mockPrisma.article.findFirst.mockResolvedValue({
      articleId: 9,
      articleNom: "Drill",
    });
    mockPrisma.loan.create.mockResolvedValue({ loanId: 5, articleId: 9 });
    mockAlerts.createCustom.mockRejectedValue(new Error("redis down"));

    const loan = await LoanService.create(1, {
      articleId: 9,
      borrowerName: "Sam",
      dueAt: new Date("2030-01-01"),
    });

    expect(loan.loanId).toBe(5);
    expect(mockPrisma.loan.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------
describe("LoanService.list", () => {
  it("scopes to open loans for one article when both filters are set", async () => {
    mockPrisma.loan.findMany.mockResolvedValue([]);
    await LoanService.list(1, { activeOnly: true, articleId: 9 });
    expect(mockPrisma.loan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerUserId: 1, returnedAt: null, articleId: 9 },
      })
    );
  });
});

// ---------------------------------------------------------------------------
// markReturned
// ---------------------------------------------------------------------------
describe("LoanService.markReturned", () => {
  it("throws 404 when there's no open loan to flip", async () => {
    mockPrisma.loan.updateMany.mockResolvedValue({ count: 0 });
    await expect(LoanService.markReturned(5, 1)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("cancels the reminder and reverts the status to ACTIVE", async () => {
    mockPrisma.loan.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.loan.findUnique
      .mockResolvedValueOnce({ loanId: 5, articleId: 9, reminderAlerteId: 77 })
      .mockResolvedValueOnce({ loanId: 5, articleId: 9, returnedAt: new Date() });
    mockAlerts.cancel.mockResolvedValue(undefined);

    await LoanService.markReturned(5, 1);

    expect(mockAlerts.cancel).toHaveBeenCalledWith(77, 1);
    expect(mockPrisma.article.updateMany).toHaveBeenCalledWith({
      where: { articleId: 9, ownerUserId: 1, status: "LOANED" },
      data: { status: "ACTIVE" },
    });
  });
});

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------
describe("LoanService.remove", () => {
  it("throws 404 when the loan isn't found", async () => {
    mockPrisma.loan.findFirst.mockResolvedValue(null);
    await expect(LoanService.remove(5, 1)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("cancels the reminder then deletes", async () => {
    mockPrisma.loan.findFirst.mockResolvedValue({
      loanId: 5,
      reminderAlerteId: 77,
    });
    mockAlerts.cancel.mockResolvedValue(undefined);
    await LoanService.remove(5, 1);
    expect(mockAlerts.cancel).toHaveBeenCalledWith(77, 1);
    expect(mockPrisma.loan.delete).toHaveBeenCalledWith({
      where: { loanId: 5 },
    });
  });
});
