/**
 * Reset-password landing form, mounted at /reset-password?token=…. Reads
 * the token from the URL, validates it against the user's password rules
 * (mirroring the API's `passwordSchema`), and POSTs to the reset endpoint.
 * On success the API bumps tokenVersion so every other session of that
 * user is invalidated; the UI redirects to login.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";

export default function ResetPasswordForm() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) setError(t("auth.reset.missingToken"));
  }, [token, t]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (newPassword !== confirm) {
      setError(t("auth.reset.mismatch"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await authAPI.resetPassword(token, newPassword);
      setDone(true);
      // Give the success message a beat, then send them to login.
      setTimeout(() => navigate("/", { replace: true }), 1500);
    } catch (err) {
      setError(getErrorMessage(err, t("common.errorOccurred")));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="ui-card max-w-md w-full p-8 rounded-xl space-y-4">
        <h1 className="text-2xl font-bold ui-title">{t("auth.reset.title")}</h1>
        <p className="text-sm ui-text-muted">{t("auth.reset.subtitle")}</p>

        {done ? (
          <p
            role="status"
            className="ui-alert-success ui-text-success rounded-md p-3 text-sm"
          >
            {t("auth.reset.success")}
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <label htmlFor="reset-new" className="block text-sm font-medium">
              {t("auth.reset.newPassword")}
            </label>
            <input
              id="reset-new"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="ui-input w-full px-3 py-2 rounded-md"
            />
            <label
              htmlFor="reset-confirm"
              className="block text-sm font-medium"
            >
              {t("auth.reset.confirm")}
            </label>
            <input
              id="reset-confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="ui-input w-full px-3 py-2 rounded-md"
            />
            {error && (
              <p className="ui-alert-error ui-text-error rounded-md p-3 text-sm">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting || !token || !newPassword || !confirm}
              className="ui-btn-primary w-full py-2 rounded-md"
            >
              {submitting ? t("common.loading") : t("auth.reset.submit")}
            </button>
            <Link
              to="/"
              className="block text-center text-sm ui-action-primary hover:underline"
            >
              {t("auth.forgot.backToLogin")}
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
