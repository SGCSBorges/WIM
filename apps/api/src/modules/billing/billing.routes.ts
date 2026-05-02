import { Router } from "express";
import { z } from "zod";
import Stripe from "stripe";
import { authGuard, AuthRequest } from "../auth/auth.middleware";
import { asyncHandler } from "../common/http";
import { createHttpError } from "../../utils/http-error";
import { prisma } from "../../libs/prisma";
import { auditAction } from "../common/audit";

const PlanSchema = z.object({ plan: z.enum(["monthly", "yearly"]).optional() });

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
  stripeCustomerId: string | null
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
  const raw = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
  if (!raw) {
    throw createHttpError(
      500,
      "APP_URL is not configured. Set APP_URL to your frontend origin."
    );
  }
  return String(raw).replace(/\/$/, "");
}

router.post(
  "/upgrade/power-user/checkout",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const appUrl = getAppUrl();

    const { plan = "monthly" } = PlanSchema.parse(req.body);

    const monthlyPriceId = process.env.STRIPE_POWER_USER_PRICE_MONTHLY;
    const yearlyPriceId = process.env.STRIPE_POWER_USER_PRICE_YEARLY;
    const priceId = plan === "yearly" ? yearlyPriceId : monthlyPriceId;

    if (!priceId) {
      throw createHttpError(
        500,
        "Missing Stripe Price ID for selected plan. Set STRIPE_POWER_USER_PRICE_MONTHLY and STRIPE_POWER_USER_PRICE_YEARLY."
      );
    }

    if (!String(priceId).startsWith("price_")) {
      throw createHttpError(
        500,
        "Stripe price IDs must start with price_. You currently have amounts instead of Stripe Price IDs."
      );
    }

    const stripe = getStripe();
    const userId = req.user!.sub;

    const user = await prisma.user.findUnique({
      where: { userId },
      select: { userId: true, email: true, stripeCustomerId: true },
    });
    if (!user) throw createHttpError(404, "User not found");

    const stripeCustomerId = await getOrCreateStripeCustomer(
      stripe,
      user.userId,
      user.email,
      user.stripeCustomerId
    );

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: String(priceId), quantity: 1 }],
      success_url: `${appUrl}/?stripe=success`,
      cancel_url: `${appUrl}/?stripe=cancel`,
      metadata: {
        userId: String(userId),
        role: req.user!.role,
        targetRole: "POWER_USER",
        plan,
      },
    });

    await auditAction(req, {
      action: "BILLING_CHECKOUT_STARTED",
      entity: "User",
      entityId: userId,
      metadata: { plan, sessionId: session.id },
    });

    if (!session.url)
      throw createHttpError(500, "Stripe did not return a checkout URL");
    return res.json({ url: session.url });
  })
);

router.post(
  "/cancel/power-user",
  authGuard,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.user!.sub;

    const user = await prisma.user.findUnique({
      where: { userId },
      select: { userId: true, role: true, stripeSubscriptionId: true },
    });
    if (!user) throw createHttpError(404, "User not found");

    if (user.role !== "POWER_USER") {
      throw createHttpError(400, "You are not a POWER_USER");
    }

    if (!user.stripeSubscriptionId) {
      throw createHttpError(
        400,
        "No Stripe subscription found. If you upgraded recently, try again after the webhook processes your payment."
      );
    }

    const stripe = getStripe();
    const updatedSub = await stripe.subscriptions.update(
      user.stripeSubscriptionId,
      { cancel_at_period_end: true }
    );

    await auditAction(req, {
      action: "BILLING_CANCEL_REQUESTED",
      entity: "User",
      entityId: userId,
      metadata: {
        subscriptionId: updatedSub.id,
        cancelAtPeriodEnd: updatedSub.cancel_at_period_end,
      },
    });

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
    const userId = req.user!.sub;
    const stripe = getStripe();

    const user = await prisma.user.findUnique({
      where: { userId },
      select: { stripeCustomerId: true, email: true, userId: true },
    });
    if (!user) throw createHttpError(404, "User not found");

    const customerId = await getOrCreateStripeCustomer(
      stripe,
      user.userId,
      user.email,
      user.stripeCustomerId
    );

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/?billing=return`,
    });

    await auditAction(req, {
      action: "BILLING_PORTAL_OPENED",
      entity: "User",
      entityId: userId,
      metadata: { customerId },
    });

    if (!session.url)
      throw createHttpError(500, "Stripe did not return a portal URL");
    return res.json({ url: session.url });
  })
);

export default router;
