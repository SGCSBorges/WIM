/**
 * Web Push delivery via VAPID. Best-effort: when VAPID_PUBLIC_KEY /
 * VAPID_PRIVATE_KEY aren't set, every call no-ops + logs (the toggle in
 * the Profile UI also hides itself). A 404/410 from the push service
 * means the browser unsubscribed — those subscriptions are pruned from
 * the DB so the next send doesn't re-attempt a dead endpoint.
 */
import webpush from "web-push";
import { prisma } from "../../libs/prisma";
import { logger } from "../../config/logger";

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? "";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
// mailto: subject is required by the spec; APP_URL contact is a sensible default.
const SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@wim.app";

const configured = Boolean(PUBLIC_KEY && PRIVATE_KEY);
if (configured) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
}

export type PushPayload = { title: string; body: string; url?: string };

export const PushService = {
  isConfigured: () => configured,
  publicKey: () => PUBLIC_KEY,

  subscribe: (
    userId: number,
    sub: { endpoint: string; p256dh: string; auth: string }
  ) =>
    // Re-subscribing the same endpoint (possibly under a new user) updates it.
    prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { userId, ...sub },
      update: { userId, p256dh: sub.p256dh, auth: sub.auth },
    }),

  unsubscribe: async (userId: number, endpoint: string) => {
    await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  },

  // Fan out a notification to all of a user's subscriptions. No-op when VAPID
  // keys aren't configured. Prunes subscriptions the push service reports as
  // permanently gone (404/410). Throws ONLY when the notification reached no
  // device yet at least one attempt failed transiently — the recoverable case
  // the reminder processor relies on to keep the alert SCHEDULED and let BullMQ
  // retry (push is the canonical channel). Stays silent on partial success
  // (≥1 device got it — a retry would duplicate) and on dead-endpoint-only
  // failures (those subs are pruned; there's nothing left to retry).
  sendToUser: async (userId: number, payload: PushPayload): Promise<void> => {
    if (!configured) return;
    const subs = await prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) return;
    const body = JSON.stringify(payload);

    let delivered = 0;
    let transientFailures = 0;

    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body
          );
          delivered++;
        } catch (err: unknown) {
          const status =
            err && typeof err === "object" && "statusCode" in err
              ? (err as { statusCode?: number }).statusCode
              : undefined;
          if (status === 404 || status === 410) {
            // Endpoint is permanently gone — prune it. Not a transient failure,
            // so on its own it doesn't justify a retry (the sub is now removed).
            await prisma.pushSubscription
              .delete({ where: { id: s.id } })
              .catch(() => undefined);
          } else {
            // Transient (network blip, push-service 5xx, …) — recoverable.
            transientFailures++;
            logger.warn({ err, endpoint: s.endpoint }, "[push] send failed");
          }
        }
      })
    );

    if (delivered === 0 && transientFailures > 0) {
      throw new Error(
        `Web push delivery failed for all ${transientFailures} active subscription(s)`
      );
    }
  },
};
