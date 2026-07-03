/**
 * Receipt scan → autofill. Fully client-side and free: tesseract.js (WASM)
 * runs OCR in the browser — the photo never leaves the device — and
 * `parseReceiptText` extracts the total / date / merchant heuristically.
 * The user reviews the extracted values before applying them to the form.
 *
 * tesseract.js is heavy (~3 MB of lazily-fetched WASM + language data), so
 * everything is dynamic-imported on first use; the article-form chunk pays
 * nothing until the user actually scans a receipt.
 */
import { useRef, useState } from "react";
import { Check, Loader2, ReceiptText, Upload } from "lucide-react";
import Modal from "../common/Modal";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";
import { parseReceiptText, type ParsedReceipt } from "../../utils/receiptParse";
import { Button } from "../ui";

// Map the app language to a tesseract traineddata pack so receipts in the
// user's own language OCR well. Language data is fetched on demand.
const OCR_LANG: Record<string, string> = {
  en: "eng",
  fr: "fra",
  pt: "por",
  es: "spa",
  nl: "nld",
};

export interface ReceiptScanResult {
  total: number | null;
  date: string | null;
  merchant: string | null;
}

interface ReceiptScannerProps {
  open: boolean;
  onClose: () => void;
  onApply: (result: ReceiptScanResult) => void;
}

export default function ReceiptScanner({
  open,
  onClose,
  onApply,
}: ReceiptScannerProps) {
  const { t, language } = useI18n();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedReceipt | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const reset = () => {
    setBusy(false);
    setProgress(0);
    setError(null);
    setParsed(null);
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setParsed(null);
    setProgress(0);
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker(OCR_LANG[language] ?? "eng", 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text")
            setProgress(Math.round(m.progress * 100));
        },
      });
      try {
        const {
          data: { text },
        } = await worker.recognize(file);
        setParsed(parseReceiptText(text));
      } finally {
        await worker.terminate();
      }
    } catch (e) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!parsed) return;
    onApply(parsed);
    reset();
    onClose();
  };

  const nothingFound =
    parsed && parsed.total === null && parsed.date === null && !parsed.merchant;

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      titleId="receipt-scan-title"
      panelClassName="ui-card w-full max-w-md p-6"
    >
      <h2
        id="receipt-scan-title"
        className="mb-1 flex items-center gap-2 text-lg font-semibold ui-title"
      >
        <ReceiptText className="h-5 w-5" aria-hidden="true" />
        {t("receipt.title")}
      </h2>
      <p className="mb-4 text-sm ui-text-muted">{t("receipt.hint")}</p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label={t("receipt.fileLabel")}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />

      {!busy && !parsed && (
        <Button
          fullWidth
          variant="outline"
          onClick={() => inputRef.current?.click()}
          leftIcon={<Upload className="h-4 w-4" />}
        >
          {t("receipt.pick")}
        </Button>
      )}

      {busy && (
        <div className="space-y-2" role="status" aria-live="polite">
          <p className="flex items-center justify-center gap-2 text-sm ui-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {t("receipt.working")}
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-center text-xs ui-text-muted tabular-nums">
            {progress}%
          </p>
        </div>
      )}

      {parsed && (
        <div className="space-y-3">
          {nothingFound ? (
            <p role="alert" className="text-sm ui-text-muted">
              {t("receipt.nothingFound")}
            </p>
          ) : (
            <dl className="space-y-1 rounded-lg border ui-divider p-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="ui-text-muted">{t("receipt.total")}</dt>
                <dd className="font-medium tabular-nums ui-title">
                  {parsed.total !== null ? parsed.total.toFixed(2) : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="ui-text-muted">{t("receipt.date")}</dt>
                <dd className="font-medium tabular-nums ui-title">
                  {parsed.date ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="ui-text-muted">{t("receipt.merchant")}</dt>
                <dd
                  className="max-w-[12rem] truncate font-medium ui-title"
                  title={parsed.merchant ?? undefined}
                >
                  {parsed.merchant ?? "—"}
                </dd>
              </div>
            </dl>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={reset}>
              {t("receipt.retry")}
            </Button>
            {!nothingFound && (
              <Button
                size="sm"
                onClick={apply}
                leftIcon={<Check className="h-4 w-4" />}
              >
                {t("receipt.apply")}
              </Button>
            )}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm ui-text-error">
          {error}
        </p>
      )}
    </Modal>
  );
}
