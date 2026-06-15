import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../services/api", () => ({
  profileAPI: {
    getSessions: vi.fn(),
    getLoginHistory: vi.fn(),
    getMe: vi.fn(),
    revokeSession: vi.fn(),
    revokeOtherSessions: vi.fn(),
  },
}));

import SecuritySection from "../../components/profile/SecuritySection";
import { profileAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";
import { ToastProvider } from "../../components/common/Toast";

const api = profileAPI as unknown as {
  getSessions: ReturnType<typeof vi.fn>;
  getLoginHistory: ReturnType<typeof vi.fn>;
  getMe: ReturnType<typeof vi.fn>;
  revokeSession: ReturnType<typeof vi.fn>;
  revokeOtherSessions: ReturnType<typeof vi.fn>;
};

const SESSIONS = {
  currentJti: "jti-current",
  items: [
    {
      id: 1,
      jti: "jti-current",
      deviceLabel: "Chrome on macOS",
      ip: "1.2.3.4",
      userAgent: "UA1",
      lastActiveAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
    {
      id: 2,
      jti: "jti-other",
      deviceLabel: "Safari on iOS",
      ip: "5.6.7.8",
      userAgent: "UA2",
      lastActiveAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
  ],
};

function renderSection() {
  render(
    <I18nProvider>
      <ThemeProvider>
        <ToastProvider>
          <SecuritySection />
        </ToastProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Defaults: 2FA off (panel renders idle), empty history.
  api.getMe.mockResolvedValue({ totpEnabled: false });
  api.getLoginHistory.mockResolvedValue([]);
});

describe("<SecuritySection />", () => {
  it("marks the current device and only offers Sign out on others", async () => {
    api.getSessions.mockResolvedValue(SESSIONS);
    renderSection();

    expect(await screen.findByText("Chrome on macOS")).toBeInTheDocument();
    expect(screen.getByText(/this device/i)).toBeInTheDocument();
    // Exactly one per-row "Sign out" (the non-current device); the current
    // device has none.
    const signOut = screen.getAllByRole("button", { name: /^sign out$/i });
    expect(signOut).toHaveLength(1);
  });

  it("revokes a session and removes its row", async () => {
    api.getSessions.mockResolvedValue(SESSIONS);
    api.revokeSession.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderSection();

    await screen.findByText("Safari on iOS");
    await user.click(screen.getByRole("button", { name: /^sign out$/i }));

    await waitFor(() => {
      expect(api.revokeSession).toHaveBeenCalledWith(2);
      expect(screen.queryByText("Safari on iOS")).not.toBeInTheDocument();
    });
  });

  it("signs out other devices via the bulk action", async () => {
    api.getSessions.mockResolvedValue(SESSIONS);
    api.revokeOtherSessions.mockResolvedValueOnce({ revoked: 1 });
    const user = userEvent.setup();
    renderSection();

    await screen.findByText("Chrome on macOS");
    await user.click(
      screen.getByRole("button", { name: /sign out other devices/i })
    );

    await waitFor(() => {
      expect(api.revokeOtherSessions).toHaveBeenCalledTimes(1);
    });
  });

  it("hides the sessions block when the sessions fetch fails", async () => {
    api.getSessions.mockRejectedValueOnce(new Error("401"));
    renderSection();

    await waitFor(() => expect(api.getSessions).toHaveBeenCalled());
    // Once the failure settles, the entire Active sessions block (heading
    // included) is hidden rather than showing a broken/empty list.
    await waitFor(() =>
      expect(screen.queryByText("Active sessions")).not.toBeInTheDocument()
    );
  });
});
