import { useState } from "react";
import { Link } from "react-router-dom";
import { authAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";

export default function ForgotPasswordForm() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Whether to show the generic post-submit message (success or unknown email
  // — the API doesn't distinguish, and neither does the UI, to avoid leaking
  // which addresses are registered).
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await authAPI.forgotPassword(email.trim());
      setSubmitted(true);
    } catch (err) {
      setError(getErrorMessage(err, t("common.errorOccurred")));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="ui-card max-w-md w-full p-8 rounded-xl space-y-4">
        <h1 className="text-2xl font-bold ui-title">
          {t("auth.forgot.title")}
        </h1>
        <p className="text-sm ui-text-muted">{t("auth.forgot.subtitle")}</p>

        {submitted ? (
          <>
            <p
              role="status"
              className="ui-alert-success ui-text-success rounded-md p-3 text-sm"
            >
              {t("auth.forgot.success")}
            </p>
            <Link to="/" className="ui-action-primary text-sm hover:underline">
              {t("auth.forgot.backToLogin")}
            </Link>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <label htmlFor="forgot-email" className="block text-sm font-medium">
              {t("auth.email")}
            </label>
            <input
              id="forgot-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="ui-input w-full px-3 py-2 rounded-md"
              placeholder="you@example.com"
            />
            {error && (
              <p className="ui-alert-error ui-text-error rounded-md p-3 text-sm">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting || !email.trim()}
              className="ui-btn-primary w-full py-2 rounded-md"
            >
              {submitting ? t("common.loading") : t("auth.forgot.submit")}
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
