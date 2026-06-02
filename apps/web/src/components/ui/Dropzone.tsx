/**
 * A labeled drag-and-drop file area with a click-to-browse fallback (and
 * optional clipboard paste). Purely presentational over `useFileDrop` —
 * the caller owns the upload. Keeps a hidden <input type="file"> so keyboard
 * and screen-reader users get the same affordance as pointer users.
 */
import { ReactNode, useId, useRef } from "react";
import { UploadCloud } from "lucide-react";
import { useFileDrop } from "../../hooks/useFileDrop";

interface DropzoneProps {
  onFiles: (files: File[]) => void;
  /** MIME prefixes/types to accept, e.g. `["image/", "application/pdf"]`. */
  accept?: string[];
  /** `accept` attribute for the file input (comma-separated). */
  inputAccept?: string;
  multiple?: boolean;
  disabled?: boolean;
  paste?: boolean;
  label: string;
  hint?: string;
  icon?: ReactNode;
  className?: string;
}

export function Dropzone({
  onFiles,
  accept,
  inputAccept,
  multiple = false,
  disabled = false,
  paste = false,
  label,
  hint,
  icon,
  className,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inputId = useId();
  const { isOver, dropProps } = useFileDrop({
    onFiles,
    accept,
    disabled,
    paste,
  });

  const browse = () => {
    if (!disabled) inputRef.current?.click();
  };

  return (
    <div
      {...dropProps}
      className={`rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
        isOver ? "border-primary bg-surface-muted" : "border-line ui-text-muted"
      } ${disabled ? "opacity-60" : ""} ${className ?? ""}`}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={inputAccept}
        multiple={multiple}
        disabled={disabled}
        className="hidden"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={browse}
        disabled={disabled}
        className="mx-auto flex flex-col items-center gap-1.5"
      >
        <span aria-hidden="true" className="ui-text-muted">
          {icon ?? <UploadCloud className="h-6 w-6" />}
        </span>
        <span className="text-sm font-medium ui-title">{label}</span>
        {hint && <span className="text-xs ui-text-muted">{hint}</span>}
      </button>
    </div>
  );
}
