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

export default function ProfileView() {
  const { t } = useI18n();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      if (!res.ok)
        throw new Error(await getErrorMessage(res, "Failed to delete account"));
      // Log out locally and refresh.
      localStorage.removeItem("token");
      localStorage.removeItem("role");
      window.location.reload();
    } catch (e: any) {
      setError(e?.message || "Failed to delete account");
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
