/**
 * The dashboard's "Needs attention" card lists what can still be acted on:
 * warranties about to end (soonest first), then the most recently expired.
 * The articles API is mocked as a small server that honours the filter, the
 * sort and the limit, so the test reads the order a user would see.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const DAY = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * DAY).toISOString();

// articleId order is deliberately unrelated to the end dates: the oldest
// expiries have the highest ids, as when a long-owned item is entered late.
const ARTICLES = [
  { articleId: 1, articleNom: "Expired last week", end: at(-7) },
  { articleId: 2, articleNom: "Ends in 20 days", end: at(20) },
  { articleId: 3, articleNom: "Ends in 3 days", end: at(3) },
  { articleId: 4, articleNom: "Expired last month", end: at(-30) },
  { articleId: 5, articleNom: "Expired 2 years ago", end: at(-730) },
  { articleId: 6, articleNom: "Expired 3 years ago", end: at(-1095) },
  { articleId: 7, articleNom: "Expired 4 years ago", end: at(-1460) },
  { articleId: 8, articleNom: "Expired 5 years ago", end: at(-1825) },
  { articleId: 9, articleNom: "Expired 6 years ago", end: at(-2190) },
].map(({ articleId, articleNom, end }) => ({
  articleId,
  articleNom,
  garantie: { garantieId: articleId, garantieFin: end },
}));

type Params = {
  warrantyStatus?: "expired" | "expiringSoon";
  sort?: string;
  dir?: "asc" | "desc";
  limit?: number;
};

vi.mock("../../services/api", () => ({
  articlesAPI: {
    getAll: vi.fn(async (p: Params) => {
      const now = Date.now();
      const end = (a: (typeof ARTICLES)[number]) =>
        new Date(a.garantie.garantieFin).getTime();
      let items = ARTICLES.filter((a) =>
        p.warrantyStatus === "expired"
          ? end(a) < now
          : end(a) >= now && end(a) <= now + 30 * DAY
      );
      const sign = p.dir === "asc" ? 1 : -1;
      items = [...items].sort((a, b) =>
        p.sort === "warrantyEnd"
          ? sign * (end(a) - end(b))
          : sign * (a.articleId - b.articleId)
      );
      items = items.slice(0, p.limit ?? 50);
      return { items, total: items.length, page: 1, limit: p.limit ?? 50 };
    }),
  },
  alertsAPI: { getAll: vi.fn().mockResolvedValue([]), snooze: vi.fn() },
  warrantiesAPI: {},
}));

import { MemoryRouter } from "react-router";
import NeedsAttention from "../../components/dashboard/NeedsAttention";
import { I18nProvider } from "../../i18n/i18n";
import { ToastProvider } from "../../components/common/Toast";

describe("NeedsAttention", () => {
  it("lists warranties about to end first, then the most recently expired", async () => {
    render(
      <MemoryRouter>
        <I18nProvider>
          <ToastProvider>
            <NeedsAttention />
          </ToastProvider>
        </I18nProvider>
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0)
    );
    // Each row's first paragraph is the article name (the badge is a span).
    const names = screen
      .getAllByRole("listitem")
      .map((li) => li.querySelector("p")?.textContent);
    expect(names).toEqual([
      "Ends in 3 days",
      "Ends in 20 days",
      "Expired last week",
      "Expired last month",
      "Expired 2 years ago",
    ]);
  });
});
