import React, { useEffect, useState } from "react";
import { API_BASE_URL } from "../../services/api";
import { useI18n } from "../../i18n/i18n";

type Me = {
  userId: number;
  email: string;
  role: string;
};

async function getErrorMessage(res: Response, fallback: string) {
  try {
    const data = await res.json();
    return data?.error || fallback;
  } catch {
    const text = await res.text().catch(() => "");
    return text || fallback;
  }
}

function disconnectAndRedirect() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("userId");
  // Hard redirect to reset app state.
  window.location.href = "/";
}

export default function ProfileView() {
  const { t } = useI18n();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [billingBusy, setBillingBusy] = useState(false);

  const [email, setEmail] = useState("");
  const [currentPasswordForEmail, setCurrentPasswordForEmail] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [deletePassword, setDeletePassword] = useState("");

  const token = localStorage.getItem("token");

  const loadMe = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/profile/me`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
        },
      });
      if (!res.ok)
        throw new Error(await getErrorMessage(res, "Failed to load profile"));
      const data = (await res.json()) as Me;
      setMe(data);
      setEmail(data.email);
    } catch (e: any) {
      setError(e?.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateEmail = async () => {
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/profile/me/email`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({
          email,
          currentPassword: currentPasswordForEmail,
        }),
      });
      if (!res.ok)
        throw new Error(await getErrorMessage(res, "Failed to update email"));
      const updated = (await res.json()) as Me;
      setMe(updated);
      alert("Email updated");
    } catch (e: any) {
      setError(e?.message || "Failed to update email");
    }
  };

  const updatePassword = async () => {
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/profile/me/password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok)
        throw new Error(
          await getErrorMessage(res, "Failed to update password"),
        );
      await res.json().catch(() => null);
      setCurrentPassword("");
      setNewPassword("");
      alert("Password updated");
    } catch (e: any) {
      setError(e?.message || "Failed to update password");
    }
  };

  const deleteAccount = async () => {
    if (!confirm("This will permanently delete your account. Continue?"))
      return;
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/profile/me`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({ currentPassword: deletePassword }),
      });
      if (res.ok) {
        // Success: API returns 204 No Content.
        disconnectAndRedirect();
        return;
      }

      const msg = await getErrorMessage(res, "Failed to delete account");
      // If the user was deleted but the API returned an error (e.g. partial delete then 500),
      // the next auth-protected calls will fail anyway. In that case, we prefer to
      // disconnect to avoid trapping the user on a broken session.
      if (res.status === 401 || res.status === 404) {
        disconnectAndRedirect();
        return;
      }
      throw new Error(msg);
    } catch (e: any) {
      setError(e?.message || "Failed to delete account");
    }
  };

  const openBillingPortal = async () => {
    setError(null);
    setBillingBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/billing/portal`, {
        method: "POST",
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
        },
      });

      if (!res.ok) {
        throw new Error(await getErrorMessage(res, "Failed to open portal"));
      }

      const data = (await res.json()) as { url?: string };
      if (!data?.url) {
        throw new Error("Portal URL missing");
      }
      window.location.href = data.url;
    } catch (e: any) {
      setError(e?.message || "Failed to open billing portal");
    } finally {
      setBillingBusy(false);
    }
  };

  const cancelAtPeriodEnd = async () => {
    if (!confirm("Cancel your subscription at period end?")) return;

    setError(null);
    setBillingBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/billing/cancel/power-user`, {
        method: "POST",
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
        },
      });

      if (!res.ok) {
        throw new Error(
          await getErrorMessage(res, "Failed to cancel subscription"),
        );
      }

      await res.json().catch(() => null);
      alert(
        "Cancellation scheduled. You'll be downgraded when the period ends.",
      );
      await loadMe();
    } catch (e: any) {
      setError(e?.message || "Failed to cancel subscription");
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
        <h1 className="text-2xl font-bold ui-title">Profile</h1>
        <p className="text-sm ui-text-muted">Manage your account settings.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="ui-card rounded-xl p-6 space-y-2">
        <div className="text-sm ui-text-muted">Signed in as</div>
        <div className="font-medium">{me?.email}</div>
        <div className="text-xs ui-text-muted">Role: {me?.role}</div>
      </div>

      {me?.role === "POWER_USER" && (
        <div className="ui-card rounded-xl p-6 space-y-3">
          <h2 className="font-semibold ui-title">Subscription</h2>
          <p className="text-sm ui-text-muted">
            Manage your subscription, payment method, or cancel at period end.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="ui-btn-primary px-4 py-2 rounded"
              onClick={openBillingPortal}
              disabled={billingBusy}
            >
              {billingBusy ? t("common.loading") : "Manage billing"}
            </button>
            <button
              className="ui-btn-ghost px-4 py-2 rounded border ui-divider"
              onClick={cancelAtPeriodEnd}
              disabled={billingBusy}
              title="Cancels at period end (keeps access until then)"
            >
              {billingBusy ? t("common.loading") : "Cancel at period end"}
            </button>
          </div>
        </div>
      )}

      <div className="ui-card rounded-xl p-6 space-y-4">
        <h2 className="font-semibold ui-title">Change email</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-1">New email</label>
            <input
              className="w-full ui-input px-3 py-2 rounded"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Current password
            </label>
            <input
              className="w-full ui-input px-3 py-2 rounded"
              value={currentPasswordForEmail}
              onChange={(e) => setCurrentPasswordForEmail(e.target.value)}
              type="password"
            />
          </div>
        </div>
        <button
          className="ui-btn-primary px-4 py-2 rounded"
          onClick={updateEmail}
        >
          Save email
        </button>
      </div>

      <div className="ui-card rounded-xl p-6 space-y-4">
        <h2 className="font-semibold ui-title">Change password</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-1">
              Current password
            </label>
            <input
              className="w-full ui-input px-3 py-2 rounded"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              type="password"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              New password
            </label>
            <input
              className="w-full ui-input px-3 py-2 rounded"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              type="password"
              minLength={8}
            />
          </div>
        </div>
        <button
          className="ui-btn-primary px-4 py-2 rounded"
          onClick={updatePassword}
        >
          Save password
        </button>
      </div>

      <div className="ui-card rounded-xl p-6 space-y-3">
        <h2 className="font-semibold" style={{ color: "#dc2626" }}>
          Danger zone
        </h2>
        <p className="text-sm ui-text-muted">
          Delete your account and all your data. This cannot be undone.
        </p>
        <div className="max-w-sm">
          <label className="block text-sm font-medium mb-1">
            Current password
          </label>
          <input
            className="w-full ui-input px-3 py-2 rounded"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            type="password"
          />
        </div>
        <button
          className="px-4 py-2 rounded"
          style={{ background: "#dc2626", color: "white" }}
          onClick={deleteAccount}
        >
          Delete account
        </button>
      </div>
    </div>
  );
}
