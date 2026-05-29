import { Worker } from "bullmq";
import { createRedisConnection } from "./redis";
import { AlertJobPayload } from "../modules/alerts/alert.types";
// Using dynamic import avoids TS module-resolution edge cases in some workspace configs.
import { logger } from "../config/logger";
import {
  ALERT_QUEUE_NAME,
  MAINTENANCE_QUEUE_NAME,
  MaintenanceJobPayload,
  maintenanceQueue,
} from "./queues";

let workerSingleton: Worker<AlertJobPayload> | null = null;
let maintenanceWorkerSingleton: Worker<MaintenanceJobPayload> | null = null;

/** Returns the singleton alert worker (null when JOBS_ENABLED=false). */
export function getAlertWorker(): Worker<AlertJobPayload> | null {
  return workerSingleton;
}

/** Returns the singleton maintenance worker, or null. */
export function getMaintenanceWorker(): Worker<MaintenanceJobPayload> | null {
  return maintenanceWorkerSingleton;
}

// Daily audit-log prune is the only maintenance job today. Read the retention
// window from env: 0 (or invalid/missing) disables the schedule entirely so
// an operator can opt out without code changes.
const AUDIT_PRUNE_REPEAT_KEY = "audit-prune-daily";
const TRASH_PURGE_REPEAT_KEY = "article-trash-purge-daily";
const WARRANTY_DIGEST_REPEAT_KEY = "warranty-digest-weekly";

function warrantyDigestEnabled(): boolean {
  return (
    String(process.env.WARRANTY_DIGEST_ENABLED ?? "true").toLowerCase() !==
    "false"
  );
}

function auditRetentionDays(): number {
  const raw = process.env.AUDIT_RETENTION_DAYS;
  if (raw === undefined) return 90;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 90;
  return n;
}

function articleTrashRetentionDays(): number {
  const raw = process.env.ARTICLE_TRASH_RETENTION_DAYS;
  if (raw === undefined) return 30;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 30;
  return n;
}

async function scheduleMaintenance() {
  const auditDays = auditRetentionDays();
  const trashDays = articleTrashRetentionDays();
  try {
    const existing = await maintenanceQueue.getRepeatableJobs();
    for (const r of existing) {
      if (
        r.id === AUDIT_PRUNE_REPEAT_KEY ||
        r.id === TRASH_PURGE_REPEAT_KEY ||
        r.id === WARRANTY_DIGEST_REPEAT_KEY
      ) {
        await maintenanceQueue.removeRepeatableByKey(r.key);
      }
    }
    if (auditDays === 0) {
      logger.info(
        "[maintenance] AUDIT_RETENTION_DAYS=0 → audit prune disabled"
      );
    } else {
      await maintenanceQueue.add(
        "audit_prune",
        { type: "audit_prune", retentionDays: auditDays },
        {
          jobId: AUDIT_PRUNE_REPEAT_KEY,
          repeat: { pattern: "0 3 * * *", tz: "UTC" },
        }
      );
      logger.info(
        { retentionDays: auditDays, cron: "0 3 * * *" },
        "[maintenance] audit prune scheduled"
      );
    }
    if (trashDays === 0) {
      logger.info(
        "[maintenance] ARTICLE_TRASH_RETENTION_DAYS=0 → trash purge disabled"
      );
    } else {
      await maintenanceQueue.add(
        "article_trash_purge",
        { type: "article_trash_purge", retentionDays: trashDays },
        {
          jobId: TRASH_PURGE_REPEAT_KEY,
          repeat: { pattern: "30 3 * * *", tz: "UTC" },
        }
      );
      logger.info(
        { retentionDays: trashDays, cron: "30 3 * * *" },
        "[maintenance] article trash purge scheduled"
      );
    }
    if (!warrantyDigestEnabled()) {
      logger.info(
        "[maintenance] WARRANTY_DIGEST_ENABLED=false → weekly digest disabled"
      );
    } else {
      await maintenanceQueue.add(
        "warranty_digest_weekly",
        { type: "warranty_digest_weekly" },
        {
          jobId: WARRANTY_DIGEST_REPEAT_KEY,
          // Mondays 09:00 UTC — early-week reminder cadence that aligns with
          // most users' planning window.
          repeat: { pattern: "0 9 * * 1", tz: "UTC" },
        }
      );
      logger.info(
        { cron: "0 9 * * 1" },
        "[maintenance] warranty digest weekly scheduled"
      );
    }
  } catch (err) {
    // Redis unavailable in dev — log and move on; reminders + API still work.
    logger.warn({ err }, "[maintenance] could not schedule maintenance jobs");
  }
}

export function startWorkers() {
  if (workerSingleton) return;

  const worker = new Worker<AlertJobPayload>(
    ALERT_QUEUE_NAME,
    async (job) => {
      const mod =
        (await import("./processors/reminder.processor")) as typeof import("./processors/reminder.processor");
      await mod.ReminderProcessor.handle(job);
    },
    { connection: createRedisConnection() }
  );

  workerSingleton = worker;

  worker.on("ready", () => {
    logger.info(
      { queue: ALERT_QUEUE_NAME },
      "[alerts] worker ready (BullMQ connected)"
    );
  });

  worker.on("error", (err) => {
    // BullMQ/ioredis will emit this on connection problems; do NOT crash dev.
    logger.error({ err }, "[alerts] worker error");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "[alerts] job failed");
  });

  // Maintenance worker + schedule. Dynamic import keeps the worker's
  // processor (which pulls in Prisma) out of the API hot path.
  const maintenance = new Worker<MaintenanceJobPayload>(
    MAINTENANCE_QUEUE_NAME,
    async (job) => {
      const mod =
        (await import("./processors/maintenance.processor")) as typeof import("./processors/maintenance.processor");
      await mod.MaintenanceProcessor.handle(job);
    },
    { connection: createRedisConnection() }
  );
  maintenanceWorkerSingleton = maintenance;
  maintenance.on("ready", () =>
    logger.info({ queue: MAINTENANCE_QUEUE_NAME }, "[maintenance] worker ready")
  );
  maintenance.on("error", (err) =>
    logger.error({ err }, "[maintenance] worker error")
  );
  maintenance.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, err }, "[maintenance] job failed")
  );

  void scheduleMaintenance();
}
