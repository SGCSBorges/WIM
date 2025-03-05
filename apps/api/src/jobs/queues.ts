import { Queue } from "bullmq";
import Redis from "ioredis";

export type ReminderJobData = {
  garantieId: number;
  alerteId?: number;
  label: "J-30" | "J-7" | "J-1";
  when: string; // ISO
};

const redisOpts = {
  maxRetriesPerRequest: null as any,
  enableReadyCheck: false,
};

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.warn(
    "[BullMQ] REDIS_URL manquant -> la connexion va échouer (pas de fallback localhost)."
  );
  // on force l'échec explicite plutôt que de fallback silencieux
  throw new Error("REDIS_URL non défini dans l'environnement");
}

// Petit log diagnostique (password masqué)
(() => {
  try {
    const u = new URL(redisUrl);
    const masked = `${u.protocol}//${u.username}:${"*".repeat(8)}@${u.host}`;
    console.info("[BullMQ] Using Redis:", masked);
  } catch {}
})();

export const connection = new Redis(redisUrl, redisOpts);

export const reminderQueue = new Queue<ReminderJobData>("wim-reminders", {
  connection,
});
