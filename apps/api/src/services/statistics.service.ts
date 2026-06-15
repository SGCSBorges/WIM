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
import type { DashboardStatistics } from "@wim/types";

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

    // Warranties of trashed articles must not count — a Garantie row
    // survives the article's soft-delete (only the article row is stamped),
    // so every warranty aggregate joins through to a live (or absent) article.
    const liveWarrantyScope = {
      OR: [{ garantieArticleId: null }, { article: { deletedAt: null } }],
    };

    // Fire all independent counts concurrently.
    const [
      articlesTotal,
      articlesWithWarranty,
      locations,
      articleCountsByLocation,
      warrantiesTotal,
      warrantiesActive,
      warrantiesExpired,
      warrantiesExpiringSoon,
      warrantiesWithAttachment,
      alertsTotal,
      ownedSharedArticles,
      inventoryValueAgg,
      atRiskValueAgg,
      locationValueRows,
      tagValueRows,
      valueArticles,
    ] = await Promise.all([
      prisma.article.count({ where: { ownerUserId, deletedAt: null } }),
      prisma.article.count({
        where: { ownerUserId, garantie: { isNot: null }, deletedAt: null },
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
      prisma.article.aggregate({
        where: { ownerUserId, deletedAt: null },
        _sum: { purchasePrice: true },
      }),
      prisma.article.aggregate({
        where: {
          ownerUserId,
          deletedAt: null,
          garantie: { garantieFin: { lt: currentDate } },
        },
        _sum: { purchasePrice: true },
      }),
      prisma.articleLocation.findMany({
        where: { article: { ownerUserId, deletedAt: null } },
        select: {
          locationId: true,
          article: { select: { purchasePrice: true } },
        },
      }),
      prisma.articleTag.findMany({
        where: { article: { ownerUserId, deletedAt: null } },
        select: {
          tagId: true,
          tag: { select: { name: true } },
          article: { select: { purchasePrice: true } },
        },
      }),
      prisma.article.findMany({
        where: { ownerUserId, purchasePrice: { not: null }, deletedAt: null },
        select: {
          purchasePrice: true,
          depreciationRate: true,
          createdAt: true,
          garantie: { select: { garantieDateAchat: true } },
        },
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
    const cents = (price: unknown) =>
      price ? Math.round(Number(price) * 100) : 0;

    const centsByLocation = new Map<number, number>();
    for (const row of locationValueRows) {
      centsByLocation.set(
        row.locationId,
        (centsByLocation.get(row.locationId) ?? 0) +
          cents(row.article.purchasePrice)
      );
    }
    const valueByLocationMap = new Map<number, number>();
    for (const [id, c] of centsByLocation) valueByLocationMap.set(id, c / 100);

    // Same aggregation per tag.
    const tagCents = new Map<number, { name: string; cents: number }>();
    for (const row of tagValueRows) {
      const existing = tagCents.get(row.tagId);
      if (existing) existing.cents += cents(row.article.purchasePrice);
      else
        tagCents.set(row.tagId, {
          name: row.tag.name,
          cents: cents(row.article.purchasePrice),
        });
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
      currentCents += Math.round(value * 100);
    }

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
      articles: {
        total: articlesTotal,
        withWarranty: articlesWithWarranty,
        withoutWarranty: articlesWithoutWarranty,
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
      alerts: {
        total: alertsTotal,
      },
      sharing: {
        ownedSharedArticles,
        totalSharedArticles,
      },
      inventoryValue: {
        total: Number(inventoryValueAgg._sum.purchasePrice ?? 0),
        currentTotal: currentCents / 100,
        atRisk: Number(atRiskValueAgg._sum.purchasePrice ?? 0),
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
