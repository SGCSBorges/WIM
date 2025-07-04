import { Queue } from "bullmq";
import { RedisOptions } from "ioredis";

const connection: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
};
const redisUrl = process.env.REDIS_URL;
export const reminderQueue = new Queue("wim-reminders", { connection });

export type ReminderJobData = {
  garantieId: number;
  alerteId?: number;
  label: "J-30" | "J-7" | "J-1";
  when: string; // ISO
};
