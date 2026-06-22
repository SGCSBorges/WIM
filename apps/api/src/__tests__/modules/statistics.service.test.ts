import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    article: {
      count: vi.fn(),
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
    location: {
      findMany: vi.fn(),
    },
    articleLocation: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    articleTag: {
      findMany: vi.fn(),
    },
    garantie: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    alerte: {
      count: vi.fn(),
    },
    user: {
      count: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}));

vi.mock("../../config/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { prisma } from "../../libs/prisma";
import {
  getDashboardStatistics,
  getAdminStatistics,
  getPortfolioAnalytics,
} from "../../services/statistics.service";

const mockPrisma = prisma as unknown as {
  article: Record<string, ReturnType<typeof vi.fn>>;
  location: Record<string, ReturnType<typeof vi.fn>>;
  articleLocation: Record<string, ReturnType<typeof vi.fn>>;
  articleTag: Record<string, ReturnType<typeof vi.fn>>;
  garantie: Record<string, ReturnType<typeof vi.fn>>;
  alerte: Record<string, ReturnType<typeof vi.fn>>;
  user: Record<string, ReturnType<typeof vi.fn>>;
};

function setupDashboardMocks({
  articlesTotal = 5,
  articlesWithWarranty = 3,
  locations = [] as Array<{ locationId: number; name: string }>,
  articleCountsByLocation = [] as Array<{
    locationId: number;
    _count: { articleId: number };
  }>,
  warrantiesTotal = 2,
  warrantiesActive = 1,
  warrantiesExpired = 1,
  warrantiesExpiringSoon = 0,
  warrantiesWithAttachment = 1,
  alertsTotal = 4,
  ownedSharedArticles = 2,
  unassigned = 0,
  totalSharedArticles = 0,
} = {}) {
  mockPrisma.article.count
    .mockResolvedValueOnce(articlesTotal) // total
    .mockResolvedValueOnce(articlesWithWarranty) // withWarranty
    .mockResolvedValueOnce(ownedSharedArticles) // ownedSharedArticles
    .mockResolvedValueOnce(unassigned) // unassigned (locations: none)
    .mockResolvedValueOnce(totalSharedArticles); // totalSharedArticles (if role is POWER_USER)
  mockPrisma.location.findMany.mockResolvedValue(locations);
  mockPrisma.articleLocation.groupBy.mockResolvedValue(articleCountsByLocation);
  // Inventory-value aggregations (total + at-risk) and per-location join rows.
  mockPrisma.article.aggregate
    .mockResolvedValueOnce({ _sum: { purchasePrice: null } }) // total value
    .mockResolvedValueOnce({ _sum: { purchasePrice: null } }); // at-risk value
  mockPrisma.articleLocation.findMany.mockResolvedValue([]);
  mockPrisma.articleTag.findMany.mockResolvedValue([]);
  mockPrisma.article.findMany.mockResolvedValue([]);
  mockPrisma.garantie.count
    .mockResolvedValueOnce(warrantiesTotal)
    .mockResolvedValueOnce(warrantiesActive)
    .mockResolvedValueOnce(warrantiesExpired)
    .mockResolvedValueOnce(warrantiesExpiringSoon)
    .mockResolvedValueOnce(warrantiesWithAttachment);
  mockPrisma.alerte.count.mockResolvedValue(alertsTotal);
  // Time-series queries used by the forecasting buckets default to empty.
  mockPrisma.garantie.findMany.mockResolvedValue([]);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getDashboardStatistics", () => {
  it("returns correct article counts", async () => {
    setupDashboardMocks({ articlesTotal: 10, articlesWithWarranty: 4 });

    const result = await getDashboardStatistics({ userId: 1, role: "USER" });

    expect(result.articles.total).toBe(10);
    expect(result.articles.withWarranty).toBe(4);
    expect(result.articles.withoutWarranty).toBe(6);
  });

  it("returns correct warranty counts", async () => {
    setupDashboardMocks({
      warrantiesTotal: 5,
      warrantiesActive: 3,
      warrantiesExpired: 2,
      warrantiesExpiringSoon: 1,
      warrantiesWithAttachment: 2,
    });

    const result = await getDashboardStatistics({ userId: 1, role: "USER" });

    expect(result.warranties.total).toBe(5);
    expect(result.warranties.active).toBe(3);
    expect(result.warranties.expired).toBe(2);
    expect(result.warranties.expiringSoon).toBe(1);
    expect(result.warranties.withAttachment).toBe(2);
  });

  it("reports unassigned articles via a direct locations:none count", async () => {
    // The count comes straight from Prisma (articles with no location row),
    // NOT from subtracting junction-row sums — an article in two locations
    // must not mask a genuinely unassigned one.
    setupDashboardMocks({
      articlesTotal: 7,
      unassigned: 3,
      locations: [{ locationId: 1, name: "Home" }],
      articleCountsByLocation: [{ locationId: 1, _count: { articleId: 4 } }],
    });

    const result = await getDashboardStatistics({ userId: 1, role: "USER" });

    expect(result.locations.unassigned).toBe(3);
    expect(result.locations.byLocation[0]).toMatchObject({
      locationId: 1,
      name: "Home",
      articlesCount: 4,
    });
  });

  it("does not fetch totalSharedArticles for USER role", async () => {
    setupDashboardMocks({
      articlesTotal: 2,
      articlesWithWarranty: 1,
      ownedSharedArticles: 0,
    });

    const result = await getDashboardStatistics({ userId: 1, role: "USER" });

    expect(result.sharing.totalSharedArticles).toBe(0);
    // A USER must not pay for the cross-user shared-articles query — it
    // resolves to 0 without hitting the DB. article.count fires exactly 4x
    // (total, withWarranty, ownedShared, unassigned), not 5.
    expect(mockPrisma.article.count).toHaveBeenCalledTimes(4);
  });

  it("fetches totalSharedArticles for POWER_USER role", async () => {
    mockPrisma.article.count
      .mockResolvedValueOnce(3) // total
      .mockResolvedValueOnce(1) // withWarranty
      .mockResolvedValueOnce(1) // ownedSharedArticles
      .mockResolvedValueOnce(0) // unassigned
      .mockResolvedValueOnce(5); // totalSharedArticles
    mockPrisma.location.findMany.mockResolvedValue([]);
    mockPrisma.articleLocation.groupBy.mockResolvedValue([]);
    mockPrisma.articleLocation.findMany.mockResolvedValue([]);
    mockPrisma.articleTag.findMany.mockResolvedValue([]);
    mockPrisma.article.findMany.mockResolvedValue([]);
    mockPrisma.article.aggregate
      .mockResolvedValueOnce({ _sum: { purchasePrice: null } })
      .mockResolvedValueOnce({ _sum: { purchasePrice: null } });
    mockPrisma.garantie.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    mockPrisma.alerte.count.mockResolvedValue(0);
    mockPrisma.garantie.findMany.mockResolvedValue([]);

    const result = await getDashboardStatistics({
      userId: 1,
      role: "POWER_USER",
    });

    expect(result.sharing.totalSharedArticles).toBe(5);
    // A share-capable role DOES issue the 5th article.count for the
    // cross-user shared total.
    expect(mockPrisma.article.count).toHaveBeenCalledTimes(5);
  });

  it("aggregates inventory value (total, at-risk, by location)", async () => {
    mockPrisma.article.count
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0);
    mockPrisma.location.findMany.mockResolvedValue([
      { locationId: 1, name: "Home" },
      { locationId: 2, name: "Office" },
    ]);
    mockPrisma.articleLocation.groupBy.mockResolvedValue([
      { locationId: 1, _count: { articleId: 2 } },
      { locationId: 2, _count: { articleId: 1 } },
    ]);
    mockPrisma.article.aggregate
      .mockResolvedValueOnce({ _sum: { purchasePrice: 300 } }) // total
      .mockResolvedValueOnce({ _sum: { purchasePrice: 50 } }); // at-risk
    mockPrisma.articleLocation.findMany.mockResolvedValue([
      { locationId: 1, article: { purchasePrice: 100 } },
      { locationId: 1, article: { purchasePrice: 50 } },
      { locationId: 2, article: { purchasePrice: 150 } },
    ]);
    mockPrisma.articleTag.findMany.mockResolvedValue([
      { tagId: 1, tag: { name: "Tools" }, article: { purchasePrice: 100 } },
      { tagId: 1, tag: { name: "Tools" }, article: { purchasePrice: 150 } },
    ]);
    mockPrisma.article.findMany.mockResolvedValue([]);
    mockPrisma.garantie.count.mockResolvedValue(0);
    mockPrisma.alerte.count.mockResolvedValue(0);
    mockPrisma.garantie.findMany.mockResolvedValue([]);

    const result = await getDashboardStatistics({ userId: 1, role: "USER" });

    expect(result.inventoryValue.total).toBe(300);
    expect(result.inventoryValue.atRisk).toBe(50);
    expect(result.inventoryValue.byLocation).toEqual([
      { locationId: 1, name: "Home", value: 150 },
      { locationId: 2, name: "Office", value: 150 },
    ]);
    expect(result.inventoryValue.byTag).toEqual([
      { tagId: 1, name: "Tools", value: 250 },
    ]);
  });

  it("computes currentTotal from per-article straight-line depreciation", async () => {
    setupDashboardMocks({ articlesTotal: 3 });
    // Override total/at-risk aggregates with real numbers.
    mockPrisma.article.aggregate.mockReset();
    mockPrisma.article.aggregate
      .mockResolvedValueOnce({ _sum: { purchasePrice: 300 } }) // total
      .mockResolvedValueOnce({ _sum: { purchasePrice: 0 } }); // at-risk
    const twoYearsAgo = new Date(Date.now() - 2 * 365.25 * 24 * 3600 * 1000);
    mockPrisma.article.findMany.mockResolvedValue([
      // 10%/yr for 2 years → 80% of 100 = 80
      {
        purchasePrice: 100,
        depreciationRate: 10,
        createdAt: twoYearsAgo,
        garantie: null,
      },
      // No depreciation → full 100
      {
        purchasePrice: 100,
        depreciationRate: null,
        createdAt: twoYearsAgo,
        garantie: null,
      },
      // Warranty purchase date drives age basis (2y, 10%) → 80
      {
        purchasePrice: 100,
        depreciationRate: 10,
        createdAt: new Date(),
        garantie: { garantieDateAchat: twoYearsAgo },
      },
    ]);

    const result = await getDashboardStatistics({ userId: 1, role: "USER" });

    expect(result.inventoryValue.total).toBe(300);
    expect(result.inventoryValue.currentTotal).toBeCloseTo(260, 0);
  });

  it("treats unknown role as USER (no totalSharedArticles query)", async () => {
    setupDashboardMocks({
      articlesTotal: 1,
      articlesWithWarranty: 0,
      ownedSharedArticles: 0,
    });

    const result = await getDashboardStatistics({
      userId: 1,
      role: "UNKNOWN_ROLE",
    });

    expect(result.sharing.totalSharedArticles).toBe(0);
  });

  it("throws when prisma fails", async () => {
    mockPrisma.article.count.mockRejectedValue(new Error("DB down"));
    mockPrisma.location.findMany.mockResolvedValue([]);
    mockPrisma.articleLocation.groupBy.mockResolvedValue([]);
    mockPrisma.garantie.count.mockResolvedValue(0);
    mockPrisma.alerte.count.mockResolvedValue(0);

    await expect(
      getDashboardStatistics({ userId: 1, role: "USER" })
    ).rejects.toThrow("Failed to fetch dashboard statistics");
  });

  it("buckets warranty expirations + article additions into monthly series", async () => {
    setupDashboardMocks();
    // Two warranties expiring in the same upcoming month + one farther out.
    const now = new Date();
    const inOneMonth = new Date(now);
    inOneMonth.setMonth(inOneMonth.getMonth() + 1);
    inOneMonth.setDate(15);
    const inTenMonths = new Date(now);
    inTenMonths.setMonth(inTenMonths.getMonth() + 10);
    inTenMonths.setDate(5);
    mockPrisma.garantie.findMany.mockResolvedValue([
      { garantieFin: inOneMonth },
      { garantieFin: inOneMonth },
      { garantieFin: inTenMonths },
    ]);
    // Two articles created last month + one this month.
    const lastMonth = new Date(now);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    lastMonth.setDate(10);
    mockPrisma.article.findMany.mockResolvedValueOnce([]); // value rows query
    mockPrisma.article.findMany.mockResolvedValueOnce([
      { createdAt: lastMonth },
      { createdAt: lastMonth },
      { createdAt: now },
    ]);

    const result = await getDashboardStatistics({ userId: 1, role: "USER" });
    expect(result.warrantyExpirationsByMonth).toHaveLength(12);
    const expSum = result.warrantyExpirationsByMonth.reduce(
      (s, b) => s + b.count,
      0
    );
    expect(expSum).toBe(3);
    expect(result.articlesAddedByMonth).toHaveLength(12);
    const addSum = result.articlesAddedByMonth.reduce((s, b) => s + b.count, 0);
    expect(addSum).toBe(3);
  });
});

