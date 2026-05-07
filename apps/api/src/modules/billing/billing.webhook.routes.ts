import express, { Router } from "express";
import Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "../../libs/prisma";
import { logger } from "../../config/logger";

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
  express.raw({ type: "application/json" }),
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
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return res
        .status(400)
        .send(`Webhook signature verification failed: ${errMsg}`);
    }

    // Idempotency: record the event id first; if it's already there, this is
    // a redelivery and we short-circuit. We do this BEFORE any business logic
    // so a redelivered checkout.session.completed never re-upgrades the user.
    try {
      await prisma.processedStripeEvent.create({
        data: { eventId: event.id, type: event.type },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        logger.info(
          { eventId: event.id, type: event.type },
          "[stripe-webhook] duplicate delivery — skipping"
        );
        return res.status(200).json({ received: true, duplicate: true });
      }
      throw err;
    }

    try {
      // Upgrade user after successful checkout
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const userIdRaw = session.metadata?.userId;
        const targetRole = session.metadata?.targetRole;

        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;

        const userId = userIdRaw ? Number(userIdRaw) : NaN;
        if (!Number.isFinite(userId)) {
          return res.status(200).json({ received: true });
        }

        if (targetRole === "POWER_USER") {
          // Idempotency is already enforced via ProcessedStripeEvent above —
          // any redelivered event short-circuits before reaching here, so
          // we don't need extra guards on the update itself. Don't demote
          // ADMIN; just record the subscription id for the cancel/portal
          // flows.
          const target = await prisma.user.findUnique({
            where: { userId },
            select: { role: true },
          });
          if (!target) {
            return res.status(200).json({ received: true });
          }
          await prisma.user.update({
            where: { userId },
            data: {
              ...(target.role === "ADMIN" ? {} : { role: "POWER_USER" }),
              ...(subscriptionId
                ? { stripeSubscriptionId: subscriptionId }
                : {}),
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
        const endedAt = sub.ended_at as number | null | undefined;

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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error(
        { err: e, eventType: event.type },
        "[stripe-webhook] handler error"
      );
      return res.status(500).json({ error: message });
    }
  }
);

export default router;
