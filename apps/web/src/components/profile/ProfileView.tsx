import React, { useEffect, useState } from "react";
import { profileAPI, billingAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";

type Me = { userId: number; email: string; role: string };

function disconnectAndRedirect() {
  window.location.href = "/";
}

export default function ProfileView() {
  const { t } = useI18n();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const [email, setEmail] = useState("");
  const [currentPasswordForEmail, setCurrentPasswordForEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 4000);
  };

  const loadMe = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await profileAPI.getMe();
      setMe(data);
      setEmail(data.email);
    } catch (e: any) {
      setError(e?.message || t("common.errorOccurred"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadMe(); }, []);

  const updateEmail = async () => {
    setError(null);
    setSaving(true);
    try {
      const updated = await profileAPI.updateEmail(email, currentPasswordForEmail);
      setMe(updated);
      setCurrentPasswordForEmail("");
      showSuccess(t("profile.email.success"));
    } catch (e: any) {
      setError(e?.message || t("common.errorOccurred"));
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
    } catch (e: any) {
      setError(e?.message || t("common.errorOccurred"));
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async () => {
    setError(null);
    try {
      await profileAPI.deleteAccount(deletePassword);
      disconnectAndRedirect();
    } catch (e: any) {
      const msg: string = e?.message ?? "";
      if (/4(01|04)/.test(msg) || /not found|unauthorized/i.test(msg)) {
        disconnectAndRedirect();
        return;
      }
      setError(msg || t("common.errorOccurred"));
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  const openBillingPortal = async () => {
    setError(null);
    setBillingBusy(true);
    try {
      const { url } = await billingAPI.openPortal();
      window.location.href = url;
    } catch (e: any) {
      setError(e?.message || t("common.errorOccurred"));
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
    } catch (e: any) {
      setError(e?.message || t("common.errorOccurred"));
    } finally {
      setBillingBusy(false);
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
        <div className="bg-red-50 border border-red-200 rounded-lg p-4" role="alert">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4" role="status">
          <p className="text-sm text-green-700">{success}</p>
        </div>
      )}

      <div className="ui-card rounded-xl p-6 space-y-2">
        <div className="text-sm ui-text-muted">{t("profile.signedInAs")}</div>
        <div className="font-medium">{me?.email}</div>
        <div className="text-xs ui-text-muted">{t("profile.role")} {me?.role}</div>
      </div>

      {me?.role === "POWER_USER" && (
        <div className="ui-card rounded-xl p-6 space-y-3">
          <h2 className="font-semibold ui-title">{t("profile.subscription.title")}</h2>
          <p className="text-sm ui-text-muted">{t("profile.subscription.subtitle")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="ui-btn-primary px-4 py-2 rounded"
              onClick={openBillingPortal}
              disabled={billingBusy}
            >
              {billingBusy ? t("common.loading") : t("profile.billing.manage")}
            </button>
            <button
              className="ui-btn-ghost px-4 py-2 rounded border ui-divider"
              onClick={() => setShowCancelConfirm(true)}
              disabled={billingBusy}
              title={t("profile.billing.cancelTooltip")}
            >
              {t("profile.billing.cancelAtPeriodEnd")}
            </button>
          </div>
          {showCancelConfirm && (
            <div className="mt-3 p-3 border border-yellow-300 bg-yellow-50 rounded-lg space-y-2">
              <p className="text-sm text-yellow-800">{t("profile.billing.cancelTooltip")}</p>
              <div className="flex gap-2">
                <button className="ui-btn-primary px-3 py-1 text-sm rounded" onClick={confirmCancelAtPeriodEnd}>{t("common.yes")}</button>
                <button className="ui-btn-ghost px-3 py-1 text-sm rounded border ui-divider" onClick={() => setShowCancelConfirm(false)}>{t("common.no")}</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="ui-card rounded-xl p-6 space-y-4">
        <h2 className="font-semibold ui-title">{t("profile.email.title")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-1">{t("profile.email.new")}</label>
            <input className="w-full ui-input px-3 py-2 rounded" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t("profile.email.currentPassword")}</label>
            <input className="w-full ui-input px-3 py-2 rounded" value={currentPasswordForEmail} onChange={(e) => setCurrentPasswordForEmail(e.target.value)} type="password" required />
          </div>
        </div>
        <button className="ui-btn-primary px-4 py-2 rounded disabled:opacity-60 disabled:cursor-not-allowed" onClick={updateEmail} disabled={saving}>{saving ? t("common.loading") : t("profile.email.save")}</button>
      </div>

      <div className="ui-card rounded-xl p-6 space-y-4">
        <h2 className="font-semibold ui-title">{t("profile.password.title")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-1">{t("profile.password.current")}</label>
            <input className="w-full ui-input px-3 py-2 rounded" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} type="password" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t("profile.password.new")}</label>
            <input className="w-full ui-input px-3 py-2 rounded" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" minLength={8} required />
          </div>
        </div>
        <button className="ui-btn-primary px-4 py-2 rounded disabled:opacity-60 disabled:cursor-not-allowed" onClick={updatePassword} disabled={saving}>{saving ? t("common.loading") : t("profile.password.save")}</button>
      </div>

      <div className="ui-card rounded-xl p-6 space-y-3 border border-red-200">
        <h2 className="font-semibold text-red-600">{t("profile.danger.title")}</h2>
        <p className="text-sm ui-text-muted">{t("profile.danger.subtitle")}</p>
        <div className="max-w-sm">
          <label className="block text-sm font-medium mb-1">{t("profile.danger.currentPassword")}</label>
          <input className="w-full ui-input px-3 py-2 rounded" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} type="password" />
        </div>
        {!showDeleteConfirm ? (
          <button
            className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
            onClick={() => setShowDeleteConfirm(true)}
          >
            {t("profile.danger.deleteButton")}
          </button>
        ) : (
          <div className="p-3 border border-red-300 bg-red-50 rounded-lg space-y-2">
            <p className="text-sm text-red-800">{t("profile.danger.confirm")}</p>
            <div className="flex gap-2">
              <button className="px-3 py-1 text-sm rounded bg-red-600 text-white hover:bg-red-700" onClick={deleteAccount}>{t("common.yes")}</button>
              <button className="ui-btn-ghost px-3 py-1 text-sm rounded border ui-divider" onClick={() => setShowDeleteConfirm(false)}>{t("common.no")}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
