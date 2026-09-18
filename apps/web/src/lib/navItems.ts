/**
 * Primary navigation model — one source of truth for the sidebar, the mobile
 * drawer, and the home cards. Labels resolve via `t("nav.<key>")`; icons are
 * lucide components. `requires` gates visibility on the role hierarchy.
 */
import {
  Home,
  LayoutDashboard,
  Package,
  ShieldCheck,
  Paperclip,
  MapPin,
  MapPinned,
  Bell,
  Share2,
  FileText,
  TrendingUp,
  Settings,
  ArrowRightLeft,
  MessagesSquare,
  Umbrella,
  Gift,
  CalendarClock,
  type LucideIcon,
} from "lucide-react";
export type NavKey =
  | "home"
  | "dashboard"
  | "articles"
  | "warranties"
  | "attachments"
  | "locations"
  | "alerts"
  | "agenda"
  | "insurance"
  | "wishlist"
  | "reports"
  | "analytics"
  | "locationValue"
  | "sharing"
  | "transfers"
  | "messages"
  | "admin";

/** Sidebar / drawer sections, in display order. Seventeen flat entries had
 *  become a wall; grouping is what makes "where is Insurance?" answerable
 *  at a glance. Labels resolve via `t("nav.group.<group>")`. */
export type NavGroup =
  | "inventory"
  | "planning"
  | "insights"
  | "collaborate"
  | "admin";
export const NAV_GROUPS: NavGroup[] = [
  "inventory",
  "planning",
  "insights",
  "collaborate",
  "admin",
];

export interface NavItem {
  key: NavKey;
  path: string;
  icon: LucideIcon;
  group: NavGroup;
  requires?: "share" | "admin";
  /** When set, the item is hidden unless this feature flag is enabled for
   *  the user (only honored when a feature map is passed to
   *  `visibleNavItems`; falls back to always-visible without one). */
  feature?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "home", path: "/", icon: Home, group: "inventory" },
  {
    key: "dashboard",
    path: "/dashboard",
    icon: LayoutDashboard,
    group: "inventory",
  },
  { key: "articles", path: "/articles", icon: Package, group: "inventory" },
  {
    key: "warranties",
    path: "/warranties",
    icon: ShieldCheck,
    group: "inventory",
  },
  {
    key: "attachments",
    path: "/attachments",
    icon: Paperclip,
    group: "inventory",
  },
  { key: "locations", path: "/locations", icon: MapPin, group: "inventory" },
  { key: "alerts", path: "/alerts", icon: Bell, group: "planning" },
  { key: "agenda", path: "/agenda", icon: CalendarClock, group: "planning" },
  {
    key: "insurance",
    path: "/insurance",
    icon: Umbrella,
    feature: "insurance",
    group: "planning",
  },
  {
    key: "wishlist",
    path: "/wishlist",
    icon: Gift,
    feature: "wishlist",
    group: "planning",
  },
  {
    key: "reports",
    path: "/reports",
    icon: FileText,
    feature: "reports",
    group: "insights",
  },
  {
    key: "analytics",
    path: "/analytics",
    icon: TrendingUp,
    feature: "analytics",
    group: "insights",
  },
  {
    key: "locationValue",
    path: "/locations/value",
    icon: MapPinned,
    feature: "analytics",
    group: "insights",
  },
  {
    key: "sharing",
    path: "/sharing",
    icon: Share2,
    requires: "share",
    group: "collaborate",
  },
  {
    key: "transfers",
    path: "/transfers",
    icon: ArrowRightLeft,
    requires: "share",
    group: "collaborate",
  },
  {
    key: "messages",
    path: "/messages",
    icon: MessagesSquare,
    feature: "messaging",
    group: "collaborate",
  },
  {
    key: "admin",
    path: "/admin",
    icon: Settings,
    requires: "admin",
    group: "admin",
  },
];

/** The visible items bucketed by group, in NAV_GROUPS order, with empty
 *  groups dropped (a USER has nothing under "collaborate" or "admin"). */
export function groupedNavItems(
  items: NavItem[]
): Array<{ group: NavGroup; items: NavItem[] }> {
  return NAV_GROUPS.map((group) => ({
    group,
    items: items.filter((i) => i.group === group),
  })).filter((g) => g.items.length > 0);
}

export function visibleNavItems(
  role: string | null,
  features?: Record<string, boolean>
): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (item.requires === "share") {
      if (features) {
        const featureKey = item.key === "transfers" ? "transfers" : "sharing";
        return features[featureKey] === true;
      }
      return role === "POWER_USER" || role === "ADMIN";
    }
    if (item.requires === "admin") return role === "ADMIN";
    // Feature-gated items (e.g. reports) hide when the flag is off; without a
    // feature map (pre-load) they stay visible to avoid a flash of empty nav.
    if (item.feature && features) return features[item.feature] === true;
    return true;
  });
}

/** The feature flag a nav item maps to (for the locked-teaser indicator), or
 *  undefined for ungated / role-only items (home, articles, admin, …). */
export function navItemFeatureKey(item: NavItem): string | undefined {
  if (item.feature) return item.feature;
  if (item.requires === "share")
    return item.key === "transfers" ? "transfers" : "sharing";
  return undefined;
}

/** True when `path` is the active section for the current location. The home
 *  route matches exactly; section roots also match their nested routes
 *  (e.g. /articles is active on /articles/123). */
export function isActivePath(path: string, pathname: string): boolean {
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(path + "/");
}
