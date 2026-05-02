import { Router } from "express";
import { prisma } from "../../libs/prisma";
import { asyncHandler } from "../common/http";
import { authGuard, requireRole, AuthRequest } from "../auth/auth.middleware";
import { auditAction } from "../common/audit";
import { createHttpError } from "../../utils/http-error";
import { idParam } from "../common/schemas";

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
      take: 500,
      orderBy: { createdAt: "desc" },
    });
    res.json(users);
  })
);

/** DELETE /api/admin/users/:id - Delete user and all their data (Admin only) */
router.delete(
  "/users/:id",
  authGuard,
  requireRole("ADMIN"),
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = idParam.parse(req.params.id);

    const user = await prisma.user.findUnique({ where: { userId } });
    if (!user) throw createHttpError(404, "User not found");

    // Wrap count-check and delete in a serializable transaction so two
    // concurrent admin-deletion requests cannot both bypass the last-admin guard.
    await prisma.$transaction(
      async (tx) => {
        if (user.role === "ADMIN") {
          const adminCount = await tx.user.count({ where: { role: "ADMIN" } });
          if (adminCount <= 1)
            throw createHttpError(400, "Cannot delete the last admin user");
        }
        await tx.user.delete({ where: { userId } });
      },
      { isolationLevel: "Serializable" },
    );

    await auditAction(req, {
      userId: req.user!.sub,
      action: "DELETE",
      entity: "User",
      entityId: userId,
      metadata: { deletedEmail: user.email, deletedRole: user.role },
    });

    res.status(204).send();
  })
);

/** GET /api/admin/users/:id/inventory - Get user's inventory details (Admin only) */
router.get(
  "/users/:id/inventory",
  authGuard,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const userId = idParam.parse(req.params.id);

    const user = await prisma.user.findUnique({
      where: { userId },
      include: {
        articlesOwned: {
          take: 500,
          include: {
            garantie: {
              select: {
                garantieId: true,
                garantieNom: true,
                garantieIsValide: true,
              },
            },
          },
        },
        warrantiesOwned: {
          take: 500,
          include: {
            article: {
              select: {
                articleNom: true,
                articleModele: true,
              },
            },
          },
        },
      },
    });

    if (!user) throw createHttpError(404, "User not found");

    res.json({
      userId: user.userId,
      email: user.email,
      articlesOwned: user.articlesOwned,
      warrantiesOwned: user.warrantiesOwned,
    });
  })
);

export default router;
