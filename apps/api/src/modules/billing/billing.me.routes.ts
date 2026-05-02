import { Router } from "express";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { asyncHandler } from "../common/http";
import { createHttpError } from "../../utils/http-error";
import { prisma } from "../../libs/prisma";

const router = Router();

// Handy endpoint so the frontend can refresh user role after returning from Stripe.
router.get(
  "/me",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.user!.sub;
    const user = await prisma.user.findUnique({
      where: { userId },
      select: { userId: true, email: true, role: true },
    });

    if (!user) throw createHttpError(404, "User not found");
    res.json(user);
  })
);

export default router;
