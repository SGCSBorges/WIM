import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type ToastKind = "success" | "error" | "info";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  // ms before auto-dismiss; null = sticky until user closes
  ttl: number | null;
  action?: ToastAction;
}

interface ToastContextValue {
  show: (
    message: string,
    options?: { kind?: ToastKind; ttl?: number | null; action?: ToastAction }
  ) => number;
  dismiss: (id: number) => void;
  clear: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

const KIND_CLASS: Record<ToastKind, string> = {
  success: "ui-alert-success ui-text-success",
  error: "ui-alert-error ui-text-error",
  info: "ui-alert-info text-slate-800",
};

const KIND_ICON: Record<ToastKind, string> = {
  success: "✅",
  error: "❌",
  info: "ℹ️",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const show = useCallback<ToastContextValue["show"]>(
    (message, options) => {
      const id = nextId++;
      const kind = options?.kind ?? "info";
      const ttl = options?.ttl === undefined ? 5000 : options.ttl;
      setToasts((prev) => [
        ...prev,
        { id, kind, message, ttl, action: options?.action },
      ]);
      if (ttl !== null && ttl > 0) {
        const timer = setTimeout(() => dismiss(id), ttl);
        timersRef.current.set(id, timer);
      }
      return id;
    },
    [dismiss]
  );

  const clear = useCallback(() => {
    setToasts([]);
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current.clear();
  }, []);

  // Clear all pending timers on unmount (e.g. theme reload / HMR in dev).
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const value = useMemo(
    () => ({ show, dismiss, clear }),
    [show, dismiss, clear]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        // The polite live region announces success/info; assertive errors
        // are duplicated below for screen readers.
        className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto border rounded-lg p-3 flex items-start gap-3 shadow-md ${KIND_CLASS[t.kind]}`}
          >
            <span aria-hidden="true" className="text-base leading-none mt-0.5">
              {KIND_ICON[t.kind]}
            </span>
            <p className="text-sm flex-1 break-words">{t.message}</p>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
                className="text-sm font-semibold underline shrink-0 hover:opacity-70"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="text-current hover:opacity-70 shrink-0"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
