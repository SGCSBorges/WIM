/**
 * Mobile navigation drawer — slide-in from the right with a backdrop. Mirrors
 * the desktop Sidebar's items but with larger touch targets, and owns the
 * a11y choreography (Esc to close, body-scroll lock, focus into the drawer on
 * open and back to the toggle on close). Stays mounted so the transition runs
 * both ways; pointer-events are disabled when closed.
 */
import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { X, LogOut, Lock } from "lucide-react";
import { useI18n } from "../../i18n/i18n";
import {
  visibleNavItems,
  isActivePath,
  navItemFeatureKey,
} from "../../lib/navItems";
import { useFeatures } from "../../features/features";
import LanguageThemeSelector from "../common/LanguageThemeSelector";
import { Button } from "../ui";

// Same focusable selector Modal.tsx uses for its Tab trap — kept local since
// the drawer's slide-in layout doesn't fit Modal's centered-panel shell.
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

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
  const panelRef = useRef<HTMLElement | null>(null);
  const { features, loaded } = useFeatures();
  const items = visibleNavItems(role);
  const lockedFor = (item: (typeof items)[number]): boolean => {
    if (!loaded) return false;
    const key = navItemFeatureKey(item);
    return key ? features[key as keyof typeof features] === false : false;
  };

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    // Defer focus to the next frame so the drawer is painted and its first
    // link is reliably focusable (a 0ms timeout can fire before layout).
    const focusRaf = requestAnimationFrame(() => firstLinkRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      cancelAnimationFrame(focusRaf);
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
        ref={panelRef}
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
            const locked = lockedFor(item);
            return (
              <button
                key={item.path}
                ref={i === 0 ? firstLinkRef : undefined}
                type="button"
                onClick={() => navigate(item.path)}
                aria-current={active ? "page" : undefined}
                title={locked ? t("upgrade.lockedHint") : undefined}
                className={`flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium transition-colors ${
                  active ? "ui-nav-item-active" : "ui-btn-ghost"
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                {t(`nav.${item.key}`)}
                {locked && (
                  <Lock
                    className="ml-auto h-4 w-4 shrink-0 ui-text-muted"
                    aria-label={t("upgrade.lockedHint")}
                  />
                )}
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
