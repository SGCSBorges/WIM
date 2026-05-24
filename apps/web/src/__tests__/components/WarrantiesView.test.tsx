import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

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
    <I18nProvider>
      <ThemeProvider>
        <WarrantiesView />
      </ThemeProvider>
    </I18nProvider>
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
});
