import { Router } from "express";
import { prisma } from "../../libs/prisma";
import { authGuard, requireRole } from "../auth/auth.middleware";
import { asyncHandler } from "../common/http";
import { auditAction } from "../common/audit";

const router = Router();

// POWER_USER owner shares a specific article with *all* POWER_USERs.
// Simplest model: Article.sharedWithPowerUsers boolean.

router.post(
  "/:articleId/share",
  authGuard,
  requireRole("POWER_USER"),
  asyncHandler(async (req: any, res) => {
    const articleId = Number(req.params.articleId);
    if (!Number.isFinite(articleId) || articleId <= 0) {
      return res.status(400).json({ error: "Invalid article id" });
    }
    const ownerUserId = Number(req.user.sub);

    // Only the article owner can share it.
    const article = await prisma.article.findFirst({
      where: { articleId, ownerUserId },
      select: { articleId: true },
    });
    if (!article) {
      return res.status(404).json({ error: "Article non trouvé" });
    }

    const updated = await prisma.article.update({
      where: { articleId },
      data: { sharedWithPowerUsers: true },
      select: { articleId: true, sharedWithPowerUsers: true, updatedAt: true },
    });

    await auditAction(req, {
      action: "UPDATE",
      entity: "Article",
      entityId: articleId,
      metadata: { articleId, sharedWithPowerUsers: true },
    });

    return res.status(200).json(updated);
  })
);

// Owner-only: get sharing status for an article.
// GET /api/articles/:articleId/shares
router.get(
  "/:articleId/shares",
  authGuard,
  requireRole("POWER_USER"),
  asyncHandler(async (req: any, res) => {
    const articleId = Number(req.params.articleId);
    if (!Number.isFinite(articleId) || articleId <= 0) {
      return res.status(400).json({ error: "Invalid article id" });
    }
    const ownerUserId = Number(req.user.sub);

    const article = await prisma.article.findFirst({
      where: { articleId, ownerUserId },
      select: { articleId: true },
    });
    if (!article) {
      return res.status(404).json({ error: "Article non trouvé" });
    }

    const row = await prisma.article.findFirst({
      where: { articleId, ownerUserId },
      select: { articleId: true, sharedWithPowerUsers: true, updatedAt: true },
    });

    return res.json(row);
  })
);

router.delete(
  "/:articleId/share/:targetUserId",
  authGuard,
  requireRole("POWER_USER"),
  asyncHandler(async (req: any, res) => {
    const articleId = Number(req.params.articleId);
    if (!Number.isFinite(articleId) || articleId <= 0) {
      return res.status(400).json({ error: "Invalid article id" });
    }
    const ownerUserId = Number(req.user.sub);

    const article = await prisma.article.findFirst({
      where: { articleId, ownerUserId },
      select: { articleId: true },
    });
    if (!article) {
      return res.status(404).json({ error: "Article non trouvé" });
    }

    await prisma.article.update({
      where: { articleId },
      data: { sharedWithPowerUsers: false },
    });

    await auditAction(req, {
      action: "UPDATE",
      entity: "Article",
      entityId: articleId,
      metadata: { articleId, sharedWithPowerUsers: false },
    });

    return res.status(204).send();
  })
);

export default router;
