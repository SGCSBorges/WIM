import { Worker } from "bullmq";
import { createRedisConnection } from "./redis";
import { WarrantyReminderJobPayload } from "../modules/alerts/alert.types";
// Using dynamic import avoids TS module-resolution edge cases in some workspace configs.
import { logger } from "../config/logger";
import { ALERT_QUEUE_NAME } from "./queues";

export function startWorkers() {
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

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "[alerts] job failed");
  });
}
