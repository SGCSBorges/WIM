import { Worker } from "bullmq";
import { reminderQueue, ReminderJobData } from "./queues";
import { PrismaClient } from "@prisma/client";
import { RedisOptions } from "ioredis";

const prisma = new PrismaClient();

// Create Redis connection configuration for worker
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

  return {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    host: process.env.REDIS_HOST || "localhost",
    port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
  };
}

export function startWorkers() {
  const worker = new Worker<ReminderJobData>(
    "wim-reminders",
    async (job) => {
      const { garantieId, label, when } = job.data;
      // Récup info garantie/article pour log (placeholder)
      const g = await prisma.garantie.findUnique({ where: { garantieId } });
      console.log(
        `[Reminder] ${label} garanti=${garantieId} at ${when} (fin=${g?.garantieFin.toISOString()})`
      );
      // TODO: envoi push via Web Push (phase ultérieure)
    },
    {
      connection: createRedisConnection(),
    }
  );

  worker.on("failed", (job, err) => {
    console.error("[Reminder] Failed", job?.id, err);
  });
}
