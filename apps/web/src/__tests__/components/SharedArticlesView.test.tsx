/**
 * "Shared with me" shows a page at a time: a household's list ran past a
 * hundred rows and made the Sharing page 9,000 px tall.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { SharedArticleRow } from "../../services/api";

const ROWS: SharedArticleRow[] = Array.from({ length: 45 }, (_, i) => ({
  rowId: i + 1,
  source: "global",
  permission: "READ",
  owner: { userId: 9, email: "owner@example.com" },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  article: {
    articleId: i + 1,
    articleNom: `Item ${i + 1}`,
    articleModele: `M${i + 1}`,
    brand: null,
    articleDescription: null,
    productImageUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ownerUserId: 9,
    locations: [],
    garantie: null,
  },
}));

vi.mock("../../services/api", () => ({
  sharedAPI: {
    getSharedArticles: vi.fn(async (page = 1, limit = 50) =>
      ROWS.slice((page - 1) * limit, page * limit)
    ),
  },
}));

import SharedArticlesView from "../../components/sharing/SharedArticlesView";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";
import { ToastProvider } from "../../components/common/Toast";

const names = () =>
  screen
    .getAllByRole("listitem")
    .map((li) => li.querySelector(".ui-title")?.textContent);

describe("<SharedArticlesView />", () => {
  it("shows twenty rows at a time, with prev/next", async () => {
    render(
      <MemoryRouter>
        <I18nProvider>
          <ThemeProvider>
            <ToastProvider>
              <SharedArticlesView />
            </ToastProvider>
          </ThemeProvider>
        </I18nProvider>
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(screen.getAllByRole("listitem")).toHaveLength(20)
    );
    expect(names()[0]).toBe("Item 1 — M1");
    expect(names()[19]).toBe("Item 20 — M20");

    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(names()).toHaveLength(20);
    expect(names()[0]).toBe("Item 21 — M21");

    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(names()).toHaveLength(5);
    expect(names()[4]).toBe("Item 45 — M45");
    expect(screen.getByText("41–45 of 45")).toBeInTheDocument();
  });
});
