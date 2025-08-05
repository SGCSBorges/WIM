import type { Job } from "bullmq";

import { prisma } from "../../libs/prisma";
import { logger } from "../../config/logger";
import { WarrantyReminderJobPayload } from "../../modules/alerts/alert.types";
import { AlertService } from "../../modules/alerts/alert.service";

export const ReminderProcessor = {
  async handle(job: Job<WarrantyReminderJobPayload>) {
    const data = job.data;

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

      logger.info(
        {
          jobId: job.id,
          garantie: g,
          reminderKind: data.reminderKind,
        },
        "[alerts] reminder event"
      );

      // V1: "notification" = log + DB update
      await AlertService.markSent(data.alerteId);
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
};
