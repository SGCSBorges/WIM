/**
 * Statistics Service
 * Provides dashboard statistics and analytics
 */

import { prisma } from "../libs/prisma";

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
    const role = String(params.role || "USER") as UserRole;

    // Articles (owner-scoped)
    const articlesTotal = await prisma.article.count({
      where: { ownerUserId },
    });
    const articlesWithWarranty = await prisma.article.count({
      where: { ownerUserId, garantie: { isNot: null } },
    });
    const articlesWithoutWarranty = articlesTotal - articlesWithWarranty;

    // Articles by location (only the user's locations)
    const locations = await prisma.location.findMany({
      where: { ownerUserId },
      select: { locationId: true, name: true },
      orderBy: { name: "asc" },
    });

    const articleCountsByLocation = await prisma.articleLocation.groupBy({
      by: ["locationId"],
      where: {
        article: { ownerUserId },
      },
      _count: { articleId: true },
    });

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

    // Warranties (owner-scoped)
    const warrantiesTotal = await prisma.garantie.count({
      where: { ownerUserId },
    });
    const currentDate = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(currentDate.getDate() + 30);

    const warrantiesActive = await prisma.garantie.count({
      where: {
        ownerUserId,
        garantieFin: {
          gte: currentDate,
        },
        garantieIsValide: true,
      },
    });

    const warrantiesExpired = await prisma.garantie.count({
      where: {
        ownerUserId,
        OR: [
          {
            garantieFin: {
              lt: currentDate,
            },
          },
          {
            garantieIsValide: false,
          },
        ],
      },
    });

    const warrantiesExpiringSoon = await prisma.garantie.count({
      where: {
        ownerUserId,
        garantieFin: {
          gte: currentDate,
          lte: thirtyDaysFromNow,
        },
        garantieIsValide: true,
      },
    });

    const warrantiesWithAttachment = await prisma.garantie.count({
      where: { ownerUserId, garantieImageAttachmentId: { not: null } },
    });

    // Alerts (owner-scoped)
    const alertsTotal = await prisma.alerte.count({
      where: { ownerUserId },
    });

    // Sharing counts
    const ownedSharedArticles = await prisma.article.count({
      where: { ownerUserId, sharedWithPowerUsers: true },
    });

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
    };
  } catch (error) {
    console.error(
      "[Statistics Service] Error fetching dashboard statistics:",
      error
    );
    throw new Error("Failed to fetch dashboard statistics");
  }
}

/**
 * Get admin dashboard statistics (global totals)
 */
export async function getAdminStatistics(): Promise<AdminStatistics> {
  try {
    // Users
    const totalUsers = await prisma.user.count();
    const usersByRole = await prisma.user.groupBy({
      by: ["role"],
      _count: { userId: true },
    });
    const roleCounts = {
      USER: 0,
      POWER_USER: 0,
      ADMIN: 0,
    };
    for (const row of usersByRole) {
      roleCounts[row.role as keyof typeof roleCounts] = row._count.userId;
    }

    // Articles (global)
    const totalArticles = await prisma.article.count();

    // Warranties (global)
    const totalWarranties = await prisma.garantie.count();
    const currentDate = new Date();
    const warrantiesActive = await prisma.garantie.count({
      where: {
        garantieFin: {
          gte: currentDate,
        },
        garantieIsValide: true,
      },
    });
    const warrantiesExpired = await prisma.garantie.count({
      where: {
        OR: [
          {
            garantieFin: {
              lt: currentDate,
            },
          },
          {
            garantieIsValide: false,
          },
        ],
      },
    });
    const warrantiesWithAttachment = await prisma.garantie.count({
      where: { garantieImageAttachmentId: { not: null } },
    });

    // Alerts (global)
    const totalAlerts = await prisma.alerte.count();

    // Sharing (global)
    const totalSharedArticles = await prisma.article.count({
      where: { sharedWithPowerUsers: true },
    });

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
    console.error(
      "[Statistics Service] Error fetching admin statistics:",
      error
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
    console.error(
      "[Statistics Service] Error fetching basic statistics:",
      error
    );
    throw new Error("Failed to fetch basic statistics");
  }
}
