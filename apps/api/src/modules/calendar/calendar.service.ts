import crypto from "crypto";
import { AlerteStatus } from "@prisma/client";
import { prisma } from "../../libs/prisma";

// Escape per RFC 5545: backslash, semicolon, comma, and newlines.
function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
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
  ].join("\r\n");
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

    const [warranties, alerts, claims] = await Promise.all([
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
    ]);

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
    ];

    return buildCalendar(events);
  },
};
