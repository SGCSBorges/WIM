import { describe, it, expect, vi } from "vitest";
import { fetchAllPages, API_PAGE_MAX } from "../../services/pagination";

describe("fetchAllPages", () => {
  it("asks for full pages and stops at the first short one", async () => {
    // 3 full pages of 2 then a short page of 1 → 7 rows, 4 requests.
    const pages = [[1, 2], [3, 4], [5, 6], [7]];
    const fetchPage = vi.fn(
      async (page: number, _limit: number) => pages[page - 1] ?? []
    );

    const rows = await fetchAllPages(fetchPage, 2);

    expect(rows).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(fetchPage).toHaveBeenCalledTimes(4);
    expect(fetchPage.mock.calls.map((c) => c[0])).toEqual([1, 2, 3, 4]);
    expect(fetchPage.mock.calls.every((c) => c[1] === 2)).toBe(true);
  });

  it("uses the API's maximum page size by default", async () => {
    const fetchPage = vi.fn(async () => []);
    await fetchAllPages(fetchPage);
    expect(fetchPage).toHaveBeenCalledWith(1, API_PAGE_MAX);
    expect(API_PAGE_MAX).toBe(500);
  });

  it("returns a single short page unchanged (no extra request)", async () => {
    const fetchPage = vi.fn(async () => ["a"]);
    expect(await fetchAllPages(fetchPage)).toEqual(["a"]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("stops when an endpoint ignores `page` instead of looping forever", async () => {
    // Always a full page, forever — must terminate.
    const fetchPage = vi.fn(async (_p: number, limit: number) =>
      Array.from({ length: limit }, (_, i) => i)
    );
    const rows = await fetchAllPages(fetchPage, 5);
    expect(fetchPage.mock.calls.length).toBeLessThanOrEqual(40);
    expect(rows.length).toBe(fetchPage.mock.calls.length * 5);
  });

  it("treats a non-array response as the end of the list", async () => {
    const fetchPage = vi.fn(async () => undefined as unknown as string[]);
    expect(await fetchAllPages(fetchPage)).toEqual([]);
  });
});
