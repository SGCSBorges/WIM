/**
 * Form field primitives. `Field` renders a label + control + hint/error and
 * wires the accessibility relationships (htmlFor ⇄ id, aria-invalid,
 * aria-describedby) through context so the control inside it stays simple.
 * `Input`/`Textarea`/`Select` read that context automatically, or work
 * standalone. This keeps the `getByLabelText` + `aria-invalid` contract the
 * forms (and their tests) rely on.
 */
import React from "react";

interface FieldCtx {
  id: string;
  describedBy?: string;
  invalid: boolean;
  required: boolean;
}
const FieldContext = React.createContext<FieldCtx | null>(null);

const CONTROL_BASE =
  "w-full rounded-lg px-3 py-2 text-sm transition disabled:opacity-60 " +
  "disabled:cursor-not-allowed placeholder:text-muted/70";

function invalidRing(invalid: boolean): string {
  return invalid ? "border-danger ring-2 ring-danger/30 border" : "";
}

export interface FieldProps {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className = "",
  children,
}: FieldProps) {
  const generated = React.useId();
  const id = htmlFor ?? generated;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <FieldContext.Provider
      value={{
        id,
        describedBy,
        invalid: Boolean(error),
        required: Boolean(required),
      }}
    >
      <div className={`flex flex-col gap-1.5 ${className}`}>
        <label htmlFor={id} className="text-sm font-medium ui-title">
          {label}
          {required && (
            <span className="text-danger" aria-hidden="true">
              {" "}
              *
            </span>
          )}
        </label>
        {children}
        {hint && !error && (
          <p id={hintId} className="text-xs ui-text-muted">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className="text-xs ui-text-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}

function useControlAria(explicit: {
  id?: string;
  "aria-invalid"?: React.AriaAttributes["aria-invalid"];
  "aria-describedby"?: string;
  required?: boolean;
}) {
  const ctx = React.useContext(FieldContext);
  const explicitInvalid = explicit["aria-invalid"];
  const invalid =
    explicitInvalid === true ||
    explicitInvalid === "true" ||
    (explicitInvalid === undefined && (ctx?.invalid ?? false));
  // Reflect the Field's `required` onto the control so assistive tech
  // announces "required" — the visual `*` on the label is decorative
  // (aria-hidden) and wouldn't be heard otherwise. An explicit `required`
  // on the control still wins.
  const required = explicit.required ?? ctx?.required ?? false;
  return {
    id: explicit.id ?? ctx?.id,
    "aria-invalid": explicitInvalid ?? (ctx?.invalid || undefined),
    "aria-describedby": explicit["aria-describedby"] ?? ctx?.describedBy,
    required: required || undefined,
    invalid,
  };
}

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className = "", onWheel, ...rest }, ref) {
  const aria = useControlAria(rest);
  // On a focused number input the scroll wheel silently increments/
  // decrements the value — a classic way to corrupt a price/duration while
  // scrolling the form. Blur on wheel so the page scrolls instead.
  const handleWheel = (e: React.WheelEvent<HTMLInputElement>) => {
    if (rest.type === "number") e.currentTarget.blur();
    onWheel?.(e);
  };
  return (
    <input
      ref={ref}
      {...rest}
      onWheel={handleWheel}
      id={aria.id}
      aria-invalid={aria["aria-invalid"]}
      aria-describedby={aria["aria-describedby"]}
      required={aria.required}
      className={`ui-input ${CONTROL_BASE} ${invalidRing(aria.invalid)} ${className}`}
    />
  );
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className = "", ...rest }, ref) {
  const aria = useControlAria(rest);
  return (
    <textarea
      ref={ref}
      {...rest}
      id={aria.id}
      aria-invalid={aria["aria-invalid"]}
      aria-describedby={aria["aria-describedby"]}
      required={aria.required}
      className={`ui-input ${CONTROL_BASE} ${invalidRing(aria.invalid)} ${className}`}
    />
  );
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className = "", children, ...rest }, ref) {
  const aria = useControlAria(rest);
  return (
    <select
      ref={ref}
      {...rest}
      id={aria.id}
      aria-invalid={aria["aria-invalid"]}
      aria-describedby={aria["aria-describedby"]}
      required={aria.required}
      className={`ui-select ${CONTROL_BASE} ${invalidRing(aria.invalid)} ${className}`}
    >
      {children}
    </select>
  );
});
