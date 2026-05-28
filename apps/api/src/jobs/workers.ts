import { Worker } from "bullmq";
import { createRedisConnection } from "./redis";
import { AlertJobPayload } from "../modules/alerts/alert.types";
// Using dynamic import avoids TS module-resolution edge cases in some workspace configs.
import { logger } from "../config/logger";
import { ALERT_QUEUE_NAME } from "./queues";

let workerSingleton: Worker<AlertJobPayload> | null = null;

/** Returns the singleton alert worker (null when JOBS_ENABLED=false). */
export function getAlertWorker(): Worker<AlertJobPayload> | null {
  return workerSingleton;
}

export function startWorkers() {
  if (workerSingleton) return;

  const worker = new Worker<AlertJobPayload>(
    ALERT_QUEUE_NAME,
    async (job) => {
      const mod =
        (await import("./processors/reminder.processor")) as typeof import("./processors/reminder.processor");
      await mod.ReminderProcessor.handle(job);
    },
    { connection: createRedisConnection() }
  );

  workerSingleton = worker;

  worker.on("ready", () => {
    logger.info(
      { queue: ALERT_QUEUE_NAME },
      "[alerts] worker ready (BullMQ connected)"
    );
  });

  worker.on("error", (err) => {
    // BullMQ/ioredis will emit this on connection problems; do NOT crash dev.
    logger.error({ err }, "[alerts] worker error");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "[alerts] job failed");
  });
}
