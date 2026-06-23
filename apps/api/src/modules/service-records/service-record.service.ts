/**
 * Service / maintenance log — an append-only history of repairs, tune-ups, and
 * cleanings per article, with an optional next-service date that schedules a
 * reminder via the existing alert engine (cancelled on delete). Alert wiring is
 * best-effort: a Redis hiccup must never fail the log write (mirrors the
 * Loan/PushService pattern).
 */
import { prisma } from "../../libs/prisma";
import { createHttpError } from "../../utils/http-error";
import { logger } from "../../config/logger";
import { AlertService } from "../alerts/alert.service";
import type { ServiceCreateInput } from "./service-record.schemas";

async function assertArticleOwned(articleId: number, ownerUserId: number) {
  const article = await prisma.article.findFirst({
    where: { articleId, ownerUserId, deletedAt: null },
    select: { articleId: true, articleNom: true },
  });
  if (!article) throw createHttpError(404, "Article not found");
  return article;
}

export const ServiceRecordService = {
  list(ownerUserId: number, articleId: number) {
    return prisma.serviceRecord.findMany({
      where: { ownerUserId, articleId },
      orderBy: { performedAt: "desc" },
    });
  },

  async create(ownerUserId: number, data: ServiceCreateInput) {
    const article = await assertArticleOwned(data.articleId, ownerUserId);

    const record = await prisma.serviceRecord.create({
      data: {
        ownerUserId,
        articleId: data.articleId,
        performedAt: data.performedAt,
        description: data.description,
        cost: data.cost ?? null,
        provider: data.provider ?? null,
        nextDueAt: data.nextDueAt ?? null,
      },
    });

    // Optional next-service reminder (best-effort — never fail the log on it).
    if (data.nextDueAt) {
      try {
        const alert = await AlertService.createCustom({
          ownerUserId,
          alerteNom: `Service due: ${article.articleNom}`,
          alerteDate: data.nextDueAt,
          alerteArticleId: data.articleId,
        });
        await prisma.serviceRecord.update({
          where: { serviceId: record.serviceId },
          data: { reminderAlerteId: alert.alerteId },
        });
        record.reminderAlerteId = alert.alerteId;
      } catch (err) {
        logger.warn(
          { err, serviceId: record.serviceId },
          "[service] reminder schedule failed"
        );
      }
    }

    return record;
  },

  async remove(serviceId: number, ownerUserId: number) {
    const record = await prisma.serviceRecord.findFirst({
      where: { serviceId, ownerUserId },
    });
    if (!record) throw createHttpError(404, "Service record not found");
    if (record.reminderAlerteId)
      await AlertService.cancel(record.reminderAlerteId, ownerUserId).catch(
        () => undefined
      );
    await prisma.serviceRecord.delete({ where: { serviceId } });
  },
};
