import { AlerteStatus, AlerteKind, Alerte } from "@prisma/client";
import { prisma } from "../../libs/prisma";
import { alertQueue } from "../../jobs/queues";
import { logger } from "../../config/logger";
import { addMonths } from "../common/date";
import { createHttpError } from "../../utils/http-error";
import { computeWarrantyReminderSchedule } from "./alert.scheduler";

import {
  reminderKindLabel,
  WarrantyReminderJobPayload,
  WarrantyReminderKind,
  CustomAlertJobPayload,
} from "./alert.types";

// Generic per-alert job id used by CUSTOM alerts and any snoozed alert.
const customJobId = (alerteId: number) => `alert:${alerteId}`;

function formatYYYYMMDD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function buildJobId(
  garantieId: number,
  reminderKind: WarrantyReminderKind,
  executeAt: Date
) {
  return `warranty:${garantieId}:${reminderKind}:${formatYYYYMMDD(executeAt)}`;
}

export const AlertService = {
  list: (ownerUserId: number, status?: AlerteStatus, page = 1, limit = 50) => {
    return prisma.alerte.findMany({
      where: {
        ownerUserId,
        ...(status ? { status } : {}),
      },
      take: limit,
      skip: (page - 1) * limit,
      orderBy: { alerteDate: "asc" },
      include: {
        garantie: {
          select: {
            garantieId: true,
            garantieNom: true,
          },
        },
        article: {
          select: {
            articleId: true,
            articleNom: true,
            articleModele: true,
          },
        },
      },
    });
  },

  scheduleForWarranty: async (input: {
    ownerUserId: number;
    garantieId: number;
    articleId?: number | null;
    garantieFin: Date;
  }) => {
    const now = new Date();
    const schedule = computeWarrantyReminderSchedule({
      garantieFin: input.garantieFin,
      now,
      includePast: false,
    });

    for (const { reminderKind, executeAt } of schedule) {
      const executeMs = executeAt.getTime();

      // NOTE: we can't rely on regenerated Prisma Client in Windows right now (prisma generate EPERM).
      // So we use createMany (skipDuplicates) + findFirst to get an alerteId deterministically.
      await prisma.alerte.createMany({
        data: [
          {
            ownerUserId: input.ownerUserId,
            alerteNom: reminderKindLabel(reminderKind),
            alerteDate: executeAt,
            alerteGarantieId: input.garantieId,
            alerteArticleId: input.articleId ?? null,
            status: AlerteStatus.SCHEDULED,
          },
        ],
        skipDuplicates: true,
      });

      const alerte = await prisma.alerte.findFirst({
        where: {
          ownerUserId: input.ownerUserId,
          alerteGarantieId: input.garantieId,
          alerteDate: executeAt,
        },
        orderBy: { alerteId: "desc" },
      });

      if (!alerte) {
        logger.warn(
          { garantieId: input.garantieId, executeAt },
          "[alerts] alert record not found after createMany — skipping job"
        );
        continue;
      }

      const delay = Math.max(0, executeMs - now.getTime());
      const jobId = buildJobId(input.garantieId, reminderKind, executeAt);

      const payload: WarrantyReminderJobPayload = {
        type: "warranty_reminder",
        ownerUserId: input.ownerUserId,
        garantieId: input.garantieId,
        articleId: input.articleId ?? null,
        reminderKind,
        executeAt: executeAt.toISOString(),
        alerteId: alerte.alerteId,
      };

      logger.info(
        {
          jobId,
          delay,
          executeAt: payload.executeAt,
          ownerUserId: payload.ownerUserId,
          garantieId: payload.garantieId,
          reminderKind: payload.reminderKind,
        },
        "[alerts] schedule"
      );

      await alertQueue.add("reminder", payload, {
        jobId,
        delay,
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
      });
    }
  },

  cancelForWarranty: async (input: {
    ownerUserId: number;
    garantieId: number;
  }) => {
    // cancel DB alerts
    const alerts = await prisma.alerte.findMany({
      where: {
        ownerUserId: input.ownerUserId,
        alerteGarantieId: input.garantieId,
        status: AlerteStatus.SCHEDULED,
      },
    });

    for (const a of alerts) {
      // attempt to remove corresponding jobs; we don't know exact kind, so compute 3 candidates
      for (const reminderKind of ["J30", "J7", "J1"] as const) {
        const jobId = buildJobId(input.garantieId, reminderKind, a.alerteDate);
        const job = await alertQueue.getJob(jobId);
        if (job) {
          await job.remove();
          logger.info({ jobId }, "[alerts] cancelled job");
        }
      }
    }

    // Only cancel SCHEDULED alerts — leave SENT/FAILED records intact for audit purposes.
    await prisma.alerte.updateMany({
      where: {
        ownerUserId: input.ownerUserId,
        alerteGarantieId: input.garantieId,
        status: AlerteStatus.SCHEDULED,
      },
      data: { status: AlerteStatus.CANCELLED },
    });
  },

  cancelForUser: async (ownerUserId: number) => {
    const alerts = await prisma.alerte.findMany({
      where: { ownerUserId, status: AlerteStatus.SCHEDULED },
      select: { alerteGarantieId: true, alerteDate: true },
    });

    for (const a of alerts) {
      if (!a.alerteGarantieId) continue;
      for (const reminderKind of ["J30", "J7", "J1"] as const) {
        const jobId = buildJobId(
          a.alerteGarantieId,
          reminderKind,
          a.alerteDate
        );
        const job = await alertQueue.getJob(jobId);
        if (job) {
          await job.remove();
          logger.info({ jobId }, "[alerts] cancelled job for account deletion");
        }
      }
    }
  },

  rescheduleForWarranty: async (input: {
    ownerUserId: number;
    garantieId: number;
    articleId?: number | null;
    garantieFin: Date;
  }) => {
    await AlertService.cancelForWarranty({
      ownerUserId: input.ownerUserId,
      garantieId: input.garantieId,
    });
    await AlertService.scheduleForWarranty(input);
  },

  // Remove any BullMQ job(s) backing an alert. Warranty alerts are keyed by
  // (garantieId, kind, date) so we try all three reminder kinds; custom and
  // snoozed alerts use the generic per-alert id.
  removeJobsForAlert: async (alert: {
    alerteId: number;
    alerteGarantieId: number | null;
    alerteDate: Date;
    kind: AlerteKind;
  }) => {
    if (alert.kind === AlerteKind.WARRANTY && alert.alerteGarantieId) {
      for (const reminderKind of ["J30", "J7", "J1"] as const) {
        const jobId = buildJobId(
          alert.alerteGarantieId,
          reminderKind,
          alert.alerteDate
        );
        const job = await alertQueue.getJob(jobId);
        if (job) await job.remove();
      }
    }
    const generic = await alertQueue.getJob(customJobId(alert.alerteId));
    if (generic) await generic.remove();
  },

  enqueueCustom: async (ownerUserId: number, alerteId: number, when: Date) => {
    const payload: CustomAlertJobPayload = {
      type: "custom_alert",
      ownerUserId,
      alerteId,
      executeAt: when.toISOString(),
    };
    await alertQueue.add("reminder", payload, {
      jobId: customJobId(alerteId),
      delay: Math.max(0, when.getTime() - Date.now()),
      removeOnComplete: true,
      removeOnFail: false,
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
    });
  },

  createCustom: async (input: {
    ownerUserId: number;
    alerteNom: string;
    alerteDate: Date;
    alerteDescription?: string | null;
    recurrenceMonths?: number | null;
    alerteArticleId?: number | null;
    alerteGarantieId?: number | null;
  }) => {
    const created = await prisma.alerte.create({
      data: {
        ownerUserId: input.ownerUserId,
        alerteNom: input.alerteNom,
        alerteDate: input.alerteDate,
        alerteDescription: input.alerteDescription ?? null,
        kind: AlerteKind.CUSTOM,
        recurrenceMonths: input.recurrenceMonths ?? null,
        alerteArticleId: input.alerteArticleId ?? null,
        alerteGarantieId: input.alerteGarantieId ?? null,
        status: AlerteStatus.SCHEDULED,
      },
    });
    await AlertService.enqueueCustom(
      created.ownerUserId,
      created.alerteId,
      created.alerteDate
    );
    return created;
  },

  // Spawn the next occurrence of a recurring CUSTOM alert after it fires.
  createRecurrenceFollowUp: async (alert: Alerte) => {
    if (!alert.recurrenceMonths) return;
    const nextDate = addMonths(
      new Date(alert.alerteDate),
      alert.recurrenceMonths
    );
    const next = await prisma.alerte.create({
      data: {
        ownerUserId: alert.ownerUserId,
        alerteNom: alert.alerteNom,
        alerteDate: nextDate,
        alerteDescription: alert.alerteDescription,
        kind: AlerteKind.CUSTOM,
        recurrenceMonths: alert.recurrenceMonths,
        alerteArticleId: alert.alerteArticleId,
        alerteGarantieId: alert.alerteGarantieId,
        status: AlerteStatus.SCHEDULED,
      },
    });
    await AlertService.enqueueCustom(
      next.ownerUserId,
      next.alerteId,
      next.alerteDate
    );
    return next;
  },

  snooze: async (alerteId: number, ownerUserId: number, days: number) => {
    const alert = await prisma.alerte.findFirst({
      where: { alerteId, ownerUserId, status: AlerteStatus.SCHEDULED },
    });
    if (!alert) throw createHttpError(404, "Scheduled alert not found");

    await AlertService.removeJobsForAlert(alert);
    const newDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const updated = await prisma.alerte.update({
      where: { alerteId },
      data: { alerteDate: newDate, snoozedUntil: newDate },
    });
    await AlertService.enqueueCustom(ownerUserId, alerteId, newDate);
    return updated;
  },

  cancel: async (alerteId: number, ownerUserId: number) => {
    const alert = await prisma.alerte.findFirst({
      where: { alerteId, ownerUserId, status: AlerteStatus.SCHEDULED },
    });
    if (!alert) throw createHttpError(404, "Scheduled alert not found");
    await AlertService.removeJobsForAlert(alert);
    return prisma.alerte.update({
      where: { alerteId },
      data: { status: AlerteStatus.CANCELLED },
    });
  },

  markSent: (alerteId: number) =>
    prisma.alerte.update({
      where: { alerteId },
      data: { status: AlerteStatus.SENT, sentAt: new Date() },
    }),

  markFailed: (alerteId: number, err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    return prisma.alerte.update({
      where: { alerteId },
      data: {
        status: AlerteStatus.FAILED,
        failedAt: new Date(),
        errorMessage: message.slice(0, 500),
        errorStack: stack ? stack.slice(0, 2000) : null,
      },
    });
  },
};
