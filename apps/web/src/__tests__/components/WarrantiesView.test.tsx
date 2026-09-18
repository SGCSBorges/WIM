import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("../../services/api", () => ({
  warrantiesAPI: { getAll: vi.fn() },
}));

import WarrantiesView from "../../components/warranties/WarrantiesView";
import { warrantiesAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";

const mockedGet = warrantiesAPI.getAll as unknown as ReturnType<typeof vi.fn>;

function renderView() {
  render(
    <MemoryRouter>
      <I18nProvider>
        <ThemeProvider>
          <WarrantiesView />
        </ThemeProvider>
      </I18nProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("<WarrantiesView />", () => {
  it("renders warranties once loaded", async () => {
    mockedGet.mockResolvedValueOnce([
      {
        garantieId: 1,
        garantieNom: "Laptop warranty",
        garantieDateAchat: "2025-01-15T00:00:00.000Z",
        garantieDuration: 24,
        garantieArticleId: 9,
      },
    ]);
    renderView();
    expect(await screen.findByText("Laptop warranty")).toBeInTheDocument();
  });

  it("does not crash on a malformed purchase date", async () => {
    mockedGet.mockResolvedValueOnce([
      {
        garantieId: 2,
        garantieNom: "Bad date warranty",
        garantieDateAchat: "not-a-date",
        garantieDuration: 12,
        garantieArticleId: 3,
      },
    ]);
    renderView();
    // The row still renders (date falls back to an em dash instead of throwing).
    expect(await screen.findByText("Bad date warranty")).toBeInTheDocument();
  });

  it("shows an error banner with retry on failure", async () => {
    mockedGet.mockRejectedValueOnce(new Error("boom"));
    renderView();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  // GET /warranties defaults to 50 rows and returns no total. The view
  // filters and searches client-side, so it must hold the whole list: an
  // account with 72 warranties showed 50 and no way to reach the rest.
  it("walks every page instead of stopping at the server default", async () => {
    const row = (id: number) => ({
      garantieId: id,
      garantieNom: `Warranty ${id}`,
      garantieDateAchat: "2025-01-15T00:00:00.000Z",
      garantieDuration: 24,
      garantieArticleId: id,
      status: "ACTIVE",
    });
    mockedGet
      .mockResolvedValueOnce(Array.from({ length: 500 }, (_, i) => row(i + 1)))
      .mockResolvedValueOnce([row(501)]);
    renderView();
    expect(await screen.findByText("Warranty 501")).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
    expect(mockedGet).toHaveBeenNthCalledWith(1, 1, 500);
    expect(mockedGet).toHaveBeenNthCalledWith(2, 2, 500);
  });
});
