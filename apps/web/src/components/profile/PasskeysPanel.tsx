/**
 * Passkey management inside Profile → Security: list registered passkeys
 * (label, created, last used), add a new one via the platform authenticator,
 * delete with confirm. Registration is a two-step dance with the server
 * (options + challenge JWT → authenticator → verify) — see
 * modules/auth/webauthn.routes.ts. Hidden entirely on browsers without
 * WebAuthn support.
 */
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { authAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { usePreferences } from "../../preferences/preferences";
import { getErrorMessage } from "../../utils/error";
import { useToast } from "../common/Toast";
import { Button, Badge, ConfirmDialog, Input, Field } from "../ui";

type PasskeyRow = {
  id: number;
  deviceLabel: string | null;
  transports: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

export default function PasskeysPanel() {
  const { t } = useI18n();
  const { formatDate } = usePreferences();
  const toast = useToast();
  const [items, setItems] = useState<PasskeyRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const supported =
    typeof window !== "undefined" && !!window.PublicKeyCredential;

  const load = useCallback(async () => {
    try {
      const { items: rows } = await authAPI.listPasskeys();
      setItems(rows);
    } catch {
      // Silent — the panel just shows an empty list on a fetch hiccup.
    }
  }, []);

  useEffect(() => {
    if (supported) void load();
  }, [load, supported]);

  const addPasskey = async () => {
    setBusy(true);
    setError(null);
    try {
      const { startRegistration } = await import("@simplewebauthn/browser");
      const { options, challengeToken } =
        await authAPI.passkeyRegisterOptions();
      const attestation = await startRegistration({
        optionsJSON: options as Parameters<
          typeof startRegistration
        >[0]["optionsJSON"],
      });
      await authAPI.passkeyRegisterVerify(
        challengeToken,
        attestation,
        label.trim() || undefined
      );
      setLabel("");
      toast.show(t("passkeys.added"), { kind: "success" });
      await load();
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "NotAllowedError")) {
        setError(getErrorMessage(e, t("common.errorOccurred")));
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const id = deleteTarget;
    setDeleteTarget(null);
    if (id === null) return;
    try {
      await authAPI.deletePasskey(id);
      setItems((prev) => prev.filter((p) => p.id !== id));
      toast.show(t("passkeys.deleted"), { kind: "success" });
    } catch (e) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    }
  };

  if (!supported) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium ui-text-muted">
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          {t("passkeys.title")}
        </p>
        <Badge tone={items.length > 0 ? "success" : "neutral"}>
          {items.length > 0
            ? t("passkeys.countBadge").replace("{count}", String(items.length))
            : t("passkeys.none")}
        </Badge>
      </div>
      <p className="text-xs ui-text-muted">{t("passkeys.hint")}</p>

      {items.length > 0 && (
        <ul className="divide-y ui-divider">
          {items.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium ui-title">
                  {p.deviceLabel || t("passkeys.unnamed")}
                </p>
                <p className="text-xs ui-text-muted">
                  {t("passkeys.created")}: {formatDate(new Date(p.createdAt))}
                  {p.lastUsedAt &&
                    ` · ${t("passkeys.lastUsed")}: ${formatDate(
                      new Date(p.lastUsedAt)
                    )}`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteTarget(p.id)}
                aria-label={`${t("common.delete")} ${
                  p.deviceLabel || t("passkeys.unnamed")
                }`}
                className="text-danger"
                leftIcon={<Trash2 className="h-4 w-4" />}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <Field
          label={t("passkeys.labelField")}
          htmlFor="passkey-label"
          className="max-w-[14rem]"
        >
          <Input
            id="passkey-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={120}
            placeholder={t("passkeys.labelPlaceholder")}
          />
        </Field>
        <Button
          variant="outline"
          size="sm"
          onClick={addPasskey}
          loading={busy}
          leftIcon={<Plus className="h-4 w-4" />}
        >
          {t("passkeys.add")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm ui-text-error">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        tone="danger"
        title={t("passkeys.deleteConfirmTitle")}
        message={t("passkeys.deleteConfirmBody")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={remove}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
