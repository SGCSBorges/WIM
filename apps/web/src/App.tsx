/**
 * Top-level app shell + router. Three responsibilities:
 *
 *   • Auth gating — reads `/auth/me` on boot, redirects to login if it
 *     401s. Role (`USER` / `POWER_USER` / `ADMIN`) gates the visible nav
 *     items and route guards.
 *   • Lazy routes — every page-level component is `React.lazy`-loaded so
 *     the initial JS bundle stays small. `Suspense fallback` renders a
 *     skeleton during chunk fetch.
 *   • Error boundary — catches render-time crashes anywhere in the tree
 *     and shows a friendly retry. Network/async errors are surfaced via
 *     useToast inside individual views, not here.
 *
 * The visual chrome (sidebar, top bar, mobile drawer) lives in
 * components/layout/AppShell; this file orchestrates auth + routes.
 */
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
import {
  Loader2,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  PartyPopper,
  X,
} from "lucide-react";
import LoginForm from "./components/auth/LoginForm";
import ForgotPasswordForm from "./components/auth/ForgotPasswordForm";
import ResetPasswordForm from "./components/auth/ResetPasswordForm";
import {
  authAPI,
  billingAPI,
  profileAPI,
  register401Handler,
  unregister401Handler,
} from "./services/api";
import { useI18n } from "./i18n/i18n";
import { useTheme } from "./theme/theme";
import { usePreferences } from "./preferences/preferences";
import InstallPwaButton from "./components/common/InstallPwaButton";
import { RouteFallbackSkeleton } from "./components/common/Skeleton";
import AppShell from "./components/layout/AppShell";
import { useFeature, useFeatures } from "./features/features";

