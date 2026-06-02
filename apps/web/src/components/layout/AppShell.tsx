/**
 * AppShell — the authenticated chrome: skip link, desktop Sidebar, sticky
 * TopBar, mobile drawer, and the scrollable content area. Owns only layout
 * state (mobile drawer open, sidebar collapsed — the latter persisted). Auth,
 * routing, and Stripe-return handling stay in App.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useI18n } from "../../i18n/i18n";
import OfflineBanner from "../common/OfflineBanner";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import MobileDrawer from "./MobileDrawer";

const COLLAPSE_KEY = "wim.sidebar.collapsed";

export interface AppShellProps {
  role: string | null;
  onLogout: () => void;
  children: React.ReactNode;
}

export default function AppShell({ role, onLogout, children }: AppShellProps) {
  const { t } = useI18n();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem(COLLAPSE_KEY) === "1"
  );
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  // Close the mobile drawer on navigation.
  useEffect(() => setMobileNavOpen(false), [location.pathname]);

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      return !c;
    });

  return (
    <div className="min-h-screen bg-bg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-contrast"
      >
        {t("nav.skipToContent")}
      </a>

      <OfflineBanner />

      <div className="flex">
        <Sidebar
          role={role}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            ref={toggleRef}
            mobileNavOpen={mobileNavOpen}
            onToggleMobileNav={() => setMobileNavOpen((o) => !o)}
            onLogout={onLogout}
          />
          <main id="main" className="flex-1">
            <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
              {children}
            </div>
          </main>
        </div>
      </div>

      <MobileDrawer
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        role={role}
        onLogout={onLogout}
        toggleRef={toggleRef}
      />
    </div>
  );
}
