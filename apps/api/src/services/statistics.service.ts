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
  warranties: {
    total: number;
    active: number;
    expired: number;
    expiringSoon: number; // expires in next 30 days
  };
  users: {
    total: number;
    byRole: {
      USER: number;
      POWER_USER: number;
      ADMIN: number;
    };
  };
  alerts: {
    total: number;
  };
}

/**
 * Get comprehensive dashboard statistics
 */
export async function getDashboardStatistics(): Promise<DashboardStatistics> {
  try {
    // Get articles statistics
    const articlesTotal = await prisma.article.count();
    const articlesWithWarranty = await prisma.article.count({
      where: {
        garantie: {
          isNot: null,
        },
      },
    });
    const articlesWithoutWarranty = articlesTotal - articlesWithWarranty;

    // Get warranties statistics (using 'Garantie' model)
    const warrantiesTotal = await prisma.garantie.count();
    const currentDate = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(currentDate.getDate() + 30);

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

    const warrantiesExpiringSoon = await prisma.garantie.count({
      where: {
        garantieFin: {
          gte: currentDate,
          lte: thirtyDaysFromNow,
        },
        garantieIsValide: true,
      },
    });

    // Get users statistics
    const usersTotal = await prisma.user.count();
    const usersUser = await prisma.user.count({
      where: { role: "USER" as UserRole },
    });
    const usersPowerUser = await prisma.user.count({
      where: { role: "POWER_USER" as UserRole },
    });
    const usersAdmin = await prisma.user.count({
      where: { role: "ADMIN" as UserRole },
    });

    // Get alerts statistics
    const alertsTotal = await prisma.alerte.count();

    return {
      articles: {
        total: articlesTotal,
        withWarranty: articlesWithWarranty,
        withoutWarranty: articlesWithoutWarranty,
      },
      warranties: {
        total: warrantiesTotal,
        active: warrantiesActive,
        expired: warrantiesExpired,
        expiringSoon: warrantiesExpiringSoon,
      },
      users: {
        total: usersTotal,
        byRole: {
          USER: usersUser,
          POWER_USER: usersPowerUser,
          ADMIN: usersAdmin,
        },
      },
      alerts: {
        total: alertsTotal,
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
 * Get basic statistics for quick overview
 */
export async function getBasicStatistics() {
  try {
    const [articlesCount, warrantiesCount, usersCount, alertsCount] =
      await Promise.all([
        prisma.article.count(),
        prisma.garantie.count(),
        prisma.user.count(),
        prisma.alerte.count(),
      ]);

    return {
      articles: articlesCount,
      warranties: warrantiesCount,
      users: usersCount,
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
