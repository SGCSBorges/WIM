import { describe, it, expect } from "vitest";
import { visibleNavItems, isActivePath } from "../../lib/navItems";

/** Convenience: the set of nav keys returned for a given role/features. */
function keys(
  role: string | null,
  features?: Record<string, boolean>
): string[] {
  return visibleNavItems(role, features).map((i) => i.key);
}

describe("visibleNavItems — role-only (no feature map)", () => {
  it("hides share + admin items for a plain USER", () => {
    const k = keys("USER");
    expect(k).toContain("articles");
    expect(k).toContain("reports");
    expect(k).not.toContain("sharing");
    expect(k).not.toContain("transfers");
    expect(k).not.toContain("admin");
  });

  it("shows share items for POWER_USER but not admin", () => {
    const k = keys("POWER_USER");
    expect(k).toContain("sharing");
    expect(k).toContain("transfers");
    expect(k).not.toContain("admin");
  });

  it("shows everything for ADMIN", () => {
    const k = keys("ADMIN");
    expect(k).toContain("sharing");
    expect(k).toContain("transfers");
    expect(k).toContain("admin");
  });
});

describe("visibleNavItems — feature-map driven", () => {
  const allFalse = {
    cmd_palette: false,
    sharing: false,
    transfers: false,
    reports: false,
    templates: false,
    bulk_edit: false,
    saved_views: false,
    notifications: false,
    calendar_feed: false,
    csv_import: false,
    csv_export: false,
  };

  it("hides sharing/transfers when their flags are off, even for ADMIN", () => {
    const k = keys("ADMIN", allFalse);
    expect(k).not.toContain("sharing");
    expect(k).not.toContain("transfers");
    // admin item is role-gated, not feature-gated → still visible
    expect(k).toContain("admin");
  });

  it("shows sharing/transfers when their flags are on", () => {
    const k = keys("USER", { ...allFalse, sharing: true, transfers: true });
    expect(k).toContain("sharing");
    expect(k).toContain("transfers");
  });

  it("hides the reports item when the reports flag is off", () => {
    const k = keys("USER", allFalse);
    expect(k).not.toContain("reports");
  });

  it("shows the reports item when the reports flag is on", () => {
    const k = keys("USER", { ...allFalse, reports: true });
    expect(k).toContain("reports");
  });

  it("keeps non-gated items visible regardless of the feature map", () => {
    const k = keys("USER", allFalse);
    expect(k).toContain("home");
    expect(k).toContain("articles");
    expect(k).toContain("warranties");
    expect(k).toContain("alerts");
  });
});

describe("isActivePath", () => {
  it("matches home only exactly", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/", "/articles")).toBe(false);
  });

  it("matches a section root and its nested routes", () => {
    expect(isActivePath("/articles", "/articles")).toBe(true);
    expect(isActivePath("/articles", "/articles/123")).toBe(true);
    expect(isActivePath("/articles", "/articlesfoo")).toBe(false);
  });
});
