/**
 * Top bar — a slim sticky header above the content area. On mobile it carries
 * the menu toggle + brand; on desktop it holds the utility cluster (PWA
 * install, language/theme, profile, logout). Primary navigation lives in the
 * Sidebar (desktop) and MobileDrawer (mobile).
 */
import { forwardRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Menu, X, User, LogOut, Search } from "lucide-react";
import { useI18n } from "../../i18n/i18n";
import { useFeature } from "../../features/features";
import { isActivePath } from "../../lib/navItems";
import LanguageThemeSelector from "../common/LanguageThemeSelector";
import InstallPwaButton from "../common/InstallPwaButton";
import NotificationBell from "./NotificationBell";
import { Button } from "../ui";

export interface TopBarProps {
  mobileNavOpen: boolean;
  onToggleMobileNav: () => void;
  onLogout: () => void;
  onOpenSearch: () => void;
  showSearch?: boolean;
}

function modKey(): string {
  return /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
}

const TopBar = forwardRef<HTMLButtonElement, TopBarProps>(function TopBar(
  {
    mobileNavOpen,
    onToggleMobileNav,
    onLogout,
    onOpenSearch,
    showSearch = true,
  },
  toggleRef
) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const profileActive = isActivePath("/profile", pathname);
  const showNotifications = useFeature("notifications");

  return (
    <header className="sticky top-0 z-30 ui-nav border-b ui-divider backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="flex h-16 items-center gap-3 px-3 sm:px-4 lg:px-6">
        {/* Mobile menu toggle */}
        <button
          ref={toggleRef}
          type="button"
          aria-label={mobileNavOpen ? t("nav.close") : t("nav.menu")}
          aria-expanded={mobileNavOpen}
          aria-controls="mobile-nav"
          onClick={onToggleMobileNav}
          className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg ui-btn-ghost"
        >
          {mobileNavOpen ? (
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Menu className="h-5 w-5" aria-hidden="true" />
          )}
        </button>

        {/* Mobile brand */}
        <button
          type="button"
          onClick={() => navigate("/")}
          className="md:hidden flex items-center gap-2"
          aria-label={t("nav.home")}
        >
          <img src="/logo.png" alt="WIM" className="h-8 w-auto" />
        </button>

        <div className="flex-1" />

        {showSearch && (
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label={t("cmdk.open")}
            className="hidden h-10 items-center gap-2 rounded-lg border border-line bg-surface-muted px-3 text-sm ui-text-muted hover:ui-title sm:inline-flex"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            <span className="hidden md:inline">{t("cmdk.open")}</span>
            <span
              aria-hidden="true"
              className="ml-2 hidden rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] ui-title md:inline"
            >
              {modKey()}K
            </span>
          </button>
        )}

        <div className="hidden sm:block">
          <InstallPwaButton />
        </div>
        <div className="hidden lg:block">
          <LanguageThemeSelector />
        </div>

        {showNotifications && <NotificationBell />}

        <button
          type="button"
          onClick={() => navigate("/profile")}
          aria-label={t("nav.profile")}
          title={t("nav.profile")}
          aria-current={profileActive ? "page" : undefined}
          className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${
            profileActive ? "ui-nav-item-active" : "ui-btn-ghost"
          }`}
        >
          <User className="h-5 w-5" aria-hidden="true" />
        </button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onLogout}
          leftIcon={<LogOut className="h-4 w-4" />}
          className="hidden sm:inline-flex"
        >
          {t("nav.logout")}
        </Button>
      </div>
    </header>
  );
});

export default TopBar;
