import { Router } from "express";
import { prisma } from "../../libs/prisma";
import { asyncHandler } from "../common/http";
import { authGuard, requireRole } from "../auth/auth.middleware";

const router = Router();

/** GET /api/admin/db-stats - Database statistics (Admin only) */
router.get(
  "/db-stats",
  authGuard,
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => {
    const stats = {
      users: await prisma.user.count(),
      articles: await prisma.article.count(),
      warranties: await prisma.garantie.count(),
      auditLogs: await prisma.auditLog.count(),
      alerts: await prisma.alerte.count(),
    };

    const recentUsers = await prisma.user.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        userId: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    const recentArticles = await prisma.article.findMany({
      take: 5,
      orderBy: { articleId: "desc" },
      select: {
        articleId: true,
        articleNom: true,
        articleModele: true,
        owner: {
          select: {
            email: true,
          },
        },
      },
    });

    res.json({
      stats,
      recent: {
        users: recentUsers,
        articles: recentArticles,
      },
    });
  })
);

/** GET /api/admin/users - List all users (Admin only) */
router.get(
  "/users",
  authGuard,
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      select: {
        userId: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(users);
  })
);

export default router;
