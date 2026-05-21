import { describe, it, expect } from "vitest";
import { addMonths } from "../../modules/common/date";

describe("addMonths", () => {
  it("adds months to a mid-month date", () => {
    const result = addMonths(new Date("2024-01-15"), 3);
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(3); // April (0-indexed)
    expect(result.getDate()).toBe(15);
  });

  it("handles month-end overflow: Jan 31 + 1 month → last day of Feb", () => {
    const result = addMonths(new Date("2024-01-31"), 1);
    // Feb 2024 has 29 days (leap year)
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(29);
  });

  it("handles non-leap-year month-end overflow: Jan 31 + 1 month → Feb 28", () => {
    const result = addMonths(new Date("2023-01-31"), 1);
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(28);
  });

  it("handles 12-month span (full year)", () => {
    const result = addMonths(new Date("2023-06-15"), 12);
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(5); // June
    expect(result.getDate()).toBe(15);
  });

  it("handles 0 months (returns same date)", () => {
    const d = new Date("2024-03-10");
    const result = addMonths(d, 0);
    expect(result.toDateString()).toBe(d.toDateString());
  });

  it("does not mutate the original date", () => {
    const original = new Date("2024-01-15");
    addMonths(original, 6);
    expect(original.getMonth()).toBe(0); // still January
  });
});
