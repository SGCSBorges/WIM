/**
 * Two-factor (TOTP) setup + disable flow. State machine:
 *
 *   idle ──[start]──► passwordPrompt ──[setup]──► confirm ──[verify]──► done
 *     │
 *     └─[disable] ──► passwordPromptDisable ──► (DELETE) ──► done
 *
 * Backup codes returned by setup() are surfaced ONCE in the confirm step —
 * the server only stores bcrypt hashes, so if the user dismisses without
 * saving them they can re-enroll later (which rotates the secret).
 */
import { useState } from "react";
import { Copy, ShieldCheck, ShieldOff } from "lucide-react";
import { profileAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { useToast } from "../common/Toast";
import { getErrorMessage } from "../../utils/error";
import { Badge, Button, Field, Input } from "../ui";

interface TwoFactorPanelProps {
  enabled: boolean;
  onChanged: () => void;
}

export default function TwoFactorPanel({
  enabled,
  onChanged,
}: TwoFactorPanelProps) {
  const { t } = useI18n();
  const toast = useToast();

  const [phase, setPhase] = useState<
    "idle" | "password" | "confirm" | "disablePassword"
  >("idle");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPhase("idle");
    setPassword("");
    setCode("");
    setQr(null);
    setOtpauthUrl(null);
    setBackupCodes([]);
    setError(null);
  };

  const beginSetup = async () => {
    setBusy(true);
    setError(null);
    try {
      const { qrDataUrl, otpauthUrl, backupCodes } =
        await profileAPI.setupTotp(password);
      setQr(qrDataUrl);
      setOtpauthUrl(otpauthUrl);
      setBackupCodes(backupCodes);
      setPhase("confirm");
    } catch (e) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setBusy(false);
    }
  };

  const confirmSetup = async () => {
    setBusy(true);
    setError(null);
    try {
      await profileAPI.verifyTotpSetup(password, code);
      toast.show(t("twoFactor.enabled"), { kind: "success" });
      reset();
      onChanged();
    } catch (e) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError(null);
    try {
      await profileAPI.disableTotp(password);
      toast.show(t("twoFactor.disabled"), { kind: "success" });
      reset();
      onChanged();
    } catch (e) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium ui-text-muted">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {t("twoFactor.title")}
        </p>
        <Badge tone={enabled ? "success" : "neutral"}>
          {enabled ? t("twoFactor.statusOn") : t("twoFactor.statusOff")}
        </Badge>
        {phase === "idle" && !enabled && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => setPhase("password")}
          >
            {t("twoFactor.enable")}
          </Button>
        )}
        {phase === "idle" && enabled && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-danger"
            leftIcon={<ShieldOff className="h-4 w-4" />}
            onClick={() => setPhase("disablePassword")}
          >
            {t("twoFactor.disable")}
          </Button>
        )}
      </div>

      {phase === "password" && (
        <div className="space-y-2 rounded-lg border ui-divider p-3">
          <Field
            label={t("twoFactor.passwordLabel")}
            htmlFor="totp-setup-password"
          >
            <Input
              id="totp-setup-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error && <p className="text-sm ui-text-error">{error}</p>}
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              loading={busy}
              disabled={!password}
              onClick={beginSetup}
            >
              {t("twoFactor.continue")}
            </Button>
          </div>
        </div>
      )}

      {phase === "confirm" && qr && (
        <div className="space-y-3 rounded-lg border ui-divider p-3">
          <p className="text-sm ui-text-muted">{t("twoFactor.scanHint")}</p>
          <img
            src={qr}
            alt={t("twoFactor.qrAlt")}
            className="mx-auto h-44 w-44 rounded-md border ui-divider"
          />
          {otpauthUrl && (
            <button
              type="button"
              className="block w-full break-all rounded-md bg-surface-muted px-2 py-1 text-left font-mono text-[10px] ui-text-muted hover:ui-title"
              onClick={() => {
                void navigator.clipboard
                  .writeText(otpauthUrl)
                  .then(() =>
                    toast.show(t("twoFactor.urlCopied"), { kind: "success" })
                  )
                  .catch(() =>
                    toast.show(t("twoFactor.urlCopyFailed"), { kind: "error" })
                  );
              }}
            >
              {otpauthUrl}
            </button>
          )}
          <Field label={t("twoFactor.codeLabel")} htmlFor="totp-setup-code">
            <Input
              id="totp-setup-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
            />
          </Field>
          {backupCodes.length > 0 && (
            <div className="rounded-md bg-surface-muted p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium ui-title">
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                {t("twoFactor.backupTitle")}
              </p>
              <p className="mb-2 text-xs ui-text-muted">
                {t("twoFactor.backupHint")}
              </p>
              <ul className="grid grid-cols-2 gap-1 font-mono text-xs">
                {backupCodes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {error && <p className="text-sm ui-text-error">{error}</p>}
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              loading={busy}
              disabled={code.length !== 6}
              onClick={confirmSetup}
            >
              {t("twoFactor.confirm")}
            </Button>
          </div>
        </div>
      )}

      {phase === "disablePassword" && (
        <div className="space-y-2 rounded-lg border ui-alert-warning p-3">
          <p className="text-sm ui-text-warn">{t("twoFactor.disableWarn")}</p>
          <Field
            label={t("twoFactor.passwordLabel")}
            htmlFor="totp-disable-password"
          >
            <Input
              id="totp-disable-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error && <p className="text-sm ui-text-error">{error}</p>}
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={busy}
              disabled={!password}
              onClick={disable}
            >
              {t("twoFactor.disableConfirm")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
