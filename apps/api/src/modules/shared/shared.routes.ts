import { Router } from "express";
import { prisma } from "../../libs/prisma";
import { authGuard, requireRole } from "../auth/auth.middleware";
import { asyncHandler } from "../common/http";

const router = Router();

/**
 * Shared (read-only) views for POWER_USER.
 * Rule A: receivers can view shared articles, but only owners can edit/unshare.
 */

// GET /api/shared/articles - list articles shared *to* me
router.get(
  "/articles",
  authGuard,
  requireRole("POWER_USER"),
  asyncHandler(async (req: any, res) => {
    const targetUserId = Number(req.user.sub);

    const rows = await prisma.articleShare.findMany({
      where: { targetUserId, active: true },
      orderBy: { updatedAt: "desc" },
      include: {
        owner: { select: { userId: true, email: true } },
        article: {
          include: {
            garantie: true,
            locations: {
              select: {
                locationId: true,
                location: { select: { name: true } },
              },
            } as any,
          } as any,
        },
      },
    });

    // Flatten for the web UI.
    res.json(
      rows.map((r: any) => ({
        articleShareId: r.articleShareId,
        active: r.active,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        owner: r.owner,
        article: r.article,
      }))
    );
  })
);

export default router;
