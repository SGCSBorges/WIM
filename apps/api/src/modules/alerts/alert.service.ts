// import { reminderQueue, ReminderJobData } from "../../jobs/queues";
import { addMonths } from "../common/date";

export const AlertService = {
  // planifie 3 jobs pour une garantie donnée
  // TODO: Remplacer par Redis/BullMQ quand Redis est disponible
  scheduleForWarranty: async (
    garantieId: number,
    dateAchat: Date,
    durationMonths: number
  ) => {
    const fin = addMonths(dateAchat, durationMonths);
    const j30 = new Date(fin);
    j30.setDate(j30.getDate() - 30);
    const j7 = new Date(fin);
    j7.setDate(j7.getDate() - 7);
    const j1 = new Date(fin);
    j1.setDate(j1.getDate() - 1);

    // Pour le moment, on log simplement les alertes à programmer
    console.log(`[AlertService] Garantie ${garantieId} - Alertes programmées:`);
    console.log(`  - J-30: ${j30.toISOString()}`);
    console.log(`  - J-7: ${j7.toISOString()}`);
    console.log(`  - J-1: ${j1.toISOString()}`);

    // TODO: Implémenter avec Redis quand disponible
    // const jobs: ReminderJobData[] = [
    //   { garantieId, label: "J-30", when: j30.toISOString() },
    //   { garantieId, label: "J-7", when: j7.toISOString() },
    //   { garantieId, label: "J-1", when: j1.toISOString() },
    // ];
    // for (const job of jobs) {
    //   const delay = new Date(job.when).getTime() - Date.now();
    //   await reminderQueue.add("reminder", job, { delay: Math.max(0, delay) });
    // }
  },
};
