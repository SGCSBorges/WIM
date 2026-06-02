/**
 * Drag-and-drop + clipboard-paste file capture. Returns props to spread on a
 * drop target plus an `isOver` flag for highlight styling. Files are filtered
 * by `accept` (an array of MIME prefixes/types, e.g. `["image/", "application/pdf"]`)
 * before reaching `onFiles`, so callers never see rejected types.
 */
import { DragEvent, useCallback, useEffect, useRef, useState } from "react";

interface UseFileDropOptions {
  onFiles: (files: File[]) => void;
  accept?: string[];
  disabled?: boolean;
  /** Also capture images pasted from the clipboard while mounted. */
  paste?: boolean;
}

function matches(file: File, accept?: string[]): boolean {
  if (!accept || accept.length === 0) return true;
  return accept.some((a) =>
    a.endsWith("/") ? file.type.startsWith(a) : file.type === a
  );
}

export function useFileDrop({
  onFiles,
  accept,
  disabled = false,
  paste = false,
}: UseFileDropOptions) {
  const [isOver, setIsOver] = useState(false);
  // Drag enter/leave fire for child elements too; count depth so the
  // highlight only clears when the pointer truly leaves the target.
  const depth = useRef(0);

  const emit = useCallback(
    (list: FileList | File[] | null | undefined) => {
      if (!list) return;
      const files = Array.from(list).filter((f) => matches(f, accept));
      if (files.length > 0) onFiles(files);
    },
    [accept, onFiles]
  );

  const onDragEnter = (e: DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    depth.current += 1;
    setIsOver(true);
  };
  const onDragOver = (e: DragEvent) => {
    if (disabled) return;
    e.preventDefault();
  };
  const onDragLeave = (e: DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setIsOver(false);
  };
  const onDrop = (e: DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    depth.current = 0;
    setIsOver(false);
    emit(e.dataTransfer?.files);
  };

  useEffect(() => {
    if (!paste || disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files && files.length > 0) emit(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [paste, disabled, emit]);

  return {
    isOver,
    dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop },
  };
}
