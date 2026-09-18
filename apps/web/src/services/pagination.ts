/**
 * Walk a paginated list endpoint until the whole collection is in hand.
 *
 * Most list endpoints (`/warranties`, `/alerts`, `/attachments`,
 * `/locations`, `/shares/*`, `/shared/articles`) return a bare array with
 * no total, and default to `limit=50` when the caller sends nothing. The
 * views that consume them filter, search and sort *client-side*, so they
 * need every row: calling them with no pagination meant the 51st warranty
 * or the 51st shared article silently never appeared anywhere in the UI.
 *
 * The API caps `limit` at 500 (`paginationQuery`), so we ask for full
 * pages and stop at the first short one. A hard page ceiling keeps a
 * misbehaving endpoint (one that ignores `page`) from looping forever.
 */
export const API_PAGE_MAX = 500;
const MAX_PAGES = 40; // 20 000 rows — far beyond any real inventory

export async function fetchAllPages<T>(
  fetchPage: (page: number, limit: number) => Promise<T[]>,
  limit: number = API_PAGE_MAX
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const rows = await fetchPage(page, limit);
    // A defensive guard: a mocked or misbehaving endpoint may hand back
    // something that isn't an array; treat it as the end of the list.
    if (!Array.isArray(rows)) break;
    out.push(...rows);
    if (rows.length < limit) break;
  }
  return out;
}
