import { useRef, useState } from "react";
import { adminAPI, authAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";
import { useToast } from "../common/Toast";

/**
 * Admin-only Database backup / restore card.
 *
 * Provides one-button export (downloads a JSON dump of every table) and
 * import (replaces every row from a previously exported JSON file). The
 * import is destructive: it wipes the running database. The caller's
 * session is invalidated by the server because its User row is rewritten
 * by the import — we trigger a hard logout + redirect on success.
 */
export default function AdminDbBackup() {
  const { t } = useI18n();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setError(null);
    setExporting(true);
    try {
      const { blob, filename } = await adminAPI.exportDatabase();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.show(t("admin.db.exportSuccess"), { kind: "success" });
    } catch (e) {
      const msg = getErrorMessage(e, t("common.errorOccurred"));
      setError(msg);
      toast.show(msg, { kind: "error" });
    } finally {
      setExporting(false);
    }
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setPendingFile(file);
    setError(null);
    setCounts(null);
  };

  const confirmImport = async () => {
    if (!pendingFile) return;
    setError(null);
    setImporting(true);
    try {
      const text = await pendingFile.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(t("admin.db.invalidJson"));
      }
      const result = await adminAPI.importDatabase(parsed);
      setCounts(result.counts);
      toast.show(t("admin.db.importSuccess"), { kind: "success" });
      // Server rewrote the user table; our session no longer maps to a
      // real row (or maps to a row with a different tokenVersion). Hard
      // logout + reload so we land on the login screen with a clean cache.
      try {
        await authAPI.logout();
      } catch {
        // ignore — we're about to reload anyway
      }
      window.setTimeout(() => {
        window.location.href = "/";
      }, 1500);
    } catch (e) {
      const msg = getErrorMessage(e, t("common.errorOccurred"));
      setError(msg);
      toast.show(msg, { kind: "error" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="ui-card rounded-lg shadow p-6 space-y-4">
      <div>
        <h3 className="font-semibold ui-title">{t("admin.db.title")}</h3>
        <p className="text-sm ui-text-muted mt-1">{t("admin.db.subtitle")}</p>
      </div>

      {error && (
        <div className="border ui-alert-error rounded-md p-3" role="alert">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {counts && (
        <div className="border ui-alert-success rounded-md p-3">
          <p className="text-sm text-green-800 font-medium">
            {t("admin.db.importSuccess")}
          </p>
          <ul className="mt-1 text-xs text-green-700 grid grid-cols-2 gap-x-3">
            {Object.entries(counts).map(([table, n]) => (
              <li key={table}>
                <code className="font-mono">{table}</code>: {n}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || importing}
          className="ui-btn-primary px-4 py-2 rounded text-sm"
        >
          {exporting
            ? t("admin.db.exporting")
            : `⬇ ${t("admin.db.exportButton")}`}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleFilePick}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={exporting || importing}
          className="ui-btn-ghost px-4 py-2 rounded text-sm border ui-divider"
        >
          ⬆ {t("admin.db.chooseFile")}
        </button>
      </div>

      {pendingFile && !importing && !counts && (
        <div className="border ui-alert-warning rounded-md p-3 space-y-2">
          <p className="text-sm text-yellow-900">
            <strong>{t("admin.db.confirmTitle")}</strong>
          </p>
          <p className="text-sm text-yellow-800">
            {t("admin.db.confirmBody").replace("{file}", pendingFile.name)}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={confirmImport}
              className="ui-btn-danger px-3 py-1.5 text-sm rounded"
            >
              {t("admin.db.confirmReplace")}
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="ui-btn-ghost px-3 py-1.5 text-sm rounded border ui-divider"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      {importing && (
        <div className="border ui-divider rounded-md p-3">
          <p className="text-sm ui-text-muted">{t("admin.db.importing")}</p>
        </div>
      )}

      <p className="text-xs ui-text-muted">{t("admin.db.uploadsNote")}</p>
    </div>
  );
}
