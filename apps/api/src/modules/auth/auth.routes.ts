import { Router, Request, Response } from "express";
import { asyncHandler } from "../common/http";
import { AuthService } from "./auth.service";
import { RegisterSchema, LoginSchema } from "./auth.schemas";
import { authGuard, AuthRequest } from "./auth.middleware";
import { auditAction } from "../common/audit";
import { denyToken } from "./token-denylist";
import { prisma } from "../../libs/prisma";

const router = Router();

// Cookie attributes:
// - httpOnly:  JS can't read the cookie (defends against XSS exfiltration).
// - secure:    only sent over HTTPS in production.
// - sameSite:
//     dev (NODE_ENV !== "production"): "lax" so localhost web can talk to
//       localhost API on a different port.
//     prod: "none" so the web app at https://wim.example.com can include
//       the cookie when calling https://wimapi.example.com from XHR/fetch.
//       "none" requires secure=true (it does in prod). CSRF risk is bounded
//       by the CORS allowlist (CORS_ORIGIN env var) — only origins on that
//       list can issue credentialed cross-origin requests at all.
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite:
    process.env.NODE_ENV === "production"
      ? ("none" as const)
      : ("lax" as const),
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

router.post(
  "/register",
  asyncHandler(async (req: Request, res: Response) => {
    const data = RegisterSchema.parse(req.body);
    const result = await AuthService.register(data);
    await auditAction(req, {
      userId: result.user.userId,
      action: "CREATE",
      entity: "User",
      entityId: result.user.userId,
    });
    res.cookie("wim_token", result.token, COOKIE_OPTS);
    res.status(201).json({ user: result.user });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const data = LoginSchema.parse(req.body);
    const result = await AuthService.login(data);
    await auditAction(req, {
      userId: result.user.userId,
      action: "LOGIN",
      entity: "User",
      entityId: result.user.userId,
    });
    res.cookie("wim_token", result.token, COOKIE_OPTS);
    res.json({ user: result.user });
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
    }
    res.clearCookie("wim_token", COOKIE_OPTS);
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

export default router;
