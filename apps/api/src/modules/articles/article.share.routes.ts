import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../libs/prisma";
import { authGuard, requireRole, AuthRequest } from "../auth/auth.middleware";
import { asyncHandler } from "../common/http";
import { auditAction } from "../common/audit";

const idParam = z.coerce.number().int().positive();

const router = Router();

// POWER_USER owner shares a specific article with *all* POWER_USERs.
// Simplest model: Article.sharedWithPowerUsers boolean.

router.post(
  "/:articleId/share",
  authGuard,
  requireRole("POWER_USER"),
  asyncHandler(async (req: AuthRequest, res) => {
    const articleId = idParam.parse(req.params.articleId);
    const ownerUserId = req.user!.sub;

    // Only the article owner can share it.
    const article = await prisma.article.findFirst({
      where: { articleId, ownerUserId },
      select: { articleId: true },
    });
    if (!article) {
      return res.status(404).json({ error: "Article not found" });
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
  asyncHandler(async (req: AuthRequest, res) => {
    const articleId = idParam.parse(req.params.articleId);
    const ownerUserId = req.user!.sub;

    const article = await prisma.article.findFirst({
      where: { articleId, ownerUserId },
      select: { articleId: true, sharedWithPowerUsers: true, updatedAt: true },
    });
    if (!article) {
      return res.status(404).json({ error: "Article not found" });
    }

    return res.json(article);
  })
);

router.delete(
  "/:articleId/share",
  authGuard,
  requireRole("POWER_USER"),
  asyncHandler(async (req: AuthRequest, res) => {
    const articleId = idParam.parse(req.params.articleId);
    const ownerUserId = req.user!.sub;

    const article = await prisma.article.findFirst({
      where: { articleId, ownerUserId },
      select: { articleId: true },
    });
    if (!article) {
      return res.status(404).json({ error: "Article not found" });
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