const STRIPE_HOSTS = new Set(["checkout.stripe.com", "billing.stripe.com"]);
function isStripeUrl(url: string): boolean {
  try {
    return STRIPE_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}
import OnboardingChecklist from "./components/onboarding/OnboardingChecklist";
import { Button, Card } from "./components/ui";
import { NAV_ITEMS } from "./lib/navItems";

// Route-level code splitting: each lazy import becomes its own chunk so the
// initial JS bundle only ships the login flow + shell. The rest is fetched
// on first navigation.
const ArticlesTrash = React.lazy(
  () => import("./components/articles/ArticlesTrash")
);
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
const ReportsView = React.lazy(
  () => import("./components/reports/ReportsView")
);
const TransfersView = React.lazy(
  () => import("./components/transfers/TransfersView")
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
    // A ChunkLoadError means a lazy route's JS chunk 404'd — almost always
    // because a new deploy invalidated the old hashed filename. Auto-reload
    // once so the user gets the fresh bundle without a manual refresh.
    if (
      error.name === "ChunkLoadError" ||
      error.message.includes("Failed to fetch dynamically imported module") ||
      error.message.includes("Loading chunk")
    ) {
      window.location.reload();
    }
  }
  render() {
    if (this.state.error) {
      // Outside the I18n provider, so copy stays in English by necessity.
      return (
        <div className="min-h-screen flex items-center justify-center bg-bg p-4">
          <div className="ui-card max-w-md w-full p-8 text-center animate-scale-in">
            <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-danger/15 text-danger">
              <AlertTriangle className="h-6 w-6" />
            </span>
            <h1 className="text-xl font-bold ui-title mb-2">
              Something went wrong
            </h1>
            <p className="text-sm ui-text-muted mb-5">
              {this.state.error.message}
            </p>
            <div className="flex flex-col items-center gap-3">
              <button
                className="ui-btn-primary inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
                onClick={() => {
                  this.setState({ error: null });
                  window.location.reload();
                }}
              >
                Reload
              </button>
              <a
                href="/"
                className="text-sm ui-text-muted hover:ui-title underline"
              >
                Go to home
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** A feature shortcut on the home screen. */
function HomeCard({
  onClick,
  icon: Icon,
  title,
  subtitle,
  cta,
}: {
  onClick: () => void;
  icon: (typeof NAV_ITEMS)[number]["icon"];
  title: string;
  subtitle: string;
  cta: string;
}) {
  return (
    <Card
      as="article"
      interactive
      onClick={onClick}
      className="group flex flex-col"
    >
      <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-primary bg-gradient-brand text-primary-contrast shadow-md">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <h2 className="mb-1 text-lg font-semibold ui-title">{title}</h2>
      <p className="mb-4 flex-1 text-sm ui-text-muted">{subtitle}</p>
      <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
        {cta}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Card>
  );
}

function Home({
  role,
  upgradeError,
  onUpgrade,
}: {
  role: string | null;
  upgradeError: string | null;
  onUpgrade: (plan: "monthly" | "yearly") => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const canShare = useFeature("sharing");
  const iconFor = (key: string) => NAV_ITEMS.find((n) => n.key === key)!.icon;

  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <section className="ui-card relative overflow-hidden !bg-primary bg-gradient-brand p-6 sm:p-8 text-white">
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">
              {t("home.welcomeTitle")}
            </h1>
            <p className="mt-1 max-w-xl text-white/80">
              {t("home.welcomeSubtitle")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/articles")}
              className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white shadow-md backdrop-blur-sm transition hover:bg-white/25"
            >
              {t("home.card.inventory.cta")}
              <ArrowRight className="h-4 w-4" />
            </button>
            <InstallPwaButton />
          </div>
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"
        />
      </section>

      <OnboardingChecklist />

      {/* Upgrade (USER only) */}
      {role === "USER" && (
        <section className="mt-6">
          <Card className="border-l-4 border-l-accent">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-semibold ui-title">
                    {t("home.upgrade.title")}
                  </h2>
                  <p className="text-sm ui-text-muted">
                    {t("home.upgrade.subtitle")}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="accent" onClick={() => onUpgrade("monthly")}>
                  {t("home.upgrade.buyMonthly")}
                </Button>
                <Button variant="accent" onClick={() => onUpgrade("yearly")}>
                  {t("home.upgrade.buyYearly")}
                </Button>
              </div>
            </div>
            {upgradeError && (
              <div className="mt-3 rounded-lg border ui-alert-error px-3 py-2 text-sm ui-text-error">
                {upgradeError}
              </div>
            )}
          </Card>
        </section>
      )}

      {/* Feature shortcuts */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <HomeCard
          onClick={() => navigate("/articles")}
          icon={iconFor("articles")}
          title={t("home.card.inventory.title")}
          subtitle={t("home.card.inventory.subtitle")}
          cta={t("home.card.inventory.cta")}
        />
        <HomeCard
          onClick={() => navigate("/dashboard")}
          icon={iconFor("dashboard")}
          title={t("home.card.dashboard.title")}
          subtitle={t("home.card.dashboard.subtitle")}
          cta={t("home.card.dashboard.cta")}
        />
        <HomeCard
          onClick={() => navigate("/warranties")}
          icon={iconFor("warranties")}
          title={t("home.card.warranties.title")}
          subtitle={t("home.card.warranties.subtitle")}
          cta={t("home.card.warranties.cta")}
        />
        <HomeCard
          onClick={() => navigate("/attachments")}
          icon={iconFor("attachments")}
          title={t("home.card.attachments.title")}
          subtitle={t("home.card.attachments.subtitle")}
          cta={t("home.card.attachments.cta")}
        />
        {canShare && (
          <HomeCard
            onClick={() => navigate("/sharing")}
            icon={iconFor("sharing")}
            title={t("home.card.sharing.title")}
            subtitle={t("home.card.sharing.subtitle")}
            cta={t("home.card.sharing.cta")}
          />
        )}
      </section>
    </div>
  );
}

export default function App() {
  const { t, language, hydrateLanguage } = useI18n();
  const { hydrateTheme } = useTheme();
  const { hydrateDateFormat } = usePreferences();
  const navigate = useNavigate();
  const location = useLocation();

  // 'loading' while we verify the session cookie with /auth/me on mount
  const [authStatus, setAuthStatus] = useState<
    "loading" | "authed" | "unauthed"
  >("loading");
  const [role, setRole] = useState<string | null>(null);
  const canShare = useFeature("sharing");
  const canTransfer = useFeature("transfers");
  const { refresh: refreshFeatures } = useFeatures();
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [upgradeSuccess, setUpgradeSuccess] = useState<string | null>(null);

  // Adopt the account's cross-device UI preferences on sign-in. Hydrate
  // (vs. set) so we don't echo the value straight back to the server.
  const applyServerPrefs = (user: {
    theme?: string | null;
    language?: string | null;
    dateFormat?: string | null;
  }) => {
    if (user.theme) hydrateTheme(user.theme);
    if (user.language) hydrateLanguage(user.language);
    if (user.dateFormat) hydrateDateFormat(user.dateFormat);
  };

  useEffect(() => {
    // Flip to unauthed whenever any API call returns 401 mid-session (e.g.
    // cookie expired). Cleared on unmount so stale closures can't fire after
    // the component is gone.
    register401Handler(() => {
      setAuthStatus("unauthed");
      setRole(null);
    });
    return () => unregister401Handler();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const stripeResult = url.searchParams.get("stripe");

    authAPI
      .getMe()
      .then((user) => {
        setRole(user.role);
        setAuthStatus("authed");
        applyServerPrefs(user);

        if (stripeResult === "success") {
          const previousRole = user.role;
          billingAPI
            .syncFromStripe()
            .then((newRole) => {
              if (newRole) {
                setRole(newRole);
                if (previousRole !== newRole) {
                  // Role change shifts feature access (e.g. sharing/transfers
                  // unlock at POWER_USER) — repopulate the gate map.
                  void refreshFeatures();
                }
                if (previousRole === "USER" && newRole === "POWER_USER") {
                  setUpgradeSuccess(t("billing.upgradeSuccess"));
                }
              }
            })
            .catch((err) => {
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
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = () => {
    profileAPI
      .getMe()
      .then((user) => {
        setRole(user.role);
        applyServerPrefs(user);
        setAuthStatus("authed");
        // The feature map was fetched at mount while still logged out (all
        // false). Re-fetch now that we have a session so gated nav/routes
        // appear without a manual reload.
        void refreshFeatures();
        navigate("/");
      })
      .catch(() => {
        setAuthStatus("unauthed");
      });
  };

  const handleLogout = async () => {
    await authAPI.logout();
    setAuthStatus("unauthed");
    setRole(null);
    // Drop any granted feature access immediately (the next fetch 401s).
    void refreshFeatures();
    navigate("/");
  };

  if (authStatus === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="flex items-center gap-2 ui-text-muted">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          <span className="text-sm">{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  if (authStatus === "unauthed") {
    if (location.pathname === "/auth/forgot") return <ForgotPasswordForm />;
    if (location.pathname === "/auth/reset") return <ResetPasswordForm />;
    return <LoginForm onLogin={handleLogin} />;
  }

  const startUpgrade = async (plan: "monthly" | "yearly") => {
    setUpgradeError(null);
    try {
      const { url } = await billingAPI.createPowerUserCheckoutSession(
        plan,
        language
      );
      if (isStripeUrl(url)) window.location.href = url;
    } catch (e: unknown) {
      setUpgradeError(getErrorMessage(e, t("billing.upgradeStartError")));
    }
  };

  const sharingRoute = canShare ? (
    <div className="space-y-6">
      <MySharedArticlesView />
      <AcceptInviteForm />
      <SharesList />
      <SharedArticlesView />
    </div>
  ) : (
    <Navigate to="/" replace />
  );

  return (
    <AppShell role={role} onLogout={handleLogout}>
      {upgradeSuccess && (
        <div
          className="mb-6 flex items-start justify-between gap-3 rounded-xl border ui-alert-success p-4 animate-slide-up"
          role="status"
        >
          <p className="flex items-center gap-2 text-sm ui-text-success">
            <PartyPopper className="h-4 w-4 shrink-0" aria-hidden="true" />
            {upgradeSuccess}
          </p>
          <button
            type="button"
            onClick={() => setUpgradeSuccess(null)}
            className="ui-text-success hover:opacity-70"
            aria-label={t("common.dismiss")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <Suspense fallback={<RouteFallbackSkeleton />}>
        <Routes>
          <Route
            path="/"
            element={
              <Home
                role={role}
                upgradeError={upgradeError}
                onUpgrade={startUpgrade}
              />
            }
          />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/articles" element={<ArticlesList />} />
          <Route path="/articles/trash" element={<ArticlesTrash />} />
          <Route path="/articles/:id" element={<ArticleDetail />} />
          <Route path="/warranties" element={<WarrantiesView />} />
          <Route path="/attachments" element={<AttachmentsList />} />
          <Route path="/locations" element={<LocationsView />} />
          <Route path="/alerts" element={<AlertsView />} />
          <Route path="/reports" element={<ReportsView />} />
          <Route path="/profile" element={<ProfileView />} />
          <Route path="/sharing" element={sharingRoute} />
          <Route path="/sharing/accept" element={sharingRoute} />
          <Route
            path="/transfers"
            element={
              canTransfer ? <TransfersView /> : <Navigate to="/" replace />
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
    </AppShell>
  );
}
