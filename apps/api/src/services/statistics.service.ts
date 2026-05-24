/**
 * Statistics Service
 * Provides dashboard statistics and analytics
 */

import { prisma } from "../libs/prisma";
import { logger } from "../config/logger";

type UserRole = "USER" | "POWER_USER" | "ADMIN";

export interface DashboardStatistics {
  articles: {
    total: number;
    withWarranty: number;
    withoutWarranty: number;
  };
  locations: {
    byLocation: Array<{
      locationId: number;
      name: string;
      articlesCount: number;
    }>;
    unassigned: number;
  };
  warranties: {
    total: number;
    active: number;
    expired: number;
    expiringSoon: number; // expires in next 30 days
    withAttachment: number;
  };
  alerts: {
    total: number;
  };
  sharing: {
    ownedSharedArticles: number;
    totalSharedArticles: number;
  };
  inventoryValue: {
    total: number;
    atRisk: number; // value of articles whose warranty has expired
    byLocation: Array<{
      locationId: number;
      name: string;
      value: number;
    }>;
    byTag: Array<{
      tagId: number;
      name: string;
      value: number;
    }>;
  };
}

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
    ] = await Promise.all([
      prisma.article.count({ where: { ownerUserId } }),
      prisma.article.count({
        where: { ownerUserId, garantie: { isNot: null } },
      }),
      prisma.location.findMany({
        where: { ownerUserId },
        select: { locationId: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.articleLocation.groupBy({
        by: ["locationId"],
        where: { article: { ownerUserId } },
        _count: { articleId: true },
      }),
      prisma.garantie.count({ where: { ownerUserId } }),
      prisma.garantie.count({
        where: { ownerUserId, garantieFin: { gte: currentDate } },
      }),
      prisma.garantie.count({
        where: { ownerUserId, garantieFin: { lt: currentDate } },
      }),
      prisma.garantie.count({
        where: {
          ownerUserId,
          garantieFin: { gte: currentDate, lte: thirtyDaysFromNow },
        },
      }),
      prisma.garantie.count({
        where: { ownerUserId, garantieImageAttachmentId: { not: null } },
      }),
      prisma.alerte.count({ where: { ownerUserId } }),
      prisma.article.count({
        where: { ownerUserId, sharedWithPowerUsers: true },
      }),
      prisma.article.aggregate({
        where: { ownerUserId },
        _sum: { purchasePrice: true },
      }),
      prisma.article.aggregate({
        where: { ownerUserId, garantie: { garantieFin: { lt: currentDate } } },
        _sum: { purchasePrice: true },
      }),
      prisma.articleLocation.findMany({
        where: { article: { ownerUserId } },
        select: {
          locationId: true,
          article: { select: { purchasePrice: true } },
        },
      }),
      prisma.articleTag.findMany({
        where: { article: { ownerUserId } },
        select: {
          tagId: true,
          tag: { select: { name: true } },
          article: { select: { purchasePrice: true } },
        },
      }),
    ]);

    const articlesWithoutWarranty = articlesTotal - articlesWithWarranty;

    // Aggregate inventory value per location in JS (Prisma groupBy can't sum
    // a related column). Decimal columns come back as Prisma.Decimal | null.
    const valueByLocationMap = new Map<number, number>();
    for (const row of locationValueRows) {
      const v = row.article.purchasePrice
        ? Number(row.article.purchasePrice)
        : 0;
      valueByLocationMap.set(
        row.locationId,
        (valueByLocationMap.get(row.locationId) ?? 0) + v
      );
    }

    // Same aggregation per tag.
    const valueByTag = new Map<number, { name: string; value: number }>();
    for (const row of tagValueRows) {
      const v = row.article.purchasePrice
        ? Number(row.article.purchasePrice)
        : 0;
      const existing = valueByTag.get(row.tagId);
      if (existing) existing.value += v;
      else valueByTag.set(row.tagId, { name: row.tag.name, value: v });
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

    const locationsAssignedTotal = articleCountsByLocation.reduce(
      (sum: number, r: { _count: { articleId: number } }) =>
        sum + r._count.articleId,
      0
    );
    const unassigned = Math.max(0, articlesTotal - locationsAssignedTotal);

    // Total shared articles of all users (only meaningful for POWER_USER)
    const totalSharedArticles =
      role === "POWER_USER" || role === "ADMIN"
        ? await prisma.article.count({
            where: {
              sharedWithPowerUsers: true,
              ownerUserId: { not: ownerUserId },
            },
          })
        : 0;

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
      prisma.article.count(),
      prisma.garantie.count(),
      prisma.garantie.count({ where: { garantieFin: { gte: currentDate } } }),
      prisma.garantie.count({ where: { garantieFin: { lt: currentDate } } }),
      prisma.garantie.count({
        where: { garantieImageAttachmentId: { not: null } },
      }),
      prisma.alerte.count(),
      prisma.article.count({ where: { sharedWithPowerUsers: true } }),
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

    const [articlesCount, warrantiesCount, alertsCount] = await Promise.all([
      prisma.article.count({ where: { ownerUserId } }),
      prisma.garantie.count({ where: { ownerUserId } }),
      prisma.alerte.count({ where: { ownerUserId } }),
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
