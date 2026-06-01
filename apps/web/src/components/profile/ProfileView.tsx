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
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";
import { isPowerUserOrAdmin } from "../../utils/roles";
import {
  pushSupported,
  isPushSubscribed,
  enablePush,
  disablePush,
} from "../../utils/push";
import ArticleThumb from "../articles/ArticleThumb";
import { useToast } from "../common/Toast";
import DataExportPanel from "./DataExportPanel";

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

function formatDate(unixSeconds: number | null, language: string): string {
  if (!unixSeconds) return "—";
  return new Date(unixSeconds * 1000).toLocaleDateString(language, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

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
      if (/^https?:\/\//i.test(url)) window.location.href = url;
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
    if (isPowerUserOrAdmin(me?.role)) loadSharing();
  }, [me?.role, loadSharing]);

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
      <div className="ui-card rounded-lg p-6">
        <div className="text-sm ui-text-muted">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold ui-title">{t("profile.title")}</h1>
        <p className="text-sm ui-text-muted">{t("profile.subtitle")}</p>
      </div>

      {error && (
        <div className="border ui-alert-error rounded-lg p-4" role="alert">
          <p className="text-sm ui-text-error">{error}</p>
        </div>
      )}
      {success && (
        <div className="border ui-alert-success rounded-lg p-4" role="status">
          <p className="text-sm ui-text-success">{success}</p>
        </div>
      )}

      <div className="ui-card rounded-xl p-6 space-y-2">
        <div className="text-sm ui-text-muted">{t("profile.signedInAs")}</div>
        <div className="font-medium">{me?.email}</div>
        <div className="text-xs ui-text-muted">
          {t("profile.role")} {me?.role}
        </div>
      </div>

      <div className="ui-card rounded-xl p-6 space-y-3">
        <div>
          <h2 className="font-semibold ui-title">
            {t("profile.currency.title")}
          </h2>
          <p className="text-sm ui-text-muted">
            {t("profile.currency.subtitle")}
          </p>
        </div>
        <label htmlFor="profile-currency" className="sr-only">
          {t("profile.currency.title")}
        </label>
        <select
          id="profile-currency"
          value={me?.currency ?? "USD"}
          onChange={(e) => changeCurrency(e.target.value)}
          className="ui-select px-3 py-2 rounded max-w-[12rem]"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="ui-card rounded-xl p-6 space-y-3">
        <div>
          <h2 className="font-semibold ui-title">{t("calendar.title")}</h2>
          <p className="text-sm ui-text-muted">{t("calendar.subtitle")}</p>
        </div>
        {calendarUrl ? (
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                readOnly
                value={calendarUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="ui-input flex-1 px-3 py-2 rounded font-mono text-xs"
                aria-label={t("calendar.url")}
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(calendarUrl)
                    .then(() => showSuccess(t("calendar.copied")))
                    .catch(() => {});
                }}
                className="ui-btn-ghost px-4 py-2 rounded border ui-divider text-sm"
              >
                {t("calendar.copy")}
              </button>
            </div>
            <button
              type="button"
              onClick={disableCalendar}
              className="ui-action-danger text-sm"
            >
              {t("calendar.disable")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={enableCalendar}
            className="ui-btn-primary px-4 py-2 rounded text-sm"
          >
            {t("calendar.enable")}
          </button>
        )}
      </div>

      {pushSupported() && (
        <div className="ui-card rounded-xl p-6 space-y-3">
          <div>
            <h2 className="font-semibold ui-title">{t("push.title")}</h2>
            <p className="text-sm ui-text-muted">{t("push.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={togglePush}
            disabled={pushBusy}
            className={`px-4 py-2 rounded text-sm ${
              pushOn ? "ui-btn-ghost border ui-divider" : "ui-btn-primary"
            }`}
          >
            {pushBusy
              ? t("common.loading")
              : pushOn
                ? t("push.disable")
                : t("push.enable")}
          </button>
        </div>
      )}

      <div className="ui-card rounded-xl p-6 space-y-3">
        <div>
          <h2 className="font-semibold ui-title">
            {t("emailReminders.title")}
          </h2>
          <p className="text-sm ui-text-muted">
            {t("emailReminders.subtitle")}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={me?.emailReminders ?? true}
            onChange={(e) => toggleEmailReminders(e.target.checked)}
          />
          {t("emailReminders.toggle")}
        </label>
        <div className="pt-2 border-t ui-divider">
          <p className="text-sm font-medium ui-title mt-2">
            {t("weeklyDigest.title")}
          </p>
          <p className="text-xs ui-text-muted mb-1">
            {t("weeklyDigest.subtitle")}
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={me?.weeklyDigest ?? false}
              onChange={(e) => toggleWeeklyDigest(e.target.checked)}
            />
            {t("weeklyDigest.toggle")}
          </label>
        </div>
      </div>

      {me?.role === "POWER_USER" && (
        <div className="ui-card rounded-xl p-6 space-y-3">
          <h2 className="font-semibold ui-title">
            {t("profile.subscription.title")}
          </h2>
          <p className="text-sm ui-text-muted">
            {t("profile.subscription.subtitle")}
          </p>

          {/* Status: next billing or end-of-access date */}
          {subscription &&
            (subscription.cancelAtPeriodEnd ||
            subscription.status === "canceled" ? (
              <div className="border ui-alert-warning rounded-md p-3 text-sm">
                <p className="font-medium ui-text-warn">
                  {t("profile.billing.cancelScheduled")}
                </p>
                <p className="ui-text-warn mt-1">
                  {t("profile.billing.accessEndsOn")}{" "}
                  <strong>
                    {formatDate(
                      subscription.cancelAt ??
                        subscription.endedAt ??
                        subscription.currentPeriodEnd,
                      language
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
              <div className="border ui-divider rounded-md p-3 text-sm">
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
                    {formatDate(subscription.currentPeriodEnd, language)}
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

          <div className="flex flex-wrap items-center gap-3">
            <button
              className="ui-btn-primary px-4 py-2 rounded"
              onClick={openBillingPortal}
              disabled={billingBusy}
            >
              {billingBusy ? t("common.loading") : t("profile.billing.manage")}
            </button>
            {!subscription?.cancelAtPeriodEnd && (
              <button
                className="ui-btn-ghost px-4 py-2 rounded border ui-divider"
                onClick={() => setShowCancelConfirm(true)}
                disabled={billingBusy}
                title={t("profile.billing.cancelTooltip")}
              >
                {t("profile.billing.cancelAtPeriodEnd")}
              </button>
            )}
          </div>
          {showCancelConfirm && (
            <div className="mt-3 p-3 border ui-alert-warning rounded-lg space-y-2">
              <p className="text-sm ui-text-warn">
                {t("profile.billing.cancelTooltip")}
              </p>
              <div className="flex gap-2">
                <button
                  className="ui-btn-primary px-3 py-1 text-sm rounded"
                  onClick={confirmCancelAtPeriodEnd}
                >
                  {t("common.yes")}
                </button>
                <button
                  className="ui-btn-ghost px-3 py-1 text-sm rounded border ui-divider"
                  onClick={() => setShowCancelConfirm(false)}
                >
                  {t("common.no")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* "Articles you've shared publicly" — share-capable roles (POWER_USER
          or ADMIN). Lists every article the user flipped
          sharedWithPowerUsers=true on, with a per-row Unshare and a single
          Unshare-all kill switch. */}
      {isPowerUserOrAdmin(me?.role) && (
        <div className="ui-card rounded-xl p-6 space-y-3">
          <div>
            <h2 className="font-semibold ui-title">
              {t("profile.share.public.title")}
            </h2>
            <p className="text-sm ui-text-muted">
              {t("profile.share.public.subtitle")}
            </p>
          </div>

          {!sharingLoaded ? (
            <p className="text-sm ui-text-muted">{t("common.loading")}</p>
          ) : sharedPublic.length === 0 ? (
            <p className="text-sm ui-text-muted">
              {t("profile.share.public.empty")}
            </p>
          ) : (
            <ul className="divide-y ui-divider">
              {sharedPublic.map((a) => (
                <li key={a.articleId} className="flex items-center gap-3 py-3">
                  <ArticleThumb
                    src={a.productImageUrl}
                    alt={a.articleNom}
                    size={40}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{a.articleNom}</div>
                    <div className="text-xs ui-text-muted truncate">
                      {a.articleModele}
                    </div>
                  </div>
                  <button
                    onClick={() => unshareOne(a.articleId)}
                    disabled={sharingBusy === `article:${a.articleId}`}
                    className="ui-btn-ghost px-3 py-1.5 text-sm rounded border ui-divider"
                  >
                    {sharingBusy === `article:${a.articleId}`
                      ? t("common.loading")
                      : t("profile.share.public.unshareOne")}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {sharedPublic.length > 0 && (
            <div className="pt-3 border-t ui-divider">
              {showUnshareAllConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm ui-text-error">
                    {t("profile.share.public.unshareAllConfirm")}
                  </span>
                  <button
                    onClick={unshareAll}
                    disabled={sharingBusy === "unshare-all"}
                    className="ui-btn-danger px-3 py-1.5 text-sm rounded"
                  >
                    {sharingBusy === "unshare-all"
                      ? t("common.loading")
                      : t("common.yes")}
                  </button>
                  <button
                    onClick={() => setShowUnshareAllConfirm(false)}
                    className="ui-btn-ghost px-3 py-1.5 text-sm rounded border ui-divider"
                  >
                    {t("common.no")}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowUnshareAllConfirm(true)}
                  className="ui-action-danger text-sm"
                >
                  {t("profile.share.public.unshareAll")}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* "People you've invited" — share-capable roles (POWER_USER or ADMIN).
          Merges the active per-user shares (InventoryShare with active=true)
          and the still-pending invites (ShareInvite with status=PENDING) so
          the user can see exactly who can reach their inventory and revoke
          from one place. */}
      {isPowerUserOrAdmin(me?.role) && (
        <div className="ui-card rounded-xl p-6 space-y-4">
          <div>
            <h2 className="font-semibold ui-title">
              {t("profile.share.invited.title")}
            </h2>
            <p className="text-sm ui-text-muted">
              {t("profile.share.invited.scopeNote")}
            </p>
            <p className="text-xs ui-text-muted mt-1">
              {t("profile.share.invited.onlyPowerUsersNote")}
            </p>
          </div>

          {!sharingLoaded ? (
            <p className="text-sm ui-text-muted">{t("common.loading")}</p>
          ) : sharesOwned.length === 0 &&
            invitesSent.filter((i) => i.status === "PENDING").length === 0 ? (
            <p className="text-sm ui-text-muted">
              {t("profile.share.invited.empty")}
            </p>
          ) : (
            <div className="space-y-4">
              {sharesOwned.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-2 ui-text-muted">
                    {t("profile.share.invited.activeHeading")}
                  </h3>
                  <ul className="divide-y ui-divider">
                    {sharesOwned.map((s) => (
                      <li
                        key={s.inventoryShareId}
                        className="flex items-center gap-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">
                            {s.target.email}
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${
                            s.permission === "WRITE"
                              ? "ui-badge-warning"
                              : "ui-badge-success"
                          }`}
                        >
                          {s.permission}
                        </span>
                        <button
                          onClick={() => revokeShareWith(s.target.userId)}
                          disabled={sharingBusy === `share:${s.target.userId}`}
                          className="ui-action-danger text-sm"
                        >
                          {sharingBusy === `share:${s.target.userId}`
                            ? t("common.loading")
                            : t("shares.action.revoke")}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {invitesSent.some((i) => i.status === "PENDING") && (
                <div>
                  <h3 className="text-sm font-medium mb-2 ui-text-muted">
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
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate">
                              {i.email}
                            </div>
                          </div>
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${
                              i.permission === "WRITE"
                                ? "ui-badge-warning"
                                : "ui-badge-success"
                            }`}
                          >
                            {i.permission}
                          </span>
                          <button
                            onClick={() => revokeInvite(i.shareInviteId)}
                            disabled={
                              sharingBusy === `invite:${i.shareInviteId}`
                            }
                            className="ui-action-danger text-sm"
                          >
                            {sharingBusy === `invite:${i.shareInviteId}`
                              ? t("common.loading")
                              : t("shares.action.revoke")}
                          </button>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <DataExportPanel />

      <div className="ui-card rounded-xl p-6 space-y-4">
        <h2 className="font-semibold ui-title">{t("profile.email.title")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="profile-email-new"
              className="block text-sm font-medium mb-1"
            >
              {t("profile.email.new")}
            </label>
            <input
              id="profile-email-new"
              className="w-full ui-input px-3 py-2 rounded"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              required
            />
          </div>
          <div>
            <label
              htmlFor="profile-email-current-password"
              className="block text-sm font-medium mb-1"
            >
              {t("profile.email.currentPassword")}
            </label>
            <input
              id="profile-email-current-password"
              className="w-full ui-input px-3 py-2 rounded"
              value={currentPasswordForEmail}
              onChange={(e) => setCurrentPasswordForEmail(e.target.value)}
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
        </div>
        <button
          className="ui-btn-primary px-4 py-2 rounded"
          onClick={updateEmail}
          disabled={saving || !email || !currentPasswordForEmail}
        >
          {saving ? t("common.loading") : t("profile.email.save")}
        </button>
      </div>

      <div className="ui-card rounded-xl p-6 space-y-4">
        <h2 className="font-semibold ui-title">
          {t("profile.password.title")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="profile-password-current"
              className="block text-sm font-medium mb-1"
            >
              {t("profile.password.current")}
            </label>
            <input
              id="profile-password-current"
              className="w-full ui-input px-3 py-2 rounded"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <div>
            <label
              htmlFor="profile-password-new"
              className="block text-sm font-medium mb-1"
            >
              {t("profile.password.new")}
            </label>
            <input
              id="profile-password-new"
              className="w-full ui-input px-3 py-2 rounded"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
        </div>
        <button
          className="ui-btn-primary px-4 py-2 rounded"
          onClick={updatePassword}
          disabled={saving || !currentPassword || !newPassword}
        >
          {saving ? t("common.loading") : t("profile.password.save")}
        </button>
      </div>

      <div className="ui-card rounded-xl p-6 space-y-3 border border-red-200">
        <h2 className="font-semibold ui-text-error">
          {t("profile.danger.title")}
        </h2>
        <p className="text-sm ui-text-muted">{t("profile.danger.subtitle")}</p>
        <div className="max-w-sm">
          <label
            htmlFor="profile-delete-password"
            className="block text-sm font-medium mb-1"
          >
            {t("profile.danger.currentPassword")}
          </label>
          <input
            id="profile-delete-password"
            className="w-full ui-input px-3 py-2 rounded"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            type="password"
            autoComplete="current-password"
          />
        </div>
        {!showDeleteConfirm ? (
          <button
            className="px-4 py-2 rounded ui-btn-danger"
            onClick={() => setShowDeleteConfirm(true)}
          >
            {t("profile.danger.deleteButton")}
          </button>
        ) : (
          <div className="p-3 border ui-alert-error rounded-lg space-y-2">
            <p className="text-sm ui-text-error">
              {t("profile.danger.confirm")}
            </p>
            <div className="flex gap-2">
              <button
                className="px-3 py-1 text-sm rounded ui-btn-danger"
                onClick={deleteAccount}
                disabled={deleting}
              >
                {deleting ? t("common.loading") : t("common.yes")}
              </button>
              <button
                className="ui-btn-ghost px-3 py-1 text-sm rounded border ui-divider"
                onClick={() => setShowDeleteConfirm(false)}
              >
                {t("common.no")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
