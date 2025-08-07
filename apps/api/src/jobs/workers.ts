import { Worker } from "bullmq";
import { createRedisConnection } from "./redis";
import { WarrantyReminderJobPayload } from "../modules/alerts/alert.types";
// Using dynamic import avoids TS module-resolution edge cases in some workspace configs.
import { logger } from "../config/logger";
import { ALERT_QUEUE_NAME } from "./queues";

let workerSingleton: Worker<WarrantyReminderJobPayload> | null = null;

export function startWorkers() {
  if (workerSingleton) return;

  const worker = new Worker<WarrantyReminderJobPayload>(
    ALERT_QUEUE_NAME,
    async (job) => {
      const mod = (await import(
        "./processors/reminder.processor"
      )) as typeof import("./processors/reminder.processor");
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
