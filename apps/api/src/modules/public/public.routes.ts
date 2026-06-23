/**
 * Public, unauthenticated item view. The token in the URL IS the credential —
 * no cookie, no session. Returns only a privacy-safe subset of the article
 * (name / brand / model / description / photo / category + a coarse warranty
 * flag) — never price, serial, owner, or location. Powers the QR-label page
 * at /i/<token>. GET-only, so the global rate limiter applies and CSRF is N/A.
 */
import { Router } from "express";
import { prisma } from "../../libs/prisma";
import { asyncHandler } from "../common/http";

const router = Router();

// GET /api/public/items/:token — token is a 64-char hex string.
router.get(
  "/items/:token([a-f0-9]{64})",
  asyncHandler(async (req, res) => {
    const article = await prisma.article.findFirst({
      where: { publicToken: req.params.token, deletedAt: null },
      select: {
        articleNom: true,
        brand: true,
        articleModele: true,
        articleDescription: true,
        productImageUrl: true,
        category: true,
        garantie: { select: { garantieFin: true } },
      },
    });
    if (!article) return res.status(404).json({ error: "Not found" });

    const fin = article.garantie?.garantieFin ?? null;
    res.json({
      articleNom: article.articleNom,
      brand: article.brand,
      articleModele: article.articleModele,
      articleDescription: article.articleDescription,
      productImageUrl: article.productImageUrl,
      category: article.category,
      warrantyActive: fin ? new Date(fin).getTime() > Date.now() : null,
    });
  })
);

export default router;
