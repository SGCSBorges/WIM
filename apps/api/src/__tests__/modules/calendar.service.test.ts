import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../libs/prisma", () => ({
  prisma: {
    user: { update: vi.fn(), findUnique: vi.fn() },
    garantie: { findMany: vi.fn() },
    alerte: { findMany: vi.fn() },
  },
}));

import { prisma } from "../../libs/prisma";
import { buildCalendar, CalendarService } from "../../modules/calendar/calendar.service";

const mockPrisma = prisma as unknown as {
  user: { update: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
  garantie: { findMany: ReturnType<typeof vi.fn> };
  alerte: { findMany: ReturnType<typeof vi.fn> };
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
    expect(ics).toContain("SUMMARY:Laptop \\— warranty expires".replace("\\—", "—"));
    expect(ics.includes("\r\n")).toBe(true); // CRLF line endings
  });

  it("escapes commas, semicolons and backslashes in summaries", () => {
    const ics = buildCalendar([
      { uid: "a@wim", date: new Date("2026-01-02T00:00:00Z"), summary: "a,b;c\\d" },
    ]);
    expect(ics).toContain("SUMMARY:a\\,b\\;c\\\\d");
  });
});

describe("CalendarService", () => {
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

  it("feedForToken returns null for an unknown token", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    expect(await CalendarService.feedForToken("deadbeef")).toBeNull();
  });

  it("feedForToken builds events from warranties + scheduled alerts", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ userId: 7 });
    mockPrisma.garantie.findMany.mockResolvedValue([
      { garantieId: 1, garantieNom: "Fridge", garantieFin: new Date("2027-03-01T00:00:00Z") },
    ]);
    mockPrisma.alerte.findMany.mockResolvedValue([
      { alerteId: 2, alerteNom: "Filter change", alerteDate: new Date("2026-09-01T00:00:00Z") },
    ]);
    const ics = (await CalendarService.feedForToken("t")) as string;
    expect(ics).toContain("UID:warranty-1@wim");
    expect(ics).toContain("UID:alert-2@wim");
    expect(ics).toContain("SUMMARY:Fridge \\— warranty expires".replace("\\—", "—"));
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
    const ics = (await CalendarService.feedForToken("t")) as string;
    expect(ics).toContain("UID:claim-9-OPEN@wim");
    expect(ics).toContain("SUMMARY:Warranty claim OPEN: Camera");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260512");
  });
});
