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
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();

  // 'loading' while we verify the session cookie with /auth/me on mount
  const [authStatus, setAuthStatus] = useState<
    "loading" | "authed" | "unauthed"
  >("loading");
  const [role, setRole] = useState<string | null>(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
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
          billingAPI
            .refreshRoleFromServer()
            .then((newRole) => {
              if (newRole) setRole(newRole);
            })
            .catch(() => {})
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
      const { url } = await billingAPI.createPowerUserCheckoutSession(plan);
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
            <h1 className="text-lg sm:text-xl font-semibold whitespace-nowrap">
              {t("app.title")}
            </h1>

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
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
            </div>
          }
        >
          <Routes>
            <Route
              path="/"
              element={
                <div>
                  <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight">
                      {t("home.welcomeTitle")}
                    </h1>
                    <p className="ui-text-muted">{t("home.welcomeSubtitle")}</p>
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
