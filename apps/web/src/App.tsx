import React, { Component, ErrorInfo, useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import ArticlesList from "./components/articles/ArticlesList";
import Dashboard from "./components/dashboard/Dashboard";
import LoginForm from "./components/auth/LoginForm";
import { authAPI, billingAPI, profileAPI } from "./services/api";
import AdminUsers from "./components/admin/AdminUsers";
import WarrantiesView from "./components/warranties/WarrantiesView";
import AttachmentsList from "./components/attachments/AttachmentsList";
import SharesList from "./components/sharing/SharesList";
import SharedArticlesView from "./components/sharing/SharedArticlesView";
import AlertsView from "./components/alerts/AlertsView";
import ProfileView from "./components/profile/ProfileView";
import { useI18n } from "./i18n/i18n";
import { Language } from "./i18n/translations";
import { useTheme, Theme } from "./theme/theme";

interface ErrorBoundaryState { error: Error | null }
export class ErrorBoundary extends Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="max-w-md w-full p-8 bg-red-50 border border-red-200 rounded-lg text-center">
            <h1 className="text-xl font-bold text-red-800 mb-2">Something went wrong</h1>
            <p className="text-sm text-red-600 mb-4">{this.state.error.message}</p>
            <button
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              onClick={() => { this.setState({ error: null }); window.location.reload(); }}
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

export default function App() {
  const { t, language, setLanguage } = useI18n();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  // 'loading' while we verify the session cookie with /auth/me on mount
  const [authStatus, setAuthStatus] = useState<"loading" | "authed" | "unauthed">("loading");
  const [role, setRole] = useState<string | null>(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const stripeResult = url.searchParams.get("stripe");

    authAPI.getMe()
      .then((user) => {
        setRole(user.role);
        setAuthStatus("authed");

        if (stripeResult === "success") {
          billingAPI.refreshRoleFromServer()
            .then((newRole) => { if (newRole) setRole(newRole); })
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
    profileAPI.getMe().then((user) => setRole(user.role)).catch(() => {});
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
      window.location.href = url;
    } catch (e: any) {
      setUpgradeError(e?.message || t("billing.upgradeStartError"));
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

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav aria-label="Main navigation" className="ui-nav shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-semibold">{t("app.title")}</h1>
              <div className="flex space-x-4">
                {navLink("/", t("nav.home"))}
                {navLink("/dashboard", t("nav.dashboard"))}
                {navLink("/articles", t("nav.articles"))}
                {navLink("/warranties", t("nav.warranties"))}
                {navLink("/attachments", t("nav.attachments"))}
                {navLink("/alerts", t("nav.alerts"))}
                {navLink("/profile", t("nav.profile"))}
                {role === "POWER_USER" && navLink("/sharing", t("nav.sharing"))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-xs ui-text-muted">
                {t("nav.language")}
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="ui-select px-2 py-1 rounded-md text-sm"
              >
                <option value="en">English</option>
                <option value="fr">Français</option>
                <option value="pt">Português</option>
              </select>

              <label className="text-xs ui-text-muted">{t("nav.theme")}</label>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as Theme)}
                className="ui-select px-2 py-1 rounded-md text-sm"
              >
                <option value="light">{t("theme.light")}</option>
                <option value="dark">{t("theme.dark")}</option>
                <option value="ocean">{t("theme.ocean")}</option>
              </select>

              {role === "ADMIN" && navLink("/admin", t("nav.admin"))}

              <button
                onClick={handleLogout}
                className="px-3 py-2 text-sm ui-btn-ghost rounded-md"
              >
                {t("nav.logout")}
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
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
                        <div className="mt-3 px-3 py-2 rounded-md text-sm bg-red-50 border border-red-200 text-red-700">
                          {upgradeError}
                        </div>
                      )}
                    </div>
                  </section>
                )}

                <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div
                    className="ui-card rounded-xl p-4 cursor-pointer transition-colors"
                    onClick={() => navigate("/articles")}
                  >
                    <h2 className="font-semibold text-lg mb-2 ui-title">
                      📦 {t("home.card.inventory.title")}
                    </h2>
                    <p className="text-sm ui-text-muted mb-3">
                      {t("home.card.inventory.subtitle")}
                    </p>
                    <button className="ui-btn-primary px-3 py-1 text-sm rounded">
                      {t("home.card.inventory.cta")}
                    </button>
                  </div>
                  <div
                    className="ui-card rounded-xl p-4 cursor-pointer transition-colors"
                    onClick={() => navigate("/dashboard")}
                  >
                    <h2 className="font-semibold text-lg mb-2 ui-title">
                      📊 {t("home.card.dashboard.title")}
                    </h2>
                    <p className="text-sm ui-text-muted mb-3">
                      {t("home.card.dashboard.subtitle")}
                    </p>
                    <button className="ui-btn-primary px-3 py-1 text-sm rounded transition-colors">
                      {t("home.card.dashboard.cta")}
                    </button>
                  </div>

                  <div className="ui-card rounded-xl p-4">
                    <h2 className="font-semibold text-lg mb-2 ui-title">
                      🛡️ {t("home.card.warranties.title")}
                    </h2>
                    <p className="text-sm ui-text-muted mb-3">
                      {t("home.card.warranties.subtitle")}
                    </p>
                    <button
                      onClick={() => navigate("/warranties")}
                      className="ui-btn-primary px-3 py-1 text-sm rounded"
                    >
                      {t("home.card.warranties.cta")}
                    </button>
                  </div>

                  <div
                    className="ui-card rounded-xl p-4 cursor-pointer transition-colors"
                    onClick={() => navigate("/attachments")}
                  >
                    <h2 className="font-semibold text-lg mb-2 ui-title">
                      📎 {t("home.card.attachments.title")}
                    </h2>
                    <p className="text-sm ui-text-muted mb-3">
                      {t("home.card.attachments.subtitle")}
                    </p>
                    <button className="ui-btn-primary px-3 py-1 text-sm rounded transition-colors">
                      {t("home.card.attachments.cta")}
                    </button>
                  </div>

                  {role === "POWER_USER" && (
                    <div
                      className="ui-card rounded-xl p-4 cursor-pointer transition-colors"
                      onClick={() => navigate("/sharing")}
                    >
                      <h2 className="font-semibold text-lg mb-2 ui-title">
                        🤝 {t("home.card.sharing.title")}
                      </h2>
                      <p className="text-sm ui-text-muted mb-3">
                        {t("home.card.sharing.subtitle")}
                      </p>
                      <button className="ui-btn-primary px-3 py-1 text-sm rounded transition-colors">
                        {t("home.card.sharing.cta")}
                      </button>
                    </div>
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
              role === "ADMIN" ? (
                <AdminUsers />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
