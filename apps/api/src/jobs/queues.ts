import { Queue } from "bullmq";
import { RedisOptions } from "ioredis";

const connection: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
};
// Create BullMQ connection configuration
function createRedisConnection(): RedisOptions {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    try {
      const url = new URL(redisUrl);
      return {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        host: url.hostname,
        port: parseInt(url.port) || 6379,
        username: url.username || undefined,
        password: url.password || undefined,
      };
    } catch (error) {
      console.error("[Redis] Invalid REDIS_URL format:", error);
    }
  }

  return connection;
}

export const reminderQueue = new Queue("wim-reminders", {
  connection: createRedisConnection(),
});

export type ReminderJobData = {
  garantieId: number;
  alerteId?: number;
  label: "J-30" | "J-7" | "J-1";
  when: string; // ISO
};
