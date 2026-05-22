import { Router } from "express";
import Stripe from "stripe";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { asyncHandler } from "../common/http";
import { createHttpError } from "../../utils/http-error";
import { prisma } from "../../libs/prisma";
import { logger } from "../../config/logger";
import { ShareService } from "../shares/share.service";
import { auditAction } from "../common/audit";

const router = Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY missing");
  return new Stripe(key);
}

type SubSummary = {
  status: Stripe.Subscription.Status;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: number | null; // unix seconds
  cancelAt: number | null;
  endedAt: number | null;
  plan: "monthly" | "yearly" | null;
};

function summarizeSubscription(sub: Stripe.Subscription): SubSummary {
  const interval = sub.items.data[0]?.price?.recurring?.interval;
  const plan: "monthly" | "yearly" | null =
    interval === "month" ? "monthly" : interval === "year" ? "yearly" : null;
  return {
    status: sub.status,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    currentPeriodEnd: sub.current_period_end ?? null,
    cancelAt: sub.cancel_at ?? null,
    endedAt: sub.ended_at ?? null,
    plan,
  };
}

async function fetchSubscriptionForUser(
  user: {
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
  } | null
): Promise<SubSummary | null> {
  if (!user || !user.stripeCustomerId) return null;
  const stripe = getStripe();

  // Prefer the recorded subscription id; fall back to listing customer subs.
  try {
    if (user.stripeSubscriptionId) {
      const sub = await stripe.subscriptions.retrieve(
        user.stripeSubscriptionId
      );
      return summarizeSubscription(sub);
    }
    const subs = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      status: "all",
      limit: 5,
    });
    const live = subs.data.find(
      (s) => s.status === "active" || s.status === "trialing"
    );
    return live ? summarizeSubscription(live) : null;
  } catch (err) {
    logger.error({ err }, "[billing/me] failed to fetch subscription");
    return null;
  }
}

router.get(
  "/me",
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

    // Only ask Stripe for details when the user actually has billing state.
    // Saves a Stripe API call per /billing/me poll for free users.
    const subscription =
      user.role === "POWER_USER" || user.stripeSubscriptionId
        ? await fetchSubscriptionForUser(user)
        : null;

    res.json({
      userId: user.userId,
      email: user.email,
      role: user.role,
      subscription,
    });
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
    const isDowngrade = user.role === "POWER_USER" && nextRole === "USER";

    if (needsUpdate) {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { userId },
          data: {
            role: nextRole,
            stripeSubscriptionId: activeSubscriptionId,
          },
        });
        if (isDowngrade) {
          const counts = await ShareService.cleanupSharingForUser(userId, tx);
          logger.info(
            { userId, ...counts, reason: "billing-sync" },
            "[billing/sync] downgrade cleanup"
          );
        }
      });

      const isUpgrade = user.role === "USER" && nextRole === "POWER_USER";
      if (isUpgrade || isDowngrade) {
        await auditAction(req, {
          userId,
          action: isUpgrade ? "BILLING_UPGRADE" : "BILLING_DOWNGRADE",
          entity: "User",
          entityId: userId,
          metadata: {
            source: "billing/sync",
            from: user.role,
            to: nextRole,
            subscriptionId: activeSubscriptionId,
          },
        });
      }
    }

    return res.json({ role: nextRole, synced: true });
  })
);

export default router;
