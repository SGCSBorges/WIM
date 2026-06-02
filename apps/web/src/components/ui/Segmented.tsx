/**
 * Segmented — a compact pill group for mutually-exclusive choices (filter
 * presets, saved views, small enum filters). For larger tabbed surfaces use
 * <Tabs> (which carries full tablist semantics); this is a lightweight
 * single-select control rendered as a radiogroup.
 */
import React from "react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = "",
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex flex-wrap items-center gap-1 rounded-xl bg-surface-muted p-1 ${className}`}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={[
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              selected
                ? "bg-surface text-fg shadow-sm"
                : "ui-text-muted hover:text-fg",
            ].join(" ")}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
