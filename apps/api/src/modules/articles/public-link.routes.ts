/**
 * Opt-in public page for an article. The owner mints a random token; anyone
 * with the resulting /i/<token> link can view a privacy-safe subset (see the
 * public route in `modules/public/`). Used for QR labels on physical items.
 *
 * Owner-side only here (generate / status / revoke) — all `authGuard`-ed and
 * owner-scoped. The public read lives in `modules/public/public.routes.ts`
 * (no cookie auth). Registered BEFORE the `/:id` catch-all in app.ts.
 */
import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../../libs/prisma";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { requireFeature } from "../features/feature.service";
import { asyncHandler } from "../common/http";
import { auditAction } from "../common/audit";
import { idParam } from "../common/schemas";
import { security } from "../../config/security";
import { createHttpError } from "../../utils/http-error";

const router = Router();

async function assertOwned(articleId: number, ownerUserId: number) {
  const article = await prisma.article.findFirst({
    where: { articleId, ownerUserId, deletedAt: null },
    select: { articleId: true },
  });
  if (!article) throw createHttpError(404, "Article not found");
}

// GET /api/articles/:articleId/public-link — current token (or null).
router.get(
  "/:articleId/public-link",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const articleId = idParam.parse(req.params.articleId);
    const article = await prisma.article.findFirst({
      where: { articleId, ownerUserId: req.user!.sub, deletedAt: null },
      select: { publicToken: true },
    });
    if (!article) return res.status(404).json({ error: "Article not found" });
    res.json({ token: article.publicToken });
  })
);

// POST /api/articles/:articleId/public-link — generate (or rotate) the token.
router.post(
  "/:articleId/public-link",
  security.createRateLimiter,
  authGuard,
  requireFeature("public_page"),
  asyncHandler(async (req: AuthRequest, res) => {
    const articleId = idParam.parse(req.params.articleId);
    await assertOwned(articleId, req.user!.sub);
    const token = crypto.randomBytes(32).toString("hex");
    await prisma.article.update({
      where: { articleId },
      data: { publicToken: token },
    });
    await auditAction(req, {
      action: "UPDATE",
      entity: "Article",
      entityId: articleId,
      metadata: { publicLink: "enabled" },
    });
    res.status(201).json({ token });
  })
);

// DELETE /api/articles/:articleId/public-link — disable the public page.
router.delete(
  "/:articleId/public-link",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const articleId = idParam.parse(req.params.articleId);
    await assertOwned(articleId, req.user!.sub);
    await prisma.article.update({
      where: { articleId },
      data: { publicToken: null },
    });
    await auditAction(req, {
      action: "UPDATE",
      entity: "Article",
      entityId: articleId,
      metadata: { publicLink: "disabled" },
    });
    res.status(204).end();
  })
);

export default router;
