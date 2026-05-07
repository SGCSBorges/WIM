import { Router } from "express";
import Stripe from "stripe";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { asyncHandler } from "../common/http";
import { createHttpError } from "../../utils/http-error";
import { prisma } from "../../libs/prisma";
import { logger } from "../../config/logger";

const router = Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY missing");
  return new Stripe(key);
}

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

// Webhook-independent sync. The frontend calls this after returning from
// Stripe Checkout (?stripe=success) so the user doesn't have to wait on
// webhook delivery. Authoritative source of truth is still the webhook,
// but this gives an immediate answer when webhooks lag or aren't wired up.
router.post(
  "/sync",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.user!.sub;
    const user = await prisma.user.findUnique({
      where: { userId },
      select: {
        userId: true,
        email: true,
        role: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
      },
    });
    if (!user) throw createHttpError(404, "User not found");

    if (!user.stripeCustomerId) {
      return res.json({
        role: user.role,
        synced: false,
        reason: "no_customer",
      });
    }

    const stripe = getStripe();
    let activeSubscriptionId: string | null = null;
    try {
      const subs = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        status: "all",
        limit: 5,
      });
      // "Active enough to be a POWER_USER": active or trialing.
      const live = subs.data.find(
        (s) => s.status === "active" || s.status === "trialing"
      );
      activeSubscriptionId = live?.id ?? null;
    } catch (err) {
      logger.error(
        { err, userId },
        "[billing/sync] failed to query Stripe subscriptions"
      );
      return res.json({
        role: user.role,
        synced: false,
        reason: "stripe_error",
      });
    }

    let nextRole: "USER" | "POWER_USER" | "ADMIN" = user.role as
      | "USER"
      | "POWER_USER"
      | "ADMIN";
    if (activeSubscriptionId) {
      // Don't demote ADMIN to POWER_USER here — admins keep their role.
      if (user.role === "USER") nextRole = "POWER_USER";
    } else if (user.role === "POWER_USER") {
      nextRole = "USER";
    }

    const needsUpdate =
      nextRole !== user.role ||
      activeSubscriptionId !== user.stripeSubscriptionId;
    if (needsUpdate) {
      await prisma.user.update({
        where: { userId },
        data: {
          role: nextRole,
          stripeSubscriptionId: activeSubscriptionId,
        },
      });
    }

    return res.json({ role: nextRole, synced: true });
  })
);

export default router;
