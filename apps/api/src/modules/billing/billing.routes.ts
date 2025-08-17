import { Router } from "express";
import Stripe from "stripe";
import { authGuard } from "../auth/auth.middleware";

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

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: String(priceId), quantity: 1 }],
      success_url: `${appUrl}/?stripe=success`,
      cancel_url: `${appUrl}/?stripe=cancel`,
      metadata: {
        userId: String((req as any).user?.sub ?? ""),
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

export default router;
