import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

vi.mock("../../services/api", () => ({
  alertsAPI: {
    notifications: vi.fn(),
    markSeen: vi.fn().mockResolvedValue(undefined),
    snooze: vi.fn().mockResolvedValue({}),
  },
  authAPI: { getRole: () => null },
  profileAPI: { updatePreferences: vi.fn() },
}));

import NotificationBell from "../../components/layout/NotificationBell";
import { alertsAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";
import { PreferencesProvider } from "../../preferences/preferences";
import { ToastProvider } from "../../components/common/Toast";

const mocked = alertsAPI as unknown as {
  notifications: ReturnType<typeof vi.fn>;
  markSeen: ReturnType<typeof vi.fn>;
  snooze: ReturnType<typeof vi.fn>;
};

function renderBell() {
  return render(
    <I18nProvider>
      <ThemeProvider>
        <PreferencesProvider>
          <ToastProvider>
            <MemoryRouter>
              <NotificationBell />
            </MemoryRouter>
          </ToastProvider>
        </PreferencesProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("<NotificationBell />", () => {
  it("shows the unseen badge after fetching", async () => {
    mocked.notifications.mockResolvedValue({
      items: [
        {
          alerteId: 1,
          alerteNom: "Drill warranty expires",
          alerteDate: "2026-01-01T00:00:00.000Z",
          status: "SCHEDULED",
        },
      ],
      unseen: 1,
    });

    renderBell();

    expect(
      await screen.findByRole("button", { name: /notifications/i })
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("1")).toBeInTheDocument();
    });
  });

  it("opens, marks seen, and lists items", async () => {
    const user = userEvent.setup();
    mocked.notifications.mockResolvedValue({
      items: [
        {
          alerteId: 1,
          alerteNom: "Drill warranty expires",
          alerteDate: "2099-01-01T00:00:00.000Z",
          status: "SCHEDULED",
          article: {
            articleId: 42,
            articleNom: "Drill",
            articleModele: "DW-100",
          },
        },
      ],
      unseen: 1,
    });

    renderBell();
    await user.click(
      await screen.findByRole("button", { name: /notifications/i })
    );

    expect(
      await screen.findByText("Drill warranty expires")
    ).toBeInTheDocument();
    expect(mocked.markSeen).toHaveBeenCalledTimes(1);
  });

  it("snoozes an alert and removes the row", async () => {
    const user = userEvent.setup();
    mocked.notifications.mockResolvedValue({
      items: [
        {
          alerteId: 1,
          alerteNom: "Drill warranty expires",
          alerteDate: "2099-01-01T00:00:00.000Z",
          status: "SCHEDULED",
        },
      ],
      unseen: 0,
    });

    renderBell();
    await user.click(
      await screen.findByRole("button", { name: /notifications/i })
    );
    await user.click(await screen.findByRole("button", { name: "7d" }));

    await waitFor(() => expect(mocked.snooze).toHaveBeenCalledWith(1, 7));
    await waitFor(() =>
      expect(
        screen.queryByText("Drill warranty expires")
      ).not.toBeInTheDocument()
    );
  });

  it("hides itself if the endpoint is unavailable", async () => {
    mocked.notifications.mockRejectedValue(new Error("404"));
    renderBell();
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /notifications/i })
      ).not.toBeInTheDocument();
    });
  });
});
