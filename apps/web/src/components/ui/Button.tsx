/**
 * Button — the single source of truth for actions. Wraps the theme-aware
 * `.ui-btn-*` utilities with consistent sizing, optional icons, a loading
 * state, and a `buttonClasses` helper so links (`<Link>`/`<a>`) can wear the
 * exact same styling without duplicating it.
 */
import React from "react";
import { Loader2 } from "lucide-react";

export type ButtonVariant =
  | "primary"
  | "accent"
  | "ghost"
  | "outline"
  | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIES: Record<ButtonVariant, string> = {
  primary: "ui-btn-primary",
  accent: "ui-btn-accent",
  ghost: "ui-btn-ghost",
  danger: "ui-btn-danger",
  // Tokenized outline — neutral surface with a hairline that works on every theme.
  outline:
    "border border-line bg-surface text-fg hover:bg-surface-muted transition-colors",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "text-xs px-2.5 py-1.5 gap-1.5",
  md: "text-sm px-3.5 py-2 gap-2",
  lg: "text-base px-5 py-2.5 gap-2",
};

const BASE =
  "inline-flex items-center justify-center font-medium rounded-lg select-none " +
  "disabled:cursor-not-allowed whitespace-nowrap";

export function buttonClasses(opts?: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}): string {
  const {
    variant = "primary",
    size = "md",
    fullWidth,
    className = "",
  } = opts ?? {};
  return [
    BASE,
    SIZES[size],
    VARIES[variant],
    fullWidth ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      fullWidth,
      loading = false,
      leftIcon,
      rightIcon,
      disabled,
      className,
      children,
      type = "button",
      ...rest
    },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={buttonClasses({ variant, size, fullWidth, className })}
        {...rest}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          leftIcon
        )}
        {children}
        {!loading && rightIcon}
      </button>
    );
  }
);
