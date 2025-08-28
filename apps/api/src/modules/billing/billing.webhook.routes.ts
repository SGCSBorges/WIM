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

        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;

        const userId = userIdRaw ? Number(userIdRaw) : NaN;
        if (!Number.isFinite(userId)) {
          return res.status(200).json({ received: true });
        }

        if (targetRole === "POWER_USER") {
          await prisma.user.update({
            where: { userId },
            data: {
              role: "POWER_USER",
              stripeSubscriptionId: subscriptionId || undefined,
            },
          });
        }
      }

      // Downgrade when subscription is actually no longer active.
      // We don't downgrade on cancel_at_period_end=true, only when it ends.
      if (
        event.type === "customer.subscription.deleted" ||
        event.type === "customer.subscription.updated"
      ) {
        const sub = event.data.object as Stripe.Subscription;
        const subscriptionId = sub.id;
        const status = sub.status;
        const cancelAtPeriodEnd = sub.cancel_at_period_end;
        const endedAt = (sub as any).ended_at as number | null | undefined;

        // Map Stripe status to our role.
        const shouldDowngrade =
          status === "canceled" ||
          status === "unpaid" ||
          status === "incomplete_expired" ||
          Boolean(endedAt);

        // If subscription is deleted, Stripe will send customer.subscription.deleted.
        // If it's updated to canceled at period end, we wait until it becomes canceled.
        if (shouldDowngrade) {
          await prisma.user.updateMany({
            where: { stripeSubscriptionId: subscriptionId },
            data: { role: "USER" },
          });
        } else if (cancelAtPeriodEnd) {
          // Ensure we at least store the subscription id if we didn't yet.
          // (e.g., if Checkout metadata failed but Stripe sent a sub update.)
          // We still need a way to map to user; without metadata/customer mapping,
          // we can only store when we already have the subscriptionId.
          // No-op beyond having the field, kept for clarity.
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
