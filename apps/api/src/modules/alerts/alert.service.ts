/**
 * Alert service — schedules warranty reminders + custom user alerts on the
 * BullMQ `wim-alerts` queue and tracks their lifecycle in the `Alerte`
 * table.
 *
 * Warranty reminders fire at J-30 / J-7 / J-1 before `garantieFin`. Custom
 * alerts can recur monthly (`recurrenceMonths`). Job IDs are deterministic
 * (`warranty:<garantieId>:<kind>` / `custom:<alerteId>`) so re-scheduling
 * the same reminder no-ops at the queue layer instead of duplicating.
 *
 * The `markFailed` path records the error message + stack so the Admin
 * Jobs tab's "Recent failures" view can surface what went wrong.
 *
 * Note on naming: the Prisma model is `Alerte` (legacy French spelling
 * carried from an early schema). The shared type union and string values
 * are `AlertStatus` / `AlertKind` in @wim/types; the literal values match.
 */
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
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
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
  list: (
    ownerUserId: number,
    status?: AlerteStatus,
    page = 1,
    limit = 50,
    kind?: AlerteKind,
    articleId?: number
  ) => {
    return prisma.alerte.findMany({
      where: {
        ownerUserId,
        ...(status ? { status } : {}),
        ...(kind ? { kind } : {}),
        ...(articleId ? { alerteArticleId: articleId } : {}),
        // Hide alerts whose article sits in the trash — same live-article
        // scope the calendar feed applies, so the surfaces agree.
        OR: [{ article: null }, { article: { deletedAt: null } }],
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

      // createMany(skipDuplicates) + findFirst, rather than create, so a
      // re-schedule that lands on an existing (garantieId, alerteDate) row
      // no-ops at the unique constraint instead of throwing — then we read
      // the row back to get its alerteId deterministically.
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

      // The (garantieId, alerteDate) unique means createMany silently skips
      // when a row already exists for the same date — e.g. trash → restore,
      // or a renew that lands on identical dates. That existing row may be
      // CANCELLED; re-arm it atomically so the restored warranty's reminders
      // are live again instead of resurrecting a dead row into the queue.
      await prisma.alerte.updateMany({
        where: {
          ownerUserId: input.ownerUserId,
          alerteGarantieId: input.garantieId,
          alerteDate: executeAt,
          status: AlerteStatus.CANCELLED,
        },
        data: { status: AlerteStatus.SCHEDULED },
      });

      const alerte = await prisma.alerte.findFirst({
        where: {
          ownerUserId: input.ownerUserId,
          alerteGarantieId: input.garantieId,
          alerteDate: executeAt,
          status: AlerteStatus.SCHEDULED,
        },
        orderBy: { alerteId: "desc" },
      });

      if (!alerte) {
        // SENT/FAILED row already occupies this (garantie, date) slot — the
        // reminder was already delivered for this exact date; nothing to do.
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
        attempts: 3,
        // Long backoff because retries here cover server-side rate limits
        // (push provider / email) rather than tight network blips.
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
      // Also drop the generic per-alert job in case this reminder was snoozed
      // (snoozing re-keys it from the warranty id to `alert:<id>`).
      const generic = await alertQueue.getJob(customJobId(a.alerteId));
      if (generic) await generic.remove();
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
      select: { alerteId: true, alerteGarantieId: true, alerteDate: true },
    });

    for (const a of alerts) {
      if (a.alerteGarantieId) {
        for (const reminderKind of ["J30", "J7", "J1"] as const) {
          const jobId = buildJobId(
            a.alerteGarantieId,
            reminderKind,
            a.alerteDate
          );
          const job = await alertQueue.getJob(jobId);
          if (job) {
            await job.remove();
            logger.info(
              { jobId },
              "[alerts] cancelled job for account deletion"
            );
          }
        }
      }
      // Custom alerts — and snoozed warranty alerts, which get re-keyed to
      // the generic id — live under `alert:<id>`; without this they sit in
      // Redis as stale delayed jobs until their fire time.
      const generic = await alertQueue.getJob(customJobId(a.alerteId));
      if (generic) await generic.remove();
    }
    // Flip all remaining SCHEDULED rows to CANCELLED so a job that fires
    // after Redis removal (or after a Redis flush + replay) finds no live row.
    await prisma.alerte.updateMany({
      where: { ownerUserId, status: AlerteStatus.SCHEDULED },
      data: { status: AlerteStatus.CANCELLED },
    });
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

  // Trash flow: CUSTOM alerts hang off the article directly (not the
  // warranty), so cancelForWarranty misses them — without this, a trashed
  // article's custom reminders keep firing and deep-link to a 404.
  cancelCustomForArticle: async (ownerUserId: number, articleId: number) => {
    const alerts = await prisma.alerte.findMany({
      where: {
        ownerUserId,
        alerteArticleId: articleId,
        kind: AlerteKind.CUSTOM,
        status: AlerteStatus.SCHEDULED,
      },
      select: { alerteId: true },
    });
    for (const a of alerts) {
      const job = await alertQueue.getJob(customJobId(a.alerteId));
      if (job) await job.remove();
    }
    await prisma.alerte.updateMany({
      where: {
        ownerUserId,
        alerteArticleId: articleId,
        kind: AlerteKind.CUSTOM,
        status: AlerteStatus.SCHEDULED,
      },
      data: { status: AlerteStatus.CANCELLED },
    });
  },

  // Restore flow: re-arm the custom alerts the trash cancelled, but only
  // future-dated ones — a past date would fire immediately on restore.
  // (An alert the user cancelled manually before trashing is also revived;
  // accepted trade-off vs. silently losing alerts through a trash round-trip.)
  rearmCustomForArticle: async (ownerUserId: number, articleId: number) => {
    const candidates = await prisma.alerte.findMany({
      where: {
        ownerUserId,
        alerteArticleId: articleId,
        kind: AlerteKind.CUSTOM,
        status: AlerteStatus.CANCELLED,
        alerteDate: { gt: new Date() },
      },
      select: { alerteId: true, alerteDate: true },
    });
    for (const a of candidates) {
      const { count } = await prisma.alerte.updateMany({
        where: { alerteId: a.alerteId, status: AlerteStatus.CANCELLED },
        data: { status: AlerteStatus.SCHEDULED },
      });
      if (count > 0) {
        await AlertService.enqueueCustom(ownerUserId, a.alerteId, a.alerteDate);
      }
    }
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
    // Pre-read ONLY to reconstruct the old queue jobIds (warranty jobs are
    // keyed by the pre-snooze alerteDate). The guard itself is the atomic
    // updateMany below — the worker may flip this row to SENT between this
    // read and the write, and a snooze applied on top of SENT would
    // silently never fire (the processor skips non-SCHEDULED rows).
    const prior = await prisma.alerte.findFirst({
      where: { alerteId, ownerUserId },
      select: {
        alerteId: true,
        alerteGarantieId: true,
        alerteDate: true,
        kind: true,
      },
    });
    if (!prior) throw createHttpError(404, "Scheduled alert not found");

    const newDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const { count } = await prisma.alerte.updateMany({
      where: { alerteId, ownerUserId, status: AlerteStatus.SCHEDULED },
      data: { alerteDate: newDate, snoozedUntil: newDate },
    });
    if (count === 0) throw createHttpError(404, "Scheduled alert not found");

    await AlertService.removeJobsForAlert(prior);
    await AlertService.enqueueCustom(ownerUserId, alerteId, newDate);
    return prisma.alerte.findUniqueOrThrow({ where: { alerteId } });
  },

  cancel: async (alerteId: number, ownerUserId: number) => {
    // Same atomicity rationale as snooze: never read-then-update a status.
    // Cancelling a row the worker just marked SENT would falsely record
    // that the user was never notified.
    const { count } = await prisma.alerte.updateMany({
      where: { alerteId, ownerUserId, status: AlerteStatus.SCHEDULED },
      data: { status: AlerteStatus.CANCELLED },
    });
    if (count === 0) throw createHttpError(404, "Scheduled alert not found");

    const updated = await prisma.alerte.findUniqueOrThrow({
      where: { alerteId },
    });
    await AlertService.removeJobsForAlert(updated);
    return updated;
  },

  // Feed for the notification bell: scheduled alerts that are overdue or
  // due within the next 30 days, soonest first, capped. `unseen` counts
  // those created after the user's last "mark seen" (or all, if never).
  notifications: async (ownerUserId: number) => {
    const horizon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const [user, items] = await Promise.all([
      prisma.user.findUnique({
        where: { userId: ownerUserId },
        select: { alertsSeenAt: true },
      }),
      prisma.alerte.findMany({
        where: {
          ownerUserId,
          status: AlerteStatus.SCHEDULED,
          alerteDate: { lte: horizon },
          OR: [{ article: null }, { article: { deletedAt: null } }],
        },
        orderBy: { alerteDate: "asc" },
        take: 20,
        include: {
          garantie: { select: { garantieId: true, garantieNom: true } },
          article: {
            select: {
              articleId: true,
              articleNom: true,
              articleModele: true,
            },
          },
        },
      }),
    ]);
    const seenAt = user?.alertsSeenAt ?? null;
    const unseen = seenAt
      ? items.filter((a) => a.createdAt > seenAt).length
      : items.length;
    return { items, unseen };
  },

  markSeen: (ownerUserId: number) =>
    prisma.user.update({
      where: { userId: ownerUserId },
      data: { alertsSeenAt: new Date() },
      select: { alertsSeenAt: true },
    }),

  markSent: (alerteId: number) =>
    prisma.alerte.updateMany({
      where: {
        alerteId,
        status: { in: [AlerteStatus.SCHEDULED, AlerteStatus.FAILED] },
      },
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
