/**
 * Stripe webhook handler — the canonical channel for role transitions
 * (USER → POWER_USER on checkout.session.completed, POWER_USER → USER on
 * cancel / unpaid / incomplete_expired / subscription deleted).
 *
 * Belt-and-braces guards layered here, in order:
 *   1. Signature verification via stripe.webhooks.constructEvent.
 *   2. Staleness window (STRIPE_WEBHOOK_MAX_AGE_SEC, default 5 min) —
 *      ack 200 + skip; a leaked-payload-with-valid-signature replay
 *      attack is otherwise unbounded.
 *   3. Event-type whitelist — unrecognised types log + ack so Stripe
 *      stops retrying.
 *   4. Idempotency marker (`ProcessedStripeEvent.eventId` unique) inside
 *      the same transaction as the business effect; a P2002 means
 *      "already processed" → ack as success.
 *   5. Zod-validated `metadata.targetRole` so a forged "ADMIN" can't
 *      promote.
 *
 * On downgrade the transaction also runs `ShareService.cleanupSharingForUser`
 * so a former POWER_USER's outgoing shares are deactivated atomically with
 * their role.
 */
import express, { Router } from "express";
import { z } from "zod";
import Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "../../libs/prisma";
import { logger } from "../../config/logger";
import { ShareService } from "../shares/share.service";
import { AuditService } from "../audit/audit.service";

// Whitelist of role transitions the webhook will honor. Keeps the
// metadata.targetRole field honest as we add roles or remove them; anything
// outside this set is logged and ignored.
const TargetRoleSchema = z.enum(["POWER_USER"]);

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

    // Belt-and-braces against payload replay. A leaked old payload+signature
    // remains cryptographically valid; bound how stale we'll accept. Ack with
    // 200 so Stripe doesn't retry an event we won't process. Configurable to
    // allow a wider window in laggy test environments.
    const maxAgeSec = Number(process.env.STRIPE_WEBHOOK_MAX_AGE_SEC ?? 5 * 60);
    const ageSec = Math.floor(Date.now() / 1000) - event.created;
    if (ageSec > maxAgeSec) {
      logger.warn(
        { eventId: event.id, type: event.type, ageSec, maxAgeSec },
        "[stripe-webhook] dropping stale event"
      );
      return res.status(200).json({ received: true, stale: true });
    }

    // Whitelist of event types we actually handle. Anything else gets logged
    // (so new Stripe events surface in ops) and acked.
    const HANDLED = new Set([
      "checkout.session.completed",
      "customer.subscription.deleted",
      "customer.subscription.updated",
    ]);
    if (!HANDLED.has(event.type)) {
      logger.info(
        { eventId: event.id, type: event.type },
        "[stripe-webhook] unhandled event type"
      );
      return res.status(200).json({ received: true, unhandled: true });
    }

    // Idempotency: the marker insert AND the business logic must commit
    // together. If business logic fails we want Stripe to redeliver, which
    // requires the marker to NOT have been saved. So we wrap both in one
    // transaction. A duplicate delivery races on the marker insert and the
    // P2002 unique-violation is treated as "already processed".
    //
    // AuditService.log uses the module-level prisma client and cannot join
    // this transaction, so we collect audit inputs here and fire them after
    // the transaction commits — the audit row only lands if the business
    // change actually persisted.
    const pendingAudit: Parameters<typeof AuditService.log>[0][] = [];

    try {
      await prisma.$transaction(async (tx) => {
        // Marker first inside the tx — concurrent deliveries of the same
        // event id will collide on the PK here and one will roll back.
        await tx.processedStripeEvent.create({
          data: { eventId: event.id, type: event.type },
        });

        if (event.type === "checkout.session.completed") {
          const session = event.data.object as Stripe.Checkout.Session;
          const userIdRaw = session.metadata?.userId;
          const targetRoleParsed = TargetRoleSchema.safeParse(
            session.metadata?.targetRole
          );
          if (!targetRoleParsed.success) {
            logger.info(
              {
                eventId: event.id,
                received: session.metadata?.targetRole,
              },
              "[stripe-webhook] unknown targetRole — skipping promotion"
            );
          }
          const targetRole = targetRoleParsed.success
            ? targetRoleParsed.data
            : undefined;
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription?.id;
          const userId = userIdRaw ? Number(userIdRaw) : NaN;

          if (Number.isFinite(userId) && targetRole === "POWER_USER") {
            const target = await tx.user.findUnique({
              where: { userId },
              select: { role: true },
            });
            if (target) {
              const willPromote = target.role === "USER";
              await tx.user.update({
                where: { userId },
                data: {
                  ...(target.role === "ADMIN" ? {} : { role: "POWER_USER" }),
                  ...(subscriptionId
                    ? { stripeSubscriptionId: subscriptionId }
                    : {}),
                },
              });
              if (willPromote) {
                pendingAudit.push({
                  userId,
                  action: "BILLING_UPGRADE",
                  entity: "User",
                  entityId: userId,
                  metadata: {
                    eventId: event.id,
                    eventType: event.type,
                    subscriptionId: subscriptionId ?? null,
                  },
                });
              }
            }
          }
        }

        if (
          event.type === "customer.subscription.deleted" ||
          event.type === "customer.subscription.updated"
        ) {
          const sub = event.data.object as Stripe.Subscription;
          const subscriptionId = sub.id;
          const status = sub.status;
          const endedAt = sub.ended_at as number | null | undefined;

          // Guard Boolean(endedAt) against active/trialing status: a
          // subscription.updated event can carry a non-null ended_at while
          // status='active' (e.g. after a successful payment retry), which
          // would otherwise trigger a spurious downgrade.
          const shouldDowngrade =
            status === "canceled" ||
            status === "unpaid" ||
            status === "incomplete_expired" ||
            (Boolean(endedAt) && status !== "active" && status !== "trialing");

          if (shouldDowngrade) {
            // Scope by userId: stripeSubscriptionId is now @unique in the
            // schema, but defence-in-depth — never run a row-spanning
            // updateMany for a role change. Find the one owner explicitly,
            // then update by primary key.
            const owner = await tx.user.findFirst({
              where: {
                stripeSubscriptionId: subscriptionId,
                role: "POWER_USER",
              },
              select: { userId: true, email: true },
            });
            if (owner) {
              await tx.user.update({
                where: { userId: owner.userId },
                data: { role: "USER" },
              });
              const counts = await ShareService.cleanupSharingForUser(
                owner.userId,
                tx
              );
              logger.info(
                { userId: owner.userId, ...counts, reason: "stripe-cancel" },
                "[stripe-webhook] downgrade cleanup"
              );
              pendingAudit.push({
                userId: owner.userId,
                action: "BILLING_DOWNGRADE",
                entity: "User",
                entityId: owner.userId,
                metadata: {
                  eventId: event.id,
                  eventType: event.type,
                  subscriptionId,
                  status,
                  email: owner.email,
                  shareCleanup: counts,
                },
              });
            }
          }
        }
      });

      for (const input of pendingAudit) {
        await AuditService.log(input);
      }

      return res.status(200).json({ received: true });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        // Duplicate delivery — either a Stripe redelivery or a concurrent
        // delivery that lost the marker race. Treat as success so Stripe
        // stops retrying.
        logger.info(
          { eventId: event.id, type: event.type },
          "[stripe-webhook] duplicate delivery — skipping"
        );
        return res.status(200).json({ received: true, duplicate: true });
      }
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        { err, eventType: event.type, eventId: event.id },
        "[stripe-webhook] handler error — Stripe will retry"
      );
      return res.status(500).json({ error: message });
    }
  }
);

export default router;
