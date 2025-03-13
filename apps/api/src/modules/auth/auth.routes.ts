import { Router, Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../common/http";
import { AuthService } from "./auth.service";
import { RegisterSchema, LoginSchema } from "./auth.schemas";
import { authGuard } from "./auth.middleware";
import { auditAction } from "../common/audit";

const router = Router();

router.post(
  "/register",
  asyncHandler(async (req: Request, res: Response) => {
    const data = RegisterSchema.parse(req.body);
    const result = await AuthService.register(data);
    res.status(201).json(result);
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
    res.json(result);
  })
);

router.get(
  "/me",
  authGuard,
  asyncHandler(async (req: any, res: Response) => {
    const profile = await AuthService.profile(req.user.sub);
    res.json(profile);
  })
);

export default router;
