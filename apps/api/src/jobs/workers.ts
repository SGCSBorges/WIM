import { Worker } from "bullmq";
import { reminderQueue, connection, ReminderJobData } from "./queues";
import { jobsEnabled } from "../config/jobs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export function startWorkers() {
  if (!jobsEnabled) {
    console.log("[Jobs] Disabled - no workers started");
    return;
  }

  if (!reminderQueue || !connection) {
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
    { connection }
  );

  worker.on("failed", (job, err) => {
    console.error("[Reminder] Failed", job?.id, err);
  });
}
