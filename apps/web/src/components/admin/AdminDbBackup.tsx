/**
 * Admin-only "Database backup & restore" panel. Export downloads a full
 * JSON dump (`adminAPI.exportDatabase`); import REPLACES every row in
 * every table (`adminAPI.importDatabase`) behind a password tripwire +
 * optional Stripe-id stripping. Post-import the session is invalidated,
 * so we hard-logout + reload the page.
 */
import { useRef, useState } from "react";
import { Database, Download, Check, Upload, TriangleAlert } from "lucide-react";
import { adminAPI, authAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";
import { formatCount } from "../../utils/number";
import { useToast } from "../common/Toast";
import { Button, Section, Field, Input } from "../ui";

export default function AdminDbBackup() {
  const { t, language } = useI18n();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [keepStripeIds, setKeepStripeIds] = useState(false);

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
      setExported(true);
      setTimeout(() => setExported(false), 2000);
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
    if (!confirmPassword) {
      setError(t("admin.db.passwordRequired"));
      return;
    }
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
      const result = await adminAPI.importDatabase(parsed, {
        currentPassword: confirmPassword,
        keepStripeIds,
      });
      setConfirmPassword("");
      setCounts(result.counts);
      toast.show(t("admin.db.importSuccess"), { kind: "success" });
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
    <Section
      icon={<Database className="h-5 w-5" />}
      title={t("admin.db.title")}
      description={t("admin.db.subtitle")}
    >
      {error && (
        <div
          role="alert"
          className="mb-3 rounded-lg border ui-alert-error p-3 text-sm ui-text-error"
        >
          {error}
        </div>
      )}

      {counts && (
        <div
          role="status"
          className="mb-3 rounded-lg border ui-alert-success p-3"
        >
          <p className="text-sm font-medium ui-text-success">
            {t("admin.db.importSuccess")}
          </p>
          <ul className="mt-1 grid grid-cols-2 gap-x-3 text-xs ui-text-success">
            {Object.entries(counts).map(([table, n]) => (
              <li key={table}>
                <code className="font-mono">{table}</code>:{" "}
                {formatCount(n, language)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={handleExport}
          loading={exporting}
          disabled={importing}
          leftIcon={
            exported ? (
              <Check className="h-4 w-4" />
            ) : (
              <Download className="h-4 w-4" />
            )
          }
        >
          {t("admin.db.exportButton")}
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleFilePick}
        />
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={exporting || importing}
          leftIcon={<Upload className="h-4 w-4" />}
        >
          {t("admin.db.chooseFile")}
        </Button>
      </div>

      {pendingFile && !importing && !counts && (
        <div className="mt-3 space-y-3 rounded-lg border ui-alert-warning p-3">
          <p className="flex items-center gap-2 text-sm font-semibold ui-text-warn">
            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t("admin.db.confirmTitle")}
          </p>
          <p className="text-sm ui-text-warn">
            {t("admin.db.confirmBody").replace("{file}", pendingFile.name)}
          </p>
          <Field
            label={t("admin.db.passwordPromptLabel")}
            htmlFor="db-confirm-password"
          >
            <Input
              id="db-confirm-password"
              type="password"
              autoComplete="current-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </Field>
          <label className="flex items-start gap-2 text-xs ui-text-warn">
            <input
              type="checkbox"
              checked={keepStripeIds}
              onChange={(e) => setKeepStripeIds(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 accent-[var(--primary)]"
            />
            <span>
              <strong>{t("admin.db.keepStripeIdsLabel")}</strong>{" "}
              <span className="ui-text-muted">
                {t("admin.db.keepStripeIdsNote")}
              </span>
            </span>
          </label>
          <div className="flex items-center gap-2">
            <Button
              variant="danger"
              size="sm"
              onClick={confirmImport}
              disabled={!confirmPassword}
            >
              {t("admin.db.confirmReplace")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPendingFile(null);
                setConfirmPassword("");
                setKeepStripeIds(false);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      )}

      {importing && (
        <div className="mt-3 rounded-lg border ui-divider p-3">
          <p className="text-sm ui-text-muted">{t("admin.db.importing")}</p>
        </div>
      )}

      <p className="mt-3 text-xs ui-text-muted">{t("admin.db.uploadsNote")}</p>
    </Section>
  );
}
