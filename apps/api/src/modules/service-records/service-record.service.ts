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
import { addMonths } from "../common/date";
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

  // Services coming due (or overdue) across all the caller's articles. The
  // append-only log means each article's *latest* entry defines its current
  // schedule, so we take the most recent record per article and surface it
  // only when that entry set a nextDueAt inside the window. A later service
  // with no nextDueAt correctly clears an earlier one.
  async listDue(ownerUserId: number, withinDays = 30) {
    const records = await prisma.serviceRecord.findMany({
      where: { ownerUserId },
      orderBy: { performedAt: "desc" },
      select: {
        serviceId: true,
        articleId: true,
        nextDueAt: true,
        article: { select: { articleId: true, articleNom: true } },
      },
    });
    const threshold = Date.now() + withinDays * 86_400_000;
    const latestByArticle = new Map<number, (typeof records)[number]>();
    for (const r of records) {
      if (!latestByArticle.has(r.articleId))
        latestByArticle.set(r.articleId, r);
    }
    return [...latestByArticle.values()]
      .filter(
        (r) =>
          r.nextDueAt !== null && new Date(r.nextDueAt).getTime() <= threshold
      )
      .sort(
        (a, b) =>
          new Date(a.nextDueAt as Date).getTime() -
          new Date(b.nextDueAt as Date).getTime()
      );
  },

  async create(ownerUserId: number, data: ServiceCreateInput) {
    const article = await assertArticleOwned(data.articleId, ownerUserId);

    // Recurring cadence: an explicit nextDueAt wins; otherwise derive it from
    // performedAt + intervalMonths so a routine job re-arms itself on every
    // log entry without the user re-picking a date each time.
    const nextDueAt =
      data.nextDueAt ??
      (data.intervalMonths
        ? addMonths(new Date(data.performedAt), data.intervalMonths)
        : null);

    const record = await prisma.serviceRecord.create({
      data: {
        ownerUserId,
        articleId: data.articleId,
        performedAt: data.performedAt,
        description: data.description,
        cost: data.cost ?? null,
        provider: data.provider ?? null,
        nextDueAt,
        intervalMonths: data.intervalMonths ?? null,
      },
    });

    // Optional next-service reminder (best-effort — never fail the log on it).
    if (nextDueAt) {
      try {
        const alert = await AlertService.createCustom({
          ownerUserId,
          alerteNom: `Service due: ${article.articleNom}`,
          alerteDate: nextDueAt,
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
