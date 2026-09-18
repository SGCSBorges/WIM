/**
 * Accessible modal shell — use this for every dialog instead of hand-rolling
 * focus management. Handles role="dialog", aria-modal, aria-labelledby
 * wiring, focus trap, Esc to close, and an optional backdrop-click close.
 * Consumer supplies the title element with id={titleId}.
 */
import {
  KeyboardEvent,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { useI18nOptional } from "../../i18n/i18n";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  titleId: string;
  children: ReactNode;
  /** className for the inner panel (size, padding, etc.). */
  panelClassName?: string;
  /** Set to false to suppress backdrop-click dismissal. */
  closeOnBackdropClick?: boolean;
  /** `center` (default) is the classic dialog. `side` pins the panel to the
   *  right edge, full height, scrolling its own content — a slide-over for
   *  focused editing (create / edit article) that keeps the list in place
   *  behind it instead of pushing it down the page. */
  variant?: "center" | "side";
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
  panelClassName,
  closeOnBackdropClick = true,
  variant = "center",
}: ModalProps) {
  const { t } = useI18nOptional();
  const panelClasses =
    panelClassName ??
    (variant === "side"
      ? "ui-card h-full w-full max-w-2xl overflow-y-auto rounded-none p-5 shadow-2xl sm:p-6"
      : "ui-card rounded-lg shadow-2xl max-w-md w-full p-6 space-y-4");
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
  //
  // Overflow: the outer container scrolls and the centering wrapper carries
  // `min-h-full` so a short dialog stays vertically centered while a dialog
  // taller than the viewport scrolls into reach instead of being clipped.
  // `pointer-events-none` on the wrapper lets backdrop clicks in the padding
  // pass through to the close button beneath; the panel re-enables them.
  //
  // The side variant needs the opposite: a fixed, full-height flex row with
  // the panel at the end, and the panel (not the container) scrolling.
  return (
    <div
      className={`fixed inset-0 z-50 overscroll-contain ${
        variant === "side" ? "flex justify-end" : "overflow-y-auto"
      }`}
    >
      <button
        type="button"
        aria-label={t("a11y.close")}
        tabIndex={-1}
        onClick={() => closeOnBackdropClick && onClose()}
        className="ui-overlay fixed inset-0 h-full w-full cursor-default"
      />
      <div
        className={
          variant === "side"
            ? "pointer-events-none relative flex h-full w-full justify-end"
            : "pointer-events-none relative flex min-h-full items-center justify-center p-4"
        }
      >
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-variant={variant}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className={`pointer-events-auto relative animate-fade-in ${panelClasses}`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
