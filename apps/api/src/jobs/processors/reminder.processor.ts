import type { Job } from "bullmq";

import { prisma } from "../../libs/prisma";
import { logger } from "../../config/logger";
import { AlertJobPayload } from "../../modules/alerts/alert.types";
import { AlertService } from "../../modules/alerts/alert.service";
import { PushService } from "../../modules/push/push.service";

function shortDate(d: Date | null | undefined): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

export const ReminderProcessor = {
  async handle(job: Job<AlertJobPayload>) {
    const data = job.data;

    // Custom / snoozed alerts are keyed purely by alerteId — load the row,
    // mark it sent, and (for recurring CUSTOM alerts) schedule the next one.
    if (data.type === "custom_alert") {
      return ReminderProcessor.handleCustom(job, data.alerteId);
    }

    logger.info(
      {
        jobId: job.id,
        garantieId: data.garantieId,
        ownerUserId: data.ownerUserId,
        reminderKind: data.reminderKind,
        executeAt: data.executeAt,
      },
      "[alerts] run"
    );

    try {
      // Load some context for logging / future notification payload
      const g = await prisma.garantie.findUnique({
        where: { garantieId: data.garantieId },
        select: { garantieId: true, garantieNom: true, garantieFin: true },
      });

      // Warranty was deleted while this job was in-flight (e.g., user deleted the
      // article). The alert record is gone too (cascade), so there is nothing to
      // notify about. Complete gracefully so BullMQ does not retry.
      if (!g) {
        logger.warn(
          { jobId: job.id, garantieId: data.garantieId },
          "[alerts] warranty deleted before job ran — skipping"
        );
        return;
      }

      logger.info(
        {
          jobId: job.id,
          garantie: g,
          reminderKind: data.reminderKind,
        },
        "[alerts] reminder event"
      );

      await AlertService.markSent(data.alerteId);

      // Best-effort Web Push (no-op when VAPID isn't configured).
      await PushService.sendToUser(data.ownerUserId, {
        title: `Warranty reminder: ${g.garantieNom}`,
        body: `Warranty expires ${shortDate(g.garantieFin)}.`,
        url: data.articleId ? `/articles/${data.articleId}` : "/alerts",
      });
    } catch (err) {
      logger.error(
        {
          jobId: job.id,
          alerteId: data.alerteId,
          err,
        },
        "[alerts] reminder failed"
      );
      await AlertService.markFailed(data.alerteId, err);
      throw err;
    }
  },

  async handleCustom(job: Job<AlertJobPayload>, alerteId: number) {
    try {
      const alerte = await prisma.alerte.findUnique({ where: { alerteId } });
      // Gone (article/account deleted) or no longer scheduled (cancelled,
      // already sent, or superseded by a snooze that re-keyed the job).
      if (!alerte || alerte.status !== "SCHEDULED") {
        logger.warn(
          { jobId: job.id, alerteId, status: alerte?.status },
          "[alerts] custom alert not actionable — skipping"
        );
        return;
      }

      await AlertService.markSent(alerteId);

      await PushService.sendToUser(alerte.ownerUserId, {
        title: alerte.alerteNom,
        body: alerte.alerteDescription ?? "Maintenance reminder.",
        url: alerte.alerteArticleId
          ? `/articles/${alerte.alerteArticleId}`
          : "/alerts",
      });

      // Recurring CUSTOM alert: spawn the next occurrence. A failure here must
      // not re-fail the job — the alert is already SENT, so a retry would just
      // re-skip it and the recurrence would be lost anyway. Log and move on.
      if (alerte.kind === "CUSTOM" && alerte.recurrenceMonths) {
        try {
          await AlertService.createRecurrenceFollowUp(alerte);
        } catch (recErr) {
          logger.error(
            { jobId: job.id, alerteId, err: recErr },
            "[alerts] failed to schedule recurrence follow-up"
          );
        }
      }
    } catch (err) {
      logger.error({ jobId: job.id, alerteId, err }, "[alerts] custom failed");
      await AlertService.markFailed(alerteId, err);
      throw err;
    }
  },
};
