/**
 * Public, unauthenticated item view. The token in the URL IS the credential —
 * no cookie, no session. Returns only a privacy-safe subset of the article
 * (name / brand / model / description / photo / category + a coarse warranty
 * flag) — never price, serial, owner, or location. Powers the QR-label page
 * at /i/<token>.
 *
 * Lost & found: when the owner marked the item LOST, the payload carries
 * `isLost: true` and the page offers an anonymous "notify the owner" form
 * (POST /found-report). The report lands as a bell notification + best-effort
 * push/email — the finder never learns who the owner is, and the owner never
 * sees the finder beyond the message/contact they chose to leave.
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../libs/prisma";
import { asyncHandler } from "../common/http";
import { security } from "../../config/security";
import { auditAction } from "../common/audit";
import { PushService } from "../push/push.service";
import { EmailService } from "../email/email.service";
import { logger } from "../../config/logger";

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
        status: true,
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
      // Coarse boolean, not the raw status enum — LOST is the only lifecycle
      // state the public page acts on, so nothing else leaks.
      isLost: article.status === "LOST",
    });
  })
);

const FoundReportSchema = z.object({
  message: z.string().trim().min(1).max(500),
  contact: z.string().trim().max(120).optional().nullable(),
});

// POST /api/public/items/:token/found-report — anonymous "I found this item".
// Only works while the owner has the item marked LOST (prevents the public
// page from becoming a general contact channel). Strictly rate-limited; at
// most one report per article per hour is recorded (silent 204 on dedupe so
// a spammer learns nothing).
router.post(
  "/items/:token([a-f0-9]{64})/found-report",
  security.destructiveRateLimiter,
  asyncHandler(async (req, res) => {
    const { message, contact } = FoundReportSchema.parse(req.body);

    const article = await prisma.article.findFirst({
      where: {
        publicToken: req.params.token,
        deletedAt: null,
        status: "LOST",
      },
      select: {
        articleId: true,
        articleNom: true,
        ownerUserId: true,
        owner: { select: { email: true, emailReminders: true } },
      },
    });
    if (!article) return res.status(404).json({ error: "Not found" });

    const alerteNom = `Found report: ${article.articleNom}`.slice(0, 100);
    const description = `${contact ? `${contact} — ` : ""}${message}`.slice(
      0,
      255
    );

    // Dedupe window: one recorded report per article per hour.
    const recent = await prisma.alerte.findFirst({
      where: {
        ownerUserId: article.ownerUserId,
        alerteArticleId: article.articleId,
        alerteNom,
        createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
      },
      select: { alerteId: true },
    });
    if (recent) return res.status(204).send();

    // SCHEDULED + due now (and no queue job) keeps it visible in the
    // notification bell and the alerts list until the owner dismisses it —
    // an inbox entry, not a future reminder.
    await prisma.alerte.create({
      data: {
        ownerUserId: article.ownerUserId,
        alerteNom,
        alerteDescription: description,
        alerteDate: new Date(),
        alerteArticleId: article.articleId,
        kind: "CUSTOM",
        status: "SCHEDULED",
      },
    });

    await auditAction(req, {
      userId: article.ownerUserId,
      action: "CREATE",
      entity: "Alerte",
      entityId: article.articleId,
      metadata: { via: "found-report", articleId: article.articleId },
    });

    // Push + email are best-effort — the report is already recorded.
    try {
      await PushService.sendToUser(article.ownerUserId, {
        title: alerteNom,
        body: message.slice(0, 120),
        url: `/articles/${article.articleId}`,
      });
    } catch (err) {
      logger.warn({ err }, "[found-report] push failed");
    }
    if (article.owner.emailReminders) {
      void EmailService.sendReminderEmail({
        to: article.owner.email,
        subject: `WIM: someone found "${article.articleNom}"`,
        body: `A finder left a message about your lost item "${article.articleNom}":\n\n${message}${contact ? `\n\nContact: ${contact}` : ""}`,
        path: `/articles/${article.articleId}`,
      });
    }

    res.status(204).send();
  })
);

export default router;
