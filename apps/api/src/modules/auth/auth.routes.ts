import { Router, Request, Response } from "express";
import { asyncHandler } from "../common/http";
import { AuthService } from "./auth.service";
import { RegisterSchema, LoginSchema } from "./auth.schemas";
import { authGuard, AuthRequest } from "./auth.middleware";
import { auditAction } from "../common/audit";
import { denyToken } from "./token-denylist";
import { prisma } from "../../libs/prisma";
import { cookieOptsFor } from "./cookies";

const router = Router();

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
    res.cookie("wim_token", result.token, cookieOptsFor(req));
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
    res.cookie("wim_token", result.token, cookieOptsFor(req));
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

export default router;
