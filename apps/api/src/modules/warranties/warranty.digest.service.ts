import { prisma } from "../../libs/prisma";
import { logger } from "../../config/logger";
import { EmailService } from "../email/email.service";

// Window of upcoming expirations included in the weekly digest. Matches the
// existing "expiringSoon" notion the dashboard already surfaces (30 days).
const WINDOW_DAYS = 30;

function fmtDate(d: Date): string {
  // YYYY-MM-DD is unambiguous across locales and matches the dashboard's
  // "expires in N days" rendering style without pulling in a date lib here.
  return d.toISOString().slice(0, 10);
}

export const WarrantyDigestService = {
  /** Send the weekly digest to every opted-in user with ≥1 warranty expiring
   *  in the next 30 days. Returns counts for observability. Never throws —
   *  per-user failures are logged and counted. */
  sendWeeklyDigests: async (
    now: Date = new Date()
  ): Promise<{
    usersSent: number;
    usersSkipped: number;
    emailsAttempted: number;
  }> => {
    if (!EmailService.isConfigured()) {
      logger.info(
        "[warranty-digest] Resend not configured (RESEND_API_KEY/MAIL_FROM) — skipping"
      );
      return { usersSent: 0, usersSkipped: 0, emailsAttempted: 0 };
    }

    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() + WINDOW_DAYS);

    // One query for every opted-in user that has at least one expiring
    // warranty in the window. `weeklyDigest` is the user-level opt-in;
    // `emailReminders` is respected too so a user who muted email also mutes
    // the digest (consistent with the existing reminder flow).
    const users = await prisma.user.findMany({
      where: {
        weeklyDigest: true,
        emailReminders: true,
        warrantiesOwned: {
          some: {
            garantieFin: { gte: now, lte: cutoff },
            article: { deletedAt: null },
          },
        },
      },
      select: {
        userId: true,
        email: true,
        warrantiesOwned: {
          where: {
            garantieFin: { gte: now, lte: cutoff },
            article: { deletedAt: null },
          },
          orderBy: { garantieFin: "asc" },
          take: 50, // keep the email short and the query bounded
          select: {
            garantieNom: true,
            garantieFin: true,
            article: { select: { articleId: true, articleNom: true } },
          },
        },
      },
    });

    let usersSent = 0;
    let emailsAttempted = 0;
    for (const u of users) {
      if (u.warrantiesOwned.length === 0) continue;
      const lines = u.warrantiesOwned
        .map((g) => {
          const articleName = g.article?.articleNom ?? "(article gone)";
          return `• ${articleName} — ${g.garantieNom} — expires ${fmtDate(
            new Date(g.garantieFin)
          )}`;
        })
        .join("\n");
      const body = `You have ${u.warrantiesOwned.length} warranty(ies) expiring in the next ${WINDOW_DAYS} days:\n\n${lines}`;
      try {
        emailsAttempted++;
        await EmailService.sendReminderEmail({
          to: u.email,
          subject: `Warranty digest — ${u.warrantiesOwned.length} expiring soon`,
          body,
          path: "/dashboard",
        });
        usersSent++;
      } catch (err) {
        logger.warn(
          { err, userId: u.userId },
          "[warranty-digest] per-user send error"
        );
      }
    }
    return {
      usersSent,
      usersSkipped: users.length - usersSent,
      emailsAttempted,
    };
  },
};
