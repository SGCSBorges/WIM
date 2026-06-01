import { describe, it, expect } from "vitest";
import { roleAtLeast } from "../../modules/common/roles";

describe("roleAtLeast (USER < POWER_USER < ADMIN)", () => {
  it("ADMIN clears a POWER_USER gate (inherits sharing)", () => {
    expect(roleAtLeast("ADMIN", "POWER_USER")).toBe(true);
  });

  it("POWER_USER clears its own gate", () => {
    expect(roleAtLeast("POWER_USER", "POWER_USER")).toBe(true);
  });

  it("USER does NOT clear a POWER_USER gate", () => {
    expect(roleAtLeast("USER", "POWER_USER")).toBe(false);
  });

  it("POWER_USER does NOT clear an ADMIN gate (no downward leak)", () => {
    expect(roleAtLeast("POWER_USER", "ADMIN")).toBe(false);
  });

  it("ADMIN clears an ADMIN gate", () => {
    expect(roleAtLeast("ADMIN", "ADMIN")).toBe(true);
  });

  it("an unknown role clears nothing", () => {
    expect(roleAtLeast("GUEST", "POWER_USER")).toBe(false);
    expect(roleAtLeast("", "USER")).toBe(false);
  });
});
