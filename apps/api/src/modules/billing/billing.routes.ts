import { Router } from "express";
import Stripe from "stripe";
import { authGuard } from "../auth/auth.middleware";
import { prisma } from "../../libs/prisma";

const router = Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY missing");
  }
  // Pinning apiVersion avoids surprises when Stripe updates defaults.
  return new Stripe(key);
}

router.post("/upgrade/power-user/checkout", authGuard, async (req, res) => {
  try {
    // URL of the frontend app for Stripe redirects.
    // On Render, set APP_URL to your static site origin (e.g. https://wimweb.onrender.com)
    // Never leave it as localhost in production, otherwise Stripe redirects to localhost.
    const appUrlRaw =
      process.env.APP_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      "http://localhost:5173";
    const appUrl = String(appUrlRaw).replace(/\/$/, "");

    const plan = String((req.body as any)?.plan || "monthly");
    if (plan !== "monthly" && plan !== "yearly") {
      return res.status(400).json({ error: "Invalid plan" });
    }

    const monthlyPriceId = process.env.STRIPE_POWER_USER_PRICE_MONTHLY;
    const yearlyPriceId = process.env.STRIPE_POWER_USER_PRICE_YEARLY;
    const priceId = plan === "yearly" ? yearlyPriceId : monthlyPriceId;

    if (!priceId) {
      return res.status(500).json({
        error:
          "Missing Stripe Price ID for selected plan. Set STRIPE_POWER_USER_PRICE_MONTHLY and STRIPE_POWER_USER_PRICE_YEARLY to price_* values.",
      });
    }

    if (!String(priceId).startsWith("price_")) {
      return res.status(500).json({
        error:
          "Stripe price IDs must start with price_. You currently have amounts (e.g. 2.99) instead of Stripe Price IDs.",
      });
    }

    const stripe = getStripe();

    const userId = Number((req as any).user?.sub);
    if (!Number.isFinite(userId)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { userId },
      select: { userId: true, email: true, stripeCustomerId: true },
    });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Ensure we have a Stripe Customer to attach the subscription to.
    // This is required to support cancellation at period end later.
    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: String(user.userId) },
      });
      stripeCustomerId = customer.id;
      await prisma.user.update({
        where: { userId: user.userId },
        data: { stripeCustomerId },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: String(priceId), quantity: 1 }],
      success_url: `${appUrl}/?stripe=success`,
      cancel_url: `${appUrl}/?stripe=cancel`,
      metadata: {
        userId: String(userId),
        role: String((req as any).user?.role ?? ""),
        targetRole: "POWER_USER",
        plan,
      },
    });

    return res.json({ url: session.url });
  } catch (e: any) {
    const message = e?.message || "Failed to create checkout session";
    return res.status(500).json({ error: message });
  }
});

// Cancel/downgrade: revert POWER_USER back to USER.
// NOTE: This currently only updates the local role.
// To actually cancel a Stripe subscription, we need to store and look up the Stripe
// customer/subscription id (or implement Stripe customer portal and let Stripe manage it).
router.post("/cancel/power-user", authGuard, async (req: any, res) => {
  try {
    const userId = Number(req.user?.sub);
    if (!Number.isFinite(userId)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Stripe-backed cancel at period end.
    const user = await prisma.user.findUnique({
      where: { userId },
      select: { userId: true, role: true, stripeSubscriptionId: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.role !== "POWER_USER") {
      return res.status(400).json({ error: "You are not a POWER_USER" });
    }

    if (!user.stripeSubscriptionId) {
      return res.status(400).json({
        error:
          "No Stripe subscription found for your account. If you upgraded recently, try again in a moment after the webhook processes your payment.",
      });
    }

    const stripe = getStripe();
    const updatedSub = await stripe.subscriptions.update(
      user.stripeSubscriptionId,
      { cancel_at_period_end: true }
    );

    // Do NOT downgrade role immediately. We'll downgrade via webhook when the subscription ends.
    return res.json({
      subscriptionId: updatedSub.id,
      cancelAtPeriodEnd: updatedSub.cancel_at_period_end,
      currentPeriodEnd: updatedSub.current_period_end,
    });
  } catch (e: any) {
    return res
      .status(500)
      .json({ error: e?.message || "Failed to cancel subscription" });
  }
});

// Optional: Stripe Customer Portal session (lets users manage/cancel themselves).
// This endpoint is safe to add even if the UI doesn't use it yet.
router.post("/portal", authGuard, async (req: any, res) => {
  try {
    const userId = Number(req.user?.sub);
    if (!Number.isFinite(userId)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const appUrlRaw =
      process.env.APP_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      "http://localhost:5173";
    const appUrl = String(appUrlRaw).replace(/\/$/, "");

    const stripe = getStripe();

    const user = await prisma.user.findUnique({
      where: { userId },
      select: { stripeCustomerId: true, email: true, userId: true },
    });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: String(user.userId) },
      });
      customerId = customer.id;
      await prisma.user.update({
        where: { userId: user.userId },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/?billing=return`,
    });

    return res.json({ url: session.url });
  } catch (e: any) {
    return res
      .status(500)
      .json({ error: e?.message || "Failed to open portal" });
  }
});

export default router;
