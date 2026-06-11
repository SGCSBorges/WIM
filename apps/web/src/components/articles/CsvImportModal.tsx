/**
 * CSV bulk article import. Two-step: parse the file client-side, show a
 * row-by-row preview with valid/invalid markers, then either Validate
 * (`articlesAPI.importRows({ dryRun: true })` returns per-row errors) or
 * Import (without dryRun, persists). Multi-value columns (locations/tags)
 * accept `;`-separated names so Excel keeps them in a single cell.
 */
import { useMemo, useState } from "react";
import Modal from "../common/Modal";
import { useI18n } from "../../i18n/i18n";
import { useToast } from "../common/Toast";
import { getErrorMessage } from "../../utils/error";
import { parseCSV } from "../../utils/csv";
import { articlesAPI } from "../../services/api";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after a successful import so the list can refetch. */
  onImported: () => void;
}

type ParsedRow = {
  name: string;
  model: string;
  description: string;
  price: number | null;
  locations: string[];
  tags: string[];
  valid: boolean;
};

// Maps a parsed CSV record (case-insensitive headers) to an import row.
// Multi-value columns (locations/tags) accept ";"-separated names.
function toRow(rec: Record<string, string>): ParsedRow {
  const name = rec["name"] ?? "";
  const model = rec["model"] ?? "";
  const priceRaw = rec["price"] ?? rec["value"] ?? "";
  const price = priceRaw.trim() === "" ? null : Number(priceRaw);
  const locations = (rec["locations"] ?? rec["location"] ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  const tags = (rec["tags"] ?? rec["tag"] ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    name: name.trim(),
    model: model.trim(),
    description: (rec["description"] ?? "").trim(),
    price: price !== null && Number.isFinite(price) ? price : null,
    locations,
    tags,
    valid: name.trim() !== "" && model.trim() !== "" && locations.length > 0,
  };
}

export default function CsvImportModal({ open, onClose, onImported }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  // Server dry-run outcome; gates the real commit so the user previews
  // server-side validation (including the new-entity cap) before any writes.
  const [validation, setValidation] = useState<{
    created: number;
    errors: Array<{ row: number; message: string }>;
  } | null>(null);
  const [result, setResult] = useState<{
    created: number;
    errors: Array<{ row: number; message: string }>;
  } | null>(null);

  const validCount = useMemo(() => rows.filter((r) => r.valid).length, [rows]);

  const reset = () => {
    setRows([]);
    setFileName("");
    setValidation(null);
    setResult(null);
  };

  const handleFile = async (file: File) => {
    setResult(null);
    setValidation(null);
    try {
      const text = await file.text();
      setRows(parseCSV(text).map(toRow));
      setFileName(file.name);
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    }
  };

  const payload = () =>
    rows
      .filter((r) => r.valid)
      .map((r) => ({
        name: r.name,
        model: r.model,
        description: r.description || null,
        price: r.price,
        locations: r.locations,
        tags: r.tags,
      }));

  const doValidate = async () => {
    const valid = payload();
    if (valid.length === 0) return;
    setImporting(true);
    try {
      const res = await articlesAPI.importRows(valid, { dryRun: true });
      setValidation(res);
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setImporting(false);
    }
  };

  const doImport = async () => {
    const valid = payload();
    if (valid.length === 0) return;
    setImporting(true);
    try {
      const res = await articlesAPI.importRows(valid);
      setResult(res);
      toast.show(t("import.success").replace("{count}", String(res.created)), {
        kind: "success",
      });
      if (res.created > 0) onImported();
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      titleId="csv-import-title"
      panelClassName="ui-card rounded-lg shadow-2xl max-w-2xl w-full p-6 space-y-4"
    >
      <div>
        <h2 id="csv-import-title" className="text-lg font-semibold ui-title">
          {t("import.title")}
        </h2>
        <p className="text-sm ui-text-muted">{t("import.subtitle")}</p>
      </div>

      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => {
          const f = e.target.files?.[0];
          // Clear the input so picking the same (fixed-in-Excel) file again
          // still fires change — same value means no event otherwise.
          e.target.value = "";
          if (f) void handleFile(f);
        }}
        className="block w-full text-sm"
        aria-label={t("import.title")}
      />

      {rows.length > 0 && !result && (
        <>
          <p className="text-sm ui-text-muted">
            {t("import.preview")
              .replace("{file}", fileName)
              .replace("{valid}", String(validCount))
              .replace("{total}", String(rows.length))}
          </p>
          <div className="max-h-64 overflow-auto border ui-divider rounded">
            <table className="w-full text-sm">
              <caption className="sr-only">{t("import.title")}</caption>
              <thead className="ui-panel">
                <tr>
                  <th className="px-2 py-1 text-left">{t("import.col.ok")}</th>
                  <th className="px-2 py-1 text-left">
                    {t("articleForm.name")}
                  </th>
                  <th className="px-2 py-1 text-left">
                    {t("articleForm.model")}
                  </th>
                  <th className="px-2 py-1 text-left">
                    {t("articleForm.locations")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y ui-divider">
                {rows.map((r, i) => (
                  <tr key={i} className={r.valid ? "" : "ui-alert-error"}>
                    <td className="px-2 py-1">{r.valid ? "✓" : "✕"}</td>
                    <td className="px-2 py-1">{r.name || "—"}</td>
                    <td className="px-2 py-1">{r.model || "—"}</td>
                    <td className="px-2 py-1">
                      {r.locations.join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {validation && !result && (
        <div
          className="border ui-divider rounded p-3 space-y-2"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm ui-text-success">
            {t("import.validated").replace(
              "{count}",
              String(validation.created)
            )}
          </p>
          {validation.errors.length > 0 && (
            <ul className="text-xs ui-text-error max-h-32 overflow-auto space-y-1">
              {validation.errors.map((e, i) => (
                <li key={i}>
                  {t("import.rowError")
                    .replace("{row}", String(e.row))
                    .replace("{message}", e.message)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {result && (
        <div
          className="border ui-divider rounded p-3 space-y-2"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm ui-text-success">
            {t("import.result").replace("{count}", String(result.created))}
          </p>
          {result.errors.length > 0 && (
            <ul className="text-xs ui-text-error max-h-32 overflow-auto space-y-1">
              {result.errors.map((e, i) => (
                <li key={i}>
                  {t("import.rowError")
                    .replace("{row}", String(e.row))
                    .replace("{message}", e.message)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t ui-divider">
        {!result && !validation && (
          <button
            type="button"
            onClick={doValidate}
            disabled={importing || validCount === 0}
            className="ui-btn-primary px-4 py-2 rounded-md text-sm"
          >
            {importing
              ? t("common.loading")
              : t("import.validate").replace("{count}", String(validCount))}
          </button>
        )}
        {!result && validation && (
          <button
            type="button"
            onClick={doImport}
            disabled={importing || validation.created === 0}
            className="ui-btn-primary px-4 py-2 rounded-md text-sm"
          >
            {importing
              ? t("common.loading")
              : t("import.submit").replace(
                  "{count}",
                  String(validation.created)
                )}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            reset();
            onClose();
          }}
          className="ui-btn-ghost px-4 py-2 rounded-md text-sm border ui-divider"
        >
          {result ? t("common.close") : t("common.cancel")}
        </button>
      </div>
    </Modal>
  );
}
