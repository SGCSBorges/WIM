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
  | "sharing"
  | "transfers"
  | "messages"
  | "admin";

export interface NavItem {
  key: NavKey;
  path: string;
  icon: LucideIcon;
  requires?: "share" | "admin";
  /** When set, the item is hidden unless this feature flag is enabled for
   *  the user (only honored when a feature map is passed to
   *  `visibleNavItems`; falls back to always-visible without one). */
  feature?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "home", path: "/", icon: Home },
  { key: "dashboard", path: "/dashboard", icon: LayoutDashboard },
  { key: "articles", path: "/articles", icon: Package },
  { key: "warranties", path: "/warranties", icon: ShieldCheck },
  { key: "attachments", path: "/attachments", icon: Paperclip },
  { key: "locations", path: "/locations", icon: MapPin },
  { key: "alerts", path: "/alerts", icon: Bell },
  { key: "agenda", path: "/agenda", icon: CalendarClock },
  {
    key: "insurance",
    path: "/insurance",
    icon: Umbrella,
    feature: "insurance",
  },
  {
    key: "wishlist",
    path: "/wishlist",
    icon: Gift,
    feature: "wishlist",
  },
  { key: "reports", path: "/reports", icon: FileText, feature: "reports" },
  {
    key: "analytics",
    path: "/analytics",
    icon: TrendingUp,
    feature: "analytics",
  },
  { key: "sharing", path: "/sharing", icon: Share2, requires: "share" },
  {
    key: "transfers",
    path: "/transfers",
    icon: ArrowRightLeft,
    requires: "share",
  },
  {
    key: "messages",
    path: "/messages",
    icon: MessagesSquare,
    feature: "messaging",
  },
  { key: "admin", path: "/admin", icon: Settings, requires: "admin" },
];

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
