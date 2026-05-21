import { describe, it, expect } from "vitest";
import { computeWarrantyReminderSchedule } from "../modules/alerts/alert.scheduler";

describe("computeWarrantyReminderSchedule", () => {
  const now = new Date("2024-06-01T12:00:00Z");

  it("returns J30, J7, J1 reminders for a future warranty", () => {
    const garantieFin = new Date("2024-08-01T12:00:00Z");
    const result = computeWarrantyReminderSchedule({ garantieFin, now });
    expect(result).toHaveLength(3);
    const kinds = result.map((r) => r.reminderKind);
    expect(kinds).toContain("J30");
    expect(kinds).toContain("J7");
    expect(kinds).toContain("J1");
  });

  it("computes correct reminder dates", () => {
    const garantieFin = new Date("2024-08-01T12:00:00Z");
    const result = computeWarrantyReminderSchedule({ garantieFin, now });
    const byKind = Object.fromEntries(result.map((r) => [r.reminderKind, r.executeAt]));

    // J30: 30 days before garantieFin
    expect(byKind["J30"].toISOString()).toBe(new Date("2024-07-02T12:00:00Z").toISOString());
    // J7: 7 days before garantieFin
    expect(byKind["J7"].toISOString()).toBe(new Date("2024-07-25T12:00:00Z").toISOString());
    // J1: 1 day before garantieFin
    expect(byKind["J1"].toISOString()).toBe(new Date("2024-07-31T12:00:00Z").toISOString());
  });

  it("excludes past reminders by default", () => {
    // Warranty expiring in 3 days — J30 and J7 are already past
    const garantieFin = new Date("2024-06-04T12:00:00Z");
    const result = computeWarrantyReminderSchedule({ garantieFin, now });
    expect(result).toHaveLength(1);
    expect(result[0].reminderKind).toBe("J1");
  });

  it("includes past reminders when includePast is true", () => {
    const garantieFin = new Date("2024-06-04T12:00:00Z");
    const result = computeWarrantyReminderSchedule({ garantieFin, now, includePast: true });
    expect(result).toHaveLength(3);
  });

  it("returns empty array when all reminders are in the past", () => {
    const garantieFin = new Date("2024-05-01T12:00:00Z");
    const result = computeWarrantyReminderSchedule({ garantieFin, now });
    expect(result).toHaveLength(0);
  });

  it("excludes a reminder scheduled exactly at now (not strictly future)", () => {
    // J1 falls exactly on `now`
    const garantieFin = new Date("2024-06-02T12:00:00Z");
    const result = computeWarrantyReminderSchedule({ garantieFin, now });
    // J1 = garantieFin - 1 day = 2024-06-01T12:00:00Z = now → excluded
    const j1 = result.find((r) => r.reminderKind === "J1");
    expect(j1).toBeUndefined();
  });

  it("uses current time as default for now", () => {
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const result = computeWarrantyReminderSchedule({ garantieFin: farFuture });
    expect(result).toHaveLength(3);
  });
});
