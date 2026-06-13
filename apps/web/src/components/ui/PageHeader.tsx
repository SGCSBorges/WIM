/**
 * PageHeader — one consistent header for every route: optional breadcrumbs,
 * an icon chip, title + subtitle, and a right-aligned actions slot. Wrapping
 * each page in this gives the whole app a single rhythm and hierarchy.
 */
import React from "react";
import { Breadcrumbs, type Crumb } from "./Breadcrumbs";

export interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: Crumb[];
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  breadcrumbs,
  className = "",
}: PageHeaderProps) {
  return (
    <header className={`mb-6 animate-fade-in ${className}`}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumbs items={breadcrumbs} className="mb-2" />
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {icon && (
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary bg-gradient-brand text-primary-contrast shadow-md"
              aria-hidden="true"
            >
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h1
              className="truncate text-2xl font-bold tracking-tight ui-title"
              title={typeof title === "string" ? title : undefined}
            >
              {title}
            </h1>
            {subtitle && (
              <p className="mt-0.5 text-sm ui-text-muted">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
