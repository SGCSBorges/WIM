import { Router, Response } from "express";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { requireFeature } from "../features/feature.service";
import { asyncHandler } from "../common/http";
import { auditAction } from "../common/audit";
import { denyToken } from "../auth/token-denylist";
import { cookieOptsFor } from "../auth/cookies";
import { signTokenWithJti } from "../auth/auth.service";
import { security } from "../../config/security";
import {
  DeleteAccountSchema,
  UpdateBudgetSchema,
  UpdateCurrencySchema,
  UpdateEmailRemindersSchema,
  UpdateEmailSchema,
  UpdatePasswordSchema,
  UpdatePreferencesSchema,
  UpdateReminderDaysSchema,
  UpdateWeeklyDigestSchema,
} from "./profile.schemas";
import { ProfileService } from "./profile.service";
import { SessionService } from "../auth/session.service";
import { TotpService } from "../auth/totp.service";
import { prisma } from "../../libs/prisma";
import { idParam } from "../common/schemas";
import bcrypt from "bcrypt";
import QRCode from "qrcode";
import { z } from "zod";
import { createHttpError } from "../../utils/http-error";

const router = Router();

/**
 * Profile API
 *
 * All routes in this file require a valid JWT (see authGuard).
 * Base path: /api/profile
 */

router.get(
  "/me",
  authGuard,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const me = await ProfileService.get(req.user!.sub);
    res.json(me);
  })
);

// User-facing login history. Reuses AuditLog rather than adding a dedicated
// table — every LOGIN/LOGOUT already lands there with ip + userAgent and is
// indexed by (userId, createdAt DESC). Capped to 50 rows so a giant audit
// trail can't make the panel slow.
// Active sessions list. We include the caller's own jti so the UI can mark
// the "current device" row without a second round-trip.
router.get(
  "/me/sessions",
  authGuard,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const items = await SessionService.list(req.user!.sub);
    res.json({ items, currentJti: req.user!.jti ?? null });
  })
);

router.delete(
  "/me/sessions/:id",
  authGuard,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = idParam.parse(req.params.id);
    await SessionService.revoke(req.user!.sub, id);
    await auditAction(req, {
      action: "UPDATE",
      entity: "User",
      entityId: req.user!.sub,
      metadata: { sessionRevoked: id },
    });
    res.status(204).send();
  })
);

router.post(
  "/me/sessions/revoke-others",
  authGuard,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user!.jti) return res.status(400).json({ error: "Missing jti" });
    const result = await SessionService.revokeOthers(
      req.user!.sub,
      req.user!.jti
    );
    await auditAction(req, {
      action: "UPDATE",
      entity: "User",
      entityId: req.user!.sub,
      metadata: { sessionsRevoked: result.revoked, kept: "current" },
    });
    res.json(result);
  })
);

router.get(
  "/me/login-history",
  authGuard,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const rows = await prisma.auditLog.findMany({
      where: {
        userId: req.user!.sub,
        action: { in: ["LOGIN", "LOGOUT"] },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        action: true,
        ip: true,
        userAgent: true,
        createdAt: true,
      },
    });
    res.json(rows);
  })
);

const TotpPasswordSchema = z.object({
  currentPassword: z.string().min(1),
});
const TotpVerifySchema = z.object({
  code: z.string().trim().min(1).max(40),
  currentPassword: z.string().min(1),
});

// Provision a fresh TOTP secret + 10 single-use backup codes. Returns the
// otpauth URL, a data-URL QR encoding it, and the plaintext backup codes
// ONCE — the route's caller must store them out-of-band. Password is
// required so a leaked session can't silently bootstrap 2FA for someone.
router.post(
  "/me/totp/setup",
  authGuard,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { currentPassword } = TotpPasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { userId: req.user!.sub },
    });
    if (!user) throw createHttpError(404, "User not found");
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw createHttpError(403, "Invalid password");

    const { otpauthUrl, backupCodes } = await TotpService.setup(
      user.userId,
      user.email
    );
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    res.json({ otpauthUrl, qrDataUrl, backupCodes });
  })
);

// Confirm the code from the authenticator app and flip totpEnabled.
router.post(
  "/me/totp/verify",
  authGuard,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { code, currentPassword } = TotpVerifySchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { userId: req.user!.sub },
    });
    if (!user) throw createHttpError(404, "User not found");
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw createHttpError(403, "Invalid password");
    await TotpService.verify(user.userId, code);
    await auditAction(req, {
      action: "UPDATE",
      entity: "User",
      entityId: user.userId,
      metadata: { field: "totpEnabled", enabled: true },
    });
    res.status(204).send();
  })
);

