/**
 * Auth routes — register, login, logout, forgot/reset password, /me, and
 * the temporary bootstrap-admin endpoint. Every mutating handler emits an
 * audit row (LOGIN/LOGOUT/PASSWORD_RESET/etc.). All four password-bearing
 * flows hash with bcrypt; tokens are issued as httpOnly cookies. The
 * `authRateLimiter` (15-min window, AUTH_RATE_LIMIT_MAX/IP) is applied at
 * mount time in app.ts.
 */
import { Router, Request, Response } from "express";
import { asyncHandler } from "../common/http";
import { AuthService, signTokenWithJti } from "./auth.service";
import {
  ForgotPasswordSchema,
  LoginSchema,
  RegisterSchema,
  ResetPasswordSchema,
} from "./auth.schemas";
import { authGuard, AuthRequest } from "./auth.middleware";
import { auditAction } from "../common/audit";
import { denyToken } from "./token-denylist";
import { prisma } from "../../libs/prisma";
import { cookieOptsFor } from "./cookies";
import { PasswordResetService } from "./password-reset.service";
import { SessionService } from "./session.service";
import { TotpService } from "./totp.service";
import { z } from "zod";
import { security } from "../../config/security";

const router = Router();

router.post(
  "/register",
  asyncHandler(async (req: Request, res: Response) => {
    const data = RegisterSchema.parse(req.body);
    const result = await AuthService.register(data);
    await SessionService.create({
      userId: result.user.userId,
      jti: result.jti,
      ip: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    });
    await auditAction(req, {
      userId: result.user.userId,
      action: "CREATE",
      entity: "User",
      entityId: result.user.userId,
    });
    res.cookie("wim_token", result.token, cookieOptsFor(req));
    res.status(201).json({ user: result.user });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const data = LoginSchema.parse(req.body);
    const result = await AuthService.login(data);
    // 2FA gate: when the user has TOTP enabled, we don't drop a session
    // cookie yet — instead we hand back a short-lived challenge token the
    // client posts to /login/verify-totp with the code.
    const flags = await prisma.user.findUnique({
      where: { userId: result.user.userId },
      select: { totpEnabled: true },
    });
    if (flags?.totpEnabled) {
      const challengeToken = TotpService.signChallenge(
        result.user.userId,
        result.user.role
      );
      res.json({ totpRequired: true, challengeToken });
      return;
    }
    await SessionService.create({
      userId: result.user.userId,
      jti: result.jti,
      ip: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    });
    await auditAction(req, {
      userId: result.user.userId,
      action: "LOGIN",
      entity: "User",
      entityId: result.user.userId,
    });
    res.cookie("wim_token", result.token, cookieOptsFor(req));
    res.json({ user: result.user });
  })
);

const VerifyTotpSchema = z.object({
  challengeToken: z.string().min(1),
  code: z.string().trim().min(1).max(40),
});

router.post(
  "/login/verify-totp",
  asyncHandler(async (req, res) => {
    const { challengeToken, code } = VerifyTotpSchema.parse(req.body);
    let claim;
    try {
      claim = TotpService.verifyChallenge(challengeToken);
    } catch {
      return res.status(401).json({ error: "Invalid or expired challenge" });
    }
    const ok = await TotpService.checkCode(claim.sub, code);
    if (!ok) return res.status(401).json({ error: "Invalid code" });

    const user = await prisma.user.findUnique({
      where: { userId: claim.sub },
      select: { userId: true, email: true, role: true, tokenVersion: true },
    });
    if (!user) return res.status(401).json({ error: "User not found" });

    const { token, jti } = signTokenWithJti(
      user.userId,
      user.role,
      user.tokenVersion
    );
    await SessionService.create({
      userId: user.userId,
      jti,
      ip: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    });
    await auditAction(req, {
      userId: user.userId,
      action: "LOGIN",
      entity: "User",
      entityId: user.userId,
      metadata: { method: "totp" },
    });
    res.cookie("wim_token", token, cookieOptsFor(req));
    res.json({
      user: { userId: user.userId, email: user.email, role: user.role },
    });
  })
);

router.post(
  "/logout",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    // Add the just-presented token to the denylist for the rest of its
    // lifetime so a stolen cookie/Authorization header can't be reused.
    if (req.user?.jti && req.user.exp) {
      const ttl = req.user.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) await denyToken(req.user.jti, ttl);
      // Mirror the denylist in the sessions table so the UI list updates.
      await prisma.userSession
        .updateMany({
          where: { jti: req.user.jti, revokedAt: null },
          data: { revokedAt: new Date() },
        })
        .catch(() => {});
    }
    await auditAction(req, {
      userId: req.user?.sub,
      action: "LOGOUT",
      entity: "User",
      entityId: req.user?.sub,
    });
    res.clearCookie("wim_token", cookieOptsFor(req));
    res.status(204).send();
  })
);

router.get(
  "/me",
  authGuard,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const profile = await AuthService.profile(req.user!.sub);
    res.json(profile);
  })
);

// One-shot admin bootstrap. Promotes the well-known seed account
// (admin@admin.com) to ADMIN — but only if no ADMIN exists yet. After the
// first ADMIN is created, this endpoint always returns 409, so leaving it
// (or its frontend trigger) in place doesn't open a backdoor.
//
// Intended to be removed once the seed admin is in place.
router.post(
  "/bootstrap-admin",
  asyncHandler(async (_req: Request, res: Response) => {
    const SEED_EMAIL = "admin@admin.com";

    const existingAdmin = await prisma.user.findFirst({
      where: { role: "ADMIN" },
      select: { userId: true },
    });
    if (existingAdmin) {
      res
        .status(409)
        .json({ error: "An admin already exists; bootstrap is disabled." });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email: SEED_EMAIL },
      select: { userId: true, email: true, role: true },
    });
    if (!user) {
      res.status(404).json({ error: `Seed account ${SEED_EMAIL} not found.` });
      return;
    }

    await prisma.user.update({
      where: { userId: user.userId },
      data: { role: "ADMIN" },
    });

    res.json({ ok: true, email: user.email, role: "ADMIN" });
  })
);

/**
 * POST /auth/forgot-password
 *
 * Always 204 — the response is deliberately the same whether the email
 * matches an account or not, to keep this endpoint from being a free
 * enumeration oracle. The destructiveRateLimiter caps per-IP attempts.
 */
router.post(
  "/forgot-password",
  security.destructiveRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { email } = ForgotPasswordSchema.parse(req.body);
    await PasswordResetService.request(email);
    res.status(204).send();
  })
);

/**
 * POST /auth/reset-password
 *
 * Consume a reset token + set a new password. Same rate limit as the issue
 * endpoint so a leaked link can't be paired with a brute-force probe of
 * other tokens. The new password meets the registration policy.
 */
router.post(
  "/reset-password",
  security.destructiveRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { token, newPassword } = ResetPasswordSchema.parse(req.body);
    await PasswordResetService.consume(token, newPassword);
    await auditAction(req, {
      action: "UPDATE",
      entity: "User",
      metadata: { field: "password", via: "reset" },
    });
    res.status(204).send();
  })
);

export default router;
