import { Router, Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../common/http";
import { AuthService } from "./auth.service";
import { RegisterSchema, LoginSchema } from "./auth.schemas";
import { authGuard } from "./auth.middleware";

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
  asyncHandler(async (req: Request, res: Response) => {
    const data = LoginSchema.parse(req.body);
    const result = await AuthService.login(data);
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