router.delete(
  "/me/totp",
  authGuard,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { currentPassword } = TotpPasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { userId: req.user!.sub },
    });
    if (!user) throw createHttpError(404, "User not found");
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw createHttpError(403, "Invalid password");
    await TotpService.disable(user.userId);
    await auditAction(req, {
      action: "UPDATE",
      entity: "User",
      entityId: user.userId,
      metadata: { field: "totpEnabled", enabled: false },
    });
    res.status(204).send();
  })
);

router.put(
  "/me/email",
  authGuard,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { email, currentPassword } = UpdateEmailSchema.parse(req.body);
    const updated = await ProfileService.updateEmail(
      req.user!.sub,
      email,
      currentPassword
    );

    await auditAction(req, {
      action: "UPDATE",
      entity: "User",
      entityId: req.user!.sub,
      metadata: { field: "email" },
    });

    // tokenVersion was bumped — deny the current jti and reissue a fresh
    // token at the new version so the calling device stays logged in.
    if (req.user?.jti && req.user.exp) {
      const ttl = req.user.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) await denyToken(req.user.jti, ttl);
      void prisma.userSession
        .updateMany({
          where: { jti: req.user.jti, revokedAt: null },
          data: { revokedAt: new Date() },
        })
        .catch(() => {});
    }
    const { token: fresh, jti: freshJti } = signTokenWithJti(
      updated.userId,
      updated.role,
      updated.tokenVersion
    );
    void SessionService.create({
      userId: updated.userId,
      jti: freshJti,
      ip: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    }).catch(() => {});
    res.cookie("wim_token", fresh, cookieOptsFor(req));

    res.json(updated);
  })
);

router.put(
  "/me/currency",
  authGuard,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { currency } = UpdateCurrencySchema.parse(req.body);
    const updated = await ProfileService.updateCurrency(
      req.user!.sub,
      currency
    );
    await auditAction(req, {
      action: "UPDATE",
      entity: "User",
      entityId: req.user!.sub,
      metadata: { field: "currency" },
    });
    res.json(updated);
  })
);

router.put(
  "/me/budget",
  authGuard,
  requireFeature("budget"),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const budget = UpdateBudgetSchema.parse(req.body);
    const updated = await ProfileService.updateBudget(req.user!.sub, budget);
    await auditAction(req, {
      action: "UPDATE",
      entity: "User",
      entityId: req.user!.sub,
      metadata: { field: "budget", keys: Object.keys(budget) },
    });
    res.json(updated);
  })
);

router.put(
  "/me/preferences",
  authGuard,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const prefs = UpdatePreferencesSchema.parse(req.body);
    const updated = await ProfileService.updatePreferences(
      req.user!.sub,
      prefs
    );
    await auditAction(req, {
      action: "UPDATE",
      entity: "User",
      entityId: req.user!.sub,
      metadata: { field: "preferences", keys: Object.keys(prefs) },
    });
    res.json(updated);
  })
);

router.put(
  "/me/email-reminders",
  authGuard,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { enabled } = UpdateEmailRemindersSchema.parse(req.body);
    const updated = await ProfileService.updateEmailReminders(
      req.user!.sub,
      enabled
    );
    await auditAction(req, {
      action: "UPDATE",
      entity: "User",
      entityId: req.user!.sub,
      metadata: { field: "emailReminders", enabled },
    });
    res.json(updated);
  })
);

router.put(
  "/me/reminder-days",
  authGuard,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { days } = UpdateReminderDaysSchema.parse(req.body);
    const updated = await ProfileService.updateReminderDays(
      req.user!.sub,
      days
    );
    await auditAction(req, {
      action: "UPDATE",
      entity: "User",
      entityId: req.user!.sub,
      metadata: { field: "warrantyReminderDays", days },
    });
    res.json(updated);
  })
);

router.put(
  "/me/weekly-digest",
  authGuard,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { enabled } = UpdateWeeklyDigestSchema.parse(req.body);
    const updated = await ProfileService.updateWeeklyDigest(
      req.user!.sub,
      enabled
    );
    await auditAction(req, {
      action: "UPDATE",
      entity: "User",
      entityId: req.user!.sub,
      metadata: { field: "weeklyDigest", enabled },
    });
    res.json(updated);
  })
);

