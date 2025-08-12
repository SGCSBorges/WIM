import React, { useEffect, useState } from "react";
import ArticlesList from "./components/articles/ArticlesList";
import Dashboard from "./components/dashboard/Dashboard";
import LoginForm from "./components/auth/LoginForm";
import { authAPI, billingAPI } from "./services/api";
import AdminUsers from "./components/admin/AdminUsers";
import WarrantiesView from "./components/warranties/WarrantiesView";
import AttachmentsList from "./components/attachments/AttachmentsList";
import SharesList from "./components/sharing/SharesList";
import AlertsView from "./components/alerts/AlertsView";
import { useI18n } from "./i18n/i18n";
import { useTheme } from "./theme/theme";

export default function App() {
  const { t, language, setLanguage } = useI18n();
  const { theme, setTheme } = useTheme();

  const [currentView, setCurrentView] = useState<
    | "dashboard"
    | "articles"
    | "home"
    | "admin"
    | "warranties"
    | "attachments"
    | "alerts"
    | "sharing"
  >("home");

  // Real authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return authAPI.isAuthenticated();
  });

  const [role, setRole] = useState(() => authAPI.getRole());

  // If user returns from Stripe, refresh role from backend.
  useEffect(() => {
    const url = new URL(window.location.href);
    const stripeResult = url.searchParams.get("stripe");
    if (stripeResult === "success") {
      billingAPI.refreshRoleFromServer().then((newRole) => {
        setRole(newRole);
        url.searchParams.delete("stripe");
        window.history.replaceState({}, document.title, url.toString());
      });
    }
  }, []);

  // Prevent manual access to gated views.
  useEffect(() => {
    if (currentView === "admin" && role !== "ADMIN") {
      setCurrentView("home");
    }
    if (currentView === "sharing" && role !== "POWER_USER") {
      setCurrentView("home");
    }
  }, [currentView, role]);

  const handleLogin = () => {
    setIsAuthenticated(true);
    setRole(authAPI.getRole());
  };

  const handleLogout = () => {
    authAPI.logout();
    setIsAuthenticated(false);
    setRole(null);
    setCurrentView("home");
  };

  // Login screen
  if (!isAuthenticated) {
    return <LoginForm onLogin={handleLogin} />;
  }

  const startUpgrade = async (plan: "monthly" | "yearly") => {
    try {
      const { url } = await billingAPI.createPowerUserCheckoutSession(plan);
      window.location.href = url;
    } catch (e: any) {
      alert(e?.message || t("billing.upgradeStartError"));
    }
  };

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="ui-nav shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-semibold">{t("app.title")}</h1>
              <div className="flex space-x-4">
                <button
                  onClick={() => setCurrentView("home")}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    currentView === "home"
                      ? "ui-nav-item-active"
                      : "ui-btn-ghost"
                  }`}
                >
                  {t("nav.home")}
                </button>
                <button
                  onClick={() => setCurrentView("dashboard")}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    currentView === "dashboard"
                      ? "ui-nav-item-active"
                      : "ui-btn-ghost"
                  }`}
                >
                  {t("nav.dashboard")}
                </button>
                <button
                  onClick={() => setCurrentView("articles")}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    currentView === "articles"
                      ? "ui-nav-item-active"
                      : "ui-btn-ghost"
                  }`}
                >
                  {t("nav.articles")}
                </button>
                <button
                  onClick={() => setCurrentView("warranties")}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    currentView === "warranties"
                      ? "ui-nav-item-active"
                      : "ui-btn-ghost"
                  }`}
                >
                  {t("nav.warranties")}
                </button>
                <button
                  onClick={() => setCurrentView("attachments")}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    currentView === "attachments"
                      ? "ui-nav-item-active"
                      : "ui-btn-ghost"
                  }`}
                >
                  {t("nav.attachments")}
                </button>
                <button
                  onClick={() => setCurrentView("alerts")}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    currentView === "alerts"
                      ? "ui-nav-item-active"
                      : "ui-btn-ghost"
                  }`}
                >
                  {t("nav.alerts")}
                </button>
                {role === "POWER_USER" && (
                  <button
                    onClick={() => setCurrentView("sharing")}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      currentView === "sharing"
                        ? "ui-nav-item-active"
                        : "ui-btn-ghost"
                    }`}
                  >
                    {t("nav.sharing")}
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-xs ui-text-muted">
                {t("nav.language")}
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as any)}
                className="ui-select px-2 py-1 rounded-md text-sm"
              >
                <option value="en">English</option>
                <option value="fr">Français</option>
                <option value="pt">Português</option>
              </select>

              <label className="text-xs ui-text-muted">{t("nav.theme")}</label>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as any)}
                className="ui-select px-2 py-1 rounded-md text-sm"
              >
                <option value="light">{t("theme.light")}</option>
                <option value="dark">{t("theme.dark")}</option>
                <option value="ocean">{t("theme.ocean")}</option>
              </select>

              {role === "ADMIN" && (
                <button
                  onClick={() => setCurrentView("admin")}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    currentView === "admin"
                      ? "ui-nav-item-active"
                      : "ui-btn-ghost"
                  }`}
                >
                  {t("nav.admin")}
                </button>
              )}

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
        {currentView === "alerts" && <AlertsView />}
        {currentView === "home" && (
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
                </div>
              </section>
            )}

            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div
                className="ui-card rounded-xl p-4 cursor-pointer transition-colors"
                onClick={() => setCurrentView("articles")}
              >
                <h2 className="font-semibold">
                  {t("home.card.inventory.title")}
                </h2>
                <p className="text-sm ui-text-muted">
                  {t("home.card.inventory.subtitle")}
                </p>
                <button className="ui-btn-primary mt-2 px-3 py-1 text-sm rounded">
                  {t("home.card.inventory.cta")}
                </button>
              </div>
              <div
                className="ui-card rounded-xl p-4 cursor-pointer transition-colors"
                onClick={() => setCurrentView("dashboard")}
              >
                <h2 className="font-semibold text-lg mb-2">
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
                <h2 className="font-semibold text-lg mb-2">
                  🛡️ {t("home.card.warranties.title")}
                </h2>
                <p className="text-sm ui-text-muted mb-3">
                  {t("home.card.warranties.subtitle")}
                </p>
                <button
                  onClick={() => setCurrentView("warranties")}
                  className="ui-btn-primary px-3 py-1 text-sm rounded"
                >
                  {t("home.card.warranties.cta")}
                </button>
              </div>

              <div
                className="ui-card rounded-xl p-4 cursor-pointer transition-colors"
                onClick={() => setCurrentView("attachments")}
              >
                <h2 className="font-semibold text-lg mb-2">
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
                  onClick={() => setCurrentView("sharing")}
                >
                  <h2 className="font-semibold text-lg mb-2">
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
        )}

        {currentView === "dashboard" && <Dashboard />}
        {currentView === "articles" && <ArticlesList />}
        {currentView === "admin" && <AdminUsers />}
        {currentView === "warranties" && <WarrantiesView />}
        {currentView === "attachments" && <AttachmentsList />}
        {currentView === "sharing" && <SharesList />}
      </main>
    </div>
  );
}
