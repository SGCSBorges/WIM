import { Queue } from "bullmq";

import { createRedisConnection } from "./redis";
import { AlertJobPayload } from "../modules/alerts/alert.types";

// BullMQ queue names cannot contain ':'; we keep the logical name "wim:alerts"
// as a namespace in logs/metrics, but use a BullMQ-valid queue name.
export const ALERT_QUEUE_NAME = "wim-alerts";

// Reminder delivery is best-effort: a transient push/email failure (network
// blip, Resend rate limit) should retry briefly, not silently drop the
// notification. Three attempts with exponential backoff (2s, 4s, 8s) gives
// recovery headroom without flooding the queue if a dependency is fully
// down — the worker's `markFailed` runs after the last attempt.
// removeOnComplete keeps a short window of completed jobs for observability
// without letting Redis grow unbounded.
export const ALERT_QUEUE_DEFAULTS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 2000 },
  removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
  removeOnFail: { age: 60 * 60 * 24 * 7 },
};

export const alertQueue = new Queue<AlertJobPayload>(ALERT_QUEUE_NAME, {
  connection: createRedisConnection(),
  defaultJobOptions: ALERT_QUEUE_DEFAULTS,
});
