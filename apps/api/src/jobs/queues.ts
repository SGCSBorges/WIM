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

// Housekeeping queue: long-running periodic jobs (audit retention pruning
// today, more to come). Separate from the alert queue so latency-sensitive
// reminder delivery never queues behind a sweep.
export const MAINTENANCE_QUEUE_NAME = "wim-maintenance";

export type MaintenanceJobPayload =
  | { type: "audit_prune"; retentionDays: number }
  | { type: "article_trash_purge"; retentionDays: number }
  | { type: "warranty_digest_weekly" };

export const maintenanceQueue = new Queue<MaintenanceJobPayload>(
  MAINTENANCE_QUEUE_NAME,
  {
    connection: createRedisConnection(),
    defaultJobOptions: {
      // Three attempts with exponential backoff lets a transient DB blip
      // self-heal between scheduled runs instead of waiting a full day.
      attempts: 3,
      backoff: { type: "exponential" as const, delay: 30_000 },
      // Keep the last successful sweep for visibility, drop older ones; keep
      // failed ones a week so an operator can see why a run blew up.
      removeOnComplete: { count: 5 },
      removeOnFail: { age: 60 * 60 * 24 * 7 },
    },
  }
);

export type FailedJobSummary = {
  queue: string;
  id: string | undefined;
  name: string;
  failedReason: string | undefined;
  stacktrace: string[];
  attemptsMade: number;
  maxAttempts: number | undefined;
  data: unknown;
  finishedOn: number | undefined;
};

/**
 * Snapshot the last N failed jobs across both queues. Used by the admin
 * "Recent failures" view so an operator can see why something fell over
 * without shelling into Redis. Capped at 100 jobs per call so the JSON
 * stays bounded. Returns an empty list on Redis-unreachable so the admin
 * UI can render an "unavailable" banner the same way JobsTab already does
 * for the counts endpoint.
 */
export async function listFailedJobs(limit = 50): Promise<FailedJobSummary[]> {
  const cap = Math.min(Math.max(limit, 1), 100);
  const summarize = async (
    queue: typeof alertQueue | typeof maintenanceQueue,
    queueName: string
  ): Promise<FailedJobSummary[]> => {
    try {
      const jobs = await queue.getFailed(0, cap - 1);
      return jobs.map((j) => ({
        queue: queueName,
        id: j.id,
        name: j.name,
        failedReason: j.failedReason,
        // Trim stack traces to the most recent 20 frames so a single
        // crashloop can't blow up the response.
        stacktrace: (j.stacktrace ?? []).slice(0, 20),
        attemptsMade: j.attemptsMade,
        maxAttempts: j.opts?.attempts,
        data: j.data,
        finishedOn: j.finishedOn,
      }));
    } catch {
      return [];
    }
  };
  const [a, m] = await Promise.all([
    summarize(alertQueue, ALERT_QUEUE_NAME),
    summarize(maintenanceQueue, MAINTENANCE_QUEUE_NAME),
  ]);
  // Newest first so the UI doesn't have to sort.
  return [...a, ...m].sort((x, y) => (y.finishedOn ?? 0) - (x.finishedOn ?? 0));
}
