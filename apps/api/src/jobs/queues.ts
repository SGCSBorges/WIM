import { Queue } from "bullmq";

import { createRedisConnection } from "./redis";
import { WarrantyReminderJobPayload } from "../modules/alerts/alert.types";

// BullMQ queue names cannot contain ':'; we keep the logical name "wim:alerts"
// as a namespace in logs/metrics, but use a BullMQ-valid queue name.
export const ALERT_QUEUE_NAME = "wim-alerts";

export const alertQueue = new Queue<WarrantyReminderJobPayload>(
  ALERT_QUEUE_NAME,
  {
    connection: createRedisConnection(),
  }
);
