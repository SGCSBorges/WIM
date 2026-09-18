import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    user: { update: vi.fn(), findUnique: vi.fn() },
    garantie: { findMany: vi.fn() },
    alerte: { findMany: vi.fn() },
    loan: { findMany: vi.fn() },
    insurancePolicy: { findMany: vi.fn() },
    serviceRecord: { findMany: vi.fn() },
  },
}));

import { prisma } from "../../libs/prisma";
import {
  buildCalendar,
  CalendarService,
} from "../../modules/calendar/calendar.service";

const mockPrisma = prisma as unknown as {
  user: {
    update: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  garantie: { findMany: ReturnType<typeof vi.fn> };
  alerte: { findMany: ReturnType<typeof vi.fn> };
  loan: { findMany: ReturnType<typeof vi.fn> };
  insurancePolicy: { findMany: ReturnType<typeof vi.fn> };
  serviceRecord: { findMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => vi.clearAllMocks());

describe("buildCalendar", () => {
  it("emits a VCALENDAR with an all-day VEVENT per event", () => {
    const ics = buildCalendar([
      {
        uid: "warranty-1@wim",
        date: new Date("2026-06-15T00:00:00.000Z"),
        summary: "Laptop — warranty expires",
      },
    ]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("UID:warranty-1@wim");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260615");
    expect(ics).toContain("DTEND;VALUE=DATE:20260616"); // exclusive next day
    expect(ics).toContain(
      "SUMMARY:Laptop \\— warranty expires".replace("\\—", "—")
    );
    expect(ics.includes("\r\n")).toBe(true); // CRLF line endings
  });

  it("escapes commas, semicolons and backslashes in summaries", () => {
    const ics = buildCalendar([
      {
        uid: "a@wim",
        date: new Date("2026-01-02T00:00:00Z"),
        summary: "a,b;c\\d",
      },
    ]);
    expect(ics).toContain("SUMMARY:a\\,b\\;c\\\\d");
  });
});

describe("CalendarService", () => {
  // The feed is windowed to +/-365 days around today, so the fixed dates in
  // these fixtures need a fixed "now" or the suite would start failing on its
  // own a year from now. Only Date is faked — timers stay real so the awaits
  // below still resolve.
  const NOW = new Date("2026-09-18T12:00:00.000Z");
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("generateToken stores a 64-hex token and returns the feed path", async () => {
    mockPrisma.user.update.mockResolvedValue({});
    const token = await CalendarService.generateToken(7);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 7 },
        data: { calendarToken: token },
      })
    );
  });

  it("feedForToken bounds every query to the +/-365d window", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ userId: 7 });
    for (const m of [
      mockPrisma.garantie.findMany,
      mockPrisma.alerte.findMany,
      mockPrisma.loan.findMany,
      mockPrisma.insurancePolicy.findMany,
      mockPrisma.serviceRecord.findMany,
    ])
      m.mockResolvedValue([]);

    await CalendarService.feedForToken("t");

    const start = new Date(NOW.getTime() - 365 * 86_400_000);
    const end = new Date(NOW.getTime() + 365 * 86_400_000);
    const window = { gte: start, lte: end };

    // An unwindowed leg would serialize the account's whole history on every
    // poll — calendar clients re-fetch this every 15-60 minutes.
    expect(mockPrisma.garantie.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ garantieFin: window }),
      })
    );
    expect(mockPrisma.alerte.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ alerteDate: window }),
      })
    );
    expect(mockPrisma.loan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ dueAt: window }),
      })
    );
    expect(mockPrisma.insurancePolicy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ renewalAt: window }),
      })
    );
    // Maintenance can't be filtered on nextDueAt (a newer null clears an older
    // schedule), so it's bounded by row count instead.
    expect(mockPrisma.serviceRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5000 })
    );
  });

  it("feedForToken drops an out-of-window maintenance due date", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ userId: 7 });
    mockPrisma.garantie.findMany.mockResolvedValue([]);
    mockPrisma.alerte.findMany.mockResolvedValue([]);
    mockPrisma.loan.findMany.mockResolvedValue([]);
    mockPrisma.insurancePolicy.findMany.mockResolvedValue([]);
    mockPrisma.serviceRecord.findMany.mockResolvedValue([
      {
        serviceId: 41,
        articleId: 4,
        nextDueAt: new Date(NOW.getTime() + 400 * 86_400_000),
        article: { articleNom: "Boiler" },
      },
      {
        serviceId: 42,
        articleId: 5,
        nextDueAt: new Date(NOW.getTime() + 30 * 86_400_000),
        article: { articleNom: "Furnace" },
      },
    ]);
    const ics = (await CalendarService.feedForToken("t")) as string;
    expect(ics).not.toContain("UID:service-41@wim");
    expect(ics).toContain("UID:service-42@wim");
  });

  it("feedForToken caps the feed, keeping the dates nearest today", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ userId: 7 });
    // 1200 alerts spread one day apart, starting 300 days in the past: the
    // 1000-event cap has to drop the far end, not the near one.
    mockPrisma.alerte.findMany.mockResolvedValue(
      Array.from({ length: 1200 }, (_, i) => ({
        alerteId: i,
        alerteNom: `A${i}`,
        alerteDate: new Date(NOW.getTime() + (i - 300) * 86_400_000),
      }))
    );
    mockPrisma.garantie.findMany.mockResolvedValue([]);
    mockPrisma.loan.findMany.mockResolvedValue([]);
    mockPrisma.insurancePolicy.findMany.mockResolvedValue([]);
    mockPrisma.serviceRecord.findMany.mockResolvedValue([]);

    const ics = (await CalendarService.feedForToken("t")) as string;
    const count = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
    expect(count).toBe(1000);
    // i=300 is today; i=1199 is ~900 days out and must be the kind that goes.
    expect(ics).toContain("UID:alert-300@wim");
    expect(ics).not.toContain("UID:alert-1199@wim");
  });

  it("feedForToken returns null for an unknown token", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    expect(await CalendarService.feedForToken("deadbeef")).toBeNull();
  });

  it("feedForToken builds events from warranties + scheduled alerts", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ userId: 7 });
    mockPrisma.garantie.findMany.mockResolvedValue([
      {
        garantieId: 1,
        garantieNom: "Fridge",
        garantieFin: new Date("2027-03-01T00:00:00Z"),
      },
    ]);
    mockPrisma.alerte.findMany.mockResolvedValue([
      {
        alerteId: 2,
        alerteNom: "Filter change",
        alerteDate: new Date("2026-09-01T00:00:00Z"),
      },
    ]);
    mockPrisma.loan.findMany.mockResolvedValue([]);
    mockPrisma.insurancePolicy.findMany.mockResolvedValue([]);
    mockPrisma.serviceRecord.findMany.mockResolvedValue([]);
    const ics = (await CalendarService.feedForToken("t")) as string;
    expect(ics).toContain("UID:warranty-1@wim");
    expect(ics).toContain("UID:alert-2@wim");
    expect(ics).toContain(
      "SUMMARY:Fridge \\— warranty expires".replace("\\—", "—")
    );
    expect(ics).toContain("SUMMARY:Filter change");
  });

  it("feedForToken emits a VEVENT per in-flight warranty claim", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ userId: 7 });
    mockPrisma.garantie.findMany
      // First call: warranties (expiry events).
      .mockResolvedValueOnce([])
      // Second call: claims with a non-NONE status + claimUpdatedAt.
      .mockResolvedValueOnce([
        {
          garantieId: 9,
          garantieNom: "Camera",
          claimStatus: "OPEN",
          claimUpdatedAt: new Date("2026-05-12T00:00:00Z"),
        },
      ]);
    mockPrisma.alerte.findMany.mockResolvedValue([]);
    mockPrisma.loan.findMany.mockResolvedValue([]);
    mockPrisma.insurancePolicy.findMany.mockResolvedValue([]);
    mockPrisma.serviceRecord.findMany.mockResolvedValue([]);
    const ics = (await CalendarService.feedForToken("t")) as string;
    expect(ics).toContain("UID:claim-9-OPEN@wim");
    expect(ics).toContain("SUMMARY:Warranty claim OPEN: Camera");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260512");
  });

  it("feedForToken also emits loan, insurance, and maintenance events", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ userId: 7 });
    mockPrisma.garantie.findMany.mockResolvedValue([]);
    mockPrisma.alerte.findMany.mockResolvedValue([]);
    mockPrisma.loan.findMany.mockResolvedValue([
      {
        loanId: 5,
        borrowerName: "Sam",
        dueAt: new Date("2026-08-01T00:00:00Z"),
        article: { articleNom: "Drill" },
      },
    ]);
    mockPrisma.insurancePolicy.findMany.mockResolvedValue([
      {
        policyId: 6,
        provider: "Acme",
        renewalAt: new Date("2026-10-01T00:00:00Z"),
      },
    ]);
    mockPrisma.serviceRecord.findMany.mockResolvedValue([
      // Latest record (first, desc order) carries the live schedule.
      {
        serviceId: 8,
        articleId: 4,
        nextDueAt: new Date("2026-07-15T00:00:00Z"),
        article: { articleNom: "Boiler" },
      },
      {
        serviceId: 7,
        articleId: 4,
        nextDueAt: new Date("2026-01-15T00:00:00Z"),
        article: { articleNom: "Boiler" },
      },
    ]);

    const ics = (await CalendarService.feedForToken("t")) as string;
    expect(ics).toContain("UID:loan-5@wim");
    expect(ics).toContain("SUMMARY:Drill — loan due back (Sam)");
    expect(ics).toContain("UID:insurance-6@wim");
    expect(ics).toContain("SUMMARY:Acme — policy renewal");
    // Only the latest service record emits (serviceId 8, not 7).
    expect(ics).toContain("UID:service-8@wim");
    expect(ics).not.toContain("UID:service-7@wim");
  });
});

