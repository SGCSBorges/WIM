import { reminderQueue, ReminderJobData } from "../../jobs/queues";
import { addMonths } from "../common/date";
import { isRedisAvailable } from "../../jobs/redis";

export const AlertService = {
  // planifie 3 jobs pour une garantie donnée
  scheduleForWarranty: async (
    garantieId: number,
    dateAchat: Date,
    durationMonths: number
  ) => {
    if (!isRedisAvailable() || !reminderQueue) {
      console.log(
        `[AlertService] Jobs disabled - skipping warranty alerts for garantie ${garantieId}`
      );
      return;
    }

    const fin = addMonths(dateAchat, durationMonths);
    const j30 = new Date(fin);
    j30.setDate(j30.getDate() - 30);
    const j7 = new Date(fin);
    j7.setDate(j7.getDate() - 7);
    const j1 = new Date(fin);
    j1.setDate(j1.getDate() - 1);

    const jobs: ReminderJobData[] = [
      { garantieId, label: "J-30", when: j30.toISOString() },
      { garantieId, label: "J-7", when: j7.toISOString() },
      { garantieId, label: "J-1", when: j1.toISOString() },
    ];

    // Planification BullMQ (delayed jobs à des dates futures)
    for (const job of jobs) {
      const delay = new Date(job.when).getTime() - Date.now();
      await reminderQueue.add("reminder", job, { delay: Math.max(0, delay) });
    }

    console.log(
      `[AlertService] Scheduled ${jobs.length} warranty alerts for garantie ${garantieId}`
    );
  },
};
