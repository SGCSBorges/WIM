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
  UpdateEmailSchema,
  UpdatePasswordSchema,
} from "./profile.schemas";
import { ProfileService } from "./profile.service";

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
