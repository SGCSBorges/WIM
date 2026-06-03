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
  Settings,
  type LucideIcon,
} from "lucide-react";
import { isPowerUserOrAdmin } from "../utils/roles";

export type NavKey =
  | "home"
  | "dashboard"
  | "articles"
  | "warranties"
  | "attachments"
  | "locations"
  | "alerts"
  | "reports"
  | "sharing"
  | "admin";

export interface NavItem {
  key: NavKey;
  path: string;
  icon: LucideIcon;
  requires?: "share" | "admin";
}

export const NAV_ITEMS: NavItem[] = [
  { key: "home", path: "/", icon: Home },
  { key: "dashboard", path: "/dashboard", icon: LayoutDashboard },
  { key: "articles", path: "/articles", icon: Package },
  { key: "warranties", path: "/warranties", icon: ShieldCheck },
  { key: "attachments", path: "/attachments", icon: Paperclip },
  { key: "locations", path: "/locations", icon: MapPin },
  { key: "alerts", path: "/alerts", icon: Bell },
  { key: "reports", path: "/reports", icon: FileText },
  { key: "sharing", path: "/sharing", icon: Share2, requires: "share" },
  { key: "admin", path: "/admin", icon: Settings, requires: "admin" },
];

export function visibleNavItems(role: string | null): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (item.requires === "share") return isPowerUserOrAdmin(role);
    if (item.requires === "admin") return role === "ADMIN";
    return true;
  });
}

/** True when `path` is the active section for the current location. The home
 *  route matches exactly; section roots also match their nested routes
 *  (e.g. /articles is active on /articles/123). */
export function isActivePath(path: string, pathname: string): boolean {
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(path + "/");
}
