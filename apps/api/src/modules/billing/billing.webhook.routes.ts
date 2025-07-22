import { Router } from "express";
import Stripe from "stripe";
import { prisma } from "../../libs/prisma";

const router = Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY missing");
  return new Stripe(key);
}

/**
 * Stripe needs the *raw* body to verify signatures.
 * This route must be mounted BEFORE express.json() or with express.raw({type:'application/json'})
 * on the router itself.
 */
router.post(
  "/webhook",
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("express").raw({ type: "application/json" }),
  async (req, res) => {
    const signingSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!signingSecret) {
      return res.status(500).json({
        error:
          "STRIPE_WEBHOOK_SECRET missing. Configure it from Stripe dashboard or Stripe CLI (whsec_...) ",
      });
    }

    const stripe = getStripe();

    const sig = req.headers["stripe-signature"] as string | undefined;
    if (!sig) return res.status(400).send("Missing stripe-signature");

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, signingSecret);
    } catch (err: any) {
      return res
        .status(400)
        .send(`Webhook signature verification failed: ${err.message}`);
    }

    try {
      // Upgrade user after successful checkout
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const userIdRaw = (session.metadata as any)?.userId;
        const targetRole = (session.metadata as any)?.targetRole;

        const userId = userIdRaw ? Number(userIdRaw) : NaN;
        if (!Number.isFinite(userId)) {
          return res.status(200).json({ received: true });
        }

        if (targetRole === "POWER_USER") {
          await prisma.user.update({
            where: { userId },
            data: { role: "POWER_USER" },
          });
        }
      }

      return res.status(200).json({ received: true });
    } catch (e: any) {
      // Return 200 to prevent event retry storms in dev; log server-side.
      // In prod you might want 500 + idempotency.
      return res.status(200).json({ received: true, error: e?.message });
    }
  }
);

export default router;
