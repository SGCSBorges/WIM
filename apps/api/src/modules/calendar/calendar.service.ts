/**
 * Calendar feed service — builds the iCalendar feed (RFC 5545) served to
 * external calendar clients via /api/calendar/feed/<token>.ics.
 *
 * Three event categories: warranty end dates, scheduled custom alerts,
 * and warranty claim status changes. Warranties for trashed articles are
 * excluded (every query joins on `article.deletedAt: null`). The
 * per-user token (`User.calendarToken`) is a 64-char random — long enough
 * to be unguessable, short enough to paste into a calendar app.
 */
import crypto from "crypto";
import { AlerteStatus } from "@prisma/client";
import type { AgendaEvent } from "@wim/types";
import { prisma } from "../../libs/prisma";

// Escape per RFC 5545: backslash, semicolon, comma, and newlines. A lone
// \r counts as a line break for permissive parsers, so it must be caught
// too — otherwise a name like "TV\rX-WR-CALNAME:x" injects a content line.
// Remaining C0 control chars are stripped (they're never legal in TEXT).
function escapeText(s: string): string {
  return (
    s
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r\n|\r|\n/g, "\\n")
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
  );
}

// RFC 5545 §3.1: content lines must not exceed 75 octets; longer lines are
// folded with CRLF + a single space. Splits on UTF-8 octet count without
// breaking a multi-byte character.
function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    // Continuation lines start with a space, which costs one octet.
    const budget = start === 0 ? 75 : 74;
    let end = Math.min(start + budget, bytes.length);
    // Back off to a UTF-8 character boundary (continuation bytes are 10xxxxxx).
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) {
      end--;
    }
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
  }
  return parts.join("\r\n ");
}

