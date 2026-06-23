import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../services/api", () => ({
  statisticsAPI: {
    getDashboard: vi.fn(),
    // BudgetCard fetches this on mount; resolve with "no budget set" so it
    // self-hides and doesn't interfere with the dashboard assertions.
    getBudget: vi.fn().mockResolvedValue({
      currency: "USD",
      monthlyBudget: null,
      monthlySpend: 0,
      annualBudget: null,
      annualSpend: 0,
    }),
  },
  profileAPI: {
    getMe: vi.fn().mockResolvedValue({
      userId: 1,
      email: "u@e.com",
      role: "USER",
      currency: "USD",
    }),
  },
  // NeedsAttention pulls expired + expiringSoon articles. Empty results
  // keep it hidden (component returns null), so it doesn't interfere with
  // these tests.
  articlesAPI: {
    getAll: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  },
  alertsAPI: {
    getAll: vi.fn().mockResolvedValue([]),
    snooze: vi.fn(),
  },
  authAPI: { getRole: () => null },
}));

import { MemoryRouter } from "react-router-dom";
import Dashboard from "../../components/dashboard/Dashboard";
import { statisticsAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";
import { ToastProvider } from "../../components/common/Toast";

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
  inventoryValue: {
    total: 1234,
    currentTotal: 1000,
    atRisk: 200,
    byLocation: [],
    byTag: [],
  },
};

function renderDashboard() {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <ThemeProvider>
          <ToastProvider>
            <Dashboard />
          </ToastProvider>
        </ThemeProvider>
      </I18nProvider>
    </MemoryRouter>
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
