import React, {
  Component,
  ErrorInfo,
  Suspense,
  useEffect,
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
const AlertsView = React.lazy(() => import("./components/alerts/AlertsView"));
const ProfileView = React.lazy(
  () => import("./components/profile/ProfileView")
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
            <h1 className="text-xl font-bold text-red-800 mb-2">
              Something went wrong
            </h1>
            <p className="text-sm text-red-600 mb-4">
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

  // Auto-close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

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
      {navLink("/alerts", t("nav.alerts"))}
      {navLink("/profile", t("nav.profile"))}
      {role === "POWER_USER" && navLink("/sharing", t("nav.sharing"))}
      {role === "ADMIN" && navLink("/admin", t("nav.admin"))}
    </>
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
                type="button"
                aria-label="Toggle navigation"
                aria-expanded={mobileNavOpen}
                aria-controls="mobile-nav"
                onClick={() => setMobileNavOpen((o) => !o)}
                className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-md ui-btn-ghost"
              >
                <span aria-hidden="true">{mobileNavOpen ? "✕" : "☰"}</span>
              </button>
            </div>
          </div>

          {/* Mobile drawer */}
          {mobileNavOpen && (
            <div
              id="mobile-nav"
              className="md:hidden pb-4 pt-2 border-t ui-divider flex flex-col gap-1"
            >
              {primaryNavLinks}
              <div className="mt-3 pt-3 border-t ui-divider flex flex-wrap items-center gap-3 justify-between">
                <LanguageThemeSelector />
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-3 py-2 text-sm ui-btn-ghost rounded-md"
                >
                  {t("nav.logout")}
                </button>
              </div>
            </div>
          )}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {upgradeSuccess && (
          <div
            className="mb-6 border ui-alert-success rounded-lg p-4 flex items-start justify-between gap-3"
            role="status"
          >
            <p className="text-sm text-green-800">🎉 {upgradeSuccess}</p>
            <button
              type="button"
              onClick={() => setUpgradeSuccess(null)}
              className="text-green-700 hover:opacity-70"
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
                          <div className="mt-3 px-3 py-2 rounded-md text-sm border ui-alert-error text-red-700">
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
            <Route path="/warranties" element={<WarrantiesView />} />
            <Route path="/attachments" element={<AttachmentsList />} />
            <Route path="/alerts" element={<AlertsView />} />
            <Route path="/profile" element={<ProfileView />} />
            <Route
              path="/sharing"
              element={
                role === "POWER_USER" ? (
                  <div className="space-y-6">
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
