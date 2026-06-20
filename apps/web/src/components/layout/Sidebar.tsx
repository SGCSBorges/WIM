/**
 * Desktop sidebar — persistent primary navigation (md+). Collapses to an
 * icon-rail; the collapsed/expanded choice is owned by AppShell (persisted in
 * localStorage). Active section is derived from the current route.
 */
import { useNavigate, useLocation } from "react-router-dom";
import { PanelLeftClose, PanelLeft, Lock } from "lucide-react";
import { useI18n } from "../../i18n/i18n";
import {
  visibleNavItems,
  isActivePath,
  navItemFeatureKey,
} from "../../lib/navItems";
import { useFeatures } from "../../features/features";
import { useMessagesUnread } from "../../messages/unread";
import { Badge } from "../ui";

export interface SidebarProps {
  role: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export default function Sidebar({
  role,
  collapsed,
  onToggleCollapsed,
}: SidebarProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { features, loaded } = useFeatures();
  const { unreadCount } = useMessagesUnread();
  const items = visibleNavItems(role);
  // A visible nav item is "locked" when its feature flag has loaded false —
  // the user can still open it (the route shows an upgrade teaser), so we just
  // badge it rather than hide it, surfacing the paid feature for discovery.
  const lockedFor = (item: (typeof items)[number]): boolean => {
    if (!loaded) return false;
    const key = navItemFeatureKey(item);
    return key ? features[key as keyof typeof features] === false : false;
  };

  return (
    <aside
      className={`hidden md:flex md:flex-col sticky top-0 h-screen shrink-0 border-r ui-divider ui-nav transition-[width] duration-200 ${
        collapsed ? "w-[4.5rem]" : "w-64"
      }`}
    >
      {/* Brand */}
      <div className="flex items-center gap-2 h-16 px-3 border-b ui-divider shrink-0">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
          aria-label={t("nav.home")}
        >
          <img src="/logo.png" alt="WIM" className="h-9 w-auto shrink-0" />
        </button>
        {!collapsed && role === "POWER_USER" && (
          <Badge tone="power" title={t("nav.badge.powerUser.tooltip")}>
            {t("nav.badge.powerUser")}
          </Badge>
        )}
        {!collapsed && role === "ADMIN" && (
          <Badge tone="admin" title={t("nav.badge.admin.tooltip")}>
            {t("nav.badge.admin")}
          </Badge>
        )}
      </div>

      {/* Nav */}
      <nav
        aria-label="Primary"
        className="flex-1 overflow-y-auto px-2 py-3 flex flex-col gap-1"
      >
        {items.map((item) => {
          const active = isActivePath(item.path, pathname);
          const Icon = item.icon;
          const label = t(`nav.${item.key}`);
          const locked = lockedFor(item);
          const unread = item.key === "messages" ? unreadCount : 0;
          const title = collapsed
            ? locked
              ? `${label} — ${t("upgrade.lockedHint")}`
              : label
            : locked
              ? t("upgrade.lockedHint")
              : undefined;
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              title={title}
              aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                collapsed ? "justify-center" : ""
              } ${active ? "ui-nav-item-active" : "ui-btn-ghost"}`}
            >
              <span className="relative shrink-0">
                <Icon className="h-5 w-5" aria-hidden="true" />
                {/* When collapsed there's no room for the count pill — a dot
                    on the icon still signals "you have unread messages". */}
                {collapsed && unread > 0 && (
                  <span
                    className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-[var(--nav-bg,transparent)]"
                    aria-label={t("messages.unread")}
                  />
                )}
              </span>
              {!collapsed && <span className="truncate">{label}</span>}
              {!collapsed && unread > 0 && (
                <span
                  className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-contrast"
                  aria-label={t("messages.unread")}
                >
                  <span aria-hidden="true">{unread > 99 ? "99+" : unread}</span>
                </span>
              )}
              {!collapsed && unread === 0 && locked && (
                <Lock
                  className="ml-auto h-3.5 w-3.5 shrink-0 ui-text-muted"
                  aria-label={t("upgrade.lockedHint")}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t ui-divider p-2 shrink-0">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
          aria-expanded={!collapsed}
          title={collapsed ? t("nav.expand") : t("nav.collapse")}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm ui-btn-ghost ${
            collapsed ? "justify-center" : ""
          }`}
        >
          {collapsed ? (
            <PanelLeft className="h-5 w-5" aria-hidden="true" />
          ) : (
            <>
              <PanelLeftClose className="h-5 w-5" aria-hidden="true" />
              <span>{t("nav.collapse")}</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