function dateOnly(d: Date): string {
  // YYYYMMDD in UTC for an all-day VALUE=DATE event.
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

type CalEvent = { uid: string; date: Date; summary: string };

function vevent(e: CalEvent, stamp: string): string {
  // DTEND for an all-day event is the day after DTSTART (exclusive).
  const end = new Date(e.date);
  end.setUTCDate(end.getUTCDate() + 1);
  return [
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${dateOnly(e.date)}`,
    `DTEND;VALUE=DATE:${dateOnly(end)}`,
    `SUMMARY:${escapeText(e.summary)}`,
    "END:VEVENT",
  ]
    .map(foldLine)
    .join("\r\n");
}

/** Build an RFC-5545 VCALENDAR string from a user's warranties + alerts. */
export function buildCalendar(events: CalEvent[]): string {
  const stamp =
    new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WIM//Warranty & Inventory Manager//EN",
    "CALSCALE:GREGORIAN",
    ...events.map((e) => vevent(e, stamp)),
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}

export const CalendarService = {
  // Returns the feed path if the caller already has an active token, else null.
  async getStatus(userId: number): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { userId },
      select: { calendarToken: true },
    });
    return user?.calendarToken
      ? `/api/calendar/feed/${user.calendarToken}.ics`
      : null;
  },

  async generateToken(userId: number): Promise<string> {
    const token = crypto.randomBytes(32).toString("hex");
    await prisma.user.update({
      where: { userId },
      data: { calendarToken: token },
    });
    return token;
  },

  async disableToken(userId: number): Promise<void> {
    await prisma.user.update({
      where: { userId },
      data: { calendarToken: null },
    });
  },

  // Returns the VCALENDAR text for the owner of `token`, or null if the token
  // doesn't resolve to a user.
  async feedForToken(token: string): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { calendarToken: token },
      select: { userId: true },
    });
    if (!user) return null;

    // Trashed-article warranties/alerts/claims must NOT appear on the feed —
    // exclude them via the joined article.deletedAt filter where the row
    // links to an article. Standalone (article-less) alerts still emit.
    const liveArticleScope = {
      OR: [{ article: null }, { article: { deletedAt: null } }],
    };

    const [warranties, alerts, claims, loans, policies, serviceRecords] =
      await Promise.all([
        prisma.garantie.findMany({
          where: { ownerUserId: user.userId, ...liveArticleScope },
          select: { garantieId: true, garantieNom: true, garantieFin: true },
        }),
        // SCHEDULED captures both kinds (warranty J-30/J-7/J-1 reminders and
        // custom alerts the user created themselves).
        prisma.alerte.findMany({
          where: {
            ownerUserId: user.userId,
            status: AlerteStatus.SCHEDULED,
            ...liveArticleScope,
          },
          select: { alerteId: true, alerteNom: true, alerteDate: true },
        }),
        // Warranty claims in flight (anything off NONE) so the workflow shows
        // up on the subscribed calendar at its last status-change date.
        prisma.garantie.findMany({
          where: {
            ownerUserId: user.userId,
            NOT: { claimStatus: "NONE" },
            claimUpdatedAt: { not: null },
            ...liveArticleScope,
          },
          select: {
            garantieId: true,
            garantieNom: true,
            claimStatus: true,
            claimUpdatedAt: true,
          },
        }),
        // Loan return dates (open loans), insurance renewals, and maintenance
        // due dates — parity with the in-app agenda so a subscribed calendar
        // shows the same actionable dates.
        prisma.loan.findMany({
          where: {
            ownerUserId: user.userId,
            returnedAt: null,
            dueAt: { not: null },
            article: { deletedAt: null },
          },
          select: {
            loanId: true,
            borrowerName: true,
            dueAt: true,
            article: { select: { articleNom: true } },
          },
        }),
        prisma.insurancePolicy.findMany({
          where: { ownerUserId: user.userId, renewalAt: { not: null } },
          select: { policyId: true, provider: true, renewalAt: true },
        }),
        prisma.serviceRecord.findMany({
          where: { ownerUserId: user.userId, article: { deletedAt: null } },
          orderBy: { performedAt: "desc" },
          select: {
            serviceId: true,
            articleId: true,
            nextDueAt: true,
            article: { select: { articleNom: true } },
          },
        }),
      ]);

    // Maintenance: only the latest record per article carries the live
    // schedule (a newer service with no nextDueAt clears an older one).
    const latestService = new Map<number, (typeof serviceRecords)[number]>();
    for (const r of serviceRecords)
      if (!latestService.has(r.articleId)) latestService.set(r.articleId, r);

    const events: CalEvent[] = [
      ...warranties.map((w) => ({
        uid: `warranty-${w.garantieId}@wim`,
        date: w.garantieFin,
        summary: `${w.garantieNom} — warranty expires`,
      })),
      ...alerts.map((a) => ({
        uid: `alert-${a.alerteId}@wim`,
        date: a.alerteDate,
        summary: a.alerteNom,
      })),
      ...claims.flatMap((c) =>
        c.claimUpdatedAt
          ? [
              {
                uid: `claim-${c.garantieId}-${c.claimStatus}@wim`,
                date: c.claimUpdatedAt,
                summary: `Warranty claim ${c.claimStatus}: ${c.garantieNom}`,
              },
            ]
          : []
      ),
      ...loans.map((l) => ({
        uid: `loan-${l.loanId}@wim`,
        date: l.dueAt as Date,
        summary: `${l.article.articleNom} — loan due back (${l.borrowerName})`,
      })),
      ...policies.map((p) => ({
        uid: `insurance-${p.policyId}@wim`,
        date: p.renewalAt as Date,
        summary: `${p.provider} — policy renewal`,
      })),
      ...[...latestService.values()]
        .filter((r) => r.nextDueAt !== null)
        .map((r) => ({
          uid: `service-${r.serviceId}@wim`,
          date: r.nextDueAt as Date,
          summary: `${r.article.articleNom} — service due`,
        })),
    ];

    return buildCalendar(events);
  },

  /**
   * In-app agenda: upcoming (and still-actionable overdue) events across
   * warranties, maintenance, loans, insurance renewals, and scheduled alerts.
   * Forward window is 365 days. Overdue loans / maintenance / insurance stay
   * on the list until resolved (they need attention); warranties and alerts
   * use a 30-day past window so long-expired items don't clutter it. Sorted
   * ascending by date and capped so the payload stays bounded.
   */
  async agenda(userId: number): Promise<AgendaEvent[]> {
    const now = new Date();
    const in365 = new Date(now.getTime() + 365 * 86_400_000);
    const past30 = new Date(now.getTime() - 30 * 86_400_000);
    const liveArticleScope = {
      OR: [{ article: null }, { article: { deletedAt: null } }],
    };

    const [warranties, alerts, loans, policies, serviceRecords] =
      await Promise.all([
        prisma.garantie.findMany({
          where: {
            ownerUserId: userId,
            garantieFin: { gte: past30, lte: in365 },
            article: { deletedAt: null },
          },
          select: {
            garantieNom: true,
            garantieFin: true,
            garantieArticleId: true,
          },
        }),
        prisma.alerte.findMany({
          where: {
            ownerUserId: userId,
            status: AlerteStatus.SCHEDULED,
            alerteDate: { gte: past30, lte: in365 },
            ...liveArticleScope,
          },
          select: {
            alerteNom: true,
            alerteDate: true,
            alerteArticleId: true,
          },
        }),
        prisma.loan.findMany({
          where: {
            ownerUserId: userId,
            returnedAt: null,
            dueAt: { not: null, lte: in365 },
            article: { deletedAt: null },
          },
          select: {
            borrowerName: true,
            dueAt: true,
            articleId: true,
            article: { select: { articleNom: true } },
          },
        }),
        prisma.insurancePolicy.findMany({
          where: {
            ownerUserId: userId,
            renewalAt: { not: null, lte: in365 },
          },
          select: { provider: true, renewalAt: true },
        }),
        prisma.serviceRecord.findMany({
          where: { ownerUserId: userId, article: { deletedAt: null } },
          orderBy: { performedAt: "desc" },
          select: {
            articleId: true,
            nextDueAt: true,
            article: { select: { articleNom: true } },
          },
        }),
      ]);

    // Maintenance: only the LATEST record per article carries the live
    // schedule (a newer service with no nextDueAt clears an older one).
    const latestService = new Map<number, (typeof serviceRecords)[number]>();
    for (const r of serviceRecords)
      if (!latestService.has(r.articleId)) latestService.set(r.articleId, r);

    const events: AgendaEvent[] = [
      ...warranties.map((w) => ({
        kind: "warranty" as const,
        date: w.garantieFin.toISOString(),
        title: `${w.garantieNom} — warranty expires`,
        articleId: w.garantieArticleId,
      })),
      ...alerts.map((a) => ({
        kind: "alert" as const,
        date: a.alerteDate.toISOString(),
        title: a.alerteNom,
        articleId: a.alerteArticleId,
      })),
      ...loans.map((l) => ({
        kind: "loan" as const,
        date: (l.dueAt as Date).toISOString(),
        title: `${l.article.articleNom} — loan due back (${l.borrowerName})`,
        articleId: l.articleId,
      })),
      ...policies.map((p) => ({
        kind: "insurance" as const,
        date: (p.renewalAt as Date).toISOString(),
        title: `${p.provider} — policy renewal`,
        articleId: null,
      })),
      ...[...latestService.values()]
        .filter((r) => r.nextDueAt !== null && r.nextDueAt <= in365)
        .map((r) => ({
          kind: "maintenance" as const,
          date: (r.nextDueAt as Date).toISOString(),
          title: `${r.article.articleNom} — service due`,
          articleId: r.articleId,
        })),
    ];

    return events.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 200);
  },
};
