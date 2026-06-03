/**
 * Two-mode warranty action dialog: Renew (swap in a fresh purchase date +
 * duration) or Extend (roll the end date forward by N months in place). Both
 * paths preserve the same garantieId — the live row rolls forward and the
 * prior state is snapshotted on the API side into WarrantyHistory.
 *
 * Shows a live "new end date" preview so the user sees exactly what the
 * server will compute, using the same `addMonths` semantic the API uses.
 */
import { useMemo, useState } from "react";
import { addMonths, format as dfFormat } from "date-fns";
import Modal from "../common/Modal";
import { Button, Field, Input, Segmented, Textarea } from "../ui";
import { useI18n } from "../../i18n/i18n";
import { usePreferences } from "../../preferences/preferences";
import { getErrorMessage } from "../../utils/error";
import { warrantiesAPI } from "../../services/api";
import { useToast } from "../common/Toast";
import type { WarrantyItem } from "../../types";

/** Minimal shape we need to drive the dialog: the warranty id (so we can
 *  POST to /renew or /extend) and enough metadata to compute the live
 *  preview. Accepts both the standalone `WarrantyItem` and the embedded
 *  `ArticleWarranty` shape from `FetchedArticle`. */
type RenewableWarranty = {
  garantieId?: number;
  garantieDateAchat: string;
  garantieDuration: number;
};

export type RenewWarrantyDialogMode = "renew" | "extend";

interface RenewWarrantyDialogProps {
  open: boolean;
  onClose: () => void;
  /** The live warranty (so the dialog can prefill date/duration sensibly). */
  warranty: RenewableWarranty;
  /** Default tab. The user can still switch. */
  mode?: RenewWarrantyDialogMode;
  /** Called with the freshly-rolled-forward warranty so the parent refreshes. */
  onUpdated: (updated: WarrantyItem) => void;
}

const TITLE_ID = "renew-warranty-dialog-title";

function toIsoDate(d: Date): string {
  return dfFormat(d, "yyyy-MM-dd");
}

export default function RenewWarrantyDialog({
  open,
  onClose,
  warranty,
  mode: initialMode = "renew",
  onUpdated,
}: RenewWarrantyDialogProps) {
  const { t } = useI18n();
  const { formatDate } = usePreferences();
  const toast = useToast();

  const [mode, setMode] = useState<RenewWarrantyDialogMode>(initialMode);
  // Renew defaults: start fresh from today + the warranty's current duration.
  const [renewDate, setRenewDate] = useState(() => toIsoDate(new Date()));
  const [renewDuration, setRenewDuration] = useState<number>(
    warranty.garantieDuration || 24
  );
  // Extend defaults: 12 months is the most common renewal slice.
  const [extendMonths, setExtendMonths] = useState<number>(12);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live preview of what `garantieFin` will become on the server. Date-fns
  // `addMonths` matches the API implementation in apps/api/src/modules/common/date.
  const previewFin = useMemo(() => {
    if (mode === "renew") {
      const start = new Date(renewDate);
      if (Number.isNaN(start.getTime()) || !renewDuration) return null;
      return addMonths(start, renewDuration);
    }
    const start = new Date(warranty.garantieDateAchat);
    if (Number.isNaN(start.getTime())) return null;
    return addMonths(start, warranty.garantieDuration + (extendMonths || 0));
  }, [mode, renewDate, renewDuration, extendMonths, warranty]);

  const submit = async () => {
    if (!warranty.garantieId) return;
    setBusy(true);
    setError(null);
    try {
      const updated =
        mode === "renew"
          ? await warrantiesAPI.renew(warranty.garantieId, {
              garantieDateAchat: renewDate,
              garantieDuration: renewDuration,
              note: note || null,
            })
          : await warrantiesAPI.extend(warranty.garantieId, {
              months: extendMonths,
              note: note || null,
            });
      onUpdated(updated);
      toast.show(
        t(
          mode === "renew"
            ? "warranty.renew.success"
            : "warranty.extend.success"
        ),
        { kind: "success" }
      );
      onClose();
    } catch (e) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      titleId={TITLE_ID}
      panelClassName="ui-card w-full max-w-md space-y-4 p-5"
    >
      <h2 id={TITLE_ID} className="text-lg font-semibold ui-title">
        {t("warranty.renew.title")}
      </h2>

      <Segmented
        ariaLabel={t("warranty.renew.modeLabel")}
        value={mode}
        onChange={(v) => setMode(v as RenewWarrantyDialogMode)}
        options={[
          { value: "renew", label: t("warranty.renew.tab.renew") },
          { value: "extend", label: t("warranty.renew.tab.extend") },
        ]}
      />

      {mode === "renew" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label={t("articleForm.warranty.purchaseDate")}
            htmlFor="renew-date"
          >
            <Input
              id="renew-date"
              type="date"
              value={renewDate}
              onChange={(e) => setRenewDate(e.target.value)}
            />
          </Field>
          <Field
            label={t("articleForm.warranty.durationMonths")}
            htmlFor="renew-duration"
          >
            <Input
              id="renew-duration"
              type="number"
              min={1}
              max={120}
              value={renewDuration}
              onChange={(e) => setRenewDuration(Number(e.target.value))}
            />
          </Field>
        </div>
      ) : (
        <Field
          label={t("warranty.extend.monthsLabel")}
          htmlFor="extend-months"
          hint={t("warranty.extend.monthsHint")}
        >
          <Input
            id="extend-months"
            type="number"
            min={1}
            max={120}
            value={extendMonths}
            onChange={(e) => setExtendMonths(Number(e.target.value))}
          />
        </Field>
      )}

      <Field label={t("warranty.renew.note")} htmlFor="renew-note">
        <Textarea
          id="renew-note"
          rows={2}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("warranty.renew.notePlaceholder")}
        />
      </Field>

      {previewFin && (
        <p className="rounded-lg bg-surface-muted p-2 text-sm">
          <span className="ui-text-muted">
            {t("articleForm.warranty.endsOn")}:{" "}
          </span>
          <span className="font-medium ui-title">{formatDate(previewFin)}</span>
        </p>
      )}

      {error && <p className="text-sm ui-text-error">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
          {t("common.cancel")}
        </Button>
        <Button onClick={submit} loading={busy}>
          {mode === "renew"
            ? t("warranty.renew.submit")
            : t("warranty.extend.submit")}
        </Button>
      </div>
    </Modal>
  );
}
