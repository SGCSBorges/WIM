/**
 * Recipient-side invite acceptance. Two entry points:
 *   • Manual paste — type/paste the token, click Accept.
 *   • Deep link — /sharing/accept?token=… auto-fills + auto-submits.
 * The token is stripped from the URL afterwards (regardless of outcome)
 * so a refresh doesn't replay an already-used token. The API enforces
 * POWER_USER on the accept route, so a downgrade between issue + accept
 * surfaces as a clear error here.
 */
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Inbox, CheckCircle2 } from "lucide-react";
import { sharesAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";
import { Section, Button, Input } from "../ui";

type Props = {
  /** Notifies parent that the user just successfully redeemed an invite. */
  onAccepted?: () => void;
};

export default function AcceptInviteForm({ onAccepted }: Props) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();

  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async (raw: string) => {
    const tok = raw.trim();
    if (!tok) {
      setError(t("acceptInvite.error.tokenRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await sharesAPI.acceptInvite(tok);
      setToken("");
      setSuccess(
        t("acceptInvite.success").replace("{permission}", result.permission)
      );
      onAccepted?.();
    } catch (e) {
      setError(getErrorMessage(e, t("acceptInvite.error.default")));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!location.pathname.endsWith("/sharing/accept")) return;
    const params = new URLSearchParams(location.search);
    const tok = params.get("token");
    if (!tok) {
      navigate("/sharing", { replace: true });
      return;
    }
    setToken(tok);
    submit(tok).finally(() => {
      navigate("/sharing", { replace: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  return (
    <Section
      icon={<Inbox className="h-5 w-5" />}
      title={t("acceptInvite.title")}
      description={t("acceptInvite.subtitle")}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(token);
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <Input
          type="text"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={t("acceptInvite.placeholder")}
          aria-label={t("acceptInvite.placeholder")}
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
          className="flex-1 font-mono text-xs"
        />
        <Button type="submit" loading={busy} disabled={!token.trim()}>
          {t("acceptInvite.submit")}
        </Button>
      </form>

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-lg border ui-alert-error p-3 text-sm ui-text-error"
        >
          {error}
        </div>
      )}
      {success && (
        <div
          role="status"
          className="mt-3 flex items-start gap-2 rounded-lg border ui-alert-success p-3 text-sm ui-text-success"
        >
          <CheckCircle2
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          {success}
        </div>
      )}
    </Section>
  );
}
