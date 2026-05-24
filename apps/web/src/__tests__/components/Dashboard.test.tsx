import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../services/api", () => ({
  statisticsAPI: {
    getDashboard: vi.fn(),
  },
  profileAPI: {
    getMe: vi.fn().mockResolvedValue({
      userId: 1,
      email: "u@e.com",
      role: "USER",
      currency: "USD",
    }),
  },
}));

import Dashboard from "../../components/dashboard/Dashboard";
import { statisticsAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";

const mockedGet = statisticsAPI.getDashboard as unknown as ReturnType<
  typeof vi.fn
>;

const STATS = {
  articles: { total: 42, withWarranty: 7, withoutWarranty: 35 },
  locations: { byLocation: [], unassigned: 5 },
  warranties: {
    total: 9,
    active: 6,
    expired: 2,
    expiringSoon: 1,
    withAttachment: 4,
  },
  alerts: { total: 8 },
  sharing: { ownedSharedArticles: 3, totalSharedArticles: 11 },
  inventoryValue: { total: 1234, atRisk: 200, byLocation: [] },
};

function renderDashboard() {
  return render(
    <I18nProvider>
      <ThemeProvider>
        <Dashboard />
      </ThemeProvider>
    </I18nProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("<Dashboard />", () => {
  it("shows a busy status region while loading", async () => {
    // never resolves during this assertion window
    mockedGet.mockReturnValue(new Promise(() => {}));
    renderDashboard();
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });

  it("renders stat values once loaded", async () => {
    mockedGet.mockResolvedValueOnce(STATS);
    renderDashboard();
    await waitFor(() => {
      // total articles (42) appears in both the stat card and the
      // articles-overview detail card.
      expect(screen.getAllByText("42").length).toBeGreaterThan(0);
    });
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it("shows an alert with a working retry on error", async () => {
    mockedGet.mockRejectedValueOnce(new Error("boom"));
    renderDashboard();

    const alert = await screen.findByRole("alert");
    expect(alert).toBeInTheDocument();

    // Retry refetches.
    mockedGet.mockResolvedValueOnce(STATS);
    const user = userEvent.setup();
    const retry = screen.getByRole("button");
    await user.click(retry);

    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledTimes(2);
    });
  });
});