describe("getAdminStatistics", () => {
  function setupAdminMocks({
    totalUsers = 20,
    usersByRole = [
      { role: "USER", _count: { userId: 15 } },
      { role: "POWER_USER", _count: { userId: 4 } },
      { role: "ADMIN", _count: { userId: 1 } },
    ],
    totalArticles = 100,
    totalWarranties = 60,
    warrantiesActive = 40,
    warrantiesExpired = 20,
    warrantiesWithAttachment = 10,
    totalAlerts = 8,
    totalSharedArticles = 3,
  } = {}) {
    mockPrisma.user.count.mockResolvedValue(totalUsers);
    mockPrisma.user.groupBy.mockResolvedValue(usersByRole);
    mockPrisma.article.count
      .mockResolvedValueOnce(totalArticles)
      .mockResolvedValueOnce(totalSharedArticles);
    mockPrisma.garantie.count
      .mockResolvedValueOnce(totalWarranties)
      .mockResolvedValueOnce(warrantiesActive)
      .mockResolvedValueOnce(warrantiesExpired)
      .mockResolvedValueOnce(warrantiesWithAttachment);
    mockPrisma.alerte.count.mockResolvedValue(totalAlerts);
  }

  it("returns total user count and byRole breakdown", async () => {
    setupAdminMocks({ totalUsers: 20 });

    const result = await getAdminStatistics();

    expect(result.users.total).toBe(20);
    expect(result.users.byRole).toEqual({ USER: 15, POWER_USER: 4, ADMIN: 1 });
  });

  it("returns article, warranty, alert and sharing totals", async () => {
    setupAdminMocks({
      totalArticles: 100,
      totalWarranties: 60,
      warrantiesActive: 40,
      warrantiesExpired: 20,
      warrantiesWithAttachment: 10,
      totalAlerts: 8,
      totalSharedArticles: 3,
    });

    const result = await getAdminStatistics();

    expect(result.articles.total).toBe(100);
    expect(result.warranties).toMatchObject({
      total: 60,
      active: 40,
      expired: 20,
      withAttachment: 10,
    });
    expect(result.alerts.total).toBe(8);
    expect(result.sharing.totalSharedArticles).toBe(3);
  });

  it("defaults missing role counts to 0", async () => {
    mockPrisma.user.count.mockResolvedValue(1);
    mockPrisma.user.groupBy.mockResolvedValue([
      { role: "ADMIN", _count: { userId: 1 } },
    ]);
    mockPrisma.article.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    mockPrisma.garantie.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    mockPrisma.alerte.count.mockResolvedValue(0);

    const result = await getAdminStatistics();

    expect(result.users.byRole.USER).toBe(0);
    expect(result.users.byRole.POWER_USER).toBe(0);
    expect(result.users.byRole.ADMIN).toBe(1);
  });

  it("throws when prisma fails", async () => {
    mockPrisma.user.count.mockRejectedValue(new Error("DB error"));
    mockPrisma.user.groupBy.mockResolvedValue([]);
    mockPrisma.article.count.mockResolvedValue(0);
    mockPrisma.garantie.count.mockResolvedValue(0);
    mockPrisma.alerte.count.mockResolvedValue(0);

    await expect(getAdminStatistics()).rejects.toThrow(
      "Failed to fetch admin statistics"
    );
  });
});

