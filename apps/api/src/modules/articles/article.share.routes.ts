/**
 * Public sharing toggle on an Article (`sharedWithPowerUsers` bool).
 *
 * This is the "flat" sharing model — flip the boolean and every
 * POWER_USER on the platform can read the article. Per-user
 * `InventoryShare` flows live in `modules/shares/` instead. Owner-side
 * mutations live here so the route tree stays close to the article
 * resource; the recipient-side read goes through
 * `modules/shared/shared.routes.ts`.
 *
 * `POST /unshare-all` is the kill switch — flips every flag back at once.
 */
import { Router } from "express";
import { prisma } from "../../libs/prisma";
import { authGuard, requireRole, AuthRequest } from "../auth/auth.middleware";
import { asyncHandler } from "../common/http";
import { auditAction } from "../common/audit";
import { idParam, paginationQuery } from "../common/schemas";
import { security } from "../../config/security";

const router = Router();

// GET /api/articles/shared-public — list of *my* publicly-shared articles
// for the profile "Articles you've shared publicly" panel. Same shape as
// the regular article list to keep frontend code reusable.
//
// IMPORTANT: this must be registered BEFORE the routes that match
// "/:articleId/..." so Express doesn't try to parse "shared-public" as
// an article id.
router.get(
  "/shared-public",
  authGuard,
  requireRole("POWER_USER"),
  asyncHandler(async (req: AuthRequest, res) => {
    const ownerUserId = req.user!.sub;
    const { page, limit } = paginationQuery.parse(req.query);
    const articles = await prisma.article.findMany({
      where: { ownerUserId, sharedWithPowerUsers: true, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: (page - 1) * limit,
      include: {
        garantie: true,
        locations: {
          select: {
            locationId: true,
            location: { select: { name: true } },
          },
        },
      },
    });
    return res.json(articles);
  })
);

// POST /api/articles/unshare-all — kill switch on the public-share toggle.
// Sets `sharedWithPowerUsers=false` for every article the caller owns
// where it was true. Returns the count for the UI to confirm.
router.post(
  "/unshare-all",
  security.destructiveRateLimiter,
  authGuard,
  requireRole("POWER_USER"),
  asyncHandler(async (req: AuthRequest, res) => {
    const ownerUserId = req.user!.sub;
    const result = await prisma.article.updateMany({
      where: { ownerUserId, sharedWithPowerUsers: true, deletedAt: null },
      data: { sharedWithPowerUsers: false },
    });

    await auditAction(req, {
      action: "UPDATE",
      entity: "Article",
      metadata: { unshareAll: true, count: result.count },
    });

    return res.json({ count: result.count });
  })
);

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
      where: { articleId, ownerUserId, deletedAt: null },
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
      where: { articleId, ownerUserId, deletedAt: null },
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
      where: { articleId, ownerUserId, deletedAt: null },
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
