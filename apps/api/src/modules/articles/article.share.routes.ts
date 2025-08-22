import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../libs/prisma";
import { authGuard, requireRole } from "../auth/auth.middleware";
import { asyncHandler } from "../common/http";
import { auditAction } from "../common/audit";

const router = Router();

// POWER_USER owner shares a specific article with a target user.
// NOTE: This is per-article sharing (different from inventory-wide sharing).

const ShareArticleSchema = z.object({
  targetUserId: z.coerce.number().int().positive(),
});

router.post(
  "/:articleId/share",
  authGuard,
  requireRole("POWER_USER"),
  asyncHandler(async (req: any, res) => {
    const articleId = z.coerce
      .number()
      .int()
      .positive()
      .parse(req.params.articleId);
    const { targetUserId } = ShareArticleSchema.parse(req.body);
    const ownerUserId = Number(req.user.sub);

    // Only the article owner can share it.
    const article = await prisma.article.findFirst({
      where: { articleId, ownerUserId },
      select: { articleId: true },
    });
    if (!article) {
      return res.status(404).json({ error: "Article non trouvé" });
    }

    // Target must exist (and be a POWER_USER for the shared view to apply)
    const target = await prisma.user.findUnique({
      where: { userId: targetUserId },
      select: { userId: true, role: true },
    });
    if (!target)
      return res.status(404).json({ error: "Utilisateur non trouvé" });

    // Create or reactivate share.
    const share = await prisma.articleShare.upsert({
      where: {
        articleId_targetUserId: {
          articleId,
          targetUserId,
        },
      },
      create: {
        articleId,
        ownerUserId,
        targetUserId,
        active: true,
      },
      update: {
        ownerUserId,
        active: true,
      },
    });

    await auditAction(req, {
      action: "CREATE",
      entity: "ArticleShare",
      entityId: share.articleShareId,
      metadata: { articleId, targetUserId },
    });

    return res.status(201).json(share);
  })
);

// Owner-only: list all active shares for an article.
// GET /api/articles/:articleId/shares
router.get(
  "/:articleId/shares",
  authGuard,
  requireRole("POWER_USER"),
  asyncHandler(async (req: any, res) => {
    const articleId = z.coerce
      .number()
      .int()
      .positive()
      .parse(req.params.articleId);
    const ownerUserId = Number(req.user.sub);

    const article = await prisma.article.findFirst({
      where: { articleId, ownerUserId },
      select: { articleId: true },
    });
    if (!article) {
      return res.status(404).json({ error: "Article non trouvé" });
    }

    const shares = await prisma.articleShare.findMany({
      where: { articleId, ownerUserId, active: true },
      orderBy: { updatedAt: "desc" },
      select: {
        articleShareId: true,
        targetUserId: true,
        active: true,
        createdAt: true,
        updatedAt: true,
        target: { select: { userId: true, email: true, role: true } },
      },
    });

    return res.json(shares);
  })
);

router.delete(
  "/:articleId/share/:targetUserId",
  authGuard,
  requireRole("POWER_USER"),
  asyncHandler(async (req: any, res) => {
    const articleId = z.coerce
      .number()
      .int()
      .positive()
      .parse(req.params.articleId);
    const targetUserId = z.coerce
      .number()
      .int()
      .positive()
      .parse(req.params.targetUserId);
    const ownerUserId = Number(req.user.sub);

    const share = await prisma.articleShare.findFirst({
      where: { articleId, targetUserId, ownerUserId },
      select: { articleShareId: true },
    });

    if (!share) {
      return res.status(404).json({ error: "Share not found" });
    }

    await prisma.articleShare.update({
      where: { articleShareId: share.articleShareId },
      data: { active: false },
    });

    await auditAction(req, {
      action: "DELETE",
      entity: "ArticleShare",
      entityId: share.articleShareId,
      metadata: { articleId, targetUserId },
    });

    return res.status(204).send();
  })
);

export default router;
