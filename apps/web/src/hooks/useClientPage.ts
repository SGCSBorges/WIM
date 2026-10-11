import { useEffect, useState } from "react";

/**
 * One page at a time of a list the view already holds in full. Several views
 * fetch every row (they filter and sort client-side) and rendered them all:
 * a showcase account's alerts page was 12,000 px tall. `resetKey` sends the
 * reader back to the first page when the filter or sort changes; editing or
 * removing a row keeps the page (clamped if it ran out of rows).
 */
export function useClientPage<T>(items: T[], limit: number, resetKey = "") {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [resetKey]);
  const pages = Math.max(1, Math.ceil(items.length / limit));
  const current = Math.min(page, pages);
  const start = (current - 1) * limit;
  return {
    pageItems: items.slice(start, start + limit),
    page: current,
    setPage,
    limit,
    total: items.length,
    from: items.length ? start + 1 : 0,
    to: Math.min(start + limit, items.length),
  };
}

export type ClientPage<T> = ReturnType<typeof useClientPage<T>>;
