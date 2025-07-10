import { Worker } from "bullmq";
import { reminderQueue, ReminderJobData } from "./queues";
import { redisConnection, isRedisAvailable } from "./redis";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export function startWorkers() {
  if (!isRedisAvailable()) {
    console.log("[Jobs] Disabled - no workers started");
    return;
  }

  if (!reminderQueue || !redisConnection) {
    console.warn("[Jobs] Queue or connection not initialized");
    return;
  }
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
    { connection: redisConnection }
  );

  worker.on("failed", (job, err) => {
    console.error("[Reminder] Failed", job?.id, err);
  });
}
