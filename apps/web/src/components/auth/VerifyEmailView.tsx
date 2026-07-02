/**
 * Email-verification landing page — the target of the link we mail out.
 * Rendered before the auth gate (no session needed: the token in the query
 * string is the credential) so it works from any device or mail app.
 * Consumes the token once on mount and reports the outcome.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, MailCheck, MailX } from "lucide-react";
import { authAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";

export default function VerifyEmailView() {
  const { t } = useI18n();
  const [state, setState] = useState<"working" | "ok" | "error">("working");
  // StrictMode double-mount guard: the token is single-use, so the second
  // dev-mode invocation would consume-fail and flash an error.
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setState("error");
      return;
    }
    authAPI
      .verifyEmail(token)
      .then(() => setState("ok"))
      .catch(() => setState("error"));
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg p-4">
      <main className="ui-card w-full max-w-md p-8 text-center">
        {state === "working" && (
          <p
            className="flex items-center justify-center gap-2 text-sm ui-text-muted"
            role="status"
          >
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            {t("verifyEmail.working")}
          </p>
        )}
        {state === "ok" && (
          <div className="space-y-3">
            <MailCheck
              className="mx-auto h-10 w-10 ui-text-success"
              aria-hidden="true"
            />
            <p className="text-sm" role="status">
              {t("verifyEmail.success")}
            </p>
          </div>
        )}
        {state === "error" && (
          <div className="space-y-3">
            <MailX
              className="mx-auto h-10 w-10 ui-text-muted"
              aria-hidden="true"
            />
            <p className="text-sm" role="alert">
              {t("verifyEmail.failed")}
            </p>
          </div>
        )}
        {state !== "working" && (
          <Link
            to="/"
            className="mt-6 inline-block text-sm font-medium text-primary hover:underline"
          >
            {t("verifyEmail.goToApp")}
          </Link>
        )}
      </main>
    </div>
  );
}
