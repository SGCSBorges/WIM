/**
 * Apply a small scalar field set across a selection of articles. Each
 * field has a tri-state header: "leave unchanged" (default), "set to…",
 * or "clear". `clear` sends `null`; "set to" sends the typed value;
 * "leave unchanged" omits the key so the server doesn't touch it.
 */
import { useState } from "react";
import Modal from "../common/Modal";
import { Button, Field, Input, Select } from "../ui";
import { useI18n } from "../../i18n/i18n";
import { articlesAPI } from "../../services/api";
import { getErrorMessage } from "../../utils/error";

interface BulkEditDialogProps {
  open: boolean;
  ids: number[];
  onClose: () => void;
  onApplied: (count: number) => void;
}

type Op = "skip" | "set" | "clear";

interface FieldState {
  op: Op;
  value: string;
}

const TITLE_ID = "bulk-edit-dialog-title";

export default function BulkEditDialog({
  open,
  ids,
  onClose,
  onApplied,
}: BulkEditDialogProps) {
  const { t } = useI18n();
  const [price, setPrice] = useState<FieldState>({ op: "skip", value: "" });
  const [depreciation, setDepreciation] = useState<FieldState>({
    op: "skip",
    value: "",
  });
  const [brand, setBrand] = useState<FieldState>({ op: "skip", value: "" });
  const [serial, setSerial] = useState<FieldState>({ op: "skip", value: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPrice({ op: "skip", value: "" });
    setDepreciation({ op: "skip", value: "" });
    setBrand({ op: "skip", value: "" });
    setSerial({ op: "skip", value: "" });
    setError(null);
  };

  // Translate a FieldState into the JSON shape the API takes.
  const numericField = (s: FieldState): number | null | undefined => {
    if (s.op === "skip") return undefined;
    if (s.op === "clear") return null;
    const n = Number(s.value);
    return Number.isFinite(n) ? n : undefined;
  };
  const stringField = (s: FieldState): string | null | undefined => {
    if (s.op === "skip") return undefined;
    if (s.op === "clear") return null;
    return s.value;
  };

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      // Guard the empty "Set to…" footgun: Number("") is 0, so a blank
      // numeric field set to "set" would silently write 0 across the whole
      // selection (zeroing prices → corrupting depreciation/portfolio totals);
      // a blank string field would write "". Make the user enter a value or
      // pick Skip/Clear instead.
      const emptySet = [price, depreciation, brand, serial].some(
        (s) => s.op === "set" && s.value.trim() === ""
      );
      if (emptySet) {
        setError(t("bulkEdit.errorEmptySet"));
        return;
      }
      const fields: Record<string, number | string | null> = {};
      const p = numericField(price);
      if (p !== undefined) fields.purchasePrice = p;
      const d = numericField(depreciation);
      if (d !== undefined) fields.depreciationRate = d;
      const b = stringField(brand);
      if (b !== undefined) fields.brand = b;
      const s = stringField(serial);
      if (s !== undefined) fields.serialNumber = s;
      if (Object.keys(fields).length === 0) {
        setError(t("bulkEdit.errorNoFields"));
        return;
      }
      const { count } = await articlesAPI.bulkUpdate(ids, fields);
      onApplied(count);
      reset();
      onClose();
    } catch (e) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setBusy(false);
    }
  };

  const renderRow = (
    label: string,
    htmlFor: string,
    state: FieldState,
    setState: (s: FieldState) => void,
    inputType: "text" | "number",
    extraProps: Partial<React.InputHTMLAttributes<HTMLInputElement>> = {}
  ) => (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[10rem_9rem_minmax(0,1fr)]">
      <span className="text-sm font-medium ui-title sm:self-center">
        {label}
      </span>
      <Select
        aria-label={`${label} ${t("bulkEdit.opLabel")}`}
        value={state.op}
        onChange={(e) => setState({ ...state, op: e.target.value as Op })}
      >
        <option value="skip">{t("bulkEdit.op.skip")}</option>
        <option value="set">{t("bulkEdit.op.set")}</option>
        <option value="clear">{t("bulkEdit.op.clear")}</option>
      </Select>
      {state.op === "set" ? (
        <Field label={label} htmlFor={htmlFor}>
          <Input
            id={htmlFor}
            type={inputType}
            value={state.value}
            onChange={(e) => setState({ ...state, value: e.target.value })}
            {...extraProps}
          />
        </Field>
      ) : (
        <span />
      )}
    </div>
  );

  if (!open) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      titleId={TITLE_ID}
      panelClassName="ui-card w-full max-w-2xl space-y-4 p-5"
    >
      <h2 id={TITLE_ID} className="text-lg font-semibold ui-title">
        {t("bulkEdit.title")}
      </h2>
      <p className="text-sm ui-text-muted">
        {t("bulkEdit.subtitle").replace("{count}", String(ids.length))}
      </p>

      <div className="space-y-3">
        {renderRow(
          t("articles.field.purchasePrice"),
          "bulk-price",
          price,
          setPrice,
          "number",
          { min: 0, step: "0.01" }
        )}
        {renderRow(
          t("articles.field.depreciationRate"),
          "bulk-depreciation",
          depreciation,
          setDepreciation,
          "number",
          { min: 0, max: 100, step: "0.01" }
        )}
        {renderRow(
          t("articles.field.brand"),
          "bulk-brand",
          brand,
          setBrand,
          "text",
          { maxLength: 120 }
        )}
        {renderRow(
          t("articles.field.serialNumber"),
          "bulk-serial",
          serial,
          setSerial,
          "text",
          { maxLength: 120 }
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm ui-text-error">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            reset();
            onClose();
          }}
          disabled={busy}
        >
          {t("common.cancel")}
        </Button>
        <Button onClick={apply} loading={busy} disabled={ids.length === 0}>
          {t("bulkEdit.apply")}
        </Button>
      </div>
    </Modal>
  );
}
