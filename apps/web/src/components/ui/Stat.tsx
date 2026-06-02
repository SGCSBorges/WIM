/**
 * Stat — a KPI card for dashboards: an icon chip, a label, a large value, and
 * an optional footer (e.g. a drilldown link or delta). `tone` colors the icon
 * chip via theme-aware utility classes.
 */
import React from "react";

export type StatTone = "primary" | "success" | "warning" | "accent" | "danger";

const TONE_CHIP: Record<StatTone, string> = {
  primary: "bg-primary/15 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warn/15 text-warn",
  accent: "bg-accent/15 text-accent",
  danger: "bg-danger/15 text-danger",
};

export interface StatProps {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: React.ReactNode;
  tone?: StatTone;
  footer?: React.ReactNode;
  className?: string;
}

export function Stat({
  label,
  value,
  icon,
  tone = "primary",
  footer,
  className = "",
}: StatProps) {
  return (
    <div className={`ui-card p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium ui-text-muted">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight ui-title tabular-nums">
            {value}
          </p>
        </div>
        {icon && (
          <span
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${TONE_CHIP[tone]}`}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
      </div>
      {footer && <div className="mt-3 text-sm">{footer}</div>}
    </div>
  );
}
