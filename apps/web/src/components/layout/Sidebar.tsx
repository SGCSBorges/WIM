/**
 * Desktop sidebar — persistent primary navigation (md+). Collapses to an
 * icon-rail; the collapsed/expanded choice is owned by AppShell (persisted in
 * localStorage). Active section is derived from the current route.
 */
import { useNavigate, useLocation } from "react-router-dom";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { useI18n } from "../../i18n/i18n";
import { visibleNavItems, isActivePath } from "../../lib/navItems";
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
  const items = visibleNavItems(role);

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
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              title={collapsed ? label : undefined}
              aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                collapsed ? "justify-center" : ""
              } ${active ? "ui-nav-item-active" : "ui-btn-ghost"}`}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              {!collapsed && <span className="truncate">{label}</span>}
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
