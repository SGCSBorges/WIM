/**
 * "Forgot password" form — collects the user's email and POSTs to the
 * API's password-reset endpoint. Response is intentionally uniform (no
 * email enumeration) so we always show a generic "check your email"
 * confirmation, even when the email isn't registered.
 */
import { useState } from "react";
import { Link } from "react-router";
import { KeyRound, MailCheck, ArrowLeft } from "lucide-react";
import { authAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";
import { Button, Field, Input } from "../ui";

export default function ForgotPasswordForm() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
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
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="ui-card w-full max-w-md space-y-5 p-8 animate-scale-in">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary bg-gradient-brand text-primary-contrast shadow-md">
          <KeyRound className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight ui-title">
            {t("auth.forgot.title")}
          </h1>
          <p className="mt-1 text-sm ui-text-muted">
            {t("auth.forgot.subtitle")}
          </p>
        </div>

        {submitted ? (
          <>
            <div
              role="status"
              className="flex items-start gap-2 rounded-lg border ui-alert-success p-3 text-sm ui-text-success"
            >
              <MailCheck
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              {t("auth.forgot.success")}
            </div>
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-sm ui-action-primary hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("auth.forgot.backToLogin")}
            </Link>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label={t("auth.email")}>
              <Input
                id="forgot-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
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
              disabled={!email.trim()}
            >
              {t("auth.forgot.submit")}
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
