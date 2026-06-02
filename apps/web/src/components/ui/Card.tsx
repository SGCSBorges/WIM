/**
 * Card / Section — tokenized containers. `Card` is the elevated surface
 * (uses the theme-aware `.ui-card`); `interactive` adds the hover-lift
 * affordance. `Section` is a lighter titled block for grouping content.
 */
import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  as?: "div" | "article" | "section";
}

export function Card({
  interactive = false,
  as: Tag = "div",
  className = "",
  children,
  ...rest
}: CardProps) {
  return (
    <Tag
      className={`ui-card p-5 ${interactive ? "ui-lift cursor-pointer" : ""} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export interface SectionProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function Section({
  title,
  description,
  actions,
  icon,
  className = "",
  children,
}: SectionProps) {
  return (
    <section className={`ui-card p-5 sm:p-6 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {icon && (
              <span className="text-primary" aria-hidden="true">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              {title && (
                <h2 className="text-base font-semibold ui-title">{title}</h2>
              )}
              {description && (
                <p className="mt-0.5 text-sm ui-text-muted">{description}</p>
              )}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
