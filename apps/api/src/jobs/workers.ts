import { Worker } from "bullmq";
import { connection, ReminderJobData } from "./queues";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export function startWorkers() {
  const worker = new Worker<ReminderJobData>(
    "wim-reminders",
    async (job) => {
      const { garantieId, label, when } = job.data;
      const g = await prisma.garantie.findUnique({ where: { garantieId } });
      console.log(
        `[Reminder] ${label} garantie=${garantieId} at ${when} (fin=${g?.garantieFin.toISOString()})`
      );
    },
    { connection }
  );

  worker.on("failed", (job, err) => {
    console.error("[Reminder] Failed", job?.id, err);
  });
}
