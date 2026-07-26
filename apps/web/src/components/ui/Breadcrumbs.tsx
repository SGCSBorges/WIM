/**
 * Breadcrumbs — compact "you are here" trail. Items with a `to` render as
 * router links; the last (current) item is plain text and marked
 * aria-current="page".
 */
import React from "react";
import { Link } from "react-router";
import { ChevronRight } from "lucide-react";

export interface Crumb {
  label: React.ReactNode;
  to?: string;
}

export function Breadcrumbs({
  items,
  className = "",
}: {
  items: Crumb[];
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1 text-xs ui-text-muted">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={i} className="flex items-center gap-1">
              {c.to && !last ? (
                <Link to={c.to} className="ui-action-primary hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={last ? "ui-title font-medium" : "ui-title"}
                >
                  {c.label}
                </span>
              )}
              {!last && (
                <ChevronRight
                  className="h-3.5 w-3.5 opacity-60"
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
