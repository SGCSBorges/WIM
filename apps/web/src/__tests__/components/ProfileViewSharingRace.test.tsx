/**
 * The sharing panel is the one place where the stale-reload race is plainly
 * reachable through the UI: `sharingLoaded` never flips back to false, so the
 * list stays interactive while a reload is in flight, and `sharingBusy` is
 * per-item, so revoking a second person doesn't disable the first row. Two
 * `loadSharing` calls therefore overlap, and without a guard the earlier one
 * — which was issued before the second revoke — repaints the person you just
 * removed back into the list.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

vi.mock("../../services/api", () => ({
  profileAPI: {
    getMe: vi.fn(),
    updatePreferences: vi.fn(),
    getLoginHistory: vi.fn().mockResolvedValue([]),
    getSessions: vi.fn().mockResolvedValue({ items: [], currentJti: null }),
    updateEmail: vi.fn(),
    updatePassword: vi.fn(),
    deleteAccount: vi.fn(),
    revokeSession: vi.fn(),
    revokeOtherSessions: vi.fn(),
  },
  billingAPI: {
    getBillingMe: vi.fn().mockResolvedValue({ subscription: null }),
  },
  articlesAPI: {
    getAll: vi.fn(),
    getMySharedPublic: vi.fn().mockResolvedValue([]),
  },
  warrantiesAPI: { getAll: vi.fn() },
  attachmentsAPI: { getAll: vi.fn() },
  sharesAPI: {
    getOwned: vi.fn(),
    getSentInvites: vi.fn().mockResolvedValue([]),
    revoke: vi.fn().mockResolvedValue({}),
    revokeInvite: vi.fn(),
  },
  calendarAPI: {
    status: vi.fn().mockResolvedValue({ enabled: false, path: null }),
    enable: vi.fn(),
    disable: vi.fn(),
    feedUrl: (path: string) => path,
  },
  authAPI: { listPasskeys: vi.fn().mockResolvedValue({ items: [] }) },
}));

// The sharing tab only exists when the feature is on.
vi.mock("../../features/features", () => ({
  useFeature: (key: string) => key === "sharing",
  useFeatures: () => ({
    features: {},
    loaded: true,
    canAccess: () => true,
    refresh: async () => {},
    clear: () => {},
  }),
}));
vi.mock("../../features/upgrade", () => ({
  useUpgrade: () => ({
    promptUpgrade: () => {},
    startCheckout: async () => {},
  }),
}));

import ProfileView from "../../components/profile/ProfileView";
import { profileAPI, sharesAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";
import { ToastProvider } from "../../components/common/Toast";

const getOwned = sharesAPI.getOwned as unknown as ReturnType<typeof vi.fn>;
const revoke = sharesAPI.revoke as unknown as ReturnType<typeof vi.fn>;

const share = (id: number, email: string) => ({
  inventoryShareId: id,
  permission: "READ",
  target: { userId: id * 10, email },
});

beforeEach(() => {
  vi.clearAllMocks();
  (profileAPI.getMe as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    userId: 1,
    email: "owner@example.com",
    role: "POWER_USER",
  });
});

describe("<ProfileView /> sharing reload race", () => {
  it("drops a superseded reload that would resurrect a revoked person", async () => {
    const reloads: Array<(rows: unknown[]) => void> = [];
    getOwned.mockImplementation(() => {
      if (getOwned.mock.calls.length === 1) {
        return Promise.resolve([
          share(1, "alice@example.com"),
          share(2, "bob@example.com"),
        ]);
      }
      return new Promise<unknown[]>((resolve) => reloads.push(resolve));
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/profile?tab=sharing"]}>
        <I18nProvider>
          <ThemeProvider>
            <ToastProvider>
              <ProfileView />
            </ToastProvider>
          </ThemeProvider>
        </I18nProvider>
      </MemoryRouter>
    );

    await screen.findByText("alice@example.com");
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();

    // Revoke Alice → reload #2 is issued and left in flight.
    const revokeButtons = screen.getAllByRole("button", { name: "Revoke" });
    await user.click(revokeButtons[0]);
    await waitFor(() => expect(reloads).toHaveLength(1));

    // Revoke Bob → reload #3 is issued. Alice's row is still on screen
    // (nothing blanks the panel), which is what makes this reachable.
    await user.click(screen.getAllByRole("button", { name: "Revoke" })[1]);
    await waitFor(() => expect(reloads).toHaveLength(2));
    expect(revoke).toHaveBeenCalledTimes(2);

    // Each resolution is flushed inside act() and asserted afterwards. A bare
    // waitFor here would pass on its first check — before the update landed —
    // and the test would go green with the guard removed.
    const flush = async (resolve: () => void) => {
      await act(async () => {
        resolve();
        await new Promise((r) => setTimeout(r, 0));
      });
    };

    // Newest reload lands first: both are gone.
    await flush(() => reloads[1]([]));
    expect(screen.queryByText("bob@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("alice@example.com")).not.toBeInTheDocument();

    // The superseded reload lands last, still carrying Bob. It must be
    // discarded — otherwise the person the user just revoked reappears.
    await flush(() => reloads[0]([share(2, "bob@example.com")]));
    expect(screen.queryByText("bob@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("alice@example.com")).not.toBeInTheDocument();
  });
});
