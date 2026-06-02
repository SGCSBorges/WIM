/**
 * Reset-password landing form, mounted at /reset-password?token=…. Reads
 * the token from the URL, validates it against the user's password rules
 * (mirroring the API's `passwordSchema`), and POSTs to the reset endpoint.
 * On success the API bumps tokenVersion so every other session of that
 * user is invalidated; the UI redirects to login.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Lock, CheckCircle2, ArrowLeft } from "lucide-react";
import { authAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";
import { Button, Field, Input } from "../ui";

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
      setTimeout(() => navigate("/", { replace: true }), 1500);
    } catch (err) {
      setError(getErrorMessage(err, t("common.errorOccurred")));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="ui-card w-full max-w-md space-y-5 p-8 animate-scale-in">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-brand text-primary-contrast shadow-md">
          <Lock className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight ui-title">
            {t("auth.reset.title")}
          </h1>
          <p className="mt-1 text-sm ui-text-muted">
            {t("auth.reset.subtitle")}
          </p>
        </div>

        {done ? (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg border ui-alert-success p-3 text-sm ui-text-success"
          >
            <CheckCircle2
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            {t("auth.reset.success")}
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label={t("auth.reset.newPassword")}>
              <Input
                id="reset-new"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </Field>
            <Field label={t("auth.reset.confirm")}>
              <Input
                id="reset-confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
            {error && (
              <p
                role="alert"
                className="rounded-lg border ui-alert-error p-3 text-sm ui-text-error"
              >
                {error}
              </p>
            )}
            <Button
              type="submit"
              fullWidth
              loading={submitting}
              disabled={!token || !newPassword || !confirm}
            >
              {t("auth.reset.submit")}
            </Button>
            <Link
              to="/"
              className="inline-flex w-full items-center justify-center gap-1 text-sm ui-action-primary hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("auth.forgot.backToLogin")}
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
