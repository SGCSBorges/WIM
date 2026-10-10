import { describe, it, expect } from "vitest";
import { formatMoney } from "../../utils/money";

describe("formatMoney", () => {
  it("formats in euros when no currency is supplied", () => {
    const out = formatMoney(1234.5, undefined, "fr");
    expect(out).toContain("€");
    expect(out).not.toContain("$");
  });

  it("falls back to euros, not dollars, on an invalid currency code", () => {
    const out = formatMoney(10, "not-a-currency", "en");
    expect(out).toContain("€");
    expect(out).not.toContain("$");
  });

  it("still honours an explicit currency", () => {
    expect(formatMoney(10, "USD", "en")).toContain("$");
  });

  it("renders a dash for an absent or non-numeric amount", () => {
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney("")).toBe("—");
    expect(formatMoney("abc")).toBe("—");
  });
});
