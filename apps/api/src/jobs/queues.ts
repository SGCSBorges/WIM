import { Queue } from "bullmq";
import { RedisOptions } from "ioredis";
import { jobsEnabled, redisUrl, sanitizeRedisUrl } from "../config/jobs";

let connection: RedisOptions | undefined;
let reminderQueue: Queue | undefined;

// Only initialize Redis connection if jobs are enabled
if (jobsEnabled && redisUrl) {
  console.log(`[BullMQ] Using Redis: ${sanitizeRedisUrl(redisUrl)}`);

  const url = new URL(redisUrl);
  connection = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    host: url.hostname,
    port: parseInt(url.port) || 6379,
    username: url.username || undefined,
    password: url.password || undefined,
  };

  reminderQueue = new Queue("wim-reminders", {
    connection,
  });
}

export { reminderQueue, connection };

export type ReminderJobData = {
  garantieId: number;
  alerteId?: number;
  label: "J-30" | "J-7" | "J-1";
  when: string; // ISO
};
