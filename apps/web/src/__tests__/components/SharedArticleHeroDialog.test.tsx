import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SharedArticleRow } from "../../services/api";
import SharedArticleHeroDialog from "../../components/sharing/SharedArticleHeroDialog";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";
import { PreferencesProvider } from "../../preferences/preferences";

function row(
  overrides: Partial<SharedArticleRow["article"]> = {}
): SharedArticleRow {
  return {
    rowId: 1,
    source: "global",
    permission: "READ",
    owner: { userId: 9, email: "owner@example.com" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    article: {
      articleId: 42,
      articleNom: "OLED TV",
      articleModele: "C3",
      brand: "LG",
      serialNumber: "SN-12345",
      articleDescription: "Lightly used, boxed.",
      productImageUrl: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ownerUserId: 9,
      locations: [{ locationId: 3, location: { name: "Living room" } }],
      garantie: {
        garantieId: 7,
        garantieNom: "Manufacturer",
        garantieFin: "2030-01-01T00:00:00.000Z",
        garantieIsValide: true,
      },
      ...overrides,
    },
  };
}

function renderDialog(r: SharedArticleRow, onClose = vi.fn()) {
  render(
    <I18nProvider>
      <ThemeProvider>
        <PreferencesProvider>
          <SharedArticleHeroDialog row={r} onClose={onClose} />
        </PreferencesProvider>
      </ThemeProvider>
    </I18nProvider>
  );
  return { onClose };
}

describe("<SharedArticleHeroDialog />", () => {
  it("shows the item's identifying details and owner", () => {
    renderDialog(row());
    // Name appears as the dialog heading.
    expect(
      screen.getByRole("heading", { name: "OLED TV" })
    ).toBeInTheDocument();
    expect(screen.getByText("SN-12345")).toBeInTheDocument();
    expect(screen.getByText("Living room")).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByText(/Lightly used/)).toBeInTheDocument();
  });

  it("never discloses the owner's purchase price", () => {
    // The row type doesn't even carry a price, but guard against a regression
    // that pipes one through: nothing currency-like should render.
    const r = row();
    (r.article as unknown as { purchasePrice: string }).purchasePrice =
      "999.99";
    renderDialog(r);
    expect(screen.queryByText(/999\.99/)).not.toBeInTheDocument();
  });
});
