/**
 * Reminder processor — runs each warranty + custom-alert job. Ordering is
 * load-warranty → push (await; throw on hard failure so BullMQ retries) →
 * email (best-effort; never throws) → markSent. The order is load-bearing:
 * a failed push must not mark the alert sent, or the notification is lost.
 */
import type { Job } from "bullmq";

import { prisma } from "../../libs/prisma";
import { logger } from "../../config/logger";
import { AlertJobPayload } from "../../modules/alerts/alert.types";
import { AlertService } from "../../modules/alerts/alert.service";
import { PushService } from "../../modules/push/push.service";
import { EmailService } from "../../modules/email/email.service";
import {
  emailTranslator,
  type EmailTranslator,
} from "../../modules/email/email.i18n";

function shortDate(d: Date | null | undefined): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

type Recipient = {
  email: string;
  emailReminders: boolean;
  language?: string | null;
};

// The recipient's address, opt-in and language, read once per job so push
// and email speak the same language. Never throws: a failed read means
// English copy and no email — the push still goes out. (try/await rather
// than `.catch()`, so a client that returns a non-promise can't throw.)
async function loadRecipient(ownerUserId: number): Promise<Recipient | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { userId: ownerUserId },
      select: { email: true, emailReminders: true, language: true },
    });
    return user ?? null;
  } catch {
    return null;
  }
}

// Best-effort email delivery alongside push. No-op when email isn't
// configured or the user opted out; never throws so it can't re-fail a job
// whose alert is already marked sent.
async function emailReminder(
  user: Recipient | null,
  msg: { subject: string; body: string; path?: string }
): Promise<void> {
  if (!EmailService.isConfigured()) return;
  if (!user || !user.emailReminders) return;
  await EmailService.sendReminderEmail({
    to: user.email,
    lang: user.language,
    ...msg,
  });
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

      // Mirror handleCustom: skip rows that are gone or terminal. CANCELLED
      // (trash/renew/user) and SENT (already delivered) are terminal. A FAILED
      // row, however, means a *prior attempt of this same job* threw and BullMQ
      // is now retrying — we MUST redeliver, so FAILED is actionable alongside
      // SCHEDULED. Skipping FAILED here would let the markFailed in the catch
      // below poison every retry: the 2nd/3rd attempts would short-circuit and
      // a single transient push error would drop the notification, defeating
      // the `attempts: 3` policy this ordering was designed around.
      const alerte = await prisma.alerte.findUnique({
        where: { alerteId: data.alerteId },
        select: { status: true, ownerUserId: true },
      });
      if (
        !alerte ||
        (alerte.status !== "SCHEDULED" && alerte.status !== "FAILED")
      ) {
        logger.warn(
          { jobId: job.id, alerteId: data.alerteId, status: alerte?.status },
          "[alerts] warranty alert not actionable — skipping"
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

      const path = data.articleId ? `/articles/${data.articleId}` : "/alerts";

      // Address the row's CURRENT owner, not the payload's. An article
      // transfer re-owns the Alerte to the new owner but leaves the queued
      // job's `ownerUserId` pointing at the giver — delivering on the payload
      // would name the item to its former owner and mark the row SENT, so the
      // new owner never gets the reminder at all. handleCustom already reads
      // the row for exactly this reason.
      const recipientUserId = alerte.ownerUserId;
      const recipient = await loadRecipient(recipientUserId);
      const t: EmailTranslator = emailTranslator(recipient?.language);

      // Deliver BEFORE markSent so a failed push (e.g., transient VAPID error)
      // causes BullMQ to retry instead of marking the alert sent and dropping
      // the notification on the floor. Push is the canonical channel; if it
      // throws, the catch below records markFailed + rethrows for retry.
      const vars = { name: g.garantieNom, date: shortDate(g.garantieFin) };
      await PushService.sendToUser(recipientUserId, {
        title: t("warranty.reminder.subject", vars),
        body: t("warranty.reminder.push", vars),
        url: path,
      });

      // Email is best-effort and never throws (see emailReminder above), so
      // we don't gate markSent on it — a failed SMTP doesn't justify a
      // duplicate push on retry.
      await emailReminder(recipient, {
        subject: t("warranty.reminder.subject", vars),
        body: t("warranty.reminder.body", vars),
        path,
      });

      await AlertService.markSent(data.alerteId);
    } catch (err) {
      logger.error(
        {
          jobId: job.id,
          alerteId: data.alerteId,
          attempt: job.attemptsMade,
          maxAttempts: job.opts.attempts,
          err,
        },
        "[alerts] reminder failed"
      );
      // markFailed may itself throw if the alert was cascade-deleted while the
      // job was in-flight. Swallow that so we always rethrow the original error
      // and BullMQ records the correct failure reason.
      await AlertService.markFailed(data.alerteId, err).catch(() => {});
      throw err;
    }
  },

  async handleCustom(job: Job<AlertJobPayload>, alerteId: number) {
    try {
      const alerte = await prisma.alerte.findUnique({ where: { alerteId } });
      // Gone (article/account deleted), or terminal: CANCELLED (user/trash) or
      // SENT (already delivered). A FAILED row is a BullMQ retry of this same
      // job after a transient delivery error, so redeliver it (see the warranty
      // branch for why skipping FAILED would defeat the retry policy). A snooze
      // re-keys to a fresh job id and keeps the row SCHEDULED, so a superseded
      // row never reaches here as FAILED.
      if (
        !alerte ||
        (alerte.status !== "SCHEDULED" && alerte.status !== "FAILED")
      ) {
        logger.warn(
          { jobId: job.id, alerteId, status: alerte?.status },
          "[alerts] custom alert not actionable — skipping"
        );
        return;
      }

      const path = alerte.alerteArticleId
        ? `/articles/${alerte.alerteArticleId}`
        : "/alerts";
      const recipient = await loadRecipient(alerte.ownerUserId);
      const t: EmailTranslator = emailTranslator(recipient?.language);

      // Default to the row's own copy (genuine CUSTOM alerts). A *snoozed
      // warranty* reminder is re-enqueued as a custom job (snooze re-keys every
      // alert to the generic id), so it arrives here with kind=WARRANTY and a
      // garantie link — rebuild the warranty-specific text instead of pushing
      // the raw label ("Warranty reminder J-30") + a misleading
      // "Maintenance reminder." body.
      let title = alerte.alerteNom;
      let body = alerte.alerteDescription ?? t("custom.defaultBody");
      if (alerte.kind === "WARRANTY" && alerte.alerteGarantieId) {
        const g = await prisma.garantie.findUnique({
          where: { garantieId: alerte.alerteGarantieId },
          select: { garantieNom: true, garantieFin: true },
        });
        if (g) {
          const vars = { name: g.garantieNom, date: shortDate(g.garantieFin) };
          title = t("warranty.reminder.subject", vars);
          body = t("warranty.reminder.push", vars);
        }
      }

      // Deliver BEFORE markSent (see warranty branch comment above) so a
      // failed push triggers a retry instead of dropping the notification.
      await PushService.sendToUser(alerte.ownerUserId, {
        title,
        body,
        url: path,
      });
      await emailReminder(recipient, { subject: title, body, path });

      await AlertService.markSent(alerteId);

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
      logger.error(
        {
          jobId: job.id,
          alerteId,
          attempt: job.attemptsMade,
          maxAttempts: job.opts.attempts,
          err,
        },
        "[alerts] custom failed"
      );
      await AlertService.markFailed(alerteId, err).catch(() => {});
      throw err;
    }
  },
};
