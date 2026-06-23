/**
 * Loan/borrow tracking — who has an item and when it's due back. Pairs with the
 * LOANED article status (auto-set while a loan is open, reverted on return only
 * if still LOANED so we don't stomp a manual status change). An optional due
 * date spawns a CUSTOM reminder alert via the existing alert engine, cancelled
 * on return/delete. Alert wiring is best-effort: a Redis hiccup must never fail
 * the loan write (mirrors the PushService/EmailService pattern).
 */
import { prisma } from "../../libs/prisma";
import { createHttpError } from "../../utils/http-error";
import { logger } from "../../config/logger";
import { AlertService } from "../alerts/alert.service";
import type { LoanCreateInput } from "./loan.schemas";

const loanArticleSelect = {
  articleId: true,
  articleNom: true,
  articleModele: true,
  productImageUrl: true,
} as const;

async function assertArticleOwned(articleId: number, ownerUserId: number) {
  const article = await prisma.article.findFirst({
    where: { articleId, ownerUserId, deletedAt: null },
    select: { articleId: true, articleNom: true },
  });
  if (!article) throw createHttpError(404, "Article not found");
  return article;
}

export const LoanService = {
  async create(ownerUserId: number, data: LoanCreateInput) {
    const article = await assertArticleOwned(data.articleId, ownerUserId);

    const loan = await prisma.loan.create({
      data: {
        ownerUserId,
        articleId: data.articleId,
        borrowerName: data.borrowerName,
        borrowerEmail: data.borrowerEmail ?? null,
        dueAt: data.dueAt ?? null,
        note: data.note ?? null,
      },
      include: { article: { select: loanArticleSelect } },
    });

    // Loaning out sets the item LOANED.
    await prisma.article.update({
      where: { articleId: data.articleId },
      data: { status: "LOANED" },
    });

    // Optional due-date reminder (best-effort — never fail the loan on it).
    if (data.dueAt) {
      try {
        const alert = await AlertService.createCustom({
          ownerUserId,
          alerteNom: `Loan due: ${article.articleNom} (${data.borrowerName})`,
          alerteDate: new Date(data.dueAt),
          alerteArticleId: data.articleId,
        });
        await prisma.loan.update({
          where: { loanId: loan.loanId },
          data: { reminderAlerteId: alert.alerteId },
        });
        loan.reminderAlerteId = alert.alerteId;
      } catch (err) {
        logger.warn(
          { err, loanId: loan.loanId },
          "[loan] reminder schedule failed"
        );
      }
    }

    return loan;
  },

  list(
    ownerUserId: number,
    opts: { activeOnly?: boolean; articleId?: number }
  ) {
    return prisma.loan.findMany({
      where: {
        ownerUserId,
        ...(opts.activeOnly ? { returnedAt: null } : {}),
        ...(opts.articleId ? { articleId: opts.articleId } : {}),
      },
      orderBy: [{ returnedAt: "asc" }, { dueAt: "asc" }, { loanedAt: "desc" }],
      include: { article: { select: loanArticleSelect } },
    });
  },

  async markReturned(loanId: number, ownerUserId: number) {
    // Atomic precondition: only an open loan owned by the caller flips.
    const updated = await prisma.loan.updateMany({
      where: { loanId, ownerUserId, returnedAt: null },
      data: { returnedAt: new Date() },
    });
    if (updated.count === 0) throw createHttpError(404, "Open loan not found");

    const loan = await prisma.loan.findUnique({ where: { loanId } });
    if (loan?.reminderAlerteId) {
      await AlertService.cancel(loan.reminderAlerteId, ownerUserId).catch(
        () => undefined
      );
    }
    // Revert the status only if it's still LOANED (don't stomp a manual change).
    if (loan)
      await prisma.article.updateMany({
        where: { articleId: loan.articleId, ownerUserId, status: "LOANED" },
        data: { status: "ACTIVE" },
      });

    return prisma.loan.findUnique({
      where: { loanId },
      include: { article: { select: loanArticleSelect } },
    });
  },

  async remove(loanId: number, ownerUserId: number) {
    const loan = await prisma.loan.findFirst({
      where: { loanId, ownerUserId },
    });
    if (!loan) throw createHttpError(404, "Loan not found");
    if (loan.reminderAlerteId)
      await AlertService.cancel(loan.reminderAlerteId, ownerUserId).catch(
        () => undefined
      );
    await prisma.loan.delete({ where: { loanId } });
  },
};
