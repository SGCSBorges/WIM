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
    // Presets live behind a per-row "Snooze…" menu; open it first.
    await user.click(screen.getByRole("button", { name: "Snooze…" }));
    await user.click(screen.getByRole("button", { name: /snooze 7d/i }));

    await waitFor(() => {
      expect(mocked.snooze).toHaveBeenCalledWith(5, 7);
    });
  });

  // Five side-by-side buttons per row overflowed a 390px viewport by up to
  // 158px (the only horizontal scroll left in the app). The presets now sit
  // behind one menu trigger, so a row renders exactly two controls at rest.
  it("keeps snooze presets behind a menu until opened", async () => {
    mocked.getAll.mockResolvedValueOnce([
      {
        alerteId: 9,
        alerteNom: "Boiler service",
        alerteDate: "2099-01-01T10:00:00.000Z",
        status: "SCHEDULED",
        kind: "CUSTOM",
      },
    ]);
    renderView();
    await screen.findByText("Boiler service");

    expect(
      screen.queryByRole("button", { name: /snooze 7d/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /snooze 30d/i })
    ).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Snooze…" });
    expect(trigger).toHaveAttribute("aria-haspopup");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(trigger);
    expect(screen.getByRole("button", { name: "Tomorrow" })).toBeVisible();
    expect(screen.getByRole("button", { name: /snooze 30d/i })).toBeVisible();
    expect(screen.getByRole("button", { name: "Custom…" })).toBeVisible();

    // The custom date picker is revealed inside the menu, not in the row.
    await user.click(screen.getByRole("button", { name: "Custom…" }));
    expect(screen.getByLabelText("Snooze until date")).toBeInTheDocument();
  });

  it("fetches every page of alerts, not just the server's default 50", async () => {
    const full = Array.from({ length: 500 }, (_, i) => ({
      alerteId: i + 1,
      alerteNom: `Alert ${i + 1}`,
      alerteDate: "2099-01-01T10:00:00.000Z",
      status: "SCHEDULED",
      kind: "CUSTOM",
    }));
    mocked.getAll.mockResolvedValueOnce(full).mockResolvedValueOnce([
      {
        alerteId: 501,
        alerteNom: "The five-hundred-and-first",
        alerteDate: "2099-01-01T10:00:00.000Z",
        status: "SCHEDULED",
        kind: "CUSTOM",
      },
    ]);
    renderView();
    expect(
      await screen.findByText("The five-hundred-and-first")
    ).toBeInTheDocument();
    expect(mocked.getAll).toHaveBeenCalledTimes(2);
    // page 1 then page 2, both at the API's 500-row ceiling
    expect(mocked.getAll.mock.calls[0].slice(1, 3)).toEqual([1, 500]);
    expect(mocked.getAll.mock.calls[1].slice(1, 3)).toEqual([2, 500]);
  });
});
