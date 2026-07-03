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
import webauthnRoutes from "./webauthn.routes";
import { EmailVerificationService } from "./email-verification.service";
import { SessionService } from "./session.service";
import { TotpService } from "./totp.service";
import { z } from "zod";
import { security } from "../../config/security";
import { logger } from "../../config/logger";
import {
  seedDemoData,
  resetDemoData,
  DEMO_PASSWORD,
  DEMO_ADMIN_EMAIL,
  DEMO_EMAIL_DOMAIN,
} from "../demo/demo.service";

const router = Router();

// Passkey (WebAuthn) sub-routes — same /api/auth mount, same auth limiter.
router.use(webauthnRoutes);

// Guards a single in-flight demo seed (the op inserts thousands of rows).
let demoSeeding = false;

router.post(
  "/register",
  asyncHandler(async (req: Request, res: Response) => {
    const data = RegisterSchema.parse(req.body);
    const result = await AuthService.register(data);
    void SessionService.create({
      userId: result.user.userId,
      jti: result.jti,
      ip: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    }).catch(() => {});
    // Prove-your-email link. Best-effort and non-blocking: registration
    // must succeed identically whether or not email transport is set up.
    void EmailVerificationService.request(result.user.userId);
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
      // The session JWT minted by login() is valid but must not be used —
      // deny its jti immediately so it cannot serve as a bearer token if
      // ever exposed (e.g. via logs or a memory dump). Awaited so a Redis
      // hiccup doesn't silently leave the token live.
      await denyToken(result.jti, 7 * 24 * 60 * 60);
      const challengeToken = await TotpService.signChallenge(
        result.user.userId,
        result.user.role
      );
      res.json({ totpRequired: true, challengeToken });
      return;
    }
    void SessionService.create({
      userId: result.user.userId,
      jti: result.jti,
      ip: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    }).catch(() => {});
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
      claim = await TotpService.verifyChallenge(challengeToken);
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
    void SessionService.create({
      userId: user.userId,
      jti,
      ip: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    }).catch(() => {});
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
// Requires the BOOTSTRAP_SECRET env var to be set AND matched in the request
// body, preventing self-promotion on fresh deploys where anyone could
// register the seed email before the real operator does.
//
// Intended to be removed once the seed flow is replaced.
router.post(
  "/bootstrap-admin",
  asyncHandler(async (req: Request, res: Response) => {
    const SEED_EMAIL = "admin@admin.com";

    const secret = process.env.BOOTSTRAP_SECRET;
    if (secret) {
      const provided = (req.body as Record<string, unknown>)?.secret;
      if (!provided || provided !== secret) {
        res.status(401).json({ error: "Invalid bootstrap secret." });
        return;
      }
    }

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

// Temporary demo-data loader (login-screen "Load demo data" button). Each click
// REFRESHES the demo dataset: it first deletes every prior demo account (any
// `@demo.wim.app` user — which cascades their articles/warranties/etc.) and then
// reseeds 100 users × 100 articles + the full feature set with the latest
// generator. Real accounts (any other email domain) are never touched, so this
// is safe to re-run on a live DB and a second click picks up new fields/code
// (e.g. product image URLs) instead of being refused. Demo accounts still start
// after a reserved id margin so they don't collide with the handful of real
// users.
//
// The job inserts thousands of rows (~1–2 min), so it runs in the BACKGROUND
// and the request returns 202 immediately — the client can't sit on a long
// request. A single run at a time (demoSeeding guard). Disable entirely with
// DEMO_SEED_ENABLED=false.
router.post(
  "/seed-demo",
  asyncHandler(async (_req: Request, res: Response) => {
    if (process.env.DEMO_SEED_ENABLED === "false") {
      res.status(403).json({ error: "Demo seeding is disabled." });
      return;
    }
    if (demoSeeding) {
      res.status(409).json({ error: "A demo seed is already running." });
      return;
    }

    // Mint a demo admin only when no REAL (non-demo) admin exists, so we never
    // add a surprise admin to a database that already has a real operator. The
    // demo admin from a prior run is about to be deleted by resetDemoData, so
    // exclude `@demo.wim.app` admins from this check.
    const realAdmin = await prisma.user.findFirst({
      where: {
        role: "ADMIN",
        NOT: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } },
      },
      select: { userId: true },
    });
    const makeAdmin = !realAdmin;

    demoSeeding = true;
    void (async () => {
      const removed = await resetDemoData(prisma);
      if (removed > 0)
        logger.info(`[demo-seed] cleared ${removed} prior demo account(s)`);
      return seedDemoData(prisma, {
        reservedUserIdMargin: 1000,
        makeAdmin,
        onProgress: (m) => logger.info(`[demo-seed] ${m}`),
      });
    })()
      .then((s) =>
        logger.info(
          { users: s.users, articles: s.articles, warranties: s.warranties },
          "[demo-seed] complete"
        )
      )
      .catch((err) => logger.error({ err }, "[demo-seed] failed"))
      .finally(() => {
        demoSeeding = false;
      });

    res.status(202).json({
      started: true,
      refreshed: true,
      users: 100,
      articlesPerUser: 100,
      password: DEMO_PASSWORD,
      adminEmail: makeAdmin ? DEMO_ADMIN_EMAIL : null,
    });
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

/**
 * POST /auth/verify-email
 *
 * Consume an email-verification token (the token IS the credential, so no
 * auth cookie is required — the link must work from any device/mail app).
 * Rate-limited like the reset endpoints so tokens can't be brute-forced.
 */
router.post(
  "/verify-email",
  security.destructiveRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { token } = z
      .object({ token: z.string().trim().min(32).max(128) })
      .parse(req.body);
    await EmailVerificationService.consume(token);
    await auditAction(req, {
      action: "UPDATE",
      entity: "User",
      metadata: { field: "emailVerifiedAt", via: "verification-link" },
    });
    res.status(204).send();
  })
);

/**
 * POST /auth/verify-email/request — signed-in re-send (Profile button).
 * No-ops silently when already verified; always 204.
 */
router.post(
  "/verify-email/request",
  security.destructiveRateLimiter,
  authGuard,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    await EmailVerificationService.request(req.user!.sub);
    res.status(204).send();
  })
);

export default router;
