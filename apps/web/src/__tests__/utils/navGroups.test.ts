import { describe, it, expect } from "vitest";
import {
  NAV_ITEMS,
  NAV_GROUPS,
  groupedNavItems,
  visibleNavItems,
} from "../../lib/navItems";

describe("nav grouping", () => {
  it("assigns every item to a known group", () => {
    for (const item of NAV_ITEMS) {
      expect(NAV_GROUPS).toContain(item.group);
    }
  });

  it("buckets visible items in NAV_GROUPS order and drops empty groups", () => {
    // A plain USER sees no share/admin items. "collaborate" survives only
    // because Messages is feature-gated rather than role-gated; "admin"
    // must vanish rather than render an orphaned heading.
    const groups = groupedNavItems(visibleNavItems("USER"));
    expect(groups.map((g) => g.group)).toEqual([
      "inventory",
      "planning",
      "insights",
      "collaborate",
    ]);
    expect(groups[3].items.map((i) => i.key)).toEqual(["messages"]);
    expect(groups[0].items.map((i) => i.key)).toEqual([
      "home",
      "dashboard",
      "articles",
      "warranties",
      "attachments",
      "locations",
    ]);
    for (const g of groups) {
      expect(g.items.length).toBeGreaterThan(0);
      expect(g.items.every((i) => i.group === g.group)).toBe(true);
    }
  });

  it("gives an ADMIN every group, admin last", () => {
    const groups = groupedNavItems(visibleNavItems("ADMIN"));
    expect(groups.map((g) => g.group)).toEqual(NAV_GROUPS);
    expect(groups.at(-1)?.items.map((i) => i.key)).toEqual(["admin"]);
  });

  it("never loses or duplicates an item when grouping", () => {
    const visible = visibleNavItems("ADMIN");
    const flat = groupedNavItems(visible).flatMap((g) => g.items);
    expect(new Set(flat)).toEqual(new Set(visible));
    expect(flat).toHaveLength(visible.length);
  });
});
