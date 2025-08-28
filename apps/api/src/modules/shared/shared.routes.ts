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
    const viewerUserId = Number(req.user.sub);

    const articles = await prisma.article.findMany({
      where: {
        sharedWithPowerUsers: true,
        // Keep the view useful by not listing the viewer's own articles.
        // (Owner can still see/manage sharing from their own list.)
        ownerUserId: { not: viewerUserId },
      },
      orderBy: { updatedAt: "desc" },
      include: {
        owner: { select: { userId: true, email: true } },
        garantie: true,
        locations: {
          select: {
            locationId: true,
            location: { select: { name: true } },
          },
        } as any,
      } as any,
    });

    // Keep response shape close to previous UI expectations.
    res.json(
      articles.map((a: any) => ({
        articleShareId: a.articleId,
        active: true,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        owner: a.owner,
        article: a,
      }))
    );
  })
);

export default router;
