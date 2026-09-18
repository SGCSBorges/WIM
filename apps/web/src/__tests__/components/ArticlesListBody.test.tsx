import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { FetchedArticle } from "../../types";
import ArticlesCardList from "../../components/articles/ArticlesCardList";
import ArticlesTable from "../../components/articles/ArticlesTable";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";
import { PreferencesProvider } from "../../preferences/preferences";

// ShareArticleButton reaches for the API + toast context; the table-vs-cards
// wiring under test doesn't care about its internals, so stub it out.
vi.mock("../../components/articles/ShareArticleButton", () => ({
  default: () => null,
}));

function article(overrides: Partial<FetchedArticle> = {}): FetchedArticle {
  return {
    articleId: 1,
    articleNom: "OLED TV",
    articleModele: "C3",
    productImageUrl: null,
    purchasePrice: 1500,
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    garantie: null,
    ...overrides,
  };
}

const noopWarranty = () => ({ tone: "neutral" as const, label: "—" });
const noDays = () => null;

function wrap(ui: React.ReactNode) {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <ThemeProvider>
          <PreferencesProvider>{ui}</PreferencesProvider>
        </ThemeProvider>
      </I18nProvider>
    </MemoryRouter>
  );
}

describe("<ArticlesCardList /> (extracted from ArticlesList)", () => {
  it("renders the item and wires selection / edit / delete callbacks", () => {
    const onToggleSelected = vi.fn();
    const onToggleSelectAll = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const a = article();

    wrap(
      <ArticlesCardList
        articles={[a]}
        selectedIds={new Set()}
        allPageSelected={false}
        selectAllRef={() => {}}
        onToggleSelectAll={onToggleSelectAll}
        onToggleSelected={onToggleSelected}
        getWarrantyStatus={noopWarranty}
        getDaysUntilExpiry={noDays}
        currency="USD"
        language="en"
        onEdit={onEdit}
        onDelete={onDelete}
        onToggleFavorite={vi.fn()}
      />
    );

    // Item identity renders, linking to its detail page.
    const link = screen.getByRole("link", { name: "OLED TV" });
    expect(link).toHaveAttribute("href", "/articles/1");

    // Row checkbox toggles selection for this article id.
    const rowCheckbox = screen.getByRole("checkbox", { name: /OLED TV/ });
    fireEvent.click(rowCheckbox);
    expect(onToggleSelected).toHaveBeenCalledWith(1);

    // Edit + delete buttons fire with the article.
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(onEdit).toHaveBeenCalledWith(a);
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith(a);
  });
});

describe("<ArticlesTable /> (extracted from ArticlesList)", () => {
  it("renders a row and wires select-all / edit / delete callbacks", () => {
    const onToggleSelectAll = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const a = article();

    wrap(
      <ArticlesTable
        articles={[a]}
        selectedIds={new Set()}
        allPageSelected={false}
        selectAllRef={() => {}}
        onToggleSelectAll={onToggleSelectAll}
        onToggleSelected={() => {}}
        getWarrantyStatus={noopWarranty}
        getDaysUntilExpiry={noDays}
        currency="USD"
        language="en"
        isPowerUser={false}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggleFavorite={vi.fn()}
        onShareChanged={() => {}}
      />
    );

    expect(screen.getByRole("link", { name: "OLED TV" })).toBeInTheDocument();

    // The header select-all toggles the whole page.
    const selectAll = screen.getAllByRole("checkbox")[0];
    fireEvent.click(selectAll);
    expect(onToggleSelectAll).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(onEdit).toHaveBeenCalledWith(a);
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith(a);
  });

  // The lifecycle badge used to be stacked under the warranty badge in the
  // "Warranty" cell, where "Sold" read as a warranty state. It has its own
  // column now; ACTIVE renders as muted text instead of a pill.
  it("shows the item status in its own column, apart from the warranty", () => {
    const a = article({ status: "SOLD" });
    wrap(
      <ArticlesTable
        articles={[a]}
        selectedIds={new Set()}
        allPageSelected={false}
        selectAllRef={() => {}}
        onToggleSelectAll={() => {}}
        onToggleSelected={() => {}}
        getWarrantyStatus={() => ({ tone: "success", label: "Under warranty" })}
        getDaysUntilExpiry={noDays}
        currency="USD"
        language="en"
        isPowerUser={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleFavorite={vi.fn()}
        onShareChanged={() => {}}
      />
    );
    const headers = screen
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers).toContain("Status");
    expect(headers.indexOf("Status")).toBeLessThan(headers.indexOf("Warranty"));

    const statusCell = screen.getByText("Sold").closest("td");
    const warrantyCell = screen.getByText("Under warranty").closest("td");
    expect(statusCell).not.toBeNull();
    expect(statusCell).not.toBe(warrantyCell);
  });

  it("renders the default ACTIVE status as plain text, not a badge", () => {
    wrap(
      <ArticlesTable
        articles={[article({ status: "ACTIVE" })]}
        selectedIds={new Set()}
        allPageSelected={false}
        selectAllRef={() => {}}
        onToggleSelectAll={() => {}}
        onToggleSelected={() => {}}
        getWarrantyStatus={noopWarranty}
        getDaysUntilExpiry={noDays}
        currency="USD"
        language="en"
        isPowerUser={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleFavorite={vi.fn()}
        onShareChanged={() => {}}
      />
    );
    const active = screen.getByText("Active");
    expect(active.tagName).toBe("SPAN");
    expect(active.className).toContain("ui-text-muted");
  });
});
