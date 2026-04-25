import { Router, Request, Response } from "express";
import { asyncHandler } from "../common/http";
import { AuthService } from "./auth.service";
import { RegisterSchema, LoginSchema } from "./auth.schemas";
import { authGuard, AuthRequest } from "./auth.middleware";
import { auditAction } from "../common/audit";

const router = Router();

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
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

router.post("/logout", (_req, res) => {
  res.clearCookie("wim_token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });
  res.status(204).send();
});

router.get(
  "/me",
  authGuard,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const profile = await AuthService.profile(req.user!.sub);
    res.json(profile);
  })
);

export default router;
