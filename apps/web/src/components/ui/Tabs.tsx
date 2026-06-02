/**
 * Tabs — reusable WAI-ARIA tablist (roving focus, arrow-key navigation,
 * aria-selected, aria-controls). Each tab's DOM id is `${idPrefix}-${id}` so
 * existing contracts (e.g. AdminUsers' `admin-tab-*`) are preserved by passing
 * the matching idPrefix.
 */
import React from "react";

export interface TabItem {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  idPrefix: string;
  className?: string;
  "aria-label"?: string;
}

export function Tabs({
  tabs,
  value,
  onChange,
  idPrefix,
  className = "",
  "aria-label": ariaLabel,
}: TabsProps) {
  const onKeyDown = (e: React.KeyboardEvent) => {
    const idx = tabs.findIndex((t) => t.id === value);
    if (idx < 0) return;
    let next = idx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown")
      next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange(tabs[next].id);
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex flex-wrap gap-1 rounded-xl bg-surface-muted p-1 ${className}`}
    >
      {tabs.map((t) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            id={`${idPrefix}-${t.id}`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onKeyDown={onKeyDown}
            onClick={() => onChange(t.id)}
            className={[
              "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              selected
                ? "bg-surface text-fg shadow-sm"
                : "ui-text-muted hover:text-fg",
            ].join(" ")}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
