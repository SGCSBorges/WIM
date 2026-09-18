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

// The .ics feed is re-fetched in full by every subscribed calendar client
// every 15-60 minutes, so it must be bounded at both ends. A calendar is a
// scrollback surface (unlike the in-app agenda, which only looks forward), so
// the past window is a full year rather than the agenda's 30 days.
const FEED_PAST_DAYS = 365;
const FEED_FUTURE_DAYS = 365;
// Safety valve for a pathological account. Events are dropped furthest-from-
// today first, so a capped feed keeps the dates that actually matter instead
// of truncating the whole future.
const FEED_MAX_EVENTS = 1000;
// Bounds the maintenance history read. Ordering by articleId first means a
// truncation drops whole trailing articles rather than cutting an article's
// history mid-way, so the "latest record per article wins" rule stays exact
// for every article the query does return.
const FEED_MAX_SERVICE_ROWS = 5000;

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

    // Bound every leg to the feed window (see FEED_PAST_DAYS above). Without
    // this the feed serialized the account's entire history on every poll.
    const now = new Date();
    const windowStart = new Date(now.getTime() - FEED_PAST_DAYS * 86_400_000);
    const windowEnd = new Date(now.getTime() + FEED_FUTURE_DAYS * 86_400_000);
    const inWindow = { gte: windowStart, lte: windowEnd };

    const [warranties, alerts, claims, loans, policies, serviceRecords] =
      await Promise.all([
        prisma.garantie.findMany({
          where: {
            ownerUserId: user.userId,
            garantieFin: inWindow,
            ...liveArticleScope,
          },
          select: { garantieId: true, garantieNom: true, garantieFin: true },
        }),
        // SCHEDULED captures both kinds (warranty J-30/J-7/J-1 reminders and
        // custom alerts the user created themselves).
        prisma.alerte.findMany({
          where: {
            ownerUserId: user.userId,
            status: AlerteStatus.SCHEDULED,
            alerteDate: inWindow,
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
            claimUpdatedAt: inWindow,
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
            dueAt: inWindow,
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
          where: { ownerUserId: user.userId, renewalAt: inWindow },
          select: { policyId: true, provider: true, renewalAt: true },
        }),
        prisma.serviceRecord.findMany({
          // Can't filter on nextDueAt here: a NEWER record with a null
          // nextDueAt is exactly what clears an older schedule, so dropping
          // those rows would resurrect cancelled services. Bound by row count
          // instead, on an articleId-major ordering (see the constant).
          where: { ownerUserId: user.userId, article: { deletedAt: null } },
          orderBy: [{ articleId: "asc" }, { performedAt: "desc" }],
          take: FEED_MAX_SERVICE_ROWS,
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
      // The latest-per-article reduction has to happen before the window
      // filter, not inside the query — see the note on the findMany above.
      ...[...latestService.values()]
        .filter(
          (r) =>
            r.nextDueAt !== null &&
            r.nextDueAt >= windowStart &&
            r.nextDueAt <= windowEnd
        )
        .map((r) => ({
          uid: `service-${r.serviceId}@wim`,
          date: r.nextDueAt as Date,
          summary: `${r.article.articleNom} — service due`,
        })),
    ];

    // Cap furthest-from-today first so an over-cap feed keeps the dates
    // nearest to now, then emit in chronological order.
    const bounded =
      events.length > FEED_MAX_EVENTS
        ? [...events]
            .sort(
              (a, b) =>
                Math.abs(a.date.getTime() - now.getTime()) -
                Math.abs(b.date.getTime() - now.getTime())
            )
            .slice(0, FEED_MAX_EVENTS)
        : events;
    bounded.sort((a, b) => a.date.getTime() - b.date.getTime());

    return buildCalendar(bounded);
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
