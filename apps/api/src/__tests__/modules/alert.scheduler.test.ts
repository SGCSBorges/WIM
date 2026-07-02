import { describe, it, expect } from "vitest";
import {
  computeWarrantyReminderSchedule,
  parseReminderDays,
  DEFAULT_REMINDER_DAYS,
} from "../../modules/alerts/alert.scheduler";

describe("parseReminderDays", () => {
  it("returns the default for null/empty input", () => {
    expect(parseReminderDays(null)).toEqual([...DEFAULT_REMINDER_DAYS]);
    expect(parseReminderDays(undefined)).toEqual([...DEFAULT_REMINDER_DAYS]);
    expect(parseReminderDays("")).toEqual([...DEFAULT_REMINDER_DAYS]);
  });

  it("parses a CSV into deduped, descending offsets", () => {
    expect(parseReminderDays("7,90, 30,7")).toEqual([90, 30, 7]);
  });

  it("drops out-of-range and non-numeric entries", () => {
    expect(parseReminderDays("0,400,abc,14")).toEqual([14]);
  });

  it("falls back to the default when every entry is garbage", () => {
    expect(parseReminderDays("abc,-1,999")).toEqual([
      ...DEFAULT_REMINDER_DAYS,
    ]);
  });

  it("caps at 5 offsets", () => {
    expect(parseReminderDays("1,2,3,4,5,6,7")).toEqual([7, 6, 5, 4, 3]);
  });
});

describe("computeWarrantyReminderSchedule", () => {
  const fin = new Date("2026-12-31T00:00:00Z");

  it("defaults to J-30/J-7/J-1", () => {
    const items = computeWarrantyReminderSchedule({
      garantieFin: fin,
      now: new Date("2026-01-01T00:00:00Z"),
    });
    expect(items.map((i) => i.reminderKind)).toEqual(["J30", "J7", "J1"]);
    expect(items.map((i) => i.days)).toEqual([30, 7, 1]);
  });

  it("honors custom offsets and filters past dates", () => {
    const items = computeWarrantyReminderSchedule({
      garantieFin: fin,
      now: new Date("2026-12-10T00:00:00Z"), // J-90 and J-30 already passed
      offsets: [90, 30, 14],
    });
    expect(items.map((i) => i.reminderKind)).toEqual(["J14"]);
  });

  it("keeps past dates when includePast is set", () => {
    const items = computeWarrantyReminderSchedule({
      garantieFin: fin,
      now: new Date("2026-12-30T00:00:00Z"),
      includePast: true,
      offsets: [60],
    });
    expect(items).toHaveLength(1);
    expect(items[0].executeAt.toISOString()).toBe(
      new Date("2026-11-01T00:00:00Z").toISOString()
    );
  });
});
