/**
 * ConfirmDialog — the one accessible confirmation surface, built on <Modal>.
 * Replaces the scattered inline confirm panels and window.confirm() calls.
 * `tone="danger"` styles the confirm button for destructive actions.
 */
import React from "react";
import { AlertTriangle } from "lucide-react";
import Modal from "../common/Modal";
import { Button } from "./Button";

export interface ConfirmDialogProps {
  open: boolean;
  title: React.ReactNode;
  message?: React.ReactNode;
  confirmLabel: React.ReactNode;
  cancelLabel: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  tone?: "primary" | "danger";
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  tone = "primary",
  loading = false,
}: ConfirmDialogProps) {
  const titleId = React.useId();
  // For destructive confirmations, default focus to Cancel so a reflexive
  // Enter/Space — or the focus Modal otherwise puts on the first button —
  // can't fire the irreversible action. Runs just after Modal's open-focus.
  const cancelRef = React.useRef<HTMLButtonElement | null>(null);
  React.useEffect(() => {
    if (!open || tone !== "danger") return;
    const id = window.setTimeout(() => cancelRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open, tone]);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      titleId={titleId}
      panelClassName="ui-card rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 animate-scale-in"
    >
      <div className="flex items-start gap-3">
        {tone === "danger" && (
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-danger/15 text-danger"
            aria-hidden="true"
          >
            <AlertTriangle className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg font-semibold ui-title">
            {title}
          </h2>
          {message && <p className="mt-1 text-sm ui-text-muted">{message}</p>}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          ref={cancelRef}
          variant="ghost"
          onClick={onCancel}
          disabled={loading}
        >
          {cancelLabel}
        </Button>
        <Button
          variant={tone === "danger" ? "danger" : "primary"}
          onClick={onConfirm}
          loading={loading}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
