import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    article: { findMany: vi.fn() },
  },
}));

vi.mock("../../config/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { prisma } from "../../libs/prisma";
import { getBudgetStatus } from "../../services/statistics.service";

const mockPrisma = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> };
  article: { findMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getBudgetStatus", () => {
  it("buckets spend into the current month and year by acquisition date", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      currency: "EUR",
      monthlyBudget: 500,
      annualBudget: 5000,
    });
    const now = new Date();
    const thisMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15)
    );
    // January 2nd of this year is in-year but (except in January) not in-month.
    const earlierThisYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 2));
    const lastYear = new Date(Date.UTC(now.getUTCFullYear() - 1, 5, 1));

    mockPrisma.article.findMany.mockResolvedValue([
      { purchasePrice: 100, createdAt: thisMonth, garantie: null },
      { purchasePrice: 200, createdAt: earlierThisYear, garantie: null },
      { purchasePrice: 999, createdAt: lastYear, garantie: null },
    ]);

    const res = await getBudgetStatus(7);
    expect(res.currency).toBe("EUR");
    expect(res.monthlyBudget).toBe(500);
    expect(res.annualBudget).toBe(5000);
    // Last year's item is excluded from both periods.
    expect(res.annualSpend).toBe(300);
    // In January the "earlier this year" item also lands in-month; otherwise not.
    const expectedMonth = now.getUTCMonth() === 0 ? 300 : 100;
    expect(res.monthlySpend).toBe(expectedMonth);
  });

  it("returns null budgets and zero spend for a user with no budget or items", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      currency: "USD",
      monthlyBudget: null,
      annualBudget: null,
    });
    mockPrisma.article.findMany.mockResolvedValue([]);

    const res = await getBudgetStatus(7);
    expect(res).toEqual({
      currency: "USD",
      monthlyBudget: null,
      monthlySpend: 0,
      annualBudget: null,
      annualSpend: 0,
    });
  });

  it("prefers the warranty purchase date over createdAt", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      currency: "USD",
      monthlyBudget: 100,
      annualBudget: 100,
    });
    const lastYear = new Date(Date.UTC(new Date().getUTCFullYear() - 1, 0, 1));
    // createdAt is this month, but the warranty purchase date is last year, so
    // it must be excluded from the current-year spend.
    mockPrisma.article.findMany.mockResolvedValue([
      {
        purchasePrice: 50,
        createdAt: new Date(),
        garantie: { garantieDateAchat: lastYear },
      },
    ]);

    const res = await getBudgetStatus(7);
    expect(res.annualSpend).toBe(0);
    expect(res.monthlySpend).toBe(0);
  });
});
