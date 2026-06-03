import { Router, Response } from "express";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { asyncHandler } from "../common/http";
import { auditAction } from "../common/audit";
import { denyToken } from "../auth/token-denylist";
import { cookieOptsFor } from "../auth/cookies";
import { signToken } from "../auth/auth.service";
import { security } from "../../config/security";
import {
  DeleteAccountSchema,
  UpdateCurrencySchema,
  UpdateEmailRemindersSchema,
  UpdateEmailSchema,
  UpdatePasswordSchema,
  UpdatePreferencesSchema,
  UpdateWeeklyDigestSchema,
} from "./profile.schemas";
import { ProfileService } from "./profile.service";
import { SessionService } from "../auth/session.service";
import { prisma } from "../../libs/prisma";
import { idParam } from "../common/schemas";

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
    await SessionService.revoke(req.user!.sub, id, req.user!.exp);
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
    }
    const fresh = signToken(updated.userId, updated.role, updated.tokenVersion);
    res.cookie("wim_token", fresh, cookieOptsFor(req));

    res.json({
      userId: updated.userId,
      email: updated.email,
      role: updated.role,
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
