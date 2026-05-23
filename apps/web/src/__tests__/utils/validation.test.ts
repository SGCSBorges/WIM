import { describe, it, expect } from "vitest";
import { isValidEmail } from "../../utils/validation";

describe("isValidEmail", () => {
  it("accepts well-formed addresses", () => {
    expect(isValidEmail("alice@example.com")).toBe(true);
    expect(isValidEmail("a.b+tag@sub.domain.co")).toBe(true);
  });

  it("trims surrounding whitespace before validating", () => {
    expect(isValidEmail("  alice@example.com  ")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("missing@domain")).toBe(false);
    expect(isValidEmail("a@b c.com")).toBe(false);
  });
});