router.put(
  "/me/password",
  authGuard,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { currentPassword, newPassword } = UpdatePasswordSchema.parse(
      req.body
    );
    const updated = await ProfileService.updatePassword(
      req.user!.sub,
      currentPassword,
      newPassword
    );

    await auditAction(req, {
      action: "UPDATE",
      entity: "User",
      entityId: req.user!.sub,
      metadata: { field: "password" },
    });

    // Service bumped tokenVersion to kill every previously issued JWT
    // (other devices, leaked cookies). Belt-and-braces: deny the current
    // jti in Redis too, then mint a fresh token at the new version so the
    // calling device stays logged in without a re-login round trip.
    if (req.user?.jti && req.user.exp) {
      const ttl = req.user.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) await denyToken(req.user.jti, ttl);
      void prisma.userSession
        .updateMany({
          where: { jti: req.user.jti, revokedAt: null },
          data: { revokedAt: new Date() },
        })
        .catch(() => {});
    }
    const { token: fresh, jti: freshJti } = signTokenWithJti(
      updated.userId,
      updated.role,
      updated.tokenVersion
    );
    void SessionService.create({
      userId: updated.userId,
      jti: freshJti,
      ip: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    }).catch(() => {});
    res.cookie("wim_token", fresh, cookieOptsFor(req));

    res.json({
      userId: updated.userId,
      email: updated.email,
      role: updated.role,
    });
  })
);

/**
 * GET /api/profile/me/export — full personal data export (data portability).
 * One JSON document with every record the account owns: profile settings,
 * articles (warranty + history + notes + locations + tags + attachment
 * metadata), loans, insurance, service records, alerts, saved views,
 * templates, wishlist. Deliberately NOT feature-gated — exporting your own
 * data is a right, not a paid feature. Message threads are excluded (they
 * contain the counterparty's words). Rate-limited + audited as DB_EXPORT.
 */
router.get(
  "/me/export",
  security.destructiveRateLimiter,
  authGuard,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.sub;
    const [
      profile,
      articles,
      warrantyHistory,
      alerts,
      loans,
      insurancePolicies,
      serviceRecords,
      locations,
      tags,
      savedViews,
      templates,
      wishlist,
    ] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { userId },
        select: {
          userId: true,
          email: true,
          role: true,
          currency: true,
          monthlyBudget: true,
          annualBudget: true,
          emailReminders: true,
          weeklyDigest: true,
          warrantyReminderDays: true,
          emailVerifiedAt: true,
          theme: true,
          language: true,
          dateFormat: true,
          createdAt: true,
        },
      }),
      prisma.article.findMany({
        where: { ownerUserId: userId },
        include: {
          garantie: true,
          notes: true,
          locations: {
            select: { location: { select: { name: true } }, assignedAt: true },
          },
          tags: { select: { tag: { select: { name: true } } } },
          attachments: {
            select: {
              attachmentId: true,
              type: true,
              fileName: true,
              mimeType: true,
              fileSize: true,
              fileUrl: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.warrantyHistory.findMany({ where: { ownerUserId: userId } }),
      prisma.alerte.findMany({ where: { ownerUserId: userId } }),
      prisma.loan.findMany({ where: { ownerUserId: userId } }),
      prisma.insurancePolicy.findMany({
        where: { ownerUserId: userId },
        include: { articles: { select: { articleId: true } } },
      }),
      prisma.serviceRecord.findMany({ where: { ownerUserId: userId } }),
      prisma.location.findMany({ where: { ownerUserId: userId } }),
      prisma.tag.findMany({ where: { ownerUserId: userId } }),
      prisma.savedView.findMany({ where: { ownerUserId: userId } }),
      prisma.articleTemplate.findMany({ where: { ownerUserId: userId } }),
      prisma.wishlistItem.findMany({ where: { ownerUserId: userId } }),
    ]);

    await auditAction(req, {
      userId,
      action: "DB_EXPORT",
      entity: "User",
      entityId: userId,
      metadata: { report: "account", articles: articles.length },
    });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="wim-account-export-${userId}.json"`
    );
    res.json({
      exportedAt: new Date().toISOString(),
      format: "wim-account-export/v1",
      profile,
      articles,
      warrantyHistory,
      alerts,
      loans,
      insurancePolicies,
      serviceRecords,
      locations,
      tags,
      savedViews,
      templates,
      wishlist,
    });
  })
);

router.delete(
  "/me",
  security.destructiveRateLimiter,
  authGuard,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    /**
     * DELETE /api/profile/me
     *
     * Deletes the current account.
     * - Requires `currentPassword` to confirm the operation.
     * - Returns 204 on success.
     *
     * NOTE:
     * The service deletes dependent records owned by the user first to avoid FK issues.
     */
    const { currentPassword } = DeleteAccountSchema.parse(req.body);
    await ProfileService.deleteAccount(req.user!.sub, currentPassword);

    // Audit before invalidating the session so the row is written under the
    // (now-deleted) user's id for forensics. We tolerate audit failures here.
    await auditAction(req, {
      action: "DELETE",
      entity: "User",
      entityId: req.user!.sub,
    });

    // Revoke the JWT that authorised this request so the cookie can't be
    // replayed during its remaining TTL, then clear it from the client.
    if (req.user?.jti && req.user.exp) {
      const ttl = req.user.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) await denyToken(req.user.jti, ttl);
    }
    res.clearCookie("wim_token", cookieOptsFor(req));

    res.status(204).send();
  })
);

export default router;
