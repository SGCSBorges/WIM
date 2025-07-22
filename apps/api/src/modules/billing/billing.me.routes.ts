import { Router } from "express";
import { authGuard } from "../auth/auth.middleware";
import { prisma } from "../../libs/prisma";

const router = Router();

// Handy endpoint so the frontend can refresh user role after returning from Stripe.
router.get("/me", authGuard, async (req: any, res) => {
  const userId = Number(req.user?.sub);
  const user = await prisma.user.findUnique({
    where: { userId },
    select: { userId: true, email: true, role: true },
  });

  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

export default router;
