/**
 * Statistics Service
 * Provides dashboard statistics and analytics
 */

import { prisma } from "../libs/prisma";
import { logger } from "../config/logger";
import { currentValue } from "../modules/common/depreciation";
// Single source of truth — the local interface that used to live here was
// dropped in round 10 (T1) so the API and web client can't drift on
// dashboard-statistics shape.
import type {
  DashboardStatistics,
  PortfolioAnalytics,
  BudgetStatus,
  LocationBreakdown,
} from "@wim/types";
import { NOT_OWNED_STATUSES } from "@wim/types";

export type { DashboardStatistics };

type UserRole = "USER" | "POWER_USER" | "ADMIN";

export interface AdminStatistics {
  users: {
    total: number;
    byRole: {
      USER: number;
      POWER_USER: number;
      ADMIN: number;
    };
  };
  articles: {
    total: number;
  };
  warranties: {
    total: number;
    active: number;
    expired: number;
    withAttachment: number;
  };
  alerts: {
    total: number;
  };
  sharing: {
    totalSharedArticles: number;
  };
}

type DashboardStatisticsParams = {
  userId: number;
  role: UserRole | string;
};

/**
 * Get comprehensive dashboard statistics
 */
export async function getDashboardStatistics(
  params: DashboardStatisticsParams
): Promise<DashboardStatistics> {
  try {
    const ownerUserId = Number(params.userId);
    const VALID_ROLES = ["USER", "POWER_USER", "ADMIN"] as const;
    const rawRole = String(params.role || "USER");
    const role: UserRole = (VALID_ROLES as readonly string[]).includes(rawRole)
      ? (rawRole as UserRole)
      : "USER";

    const currentDate = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(currentDate.getDate() + 30);
    const verificationCutoff = new Date(currentDate);
    verificationCutoff.setMonth(verificationCutoff.getMonth() - 12);

    // Warranties of trashed articles must not count — a Garantie row
    // survives the article's soft-delete (only the article row is stamped),
    // so every warranty aggregate joins through to a live (or absent) article.
    const liveWarrantyScope = {
      OR: [{ garantieArticleId: null }, { article: { deletedAt: null } }],
    };

    // Value figures reflect what the user *currently owns*, so items that have
    // left their possession (SOLD/DISPOSED/LOST) are excluded — they stay in
    // the inventory for the record but don't inflate the portfolio's worth.
    // Counts (above) deliberately keep them. IN_REPAIR/LOANED are still owned.
    const ownedValueScope = {
      ownerUserId,
      deletedAt: null,
      status: { notIn: NOT_OWNED_STATUSES },
    };
    // Same rule for value rows joined through the article relation.
    const ownedArticleRelation = {
      article: {
        ownerUserId,
        deletedAt: null,
        status: { notIn: NOT_OWNED_STATUSES },
      },
    };

    // Fire all independent counts concurrently.
    const [
      articlesTotal,
      unitsAgg,
      articlesWithWarranty,
      articlesNeedingVerification,
      locations,
      articleCountsByLocation,
      warrantiesTotal,
      warrantiesActive,
      warrantiesExpired,
      warrantiesExpiringSoon,
      warrantiesWithAttachment,
      alertsTotal,
      ownedSharedArticles,
      inventoryValueRows,
      atRiskValueRows,
      locationValueRows,
      tagValueRows,
      valueArticles,
      userRow,
    ] = await Promise.all([
      prisma.article.count({ where: { ownerUserId, deletedAt: null } }),
      // Total unit count = Σ quantity across live articles (single-column
      // sum, so a plain SQL aggregate is fine here).
      prisma.article.aggregate({
        where: { ownerUserId, deletedAt: null },
        _sum: { quantity: true },
      }),
      prisma.article.count({
        where: { ownerUserId, garantie: { isNot: null }, deletedAt: null },
      }),
      // Physical inventory check: only currently-held items need verifying
      // (a SOLD/DISPOSED/LOST record has nothing to physically confirm).
      prisma.article.count({
        where: {
          ownerUserId,
          deletedAt: null,
          status: { notIn: NOT_OWNED_STATUSES },
          OR: [
            { lastVerifiedAt: null },
            // Same 12-month rule as the list's `verification=needed` filter
            // (buildArticleWhere) so the nudge count and the filtered list
            // always agree.
            { lastVerifiedAt: { lt: verificationCutoff } },
          ],
        },
      }),
      prisma.location.findMany({
        where: { ownerUserId },
        select: { locationId: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.articleLocation.groupBy({
        by: ["locationId"],
        where: { article: { ownerUserId, deletedAt: null } },
        _count: { articleId: true },
      }),
      prisma.garantie.count({
        where: { ownerUserId, ...liveWarrantyScope },
      }),
      prisma.garantie.count({
        where: {
          ownerUserId,
          garantieFin: { gte: currentDate },
          ...liveWarrantyScope,
        },
      }),
      prisma.garantie.count({
        where: {
          ownerUserId,
          garantieFin: { lt: currentDate },
          ...liveWarrantyScope,
        },
      }),
      prisma.garantie.count({
        where: {
          ownerUserId,
          garantieFin: { gte: currentDate, lte: thirtyDaysFromNow },
          ...liveWarrantyScope,
        },
      }),
      prisma.garantie.count({
        where: {
          ownerUserId,
          garantieImageAttachmentId: { not: null },
          ...liveWarrantyScope,
        },
      }),
      prisma.alerte.count({
        where: {
          ownerUserId,
          OR: [{ article: null }, { article: { deletedAt: null } }],
        },
      }),
      prisma.article.count({
        where: { ownerUserId, sharedWithPowerUsers: true, deletedAt: null },
      }),
      // Value = per-unit purchasePrice × quantity, so these can't use a SQL
      // `_sum` (which can't multiply two columns) — fetch price+quantity and
      // sum in memory instead.
      prisma.article.findMany({
        where: ownedValueScope,
        select: { purchasePrice: true, quantity: true },
      }),
      prisma.article.findMany({
        where: {
          ...ownedValueScope,
          garantie: { garantieFin: { lt: currentDate } },
        },
        select: { purchasePrice: true, quantity: true },
      }),
      prisma.articleLocation.findMany({
        where: ownedArticleRelation,
        select: {
          locationId: true,
          article: { select: { purchasePrice: true, quantity: true } },
        },
      }),
      prisma.articleTag.findMany({
        where: ownedArticleRelation,
        select: {
          tagId: true,
          tag: { select: { name: true } },
          article: { select: { purchasePrice: true, quantity: true } },
        },
      }),
      prisma.article.findMany({
        where: { ...ownedValueScope, purchasePrice: { not: null } },
        select: {
          purchasePrice: true,
          depreciationRate: true,
          quantity: true,
          createdAt: true,
          garantie: { select: { garantieDateAchat: true } },
        },
      }),
      // Carry the user's display currency on the dashboard payload so the
      // client doesn't need a second round-trip to /profile/me just to format
      // money figures.
      prisma.user.findUnique({
        where: { userId: ownerUserId },
        select: { currency: true },
      }),
    ]);

    // Time-series: rolling 12-month windows around today.
    const twelveMonthsAgo = new Date(currentDate);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    const twelveMonthsAhead = new Date(currentDate);
    twelveMonthsAhead.setMonth(twelveMonthsAhead.getMonth() + 12);
    // Second (and final) parallel batch. None of these depend on the
    // in-memory aggregation below, so they run together rather than as
    // separate sequential round-trips — `unassigned` and `totalSharedArticles`
    // used to each cost their own trip after this batch. `totalSharedArticles`
    // is only meaningful for share-capable roles; resolve to 0 otherwise
    // instead of issuing the query.
    const [
      upcomingWarrantyExpirations,
      recentArticleCreations,
      unassigned,
      totalSharedArticles,
      maintenanceSpendAgg,
    ] = await Promise.all([
      prisma.garantie.findMany({
        where: {
          ownerUserId,
          garantieFin: { gte: currentDate, lte: twelveMonthsAhead },
          ...liveWarrantyScope,
        },
        select: { garantieFin: true },
      }),
      prisma.article.findMany({
        where: {
          ownerUserId,
          deletedAt: null,
          createdAt: { gte: twelveMonthsAgo },
        },
        select: { createdAt: true },
      }),
      // Count articles with NO location directly — summing junction rows
      // counts a multi-location article N times, and the subtraction then
      // hides genuinely unassigned articles.
      prisma.article.count({
        where: { ownerUserId, deletedAt: null, locations: { none: {} } },
      }),
      // Total shared articles of all OTHER users (only meaningful for a
      // share-capable viewer).
      role === "POWER_USER" || role === "ADMIN"
        ? prisma.article.count({
            where: {
              sharedWithPowerUsers: true,
              ownerUserId: { not: ownerUserId },
              deletedAt: null,
            },
          })
        : Promise.resolve(0),
      // Maintenance spend over the trailing 12 months (live articles only).
      // ServiceRecord.cost is a single Decimal column, so a SQL _sum is fine.
      prisma.serviceRecord.aggregate({
        where: {
          ownerUserId,
          performedAt: { gte: twelveMonthsAgo },
          article: { deletedAt: null },
        },
        _sum: { cost: true },
      }),
    ]);

    const articlesWithoutWarranty = articlesTotal - articlesWithWarranty;

    // Aggregate inventory value per location in JS (Prisma groupBy can't sum
    // a related column). Decimal columns come back as Prisma.Decimal | null.
    // Accumulate in integer cents so repeated float addition can't drift the
    // displayed totals; divide back to a currency amount at the end.
    //
    // Semantics: an article in N locations (or with N tags) contributes its
    // FULL price to each slice — "value present at this location" — so slice
    // sums can exceed inventoryValue.total. Intentional; don't "fix" by
    // splitting the price across slices.
    // Line value in integer cents: per-unit price × quantity.
    const lineCents = (price: unknown, quantity: number) =>
      price ? Math.round(Number(price) * 100) * Math.max(1, quantity ?? 1) : 0;

    const centsByLocation = new Map<number, number>();
    for (const row of locationValueRows) {
      centsByLocation.set(
        row.locationId,
        (centsByLocation.get(row.locationId) ?? 0) +
          lineCents(row.article.purchasePrice, row.article.quantity)
      );
    }
    const valueByLocationMap = new Map<number, number>();
    for (const [id, c] of centsByLocation) valueByLocationMap.set(id, c / 100);

    // Same aggregation per tag.
    const tagCents = new Map<number, { name: string; cents: number }>();
    for (const row of tagValueRows) {
      const c = lineCents(row.article.purchasePrice, row.article.quantity);
      const existing = tagCents.get(row.tagId);
      if (existing) existing.cents += c;
      else tagCents.set(row.tagId, { name: row.tag.name, cents: c });
    }
    const valueByTag = new Map<number, { name: string; value: number }>();
    for (const [id, v] of tagCents)
      valueByTag.set(id, { name: v.name, value: v.cents / 100 });

    // Current (depreciated) value per article, summed in integer cents. Age
    // basis is the warranty purchase date when present, else createdAt.
    let currentCents = 0;
    for (const a of valueArticles) {
      const basis = a.garantie?.garantieDateAchat ?? a.createdAt;
      const value = currentValue(
        a.purchasePrice != null ? Number(a.purchasePrice) : null,
        a.depreciationRate != null ? Number(a.depreciationRate) : null,
        basis,
        currentDate
      );
      // Per-unit depreciated value × quantity.
      currentCents += Math.round(value * 100) * Math.max(1, a.quantity ?? 1);
    }

    // Nominal inventory value + the warranty-expired ("at risk") slice, both
    // as Σ per-unit price × quantity (in integer cents).
    let inventoryCents = 0;
    for (const a of inventoryValueRows)
      inventoryCents += lineCents(a.purchasePrice, a.quantity);
    let atRiskCents = 0;
    for (const a of atRiskValueRows)
      atRiskCents += lineCents(a.purchasePrice, a.quantity);

    const countMap = new Map<number, number>();
    for (const row of articleCountsByLocation) {
      countMap.set(row.locationId, row._count.articleId);
    }

    const byLocation = locations.map(
      (l: { locationId: number; name: string }) => ({
        locationId: l.locationId,
        name: l.name,
        articlesCount: countMap.get(l.locationId) ?? 0,
      })
    );

    // Bucket dates into YYYY-MM keys; pre-seed each rolling window so months
    // with zero events still appear (the bar chart needs a contiguous axis).
    const monthKey = (d: Date) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const seedWindow = (fromMonthOffset: number, length: number) => {
      const out = new Map<string, number>();
      const base = new Date(currentDate);
      base.setUTCDate(1);
      base.setUTCHours(0, 0, 0, 0);
      base.setUTCMonth(base.getUTCMonth() + fromMonthOffset);
      for (let i = 0; i < length; i++) {
        const d = new Date(base);
        d.setUTCMonth(base.getUTCMonth() + i);
        out.set(monthKey(d), 0);
      }
      return out;
    };
    const expirationBuckets = seedWindow(0, 12);
    for (const g of upcomingWarrantyExpirations) {
      const k = monthKey(new Date(g.garantieFin));
      if (expirationBuckets.has(k))
        expirationBuckets.set(k, (expirationBuckets.get(k) ?? 0) + 1);
    }
    const additionBuckets = seedWindow(-11, 12);
    for (const a of recentArticleCreations) {
      const k = monthKey(new Date(a.createdAt));
      if (additionBuckets.has(k))
        additionBuckets.set(k, (additionBuckets.get(k) ?? 0) + 1);
    }
    const toSeries = (m: Map<string, number>) =>
      Array.from(m.entries()).map(([month, count]) => ({ month, count }));

    return {
      currency: userRow?.currency ?? "USD",
      articles: {
        total: articlesTotal,
        withWarranty: articlesWithWarranty,
        withoutWarranty: articlesWithoutWarranty,
        needsVerification: articlesNeedingVerification,
        totalUnits: unitsAgg._sum.quantity ?? 0,
      },
      locations: {
        byLocation,
        unassigned,
      },
      warranties: {
        total: warrantiesTotal,
        active: warrantiesActive,
        expired: warrantiesExpired,
        expiringSoon: warrantiesExpiringSoon,
        withAttachment: warrantiesWithAttachment,
      },
      maintenanceSpend: Number(maintenanceSpendAgg._sum.cost ?? 0),
      alerts: {
        total: alertsTotal,
      },
      sharing: {
        ownedSharedArticles,
        totalSharedArticles,
      },
      inventoryValue: {
        total: inventoryCents / 100,
        currentTotal: currentCents / 100,
        atRisk: atRiskCents / 100,
        byLocation: byLocation.map((l) => ({
          locationId: l.locationId,
          name: l.name,
          value: valueByLocationMap.get(l.locationId) ?? 0,
        })),
        byTag: Array.from(valueByTag.entries()).map(([tagId, v]) => ({
          tagId,
          name: v.name,
          value: v.value,
        })),
      },
      warrantyExpirationsByMonth: toSeries(expirationBuckets),
      articlesAddedByMonth: toSeries(additionBuckets),
    };
  } catch (error) {
    logger.error(
      { err: error },
      "[statistics] failed to fetch dashboard statistics"
    );
    throw new Error("Failed to fetch dashboard statistics");
  }
}

/**
 * Get admin dashboard statistics (global totals)
 */
export async function getAdminStatistics(): Promise<AdminStatistics> {
  try {
    const currentDate = new Date();
    const [
      totalUsers,
      usersByRole,
      totalArticles,
      totalWarranties,
      warrantiesActive,
      warrantiesExpired,
      warrantiesWithAttachment,
      totalAlerts,
      totalSharedArticles,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.groupBy({ by: ["role"], _count: { userId: true } }),
      // Platform totals intentionally include trashed rows — they still
      // occupy storage until the purge job runs. The shared count below is
      // the exception: a trashed article isn't visible to anyone.
      prisma.article.count(),
      prisma.garantie.count(),
      prisma.garantie.count({ where: { garantieFin: { gte: currentDate } } }),
      prisma.garantie.count({ where: { garantieFin: { lt: currentDate } } }),
      prisma.garantie.count({
        where: { garantieImageAttachmentId: { not: null } },
      }),
      prisma.alerte.count(),
      prisma.article.count({
        where: { sharedWithPowerUsers: true, deletedAt: null },
      }),
    ]);

    const roleCounts = { USER: 0, POWER_USER: 0, ADMIN: 0 };
    for (const row of usersByRole) {
      if (row.role in roleCounts) {
        roleCounts[row.role as keyof typeof roleCounts] = row._count.userId;
      }
    }

    return {
      users: {
        total: totalUsers,
        byRole: roleCounts,
      },
      articles: {
        total: totalArticles,
      },
      warranties: {
        total: totalWarranties,
        active: warrantiesActive,
        expired: warrantiesExpired,
        withAttachment: warrantiesWithAttachment,
      },
      alerts: {
        total: totalAlerts,
      },
      sharing: {
        totalSharedArticles,
      },
    };
  } catch (error) {
    logger.error(
      { err: error },
      "[statistics] failed to fetch admin statistics"
    );
    throw new Error("Failed to fetch admin statistics");
  }
}
export async function getBasicStatistics(params: { userId: number }) {
  try {
    const ownerUserId = Number(params.userId);

    // Exclude trash everywhere — these counters must agree with the
    // dashboard's own totals or the two surfaces drift after a soft-delete.
    const [articlesCount, warrantiesCount, alertsCount] = await Promise.all([
      prisma.article.count({ where: { ownerUserId, deletedAt: null } }),
      prisma.garantie.count({
        where: {
          ownerUserId,
          OR: [{ garantieArticleId: null }, { article: { deletedAt: null } }],
        },
      }),
      prisma.alerte.count({
        where: {
          ownerUserId,
          OR: [{ article: null }, { article: { deletedAt: null } }],
        },
      }),
    ]);

    return {
      articles: articlesCount,
      warranties: warrantiesCount,
      alerts: alertsCount,
    };
  } catch (error) {
    logger.error(
      { err: error },
      "[statistics] failed to fetch basic statistics"
    );
    throw new Error("Failed to fetch basic statistics");
  }
}

/**
 * Spending & value analytics for the owner's current holdings (excludes
 * NOT_OWNED_STATUSES, matching the dashboard's value rule). One findMany over
 * priced articles, bucketed in memory:
 *   - spend over time by acquisition date (warranty purchase date, else
 *     createdAt) with a running cumulative total — the "portfolio value over
 *     time" trend;
 *   - spend split by location and by tag;
 *   - the top items by current (depreciated) value.
 * The trailing 24 months are returned for the chart; the cumulative line
 * carries the pre-window baseline so it reflects the true running total.
 */
const ANALYTICS_MONTHS = 24;

export async function getPortfolioAnalytics(params: {
  userId: number;
}): Promise<PortfolioAnalytics> {
  const ownerUserId = params.userId;
  const articles = await prisma.article.findMany({
    where: {
      ownerUserId,
      deletedAt: null,
      status: { notIn: NOT_OWNED_STATUSES },
      purchasePrice: { not: null },
    },
    select: {
      articleId: true,
      articleNom: true,
      purchasePrice: true,
      depreciationRate: true,
      quantity: true,
      createdAt: true,
      category: true,
      garantie: { select: { garantieDateAchat: true } },
      locations: {
        select: { locationId: true, location: { select: { name: true } } },
      },
      tags: { select: { tagId: true, tag: { select: { name: true } } } },
    },
  });

  const monthKey = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

  let totalSpend = 0;
  let currentTotal = 0;
  const spendPerMonth = new Map<string, number>();
  const locationValue = new Map<number, { name: string; value: number }>();
  const tagValue = new Map<number, { name: string; value: number }>();
  const categoryValue = new Map<string, number>();
  const valued: { articleId: number; name: string; value: number }[] = [];

  for (const a of articles) {
    const qty = Math.max(1, a.quantity ?? 1);
    // All figures are line values: per-unit price × quantity.
    const price = (a.purchasePrice == null ? 0 : Number(a.purchasePrice)) * qty;
    totalSpend += price;

    const acquired = a.garantie?.garantieDateAchat ?? a.createdAt;
    const key = monthKey(new Date(acquired));
    spendPerMonth.set(key, (spendPerMonth.get(key) ?? 0) + price);

    const current =
      (currentValue(
        a.purchasePrice == null ? null : Number(a.purchasePrice),
        a.depreciationRate == null ? null : Number(a.depreciationRate),
        acquired
      ) ?? 0) * qty;
    currentTotal += current;
    valued.push({ articleId: a.articleId, name: a.articleNom, value: current });

    for (const l of a.locations) {
      const prev = locationValue.get(l.locationId);
      locationValue.set(l.locationId, {
        name: l.location?.name ?? "",
        value: (prev?.value ?? 0) + price,
      });
    }
    for (const tg of a.tags) {
      const prev = tagValue.get(tg.tagId);
      tagValue.set(tg.tagId, {
        name: tg.tag?.name ?? "",
        value: (prev?.value ?? 0) + price,
      });
    }

    const catKey = a.category ?? "UNCATEGORIZED";
    categoryValue.set(catKey, (categoryValue.get(catKey) ?? 0) + price);
  }

  // Build a contiguous trailing-window axis (zero months still appear), but
  // start the cumulative line from everything acquired before the window so it
  // reads as a true running total rather than resetting to 0.
  const now = new Date();
  now.setUTCDate(1);
  now.setUTCHours(0, 0, 0, 0);
  const windowStart = new Date(now);
  windowStart.setUTCMonth(windowStart.getUTCMonth() - (ANALYTICS_MONTHS - 1));

  let baseline = 0;
  for (const [k, amount] of spendPerMonth) {
    if (k < monthKey(windowStart)) baseline += amount;
  }

  const spendByMonth: PortfolioAnalytics["spendByMonth"] = [];
  let cumulative = baseline;
  for (let i = 0; i < ANALYTICS_MONTHS; i++) {
    const d = new Date(windowStart);
    d.setUTCMonth(windowStart.getUTCMonth() + i);
    const key = monthKey(d);
    const amount = spendPerMonth.get(key) ?? 0;
    cumulative += amount;
    spendByMonth.push({ month: key, amount, cumulative });
  }

  const byLocation = Array.from(locationValue.entries())
    .map(([locationId, v]) => ({ locationId, name: v.name, value: v.value }))
    .sort((a, b) => b.value - a.value);
  const byTag = Array.from(tagValue.entries())
    .map(([tagId, v]) => ({ tagId, name: v.name, value: v.value }))
    .sort((a, b) => b.value - a.value);
  const byCategory = Array.from(categoryValue.entries())
    .map(([category, value]) => ({ category, value }))
    .sort((a, b) => b.value - a.value);
  const topItems = valued.sort((a, b) => b.value - a.value).slice(0, 8);

  return {
    totalSpend,
    currentValue: currentTotal,
    itemsPriced: articles.length,
    spendByMonth,
    byLocation,
    byTag,
    byCategory,
    topItems,
  };
}

/**
 * Spend-against-budget for the current calendar month and year. Spend is the
 * sum of purchase prices for currently-owned, priced items acquired in the
 * period (acquisition = warranty purchase date, else createdAt) — the same
 * scope as the analytics spend trend, so the figures agree across surfaces.
 */
export async function getBudgetStatus(userId: number): Promise<BudgetStatus> {
  const user = await prisma.user.findUnique({
    where: { userId },
    select: { currency: true, monthlyBudget: true, annualBudget: true },
  });

  const now = new Date();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );

  // Only items acquired this calendar year can count toward either period.
  const articles = await prisma.article.findMany({
    where: {
      ownerUserId: userId,
      deletedAt: null,
      status: { notIn: NOT_OWNED_STATUSES },
      purchasePrice: { not: null },
    },
    select: {
      purchasePrice: true,
      quantity: true,
      createdAt: true,
      garantie: { select: { garantieDateAchat: true } },
    },
  });

  let monthlySpend = 0;
  let annualSpend = 0;
  for (const a of articles) {
    const acquired = new Date(a.garantie?.garantieDateAchat ?? a.createdAt);
    // Line spend: per-unit price × quantity.
    const price =
      (a.purchasePrice == null ? 0 : Number(a.purchasePrice)) *
      Math.max(1, a.quantity ?? 1);
    if (acquired >= yearStart) annualSpend += price;
    if (acquired >= monthStart) monthlySpend += price;
  }

  return {
    currency: user?.currency ?? "USD",
    monthlyBudget:
      user?.monthlyBudget == null ? null : Number(user.monthlyBudget),
    monthlySpend,
    annualBudget: user?.annualBudget == null ? null : Number(user.annualBudget),
    annualSpend,
  };
}

/**
 * Combined household picture: the caller's household members with each
 * member's live article count and currently-owned inventory value (sum of
 * purchase prices, excluding NOT_OWNED_STATUSES — the dashboard value rule).
 * Returns null when the caller isn't in a household. Visibility is safe by
 * construction: households ARE a mutual WRITE-share mesh, so every member
 * already sees every other member's inventory.
 */
export async function getHouseholdStatistics(userId: number): Promise<{
  householdId: number;
  name: string;
  members: Array<{
    userId: number;
    email: string;
    articles: number;
    value: number;
  }>;
  totalArticles: number;
  totalValue: number;
} | null> {
  const membership = await prisma.householdMember.findUnique({
    where: { userId },
    include: {
      household: {
        include: {
          members: {
            orderBy: { createdAt: "asc" },
            include: { user: { select: { userId: true, email: true } } },
          },
        },
      },
    },
  });
  if (!membership) return null;

  const memberIds = membership.household.members.map((m) => m.user.userId);
  const [counts, valueRows] = await Promise.all([
    prisma.article.groupBy({
      by: ["ownerUserId"],
      where: { ownerUserId: { in: memberIds }, deletedAt: null },
      _count: { articleId: true },
    }),
    // Value = per-unit price × quantity, so a SQL `_sum` won't do — fetch the
    // priced rows and fold per owner in memory (integer cents to avoid drift).
    prisma.article.findMany({
      where: {
        ownerUserId: { in: memberIds },
        deletedAt: null,
        status: { notIn: NOT_OWNED_STATUSES },
        purchasePrice: { not: null },
      },
      select: { ownerUserId: true, purchasePrice: true, quantity: true },
    }),
  ]);
  const countBy = new Map(
    counts.map((c) => [c.ownerUserId, c._count.articleId])
  );
  const centsBy = new Map<number, number>();
  for (const a of valueRows) {
    const c =
      Math.round(Number(a.purchasePrice) * 100) * Math.max(1, a.quantity ?? 1);
    centsBy.set(a.ownerUserId, (centsBy.get(a.ownerUserId) ?? 0) + c);
  }
  const sumBy = new Map(
    Array.from(centsBy.entries()).map(([id, c]) => [id, c / 100])
  );

  const members = membership.household.members.map((m) => ({
    userId: m.user.userId,
    email: m.user.email,
    articles: countBy.get(m.user.userId) ?? 0,
    value: sumBy.get(m.user.userId) ?? 0,
  }));

  return {
    householdId: membership.household.id,
    name: membership.household.name,
    members,
    totalArticles: members.reduce((s, m) => s + m.articles, 0),
    totalValue: members.reduce((s, m) => s + m.value, 0),
  };
}

/**
 * Per-location value breakdown for the Location value dashboard. Value uses the
 * same owned-scope + per-unit × quantity rule as the main dashboard (an article
 * in N locations contributes its full line value to each). Warranty exposure is
 * the count of items at a location whose warranty is expired or expiring within
 * 30 days. `parentLocationId` lets the web build the nested roll-up + treemap.
 */
export async function getLocationBreakdown(
  userId: number
): Promise<LocationBreakdown> {
  const ownerUserId = Number(userId);
  const now = new Date();
  const in30 = new Date();
  in30.setDate(now.getDate() + 30);

  const ownedArticle = {
    ownerUserId,
    deletedAt: null,
    status: { notIn: NOT_OWNED_STATUSES },
  };

  const [locations, rows, unlocatedRows] = await Promise.all([
    prisma.location.findMany({
      where: { ownerUserId },
      select: { locationId: true, name: true, parentLocationId: true },
      orderBy: { name: "asc" },
    }),
    prisma.articleLocation.findMany({
      where: { article: ownedArticle },
      select: {
        locationId: true,
        article: {
          select: {
            purchasePrice: true,
            quantity: true,
            garantie: { select: { garantieFin: true } },
          },
        },
      },
    }),
    // Owned articles with no location at all — surfaced as an "unlocated"
    // bucket so the totals reconcile with the dashboard.
    prisma.article.findMany({
      where: { ...ownedArticle, locations: { none: {} } },
      select: { purchasePrice: true, quantity: true },
    }),
  ]);

  type Acc = {
    articleCount: number;
    cents: number;
    expiringCount: number;
    expiredCount: number;
  };
  const acc = new Map<number, Acc>();
  const bump = (id: number): Acc => {
    let a = acc.get(id);
    if (!a) {
      a = { articleCount: 0, cents: 0, expiringCount: 0, expiredCount: 0 };
      acc.set(id, a);
    }
    return a;
  };

  for (const r of rows) {
    const a = bump(r.locationId);
    a.articleCount += 1;
    if (r.article.purchasePrice != null)
      a.cents +=
        Math.round(Number(r.article.purchasePrice) * 100) *
        Math.max(1, r.article.quantity ?? 1);
    const fin = r.article.garantie?.garantieFin;
    if (fin) {
      if (fin < now) a.expiredCount += 1;
      else if (fin <= in30) a.expiringCount += 1;
    }
  }

  const locationsOut = locations.map((l) => {
    const a = acc.get(l.locationId);
    return {
      locationId: l.locationId,
      name: l.name,
      parentLocationId: l.parentLocationId ?? null,
      articleCount: a?.articleCount ?? 0,
      value: a ? a.cents / 100 : 0,
      expiringCount: a?.expiringCount ?? 0,
      expiredCount: a?.expiredCount ?? 0,
    };
  });

  let unCents = 0;
  for (const u of unlocatedRows)
    if (u.purchasePrice != null)
      unCents +=
        Math.round(Number(u.purchasePrice) * 100) *
        Math.max(1, u.quantity ?? 1);

  return {
    locations: locationsOut,
    unlocated: { articleCount: unlocatedRows.length, value: unCents / 100 },
  };
}
