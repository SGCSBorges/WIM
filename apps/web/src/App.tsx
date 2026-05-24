import React, {
  Component,
  ErrorInfo,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import { getErrorMessage } from "./utils/error";
import {
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import LoginForm from "./components/auth/LoginForm";
import { authAPI, billingAPI, profileAPI } from "./services/api";
import { useI18n } from "./i18n/i18n";
import LanguageThemeSelector from "./components/common/LanguageThemeSelector";
import InstallPwaButton from "./components/common/InstallPwaButton";
import { RouteFallbackSkeleton } from "./components/common/Skeleton";

// Route-level code splitting: each lazy import becomes its own chunk so the
// initial JS bundle only ships the login flow + shell. The rest is fetched
// on first navigation.
const ArticlesList = React.lazy(
  () => import("./components/articles/ArticlesList")
);
const ArticleDetail = React.lazy(
  () => import("./components/articles/ArticleDetail")
);
const Dashboard = React.lazy(() => import("./components/dashboard/Dashboard"));
const AdminUsers = React.lazy(() => import("./components/admin/AdminUsers"));
const WarrantiesView = React.lazy(
  () => import("./components/warranties/WarrantiesView")
);
const AttachmentsList = React.lazy(
  () => import("./components/attachments/AttachmentsList")
);
const SharesList = React.lazy(() => import("./components/sharing/SharesList"));
const SharedArticlesView = React.lazy(
  () => import("./components/sharing/SharedArticlesView")
);
const AcceptInviteForm = React.lazy(
  () => import("./components/sharing/AcceptInviteForm")
);
const MySharedArticlesView = React.lazy(
  () => import("./components/sharing/MySharedArticlesView")
);
const AlertsView = React.lazy(() => import("./components/alerts/AlertsView"));
const ProfileView = React.lazy(
  () => import("./components/profile/ProfileView")
);
const LocationsView = React.lazy(
  () => import("./components/locations/LocationsView")
);

interface ErrorBoundaryState {
  error: Error | null;
}
export class ErrorBoundary extends Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="max-w-md w-full p-8 border ui-alert-error rounded-lg text-center">
            <h1 className="text-xl font-bold ui-text-error mb-2">
              Something went wrong
            </h1>
            <p className="text-sm ui-text-error mb-4">
              {this.state.error.message}
            </p>
            <button
              className="px-4 py-2 ui-btn-danger rounded"
              onClick={() => {
                this.setState({ error: null });
                window.location.reload();
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function HomeCard({
  onClick,
  title,
  subtitle,
  cta,
}: {
  onClick: () => void;
  title: string;
  subtitle: string;
  cta: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ui-card rounded-xl p-4 text-left cursor-pointer transition-colors w-full"
    >
      <h2 className="font-semibold text-lg mb-2 ui-title">{title}</h2>
      <p className="text-sm ui-text-muted mb-3">{subtitle}</p>
      <span className="ui-btn-primary inline-block px-3 py-1 text-sm rounded">
        {cta}
      </span>
    </button>
  );
}

export default function App() {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();

  // 'loading' while we verify the session cookie with /auth/me on mount
  const [authStatus, setAuthStatus] = useState<
    "loading" | "authed" | "unauthed"
  >("loading");
  const [role, setRole] = useState<string | null>(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [upgradeSuccess, setUpgradeSuccess] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileToggleRef = useRef<HTMLButtonElement | null>(null);
  const drawerFirstLinkRef = useRef<HTMLButtonElement | null>(null);

  // Auto-close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  // Drawer side-effects: Esc closes, body scroll locks, focus moves into
  // the drawer on open and back to the toggle button on close. Skipped on
  // desktop because the drawer never opens there.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    document.addEventListener("keydown", onKey);

    // Defer focus shift until after the slide-in transition starts so the
    // first link is in the DOM and visible to the focus ring.
    const focusTimer = window.setTimeout(() => {
      drawerFirstLinkRef.current?.focus();
    }, 0);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(focusTimer);
      // Restoring focus to whatever the toggle is at cleanup time is the
      // correct behavior — the button is stable and always mounted, so
      // reading `.current` here is intentional. ESLint's generic warning
      // assumes the ref might point at something unmounted, which doesn't
      // apply here.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      mobileToggleRef.current?.focus();
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const stripeResult = url.searchParams.get("stripe");

    authAPI
      .getMe()
      .then((user) => {
        setRole(user.role);
        setAuthStatus("authed");

        if (stripeResult === "success") {
          // syncFromStripe queries Stripe directly (no webhook dependency)
          // and updates the user's role server-side, then returns the new
          // role. This makes the upgrade visible immediately even when
          // webhook delivery is lagging or not configured.
          const previousRole = user.role;
          billingAPI
            .syncFromStripe()
            .then((newRole) => {
              if (newRole) {
                setRole(newRole);
                // Only celebrate when the sync produced an actual upgrade
                // (USER → POWER_USER). A user landing on ?stripe=success
                // without a real subscription change (refresh, shared URL,
                // already-power-user, admin, etc.) shouldn't see the
                // welcome banner.
                if (previousRole === "USER" && newRole === "POWER_USER") {
                  setUpgradeSuccess(t("billing.upgradeSuccess"));
                }
              }
            })
            .catch((err) => {
              // Surface sync failures so the user isn't stuck on a stale
              // role with no feedback after a real Stripe payment.
              const msg =
                err instanceof Error ? err.message : String(err ?? "");
              setUpgradeError(
                msg || t("billing.upgradeError") || "Subscription sync failed"
              );
            })
            .finally(() => {
              url.searchParams.delete("stripe");
              window.history.replaceState({}, document.title, url.toString());
            });
        } else if (stripeResult === "cancel") {
          url.searchParams.delete("stripe");
          window.history.replaceState({}, document.title, url.toString());
        }
      })
      .catch(() => {
        setAuthStatus("unauthed");
      });
    // Run once on mount: this kicks off the session check + Stripe-return
    // handling. We intentionally don't re-run when t/language change — the
    // success copy is fine in whatever language is active at landing time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = () => {
    // Role was cached in _cachedRole by authAPI.login/register; read it back
    // then re-verify with server to get the authoritative value
    profileAPI
      .getMe()
      .then((user) => setRole(user.role))
      .catch(() => {});
    setAuthStatus("authed");
    navigate("/");
  };

  const handleLogout = async () => {
    await authAPI.logout();
    setAuthStatus("unauthed");
    setRole(null);
    navigate("/");
  };

  if (authStatus === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm ui-text-muted animate-pulse">Loading…</div>
      </div>
    );
  }

  if (authStatus === "unauthed") {
    return <LoginForm onLogin={handleLogin} />;
  }

  const startUpgrade = async (plan: "monthly" | "yearly") => {
    setUpgradeError(null);
    try {
      const { url } = await billingAPI.createPowerUserCheckoutSession(
        plan,
        language
      );
      if (/^https?:\/\//i.test(url)) window.location.href = url;
    } catch (e: unknown) {
      setUpgradeError(getErrorMessage(e, t("billing.upgradeStartError")));
    }
  };

  const navLink = (path: string, label: string) => (
    <button
      onClick={() => navigate(path)}
      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        location.pathname === path ? "ui-nav-item-active" : "ui-btn-ghost"
      }`}
    >
      {label}
    </button>
  );

  const primaryNavLinks = (
    <>
      {navLink("/", t("nav.home"))}
      {navLink("/dashboard", t("nav.dashboard"))}
      {navLink("/articles", t("nav.articles"))}
      {navLink("/warranties", t("nav.warranties"))}
      {navLink("/attachments", t("nav.attachments"))}
      {navLink("/locations", t("nav.locations"))}
      {navLink("/alerts", t("nav.alerts"))}
      {navLink("/profile", t("nav.profile"))}
      {role === "POWER_USER" && navLink("/sharing", t("nav.sharing"))}
      {role === "ADMIN" && navLink("/admin", t("nav.admin"))}
    </>
  );

  // Drawer-specific list: larger touch targets, full-width rows. The first
  // link is attached to a ref so we can move focus there when the drawer
  // opens (the toggle button takes focus back on close, in the effect above).
  const drawerLinks: { path: string; label: string; show: boolean }[] = [
    { path: "/", label: t("nav.home"), show: true },
    { path: "/dashboard", label: t("nav.dashboard"), show: true },
    { path: "/articles", label: t("nav.articles"), show: true },
    { path: "/warranties", label: t("nav.warranties"), show: true },
    { path: "/attachments", label: t("nav.attachments"), show: true },
    { path: "/locations", label: t("nav.locations"), show: true },
    { path: "/alerts", label: t("nav.alerts"), show: true },
    { path: "/profile", label: t("nav.profile"), show: true },
    {
      path: "/sharing",
      label: t("nav.sharing"),
      show: role === "POWER_USER",
    },
    { path: "/admin", label: t("nav.admin"), show: role === "ADMIN" },
  ].filter((l) => l.show);

  const drawerRow = (path: string, label: string, isFirst: boolean) => (
    <button
      key={path}
      ref={isFirst ? drawerFirstLinkRef : undefined}
      onClick={() => navigate(path)}
      className={`block w-full text-left px-4 py-3 rounded-md text-base font-medium transition-colors ${
        location.pathname === path ? "ui-nav-item-active" : "ui-btn-ghost"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav aria-label="Main navigation" className="ui-nav shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center gap-3 h-16">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              aria-label={t("nav.home")}
            >
              <img
                src="/logo.png"
                alt="WIM — Warranty & Inventory Manager"
                className="h-8 sm:h-10 w-auto"
              />
              {role === "POWER_USER" && (
                <span
                  className="text-[10px] tracking-wide font-bold uppercase px-1.5 py-0.5 rounded ui-badge-power"
                  title={t("nav.badge.powerUser.tooltip")}
                >
                  {t("nav.badge.powerUser")}
                </span>
              )}
              {role === "ADMIN" && (
                <span
                  className="text-[10px] tracking-wide font-bold uppercase px-1.5 py-0.5 rounded ui-badge-admin"
                  title={t("nav.badge.admin.tooltip")}
                >
                  {t("nav.badge.admin")}
                </span>
              )}
            </button>

            {/* Desktop links — hidden on mobile, scrollable on medium */}
            <div className="hidden md:flex flex-1 items-center justify-center gap-1 lg:gap-2 overflow-x-auto">
              {primaryNavLinks}
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden lg:block">
                <LanguageThemeSelector />
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="hidden md:inline-flex px-3 py-2 text-sm ui-btn-ghost rounded-md"
              >
                {t("nav.logout")}
              </button>

              {/* Mobile menu toggle */}
              <button
                ref={mobileToggleRef}
                type="button"
                aria-label={
                  mobileNavOpen ? "Close navigation" : "Open navigation"
                }
                aria-expanded={mobileNavOpen}
                aria-controls="mobile-nav"
                onClick={() => setMobileNavOpen((o) => !o)}
                className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-md ui-btn-ghost"
              >
                <span aria-hidden="true" className="text-xl leading-none">
                  {mobileNavOpen ? "✕" : "☰"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile drawer — slide-in from right with backdrop. Rendered outside
          the <nav> so it can cover the full viewport height. The element
          stays mounted in the DOM so the transition runs in both
          directions; pointer-events are disabled when closed so it never
          intercepts clicks behind it. */}
      <div
        className={`md:hidden fixed inset-0 z-50 ${
          mobileNavOpen ? "" : "pointer-events-none"
        }`}
        aria-hidden={!mobileNavOpen}
      >
        <button
          type="button"
          tabIndex={mobileNavOpen ? 0 : -1}
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
          className={`ui-drawer-backdrop absolute inset-0 w-full h-full ${
            mobileNavOpen ? "open" : ""
          }`}
        />
        <aside
          id="mobile-nav"
          role="dialog"
          aria-modal="true"
          aria-label={t("nav.home")}
          className={`ui-drawer absolute top-0 right-0 h-full w-72 max-w-[85vw] shadow-2xl flex flex-col ${
            mobileNavOpen ? "open" : ""
          }`}
        >
          <div className="flex items-center justify-between px-4 h-16 border-b ui-divider shrink-0">
            <img src="/logo.png" alt="WIM" className="h-8 w-auto" />
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setMobileNavOpen(false)}
              className="inline-flex items-center justify-center w-10 h-10 rounded-md ui-btn-ghost"
            >
              <span aria-hidden="true" className="text-xl leading-none">
                ✕
              </span>
            </button>
          </div>
          <nav
            aria-label="Mobile navigation"
            className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-1"
          >
            {drawerLinks.map((l, i) => drawerRow(l.path, l.label, i === 0))}
          </nav>
          <div className="px-3 py-3 border-t ui-divider flex flex-wrap items-center gap-3 justify-between shrink-0">
            <LanguageThemeSelector />
            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-2 text-sm ui-btn-ghost rounded-md"
            >
              {t("nav.logout")}
            </button>
          </div>
        </aside>
      </div>

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {upgradeSuccess && (
          <div
            className="mb-6 border ui-alert-success rounded-lg p-4 flex items-start justify-between gap-3"
            role="status"
          >
            <p className="text-sm ui-text-success">🎉 {upgradeSuccess}</p>
            <button
              type="button"
              onClick={() => setUpgradeSuccess(null)}
              className="ui-text-success hover:opacity-70"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        <Suspense fallback={<RouteFallbackSkeleton />}>
          <Routes>
            <Route
              path="/"
              element={
                <div>
                  <header className="mb-8 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h1 className="text-3xl font-bold tracking-tight">
                        {t("home.welcomeTitle")}
                      </h1>
                      <p className="ui-text-muted">
                        {t("home.welcomeSubtitle")}
                      </p>
                    </div>
                    <InstallPwaButton />
                  </header>

                  {role === "USER" && (
                    <section className="mb-8">
                      <div className="ui-card rounded-xl p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div>
                            <h2 className="font-semibold">
                              {t("home.upgrade.title")}
                            </h2>
                            <p className="text-sm ui-text-muted">
                              {t("home.upgrade.subtitle")}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => startUpgrade("monthly")}
                              className="ui-btn-primary px-4 py-2 text-sm rounded"
                            >
                              {t("home.upgrade.buyMonthly")}
                            </button>
                            <button
                              onClick={() => startUpgrade("yearly")}
                              className="ui-btn-primary px-4 py-2 text-sm rounded"
                            >
                              {t("home.upgrade.buyYearly")}
                            </button>
                          </div>
                        </div>
                        {upgradeError && (
                          <div className="mt-3 px-3 py-2 rounded-md text-sm border ui-alert-error ui-text-error">
                            {upgradeError}
                          </div>
                        )}
                      </div>
                    </section>
                  )}

                  <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <HomeCard
                      onClick={() => navigate("/articles")}
                      title={`📦 ${t("home.card.inventory.title")}`}
                      subtitle={t("home.card.inventory.subtitle")}
                      cta={t("home.card.inventory.cta")}
                    />
                    <HomeCard
                      onClick={() => navigate("/dashboard")}
                      title={`📊 ${t("home.card.dashboard.title")}`}
                      subtitle={t("home.card.dashboard.subtitle")}
                      cta={t("home.card.dashboard.cta")}
                    />
                    <HomeCard
                      onClick={() => navigate("/warranties")}
                      title={`🛡️ ${t("home.card.warranties.title")}`}
                      subtitle={t("home.card.warranties.subtitle")}
                      cta={t("home.card.warranties.cta")}
                    />
                    <HomeCard
                      onClick={() => navigate("/attachments")}
                      title={`📎 ${t("home.card.attachments.title")}`}
                      subtitle={t("home.card.attachments.subtitle")}
                      cta={t("home.card.attachments.cta")}
                    />
                    {role === "POWER_USER" && (
                      <HomeCard
                        onClick={() => navigate("/sharing")}
                        title={`🤝 ${t("home.card.sharing.title")}`}
                        subtitle={t("home.card.sharing.subtitle")}
                        cta={t("home.card.sharing.cta")}
                      />
                    )}
                  </section>
                </div>
              }
            />

            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/articles" element={<ArticlesList />} />
            <Route path="/articles/:id" element={<ArticleDetail />} />
            <Route path="/warranties" element={<WarrantiesView />} />
            <Route path="/attachments" element={<AttachmentsList />} />
            <Route path="/locations" element={<LocationsView />} />
            <Route path="/alerts" element={<AlertsView />} />
            <Route path="/profile" element={<ProfileView />} />
            <Route
              path="/sharing"
              element={
                role === "POWER_USER" ? (
                  <div className="space-y-6">
                    <MySharedArticlesView />
                    <AcceptInviteForm />
                    <SharesList />
                    <SharedArticlesView />
                  </div>
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/sharing/accept"
              element={
                role === "POWER_USER" ? (
                  <div className="space-y-6">
                    <MySharedArticlesView />
                    <AcceptInviteForm />
                    <SharesList />
                    <SharedArticlesView />
                  </div>
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/admin"
              element={
                role === "ADMIN" ? <AdminUsers /> : <Navigate to="/" replace />
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
