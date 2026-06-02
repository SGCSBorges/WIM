/**
 * Lightweight anchored popover for header menus (notification bell, future
 * overflow menus). Manages its own open state, closes on outside-click and
 * Esc, and returns focus to the trigger on close. Not a modal — it doesn't
 * trap focus or lock scroll; it's for transient, dismissible panels.
 */
import {
  ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

interface PopoverProps {
  /** Trigger button contents; receives the current open state. */
  button: (open: boolean) => ReactNode;
  buttonClassName?: string;
  /** Accessible label for the trigger (it's icon-only at most call sites). */
  ariaLabel: string;
  /** Panel content; receives a `close` callback. */
  children: (close: () => void) => ReactNode;
  /** Horizontal alignment of the panel relative to the trigger. */
  align?: "start" | "end";
  panelClassName?: string;
  /** Fired once each time the panel opens (e.g. to mark items seen). */
  onOpen?: () => void;
}

export function Popover({
  button,
  buttonClassName,
  ariaLabel,
  children,
  align = "end",
  panelClassName,
  onOpen,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();

  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next) onOpen?.();
      return next;
    });
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
        className={buttonClassName}
      >
        {button(open)}
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={ariaLabel}
          className={`absolute z-40 mt-2 ${
            align === "end" ? "right-0" : "left-0"
          } ${panelClassName ?? ""}`}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}