describe("getPortfolioAnalytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aggregates spend, cumulative trend, breakdowns and top items", async () => {
    const thisMonth = new Date();
    thisMonth.setUTCDate(15);
    const lastMonth = new Date(thisMonth);
    lastMonth.setUTCMonth(thisMonth.getUTCMonth() - 1);

    mockPrisma.article.findMany.mockResolvedValue([
      {
        articleId: 1,
        articleNom: "Laptop",
        purchasePrice: 1000,
        depreciationRate: null,
        createdAt: lastMonth,
        category: "ELECTRONICS",
        garantie: null,
        locations: [{ locationId: 1, location: { name: "Office" } }],
        tags: [{ tagId: 7, tag: { name: "work" } }],
      },
      {
        articleId: 2,
        articleNom: "Chair",
        purchasePrice: 200,
        depreciationRate: null,
        category: null,
        garantie: null,
        createdAt: thisMonth,
        locations: [{ locationId: 1, location: { name: "Office" } }],
        tags: [],
      },
    ]);

    const out = await getPortfolioAnalytics({ userId: 1 });

    expect(out.totalSpend).toBe(1200);
    expect(out.itemsPriced).toBe(2);
    // 24-month window, cumulative ends at the full total.
    expect(out.spendByMonth).toHaveLength(24);
    expect(out.spendByMonth[out.spendByMonth.length - 1].cumulative).toBe(1200);
    // Office holds both items' spend.
    expect(out.byLocation).toEqual([
      { locationId: 1, name: "Office", value: 1200 },
    ]);
    expect(out.byTag).toEqual([{ tagId: 7, name: "work", value: 1000 }]);
    // Categorized vs uncategorized spend, sorted by value desc.
    expect(out.byCategory).toEqual([
      { category: "ELECTRONICS", value: 1000 },
      { category: "UNCATEGORIZED", value: 200 },
    ]);
    // Top items ranked by current value (no depreciation → purchase price).
    expect(out.topItems[0]).toMatchObject({ articleId: 1, value: 1000 });
  });

  it("returns zeroed figures and an empty axis baseline when nothing is priced", async () => {
    mockPrisma.article.findMany.mockResolvedValue([]);
    const out = await getPortfolioAnalytics({ userId: 1 });
    expect(out.totalSpend).toBe(0);
    expect(out.itemsPriced).toBe(0);
    expect(out.spendByMonth).toHaveLength(24);
    expect(out.spendByMonth.every((b) => b.amount === 0)).toBe(true);
    expect(out.byLocation).toEqual([]);
    expect(out.byCategory).toEqual([]);
    expect(out.topItems).toEqual([]);
  });
});
