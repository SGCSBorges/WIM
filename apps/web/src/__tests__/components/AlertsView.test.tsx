import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../services/api", () => ({
  alertsAPI: {
    getAll: vi.fn(),
    create: vi.fn(),
    snooze: vi.fn(),
    cancel: vi.fn(),
  },
}));

import AlertsView from "../../components/alerts/AlertsView";
import { alertsAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";
import { ToastProvider } from "../../components/common/Toast";

const mocked = alertsAPI as unknown as {
  getAll: ReturnType<typeof vi.fn>;
  snooze: ReturnType<typeof vi.fn>;
};

function renderView() {
  render(
    <I18nProvider>
      <ThemeProvider>
        <ToastProvider>
          <AlertsView />
        </ToastProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("<AlertsView />", () => {
  it("lists alerts on load", async () => {
    mocked.getAll.mockResolvedValueOnce([
      {
        alerteId: 1,
        alerteNom: "Filter change",
        alerteDate: "2099-01-01T10:00:00.000Z",
        status: "SCHEDULED",
        kind: "CUSTOM",
      },
    ]);
    renderView();
    expect(await screen.findByText("Filter change")).toBeInTheDocument();
  });

  it("snoozes a scheduled alert", async () => {
    mocked.getAll
      .mockResolvedValueOnce([
        {
          alerteId: 5,
          alerteNom: "Service car",
          alerteDate: "2099-01-01T10:00:00.000Z",
          status: "SCHEDULED",
          kind: "CUSTOM",
        },
      ])
      .mockResolvedValueOnce([]);
    mocked.snooze.mockResolvedValueOnce({});
    renderView();
    await screen.findByText("Service car");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /snooze 7d/i }));

    await waitFor(() => {
      expect(mocked.snooze).toHaveBeenCalledWith(5, 7);
    });
  });
});
