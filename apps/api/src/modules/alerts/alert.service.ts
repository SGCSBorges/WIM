import { reminderQueue, ReminderJobData } from "../../jobs/queues";
import { addMonths } from "../common/date";

const devFake = process.env.DEV_FAKE_REMINDERS === "true";

export const AlertService = {
  scheduleForWarranty: async (
    garantieId: number,
    dateAchat: Date,
    durationMonths: number
  ) => {
    const fin = addMonths(dateAchat, durationMonths);

    if (devFake) {
      const now = Date.now();
      const jobs: ReminderJobData[] = [
        {
          garantieId,
          label: "J-30",
          when: new Date(now + 10_000).toISOString(),
        },
        {
          garantieId,
          label: "J-7",
          when: new Date(now + 20_000).toISOString(),
        },
        {
          garantieId,
          label: "J-1",
          when: new Date(now + 30_000).toISOString(),
        },
      ];
      for (const job of jobs) {
        const delay = new Date(job.when).getTime() - Date.now();
        await reminderQueue.add("reminder", job, { delay: Math.max(0, delay) });
      }
      return;
    }

    // Comportement normal (J-30/J-7/J-1)
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

    for (const job of jobs) {
      const delay = new Date(job.when).getTime() - Date.now();
      await reminderQueue.add("reminder", job, { delay: Math.max(0, delay) });
    }
  },
};
