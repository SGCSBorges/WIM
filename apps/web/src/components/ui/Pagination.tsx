/**
 * Pagination — page navigation for the paginated list endpoints (which return
 * `{ items, total, page, limit }`). Shows a range summary + prev/next; the
 * caller supplies the labels (i18n) so this stays copy-free.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";

export interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  onPage: (page: number) => void;
  prevLabel: string;
  nextLabel: string;
  /** "{from}-{to} of {total}" — pass a pre-formatted string. */
  rangeLabel?: string;
  className?: string;
}

export function Pagination({
  page,
  limit,
  total,
  onPage,
  prevLabel,
  nextLabel,
  rangeLabel,
  className = "",
}: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (total <= limit) return null;

  return (
    <nav
      aria-label="Pagination"
      className={`flex items-center justify-between gap-3 ${className}`}
    >
      <p className="text-sm ui-text-muted tabular-nums">{rangeLabel}</p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          leftIcon={<ChevronLeft className="h-4 w-4" />}
        >
          {prevLabel}
        </Button>
        <span
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="text-sm ui-text-muted tabular-nums px-1"
        >
          {page} / {pages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          rightIcon={<ChevronRight className="h-4 w-4" />}
        >
          {nextLabel}
        </Button>
      </div>
    </nav>
  );
}
