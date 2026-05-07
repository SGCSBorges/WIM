import { useState } from "react";
import { adminAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";

export default function ResetPasswordModal({
  userId,
  email,
  onClose,
  onDone,
}: {
  userId: number;
  email: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminAPI.resetPassword(userId, password);
      onDone();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, t("admin.error.resetPassword")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="ui-card rounded-lg shadow-xl w-full max-w-md">
        <form onSubmit={submit}>
          <div className="p-4 border-b ui-divider flex items-center justify-between">
            <h2 className="font-semibold">{t("admin.resetPassword.title")}</h2>
            <button
              type="button"
              onClick={onClose}
              className="ui-text-muted hover:opacity-70"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="p-4 space-y-4">
            <p className="text-sm ui-text-muted">
              {t("admin.resetPassword.for")} <strong>{email}</strong>.{" "}
              {t("admin.resetPassword.note")}
            </p>
            <div>
              <label
                htmlFor="rp-password"
                className="block text-sm font-medium mb-1"
              >
                {t("admin.resetPassword.newPassword")}
              </label>
              <input
                id="rp-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full ui-input px-3 py-2 rounded-md"
              />
              <p className="text-xs ui-text-muted mt-1">
                {t("admin.password.requirements")}
              </p>
            </div>
            {error && (
              <div className="border ui-alert-error rounded-md p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
          </div>
          <div className="p-4 border-t ui-divider flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm ui-btn-ghost border ui-divider rounded"
              disabled={busy}
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              className="px-3 py-2 text-sm ui-btn-primary rounded"
              disabled={busy}
            >
              {busy ? t("admin.working") : t("admin.resetPassword.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
