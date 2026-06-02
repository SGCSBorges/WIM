/**
 * Badge — small status pill built on the theme-aware `.ui-badge-*` utilities.
 * `tone` picks the semantic color; `icon` optionally precedes the label.
 */
import React from "react";

export type BadgeTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "power"
  | "admin";

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: "ui-badge",
  info: "ui-badge-info",
  success: "ui-badge-success ui-text-success",
  warning: "ui-badge-warning",
  danger: "ui-badge-danger ui-text-error",
  power: "ui-badge-power",
  admin: "ui-badge-admin",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  icon?: React.ReactNode;
}

export function Badge({
  tone = "neutral",
  icon,
  className = "",
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASS[tone]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </span>
  );
}