describe("CalendarService.agenda", () => {
  it("aggregates all event kinds, sorted ascending by date", async () => {
    const soon = new Date(Date.now() + 5 * 86_400_000);
    const later = new Date(Date.now() + 20 * 86_400_000);
    const overdue = new Date(Date.now() - 3 * 86_400_000);

    mockPrisma.garantie.findMany.mockResolvedValue([
      { garantieNom: "Laptop", garantieFin: later, garantieArticleId: 1 },
    ]);
    mockPrisma.alerte.findMany.mockResolvedValue([
      { alerteNom: "Custom reminder", alerteDate: soon, alerteArticleId: 2 },
    ]);
    mockPrisma.loan.findMany.mockResolvedValue([
      {
        borrowerName: "Sam",
        dueAt: overdue,
        articleId: 3,
        article: { articleNom: "Drill" },
      },
    ]);
    mockPrisma.insurancePolicy.findMany.mockResolvedValue([
      { provider: "Acme", renewalAt: later },
    ]);
    mockPrisma.serviceRecord.findMany.mockResolvedValue([
      // Two records for the same article: only the latest (first, desc order)
      // carries the live schedule.
      { articleId: 4, nextDueAt: soon, article: { articleNom: "Boiler" } },
      { articleId: 4, nextDueAt: later, article: { articleNom: "Boiler" } },
    ]);

    const events = await CalendarService.agenda(1);

    expect(events.map((e) => e.kind)).toEqual([
      "loan", // overdue → earliest
      "alert",
      "maintenance",
      "warranty",
      "insurance",
    ]);
    // Latest-record-per-article wins for maintenance (nextDueAt = soon).
    const maint = events.find((e) => e.kind === "maintenance");
    expect(maint?.date).toBe(soon.toISOString());
    expect(maint?.articleId).toBe(4);
    // Insurance events aren't tied to a single article.
    expect(events.find((e) => e.kind === "insurance")?.articleId).toBeNull();
  });

  it("drops maintenance whose latest record has no next-due date", async () => {
    mockPrisma.garantie.findMany.mockResolvedValue([]);
    mockPrisma.alerte.findMany.mockResolvedValue([]);
    mockPrisma.loan.findMany.mockResolvedValue([]);
    mockPrisma.insurancePolicy.findMany.mockResolvedValue([]);
    mockPrisma.serviceRecord.findMany.mockResolvedValue([
      // Newest record cleared the schedule (nextDueAt null) → no event.
      { articleId: 4, nextDueAt: null, article: { articleNom: "Boiler" } },
      {
        articleId: 4,
        nextDueAt: new Date(Date.now() + 5 * 86_400_000),
        article: { articleNom: "Boiler" },
      },
    ]);

    const events = await CalendarService.agenda(1);
    expect(events).toEqual([]);
  });
});
