import {
  KeyboardEvent,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
} from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  titleId: string;
  children: ReactNode;
  /** className for the inner panel (size, padding, etc.). */
  panelClassName?: string;
  /** Set to false to suppress backdrop-click dismissal. */
  closeOnBackdropClick?: boolean;
}

/**
 * Accessible modal shell:
 *
 * - `role="dialog"` + `aria-modal="true"` + `aria-labelledby={titleId}`
 *   so screen readers announce it correctly. The consumer's title element
 *   must carry `id={titleId}`.
 * - Esc closes (matches platform expectation).
 * - Tab is trapped inside the dialog while it's open. Shift+Tab from the
 *   first focusable wraps to the last, Tab from the last wraps to the
 *   first.
 * - First focusable element gets focus on open; focus restores to the
 *   element that was active before open on close.
 * - Body scroll is locked while open.
 *
 * All existing modal callsites (CreateUserModal, ResetPasswordModal, the
 * AdminDbBackup confirm panel, ArticlesList confirm overlays) can drop
 * their fixed-inset+backdrop scaffolding and just nest their content
 * inside <Modal>.
 */
export default function Modal({
  open,
  onClose,
  titleId,
  children,
  panelClassName = "ui-card rounded-lg shadow-2xl max-w-md w-full p-6 space-y-4",
  closeOnBackdropClick = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Focusables that Tab cycles through. Excludes inputs with type="hidden"
  // and elements with tabindex="-1" so we don't trap focus on programmatic
  // anchors.
  const getFocusables = useCallback((root: HTMLElement): HTMLElement[] => {
    const sel = [
      "a[href]",
      "button:not([disabled])",
      "textarea:not([disabled])",
      'input:not([disabled]):not([type="hidden"])',
      "select:not([disabled])",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");
    return Array.from(root.querySelectorAll<HTMLElement>(sel)).filter(
      (el) => !el.hasAttribute("aria-hidden") && el.offsetParent !== null
    );
  }, []);

  // Lifecycle: open/close side effects.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Defer focus shift one frame so the panel and its children are mounted.
    const t = window.setTimeout(() => {
      if (!panelRef.current) return;
      const focusables = getFocusables(panelRef.current);
      (focusables[0] ?? panelRef.current).focus();
    }, 0);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
      previouslyFocused.current?.focus?.();
    };
  }, [open, getFocusables]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !panelRef.current) return;

    const focusables = getFocusables(panelRef.current);
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;

    // Trap: wrap around the ends of the list.
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!open) return null;

  // Wrapping div is layout-only — the keyboard handler lives on the
  // dialog element itself so a11y-lint doesn't flag a static container
  // with interactive props, and so Tab/Esc only fire when focus is
  // genuinely inside the dialog.
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={() => closeOnBackdropClick && onClose()}
        className="ui-overlay absolute inset-0 w-full h-full cursor-default"
      />
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`relative ${panelClassName}`}
      >
        {children}
      </div>
    </div>
  );
}
