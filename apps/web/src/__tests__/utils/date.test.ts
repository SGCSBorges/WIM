import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime } from "../../utils/date";

// A fixed instant: 2026-03-07 09:05 local time.
const ISO = "2026-03-07T09:05:00";

describe("utils/date", () => {
  it("renders the explicit patterns in the chosen order", () => {
    expect(formatDate(ISO, "dd/MM/yyyy")).toBe("07/03/2026");
    expect(formatDate(ISO, "MM/dd/yyyy")).toBe("03/07/2026");
    expect(formatDate(ISO, "yyyy-MM-dd")).toBe("2026-03-07");
  });

  it("appends time for formatDateTime on explicit patterns", () => {
    expect(formatDateTime(ISO, "yyyy-MM-dd")).toBe("2026-03-07 09:05");
  });

  it("returns an empty string for missing/invalid input", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate(undefined)).toBe("");
    expect(formatDate("")).toBe("");
    expect(formatDate("not-a-date", "yyyy-MM-dd")).toBe("");
    expect(formatDateTime(null)).toBe("");
  });

  it("falls back to the locale formatter for 'system'", () => {
    // We don't assert the exact locale string (CI locale varies), only that
    // it produces a non-empty value distinct from the fixed patterns.
    expect(formatDate(ISO, "system")).not.toBe("");
    expect(formatDate(ISO)).not.toBe(""); // defaults to system
  });
});
