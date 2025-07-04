import { Worker } from "bullmq";
import { reminderQueue, ReminderJobData } from "./queues";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const redisUrl = process.env.REDIS_URL;

export function startWorkers() {
  const worker = new Worker<ReminderJobData>("wim-reminders", async (job) => {
    const { garantieId, label, when } = job.data;
    // Récup info garantie/article pour log (placeholder)
    const g = await prisma.garantie.findUnique({ where: { garantieId } });
    console.log(
      `[Reminder] ${label} garanti=${garantieId} at ${when} (fin=${g?.garantieFin.toISOString()})`
    );
    // TODO: envoi push via Web Push (phase ultérieure)
  });

  worker.on("failed", (job, err) => {
    console.error("[Reminder] Failed", job?.id, err);
  });
}
