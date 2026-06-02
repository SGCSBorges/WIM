/**
 * Mobile navigation drawer — slide-in from the right with a backdrop. Mirrors
 * the desktop Sidebar's items but with larger touch targets, and owns the
 * a11y choreography (Esc to close, body-scroll lock, focus into the drawer on
 * open and back to the toggle on close). Stays mounted so the transition runs
 * both ways; pointer-events are disabled when closed.
 */
import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { X, LogOut } from "lucide-react";
import { useI18n } from "../../i18n/i18n";
import { visibleNavItems, isActivePath } from "../../lib/navItems";
import LanguageThemeSelector from "../common/LanguageThemeSelector";
import { Button } from "../ui";

export interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  role: string | null;
  onLogout: () => void;
  /** The menu toggle button — focus returns here on close. */
  toggleRef: React.RefObject<HTMLButtonElement | null>;
}

export default function MobileDrawer({
  open,
  onClose,
  role,
  onLogout,
  toggleRef,
}: MobileDrawerProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const firstLinkRef = useRef<HTMLButtonElement | null>(null);
  const items = visibleNavItems(role);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const focusTimer = window.setTimeout(
      () => firstLinkRef.current?.focus(),
      0
    );
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(focusTimer);
      // eslint-disable-next-line react-hooks/exhaustive-deps
      toggleRef.current?.focus();
    };
  }, [open, onClose, toggleRef]);

  return (
    <div
      className={`md:hidden fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <button
        type="button"
        tabIndex={open ? 0 : -1}
        aria-label={t("nav.close")}
        onClick={onClose}
        className={`ui-drawer-backdrop absolute inset-0 h-full w-full ${open ? "open" : ""}`}
      />
      <aside
        id="mobile-nav"
        role="dialog"
        aria-modal="true"
        aria-label={t("nav.menu")}
        className={`ui-drawer absolute top-0 right-0 flex h-full w-72 max-w-[85vw] flex-col shadow-2xl ${open ? "open" : ""}`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b ui-divider px-4">
          <img src="/logo.png" alt="WIM" className="h-8 w-auto" />
          <button
            type="button"
            aria-label={t("nav.close")}
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg ui-btn-ghost"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <nav
          aria-label="Mobile navigation"
          className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-3"
        >
          {items.map((item, i) => {
            const active = isActivePath(item.path, pathname);
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                ref={i === 0 ? firstLinkRef : undefined}
                type="button"
                onClick={() => navigate(item.path)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium transition-colors ${
                  active ? "ui-nav-item-active" : "ui-btn-ghost"
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                {t(`nav.${item.key}`)}
              </button>
            );
          })}
        </nav>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t ui-divider px-3 py-3">
          <LanguageThemeSelector />
          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            leftIcon={<LogOut className="h-4 w-4" />}
          >
            {t("nav.logout")}
          </Button>
        </div>
      </aside>
    </div>
  );
}
