/**
 * Profile page — the user's own account settings, billing, and sharing
 * summary. The big file holds several distinct panels that could each be
 * their own component (refactor candidate, ~1k lines):
 *
 *   • Credentials — email change, password change, currency.
 *   • Notifications — push toggle, email reminders, weekly digest.
 *   • Billing — POWER_USER subscription view, portal link, cancel-at-period
 *     -end indicator (lazy-loaded from billingAPI.getBillingMe).
 *   • Sharing — public shares + per-user invites I sent (lazy-loaded via
 *     `loadSharing` when the section comes into view).
 *   • Data — DataExportPanel sub-component handles CSV/JSON downloads.
 *   • Danger — account deletion with a password tripwire + status-based
 *     redirect (404 = already gone; everything else stays an error).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  User,
  Bell,
  Mail,
  Calendar,
  CreditCard,
  Globe2,
  Smartphone,
  Send,
  Trash2,
  Copy,
  TriangleAlert,
  Lock,
  Users,
  XCircle,
  LogOut,
  Rows3,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  profileAPI,
  billingAPI,
  articlesAPI,
  sharesAPI,
  calendarAPI,
  type BillingSubscription,
  type ShareItem,
  type ShareInviteItem,
} from "../../services/api";
import type { FetchedArticle } from "../../types";

const STRIPE_HOSTS = new Set(["checkout.stripe.com", "billing.stripe.com"]);
function isStripeUrl(url: string): boolean {
  try {
    return STRIPE_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}
import { useI18n } from "../../i18n/i18n";
import { usePreferences } from "../../preferences/preferences";
import { getErrorMessage } from "../../utils/error";
import { useFeature, useFeatures } from "../../features/features";
import { useUpgrade } from "../../features/upgrade";
import {
  pushSupported,
  isPushSubscribed,
  enablePush,
  disablePush,
} from "../../utils/push";
import ArticleThumb from "../articles/ArticleThumb";
import SecuritySection from "./SecuritySection";
import { useToast } from "../common/Toast";
import { Skeleton } from "../common/Skeleton";
import DataExportPanel from "./DataExportPanel";
import {
  PageHeader,
  Section,
  Button,
  Field,
  Input,
  Select,
  Badge,
} from "../ui";

type Me = {
  userId: number;
  email: string;
  role: string;
  currency?: string;
  emailReminders?: boolean;
  weeklyDigest?: boolean;
};

// A small curated list keeps the selector usable; the API accepts any ISO code.
const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "JPY", "BRL"];

function daysFromNow(unixSeconds: number | null): number | null {
  if (!unixSeconds) return null;
  const ms = unixSeconds * 1000 - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function disconnectAndRedirect() {
  window.location.href = "/";
}

export default function ProfileView() {
  const { t, language } = useI18n();
  const { density, setDensity, formatDate: fmtDate } = usePreferences();
  const formatBillingDate = (unixSeconds: number | null) =>
    unixSeconds ? fmtDate(new Date(unixSeconds * 1000)) || "—" : "—";
  const toast = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [subscription, setSubscription] = useState<BillingSubscription | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [calendarUrl, setCalendarUrl] = useState<string | null>(null);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [email, setEmail] = useState("");
  const [currentPasswordForEmail, setCurrentPasswordForEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");

  const [showEmailPw, setShowEmailPw] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showDeletePw, setShowDeletePw] = useState(false);

  // Sharing-panel state. Both lists load lazily after first paint via the
  // same refresh function so unsharing/revoking can refetch in one place.
  const [sharedPublic, setSharedPublic] = useState<FetchedArticle[]>([]);
  const [sharesOwned, setSharesOwned] = useState<ShareItem[]>([]);
  const [invitesSent, setInvitesSent] = useState<ShareInviteItem[]>([]);
  const [sharingLoaded, setSharingLoaded] = useState(false);
  const [sharingBusy, setSharingBusy] = useState<string | null>(null);
  const [showUnshareAllConfirm, setShowUnshareAllConfirm] = useState(false);

  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tracks mount state so the fire-and-forget billing fetch in loadMe doesn't
  // call setState after the component unmounts (user navigates away mid-load).
  const canShare = useFeature("sharing");
  const canCalendarFeed = useFeature("calendar_feed");
  const { loaded: featuresLoaded } = useFeatures();
  const { promptUpgrade } = useUpgrade();
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const showSuccess = useCallback(
    (msg: string) => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      setSuccess(msg);
      successTimerRef.current = setTimeout(() => setSuccess(null), 4000);
      toast.show(msg, { kind: "success" });
    },
    [toast]
  );

  // Surface a submit failure both inline (existing setError) and as a toast
  // so users get immediate feedback even if the inline banner is off-screen.
  const showFailure = useCallback(
    (msg: string) => {
      setError(msg);
      toast.show(msg, { kind: "error" });
    },
    [toast]
  );

  useEffect(
    () => () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    },
    []
  );

  const loadMe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await profileAPI.getMe();
      setMe(data);
      setEmail(data.email);
      // Pull subscription details from the billing endpoint in parallel —
      // it's a separate Stripe round-trip on the server and we don't want
      // to block first paint of the profile on it.
      billingAPI
        .getBillingMe()
        .then((b) => {
          if (mountedRef.current) setSubscription(b.subscription);
        })
        .catch(() => {
          if (mountedRef.current) setSubscription(null);
        });
    } catch (e: unknown) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const updateEmail = async () => {
    setError(null);
    setSaving(true);
    try {
      const updated = await profileAPI.updateEmail(
        email,
        currentPasswordForEmail
      );
      setMe(updated);
      setCurrentPasswordForEmail("");
      showSuccess(t("profile.email.success"));
    } catch (e: unknown) {
      showFailure(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setSaving(false);
    }
  };

  const updatePassword = async () => {
    setError(null);
    setSaving(true);
    try {
      await profileAPI.updatePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      showSuccess(t("profile.password.success"));
    } catch (e: unknown) {
      showFailure(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async () => {
    setError(null);
    setDeleting(true);
    try {
      await profileAPI.deleteAccount(deletePassword);
      disconnectAndRedirect();
    } catch (e: unknown) {
      // Idempotent: a 404 means the account is already gone — treat as
      // success and disconnect. ANY other status (especially 401 "Invalid
      // password") surfaces the error so a typo doesn't silently log the
      // user out. Replaces a pre-round-11 regex on the error message that
      // would have wrongly matched a reworded "Unauthorized" 401.
      const status = (e as { status?: number })?.status;
      if (status === 404) {
        disconnectAndRedirect();
        return;
      }
      showFailure(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const changeCurrency = async (currency: string) => {
    try {
      const updated = await profileAPI.updateCurrency(currency);
      setMe((prev) => (prev ? { ...prev, currency: updated.currency } : prev));
      showSuccess(t("profile.currency.success"));
    } catch (e: unknown) {
      showFailure(getErrorMessage(e, t("common.errorOccurred")));
    }
  };

  const toggleEmailReminders = async (enabled: boolean) => {
    try {
      const updated = await profileAPI.updateEmailReminders(enabled);
      setMe((prev) =>
        prev ? { ...prev, emailReminders: updated.emailReminders } : prev
      );
      showSuccess(t("emailReminders.success"));
    } catch (e: unknown) {
      showFailure(getErrorMessage(e, t("common.errorOccurred")));
    }
  };

  const toggleWeeklyDigest = async (enabled: boolean) => {
    try {
      const updated = await profileAPI.updateWeeklyDigest(enabled);
      setMe((prev) =>
        prev ? { ...prev, weeklyDigest: updated.weeklyDigest } : prev
      );
      showSuccess(t("weeklyDigest.success"));
    } catch (e: unknown) {
      showFailure(getErrorMessage(e, t("common.errorOccurred")));
    }
  };

  useEffect(() => {
    isPushSubscribed()
      .then(setPushOn)
      .catch(() => {});
  }, []);

  useEffect(() => {
    calendarAPI
      .status()
      .then(({ enabled, path }) => {
        setCalendarUrl(enabled && path ? calendarAPI.feedUrl(path) : null);
      })
      .catch(() => {});
  }, []);

  const togglePush = async () => {
    setPushBusy(true);
    try {
      if (pushOn) {
        await disablePush();
        setPushOn(false);
        showSuccess(t("push.disabled"));
      } else {
        const ok = await enablePush();
        setPushOn(ok);
        showSuccess(ok ? t("push.enabled") : t("push.unavailable"));
      }
    } catch (e: unknown) {
      showFailure(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setPushBusy(false);
    }
  };

  const enableCalendar = async () => {
    try {
      const { path } = await calendarAPI.enable();
      setCalendarUrl(calendarAPI.feedUrl(path));
      showSuccess(t("calendar.enabled"));
    } catch (e: unknown) {
      showFailure(getErrorMessage(e, t("common.errorOccurred")));
    }
  };

  const disableCalendar = async () => {
    try {
      await calendarAPI.disable();
      setCalendarUrl(null);
      showSuccess(t("calendar.disabled"));
    } catch (e: unknown) {
      showFailure(getErrorMessage(e, t("common.errorOccurred")));
    }
  };

  const openBillingPortal = async () => {
    setError(null);
    setBillingBusy(true);
    try {
      const { url } = await billingAPI.openPortal(language);
      if (isStripeUrl(url)) window.location.href = url;
    } catch (e: unknown) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setBillingBusy(false);
    }
  };

  const confirmCancelAtPeriodEnd = async () => {
    setError(null);
    setBillingBusy(true);
    setShowCancelConfirm(false);
    try {
      await billingAPI.cancelAtPeriodEnd();
      showSuccess(t("profile.billing.cancelSuccess"));
      await loadMe();
    } catch (e: unknown) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setBillingBusy(false);
    }
  };

  // Sharing-panel data fetch. Pulls all three lists in parallel — none
  // depends on the others, and they're small enough that paginating
  // would add complexity for no real win.
  const loadSharing = useCallback(async () => {
    try {
      const [pub, owned, sent] = await Promise.all([
        articlesAPI.getMySharedPublic(),
        sharesAPI.getOwned(),
        sharesAPI.getSentInvites(),
      ]);
      setSharedPublic(pub);
      setSharesOwned(owned);
      setInvitesSent(sent);
      setSharingLoaded(true);
    } catch {
      // Failure here is non-fatal — the rest of the profile keeps working.
      setSharingLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (canShare) loadSharing();
  }, [canShare, loadSharing]);

  const unshareOne = async (articleId: number) => {
    setSharingBusy(`article:${articleId}`);
    setError(null);
    try {
      await articlesAPI.removeShare(articleId);
      await loadSharing();
    } catch (e: unknown) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setSharingBusy(null);
    }
  };

  const unshareAll = async () => {
    setSharingBusy("unshare-all");
    setShowUnshareAllConfirm(false);
    setError(null);
    try {
      const { count } = await articlesAPI.unshareAll();
      showSuccess(
        t("profile.share.public.unshareAllSuccess").replace(
          "{count}",
          String(count)
        )
      );
      await loadSharing();
    } catch (e: unknown) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setSharingBusy(null);
    }
  };

  const revokeShareWith = async (targetUserId: number) => {
    setSharingBusy(`share:${targetUserId}`);
    setError(null);
    try {
      await sharesAPI.revoke(targetUserId);
      await loadSharing();
    } catch (e: unknown) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setSharingBusy(null);
    }
  };

  const revokeInvite = async (inviteId: number) => {
    setSharingBusy(`invite:${inviteId}`);
    setError(null);
    try {
      await sharesAPI.revokeInvite(inviteId);
      await loadSharing();
    } catch (e: unknown) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setSharingBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton height={32} width="40%" />
        <Skeleton height={120} />
        <Skeleton height={160} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        icon={<User className="h-5 w-5" />}
        title={t("profile.title")}
        subtitle={t("profile.subtitle")}
      />

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl border ui-alert-error p-3 text-sm ui-text-error"
        >
          {error}
        </div>
      )}
      {success && (
        <div
          role="status"
          className="mb-4 rounded-xl border ui-alert-success p-3 text-sm ui-text-success"
        >
          {success}
        </div>
      )}

      <div className="space-y-6">
        {/* Identity / Signed-in-as */}
        <Section
          icon={<User className="h-5 w-5" />}
          title={t("profile.signedInAs")}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p
                className="truncate text-base font-semibold ui-title"
                title={me?.email}
              >
                {me?.email}
              </p>
              <p className="mt-0.5 text-xs ui-text-muted">
                {t("profile.role")}{" "}
                {me?.role && (
                  <Badge
                    tone={
                      me.role === "ADMIN"
                        ? "admin"
                        : me.role === "POWER_USER"
                          ? "power"
                          : "neutral"
                    }
                  >
                    {me.role}
                  </Badge>
                )}
              </p>
            </div>
          </div>
        </Section>

        {/* Preferences: currency */}
        <Section
          icon={<Globe2 className="h-5 w-5" />}
          title={t("profile.currency.title")}
          description={t("profile.currency.subtitle")}
        >
          <Field label={t("profile.currency.title")} htmlFor="profile-currency">
            <Select
              id="profile-currency"
              value={me?.currency ?? "USD"}
              onChange={(e) => changeCurrency(e.target.value)}
              className="max-w-[12rem]"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </Section>

        {/* Appearance: density toggle. Persisted locally (per-device) because
            it's a cosmetic preference; theme / language already sync to the
            account via the global selectors. */}
        <Section
          icon={<Rows3 className="h-5 w-5" />}
          title={t("appearance.title")}
        >
          <div className="flex items-start gap-2 text-sm">
            <input
              id="profile-density"
              type="checkbox"
              checked={density === "compact"}
              onChange={(e) =>
                setDensity(e.target.checked ? "compact" : "comfortable")
              }
              className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
            />
            <label htmlFor="profile-density">
              <span className="block font-medium ui-title">
                {t("appearance.density.label")}
              </span>
              <span className="block text-xs ui-text-muted">
                {t("appearance.density.hint")}
              </span>
            </label>
          </div>
        </Section>

        {/* Calendar feed — hidden when the feature is off, but kept visible
            while a feed is still active so the user can always disable it. */}
        {(canCalendarFeed || calendarUrl) && (
          <Section
            icon={<Calendar className="h-5 w-5" />}
            title={t("calendar.title")}
            description={t("calendar.subtitle")}
          >
            {calendarUrl ? (
              <div className="space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    readOnly
                    value={calendarUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 font-mono text-xs"
                    aria-label={t("calendar.url")}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard
                        ?.writeText(calendarUrl)
                        .then(() => showSuccess(t("calendar.copied")))
                        .catch(() =>
                          toast.show(t("alerts.copyFailed"), { kind: "error" })
                        );
                    }}
                    leftIcon={<Copy className="h-4 w-4" />}
                  >
                    {t("calendar.copy")}
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={disableCalendar}
                  className="text-danger"
                  leftIcon={<XCircle className="h-4 w-4" />}
                >
                  {t("calendar.disable")}
                </Button>
              </div>
            ) : (
              <Button
                onClick={enableCalendar}
                leftIcon={<Calendar className="h-4 w-4" />}
              >
                {t("calendar.enable")}
              </Button>
            )}
          </Section>
        )}

        {/* Locked teaser when calendar feed is a paid feature the user lacks. */}
        {!canCalendarFeed && !calendarUrl && featuresLoaded && (
          <Section
            icon={<Calendar className="h-5 w-5" />}
            title={t("calendar.title")}
            description={t("calendar.subtitle")}
          >
            <Button
              variant="outline"
              onClick={promptUpgrade}
              leftIcon={<Lock className="h-4 w-4" />}
            >
              {t("calendar.enable")}
            </Button>
          </Section>
        )}

        {/* Push notifications */}
        {pushSupported() && (
          <Section
            icon={<Smartphone className="h-5 w-5" />}
            title={t("push.title")}
            description={t("push.subtitle")}
          >
            <Button
              variant={pushOn ? "outline" : "primary"}
              onClick={togglePush}
              loading={pushBusy}
              leftIcon={<Bell className="h-4 w-4" />}
            >
              {pushOn ? t("push.disable") : t("push.enable")}
            </Button>
          </Section>
        )}

        {/* Reminders + weekly digest */}
        <Section
          icon={<Mail className="h-5 w-5" />}
          title={t("emailReminders.title")}
          description={t("emailReminders.subtitle")}
        >
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={me?.emailReminders ?? true}
              onChange={(e) => toggleEmailReminders(e.target.checked)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            {t("emailReminders.toggle")}
          </label>
          <div className="mt-3 border-t ui-divider pt-3">
            <p className="text-sm font-medium ui-title">
              {t("weeklyDigest.title")}
            </p>
            <p className="mt-0.5 mb-2 text-xs ui-text-muted">
              {t("weeklyDigest.subtitle")}
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={me?.weeklyDigest ?? false}
                onChange={(e) => toggleWeeklyDigest(e.target.checked)}
                className="h-4 w-4 accent-[var(--primary)]"
              />
              {t("weeklyDigest.toggle")}
            </label>
          </div>
        </Section>

        {/* Billing (POWER_USER only) */}
        {me?.role === "POWER_USER" && (
          <Section
            icon={<CreditCard className="h-5 w-5" />}
            title={t("profile.subscription.title")}
            description={t("profile.subscription.subtitle")}
          >
            {subscription &&
              (subscription.cancelAtPeriodEnd ||
              subscription.status === "canceled" ? (
                <div className="rounded-lg border ui-alert-warning p-3 text-sm">
                  <p className="flex items-center gap-2 font-medium ui-text-warn">
                    <TriangleAlert
                      className="h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                    {t("profile.billing.cancelScheduled")}
                  </p>
                  <p className="mt-1 ui-text-warn">
                    {t("profile.billing.accessEndsOn")}{" "}
                    <strong>
                      {formatBillingDate(
                        subscription.cancelAt ??
                          subscription.endedAt ??
                          subscription.currentPeriodEnd
                      )}
                    </strong>
                    {(() => {
                      const days = daysFromNow(
                        subscription.cancelAt ??
                          subscription.endedAt ??
                          subscription.currentPeriodEnd
                      );
                      return days !== null
                        ? ` (${t("profile.billing.daysLeft").replace(
                            "{days}",
                            String(days)
                          )}).`
                        : ".";
                    })()}{" "}
                    {t("profile.billing.afterCancelRevert")}
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border ui-divider p-3 text-sm">
                  <p>
                    <span className="ui-text-muted">
                      {t("profile.billing.plan")}:
                    </span>{" "}
                    <strong>
                      {subscription.plan === "yearly"
                        ? t("profile.billing.plan.yearly")
                        : subscription.plan === "monthly"
                          ? t("profile.billing.plan.monthly")
                          : "—"}
                    </strong>
                  </p>
                  <p className="mt-1">
                    <span className="ui-text-muted">
                      {t("profile.billing.nextBilling")}:
                    </span>{" "}
                    <strong>
                      {formatBillingDate(subscription.currentPeriodEnd)}
                    </strong>
                    {(() => {
                      const days = daysFromNow(subscription.currentPeriodEnd);
                      return days !== null ? (
                        <span className="ui-text-muted">
                          {" "}
                          (
                          {t("profile.billing.daysUntil").replace(
                            "{days}",
                            String(days)
                          )}
                          )
                        </span>
                      ) : null;
                    })()}
                  </p>
                </div>
              ))}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                onClick={openBillingPortal}
                loading={billingBusy}
                leftIcon={<CreditCard className="h-4 w-4" />}
              >
                {t("profile.billing.manage")}
              </Button>
              {!subscription?.cancelAtPeriodEnd && (
                <Button
                  variant="outline"
                  onClick={() => setShowCancelConfirm(true)}
                  disabled={billingBusy}
                  title={t("profile.billing.cancelTooltip")}
                  leftIcon={<LogOut className="h-4 w-4" />}
                >
                  {t("profile.billing.cancelAtPeriodEnd")}
                </Button>
              )}
            </div>
            {showCancelConfirm && (
              <div className="mt-3 space-y-2 rounded-lg border ui-alert-warning p-3">
                <p className="text-sm ui-text-warn">
                  {t("profile.billing.cancelTooltip")}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={confirmCancelAtPeriodEnd}>
                    {t("common.yes")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCancelConfirm(false)}
                  >
                    {t("common.no")}
                  </Button>
                </div>
              </div>
            )}
          </Section>
        )}

        {/* "Articles you've shared publicly" */}
        {canShare && (
          <Section
            icon={<Globe2 className="h-5 w-5" />}
            title={t("profile.share.public.title")}
            description={t("profile.share.public.subtitle")}
          >
            {!sharingLoaded ? (
              <Skeleton height={64} />
            ) : sharedPublic.length === 0 ? (
              <p className="text-sm ui-text-muted">
                {t("profile.share.public.empty")}
              </p>
            ) : (
              <ul className="divide-y ui-divider">
                {sharedPublic.map((a) => (
                  <li
                    key={a.articleId}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <ArticleThumb
                      src={a.productImageUrl}
                      alt={a.articleNom}
                      size={40}
                    />
                    <div className="min-w-0 flex-1">
                      <div
                        className="truncate font-medium ui-title"
                        title={a.articleNom}
                      >
                        {a.articleNom}
                      </div>
                      <div
                        className="truncate text-xs ui-text-muted"
                        title={a.articleModele ?? undefined}
                      >
                        {a.articleModele}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => unshareOne(a.articleId)}
                      loading={sharingBusy === `article:${a.articleId}`}
                    >
                      {t("profile.share.public.unshareOne")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {sharedPublic.length > 0 && (
              <div className="mt-3 border-t ui-divider pt-3">
                {showUnshareAllConfirm ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm ui-text-error">
                      {t("profile.share.public.unshareAllConfirm")}
                    </span>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={unshareAll}
                      loading={sharingBusy === "unshare-all"}
                    >
                      {t("common.yes")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowUnshareAllConfirm(false)}
                    >
                      {t("common.no")}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowUnshareAllConfirm(true)}
                    className="text-danger"
                    leftIcon={<XCircle className="h-4 w-4" />}
                  >
                    {t("profile.share.public.unshareAll")}
                  </Button>
                )}
              </div>
            )}
          </Section>
        )}

        {/* "People you've invited" */}
        {canShare && (
          <Section
            icon={<Users className="h-5 w-5" />}
            title={t("profile.share.invited.title")}
            description={t("profile.share.invited.scopeNote")}
          >
            <p className="mt-0.5 text-xs ui-text-muted">
              {t("profile.share.invited.onlyPowerUsersNote")}
            </p>

            {!sharingLoaded ? (
              <Skeleton height={64} className="mt-3" />
            ) : sharesOwned.length === 0 &&
              invitesSent.filter((i) => i.status === "PENDING").length === 0 ? (
              <p className="mt-3 text-sm ui-text-muted">
                {t("profile.share.invited.empty")}
              </p>
            ) : (
              <div className="mt-3 space-y-4">
                {sharesOwned.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-medium ui-text-muted">
                      {t("profile.share.invited.activeHeading")}
                    </h3>
                    <ul className="divide-y ui-divider">
                      {sharesOwned.map((s) => (
                        <li
                          key={s.inventoryShareId}
                          className="flex items-center gap-3 py-2"
                        >
                          <div
                            className="min-w-0 flex-1 truncate font-medium ui-title"
                            title={s.target.email}
                          >
                            {s.target.email}
                          </div>
                          <Badge
                            tone={
                              s.permission === "WRITE" ? "warning" : "success"
                            }
                          >
                            {s.permission}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => revokeShareWith(s.target.userId)}
                            loading={sharingBusy === `share:${s.target.userId}`}
                            className="text-danger"
                            leftIcon={<Trash2 className="h-4 w-4" />}
                          >
                            {t("shares.action.revoke")}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {invitesSent.some((i) => i.status === "PENDING") && (
                  <div>
                    <h3 className="mb-2 text-sm font-medium ui-text-muted">
                      {t("profile.share.invited.pendingHeading")}
                    </h3>
                    <ul className="divide-y ui-divider">
                      {invitesSent
                        .filter((i) => i.status === "PENDING")
                        .map((i) => (
                          <li
                            key={i.shareInviteId}
                            className="flex items-center gap-3 py-2"
                          >
                            <div
                              className="min-w-0 flex-1 truncate font-medium ui-title"
                              title={i.email}
                            >
                              {i.email}
                            </div>
                            <Badge
                              tone={
                                i.permission === "WRITE" ? "warning" : "success"
                              }
                            >
                              {i.permission}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => revokeInvite(i.shareInviteId)}
                              loading={
                                sharingBusy === `invite:${i.shareInviteId}`
                              }
                              className="text-danger"
                              leftIcon={<Trash2 className="h-4 w-4" />}
                            >
                              {t("shares.action.revoke")}
                            </Button>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Section>
        )}

        <DataExportPanel />

        {/* Change email */}
        <Section
          icon={<Mail className="h-5 w-5" />}
          title={t("profile.email.title")}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("profile.email.new")} htmlFor="profile-email-new">
              <Input
                id="profile-email-new"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            </Field>
            <Field
              label={t("profile.email.currentPassword")}
              htmlFor="profile-email-current-password"
            >
              <div className="relative">
                <Input
                  id="profile-email-current-password"
                  value={currentPasswordForEmail}
                  onChange={(e) => setCurrentPasswordForEmail(e.target.value)}
                  type={showEmailPw ? "text" : "password"}
                  autoComplete="current-password"
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowEmailPw((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 ui-text-muted hover:ui-title"
                  aria-label={
                    showEmailPw
                      ? t("auth.hidePassword")
                      : t("auth.showPassword")
                  }
                >
                  {showEmailPw ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </Field>
          </div>
          <div className="mt-3">
            <Button
              onClick={updateEmail}
              loading={saving}
              disabled={!email || !currentPasswordForEmail}
              leftIcon={<Send className="h-4 w-4" />}
            >
              {t("profile.email.save")}
            </Button>
          </div>
        </Section>

        {/* Security: login history + future 2FA / sessions placeholders. */}
        <SecuritySection />

        {/* Change password */}
        <Section
          icon={<Lock className="h-5 w-5" />}
          title={t("profile.password.title")}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t("profile.password.current")}
              htmlFor="profile-password-current"
            >
              <div className="relative">
                <Input
                  id="profile-password-current"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  type={showCurrentPw ? "text" : "password"}
                  autoComplete="current-password"
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPw((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 ui-text-muted hover:ui-title"
                  aria-label={
                    showCurrentPw
                      ? t("auth.hidePassword")
                      : t("auth.showPassword")
                  }
                >
                  {showCurrentPw ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </Field>
            <Field
              label={t("profile.password.new")}
              htmlFor="profile-password-new"
            >
              <div className="relative">
                <Input
                  id="profile-password-new"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  type={showNewPw ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={8}
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 ui-text-muted hover:ui-title"
                  aria-label={
                    showNewPw ? t("auth.hidePassword") : t("auth.showPassword")
                  }
                >
                  {showNewPw ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </Field>
          </div>
          <div className="mt-3">
            <Button
              onClick={updatePassword}
              loading={saving}
              disabled={!currentPassword || !newPassword}
              leftIcon={<Lock className="h-4 w-4" />}
            >
              {t("profile.password.save")}
            </Button>
          </div>
        </Section>

        {/* Danger zone */}
        <section className="ui-card border-l-4 border-l-danger p-5 sm:p-6">
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-danger/15 text-danger">
              <TriangleAlert className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold ui-text-error">
                {t("profile.danger.title")}
              </h2>
              <p className="text-sm ui-text-muted">
                {t("profile.danger.subtitle")}
              </p>
            </div>
          </div>
          <div className="max-w-sm">
            <Field
              label={t("profile.danger.currentPassword")}
              htmlFor="profile-delete-password"
            >
              <div className="relative">
                <Input
                  id="profile-delete-password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  type={showDeletePw ? "text" : "password"}
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowDeletePw((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 ui-text-muted hover:ui-title"
                  aria-label={
                    showDeletePw
                      ? t("auth.hidePassword")
                      : t("auth.showPassword")
                  }
                >
                  {showDeletePw ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </Field>
          </div>
          <div className="mt-3">
            {!showDeleteConfirm ? (
              <Button
                variant="danger"
                onClick={() => setShowDeleteConfirm(true)}
                leftIcon={<Trash2 className="h-4 w-4" />}
              >
                {t("profile.danger.deleteButton")}
              </Button>
            ) : (
              <div
                role="alert"
                className="space-y-2 rounded-lg border ui-alert-error p-3"
              >
                <p className="text-sm ui-text-error">
                  {t("profile.danger.confirm")}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={deleteAccount}
                    loading={deleting}
                  >
                    {t("common.yes")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    {t("common.no")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
