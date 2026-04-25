import { Router } from "express";
import Stripe from "stripe";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { asyncHandler } from "../common/http";
import { createHttpError } from "../../utils/http-error";
import { prisma } from "../../libs/prisma";

const router = Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY missing");
  }
  return new Stripe(key);
}

async function getOrCreateStripeCustomer(
  stripe: Stripe,
  userId: number,
  email: string,
  stripeCustomerId: string | null,
): Promise<string> {
  if (stripeCustomerId) return stripeCustomerId;
  const customer = await stripe.customers.create({
    email,
    metadata: { userId: String(userId) },
  });
  await prisma.user.update({
    where: { userId },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

function getAppUrl(): string {
  const raw =
    process.env.APP_URL ||
    process.env.RENDER_EXTERNAL_URL;
  if (!raw) {
    throw createHttpError(500, "APP_URL is not configured. Set APP_URL to your frontend origin.");
  }
  return String(raw).replace(/\/$/, "");
}

router.post(
  "/upgrade/power-user/checkout",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const appUrl = getAppUrl();

    const plan = String(req.body?.plan || "monthly");
    if (plan !== "monthly" && plan !== "yearly") {
      return res.status(400).json({ error: "Invalid plan" });
    }

    const monthlyPriceId = process.env.STRIPE_POWER_USER_PRICE_MONTHLY;
    const yearlyPriceId = process.env.STRIPE_POWER_USER_PRICE_YEARLY;
    const priceId = plan === "yearly" ? yearlyPriceId : monthlyPriceId;

    if (!priceId) {
      return res.status(500).json({
        error:
          "Missing Stripe Price ID for selected plan. Set STRIPE_POWER_USER_PRICE_MONTHLY and STRIPE_POWER_USER_PRICE_YEARLY.",
      });
    }

    if (!String(priceId).startsWith("price_")) {
      return res.status(500).json({
        error:
          "Stripe price IDs must start with price_. You currently have amounts instead of Stripe Price IDs.",
      });
    }

    const stripe = getStripe();
    const userId = req.user.sub;

    const user = await prisma.user.findUnique({
      where: { userId },
      select: { userId: true, email: true, stripeCustomerId: true },
    });
    if (!user) throw createHttpError(404, "User not found");

    const stripeCustomerId = await getOrCreateStripeCustomer(
      stripe, user.userId, user.email, user.stripeCustomerId,
    );

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: String(priceId), quantity: 1 }],
      success_url: `${appUrl}/?stripe=success`,
      cancel_url: `${appUrl}/?stripe=cancel`,
      metadata: {
        userId: String(userId),
        role: req.user.role,
        targetRole: "POWER_USER",
        plan,
      },
    });

    return res.json({ url: session.url });
  })
);

router.post(
  "/cancel/power-user",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.user.sub;

    const user = await prisma.user.findUnique({
      where: { userId },
      select: { userId: true, role: true, stripeSubscriptionId: true },
    });
    if (!user) throw createHttpError(404, "User not found");

    if (user.role !== "POWER_USER") {
      throw createHttpError(400, "You are not a POWER_USER");
    }

    if (!user.stripeSubscriptionId) {
      throw createHttpError(400,
        "No Stripe subscription found. If you upgraded recently, try again after the webhook processes your payment."
      );
    }

    const stripe = getStripe();
    const updatedSub = await stripe.subscriptions.update(
      user.stripeSubscriptionId,
      { cancel_at_period_end: true }
    );

    return res.json({
      subscriptionId: updatedSub.id,
      cancelAtPeriodEnd: updatedSub.cancel_at_period_end,
      currentPeriodEnd: updatedSub.current_period_end,
    });
  })
);

router.post(
  "/portal",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const appUrl = getAppUrl();
    const userId = req.user.sub;
    const stripe = getStripe();

    const user = await prisma.user.findUnique({
      where: { userId },
      select: { stripeCustomerId: true, email: true, userId: true },
    });
    if (!user) throw createHttpError(404, "User not found");

    const customerId = await getOrCreateStripeCustomer(
      stripe, user.userId, user.email, user.stripeCustomerId,
    );

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/?billing=return`,
    });

    return res.json({ url: session.url });
  })
);

export default router;
