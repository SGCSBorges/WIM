import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { sharesAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";

type Props = {
  /** Notifies parent that the user just successfully redeemed an invite. */
  onAccepted?: () => void;
};

// Lets a recipient redeem a token-based share invite. Two entry points:
//   - Manual paste: type or paste the token, click Accept.
//   - Deep link:    /sharing/accept?token=... auto-fills the field and
//                   immediately submits.
//
// The token is stripped from the URL after the attempt so a refresh
// doesn't replay it.
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

  // Deep-link handling: /sharing/accept?token=xxx pre-fills + auto-submits.
  // We strip the token from the URL whatever the outcome so it doesn't
  // sit in the address bar (and a refresh doesn't replay an already-used
  // token).
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
    <div className="ui-card rounded-lg p-4 space-y-3">
      <div>
        <h3 className="font-semibold ui-title">{t("acceptInvite.title")}</h3>
        <p className="text-sm ui-text-muted">{t("acceptInvite.subtitle")}</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(token);
        }}
        className="flex flex-col sm:flex-row gap-2"
      >
        <input
          type="text"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={t("acceptInvite.placeholder")}
          className="ui-input flex-1 px-3 py-2 rounded font-mono text-xs"
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={busy || !token.trim()}
          className="ui-btn-primary px-4 py-2 rounded"
        >
          {busy ? t("common.loading") : t("acceptInvite.submit")}
        </button>
      </form>

      {error && (
        <div className="border ui-alert-error rounded-md p-3" role="alert">
          <p className="text-sm ui-text-error">{error}</p>
        </div>
      )}
      {success && (
        <div className="border ui-alert-success rounded-md p-3" role="status">
          <p className="text-sm ui-text-success">{success}</p>
        </div>
      )}
    </div>
  );
}
