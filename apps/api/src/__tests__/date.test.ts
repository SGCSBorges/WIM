import { describe, it, expect } from "vitest";
import { addMonths } from "../modules/common/date";

describe("addMonths", () => {
  it("adds months to a regular date", () => {
    const result = addMonths(new Date("2024-01-15"), 3);
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(3); // April (0-indexed)
    expect(result.getDate()).toBe(15);
  });

  it("handles end-of-month overflow (Jan 31 + 1 = Feb 28)", () => {
    const result = addMonths(new Date("2024-01-31"), 1);
    expect(result.getMonth()).toBe(1); // February
    // In 2024, Feb 29 is valid (leap year); Jan 31 + 1 month = Feb 29
    expect(result.getDate()).toBe(29);
  });

  it("handles end-of-month overflow in non-leap year (Jan 31 + 1 = Feb 28)", () => {
    const result = addMonths(new Date("2023-01-31"), 1);
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(28);
  });

  it("handles March 31 + 1 month = April 30", () => {
    const result = addMonths(new Date("2024-03-31"), 1);
    expect(result.getMonth()).toBe(3); // April
    expect(result.getDate()).toBe(30);
  });

  it("handles adding 12 months (same date next year)", () => {
    const result = addMonths(new Date("2024-06-15"), 12);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(5); // June
    expect(result.getDate()).toBe(15);
  });

  it("handles adding 0 months", () => {
    const date = new Date("2024-06-15");
    const result = addMonths(date, 0);
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(5);
    expect(result.getDate()).toBe(15);
  });

  it("does not mutate the input date", () => {
    const original = new Date("2024-01-15");
    const originalTime = original.getTime();
    addMonths(original, 3);
    expect(original.getTime()).toBe(originalTime);
  });

  it("handles large durations (24 months)", () => {
    const result = addMonths(new Date("2022-06-01"), 24);
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(5);
    expect(result.getDate()).toBe(1);
  });
});
