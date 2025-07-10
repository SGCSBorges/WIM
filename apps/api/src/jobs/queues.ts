import { Queue } from "bullmq";
import { redisConnection, isRedisAvailable } from "./redis";

let reminderQueue: Queue | undefined;

// Only initialize Redis connection if jobs are enabled and Redis is available
if (isRedisAvailable() && redisConnection) {
  reminderQueue = new Queue("wim-reminders", {
    connection: redisConnection,
  });
}

export { reminderQueue };

export type ReminderJobData = {
  garantieId: number;
  alerteId?: number;
  label: "J-30" | "J-7" | "J-1";
  when: string; // ISO
};
