import { AlerteStatus } from "@prisma/client";
import { prisma } from "../../libs/prisma";
import { alertQueue } from "../../jobs/queues";
import { logger } from "../../config/logger";
import { computeWarrantyReminderSchedule } from "./alert.scheduler";

import {
  reminderKindLabel,
  WarrantyReminderJobPayload,
  WarrantyReminderKind,
} from "./alert.types";

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
        logger.warn({ garantieId: input.garantieId, executeAt }, "[alerts] alert record not found after createMany — skipping job");
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
        const jobId = buildJobId(a.alerteGarantieId, reminderKind, a.alerteDate);
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
