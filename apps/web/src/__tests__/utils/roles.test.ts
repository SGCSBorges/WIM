import { describe, it, expect } from "vitest";
import { isPowerUserOrAdmin } from "../../utils/roles";

describe("isPowerUserOrAdmin", () => {
  it("is true for POWER_USER and ADMIN (ADMIN inherits sharing)", () => {
    expect(isPowerUserOrAdmin("POWER_USER")).toBe(true);
    expect(isPowerUserOrAdmin("ADMIN")).toBe(true);
  });

  it("is false for USER and for null/undefined", () => {
    expect(isPowerUserOrAdmin("USER")).toBe(false);
    expect(isPowerUserOrAdmin(null)).toBe(false);
    expect(isPowerUserOrAdmin(undefined)).toBe(false);
  });
});
