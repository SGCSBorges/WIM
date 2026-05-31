import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../services/api", () => ({
  adminAPI: {
    listUsers: vi.fn(),
    getUserInventory: vi.fn(),
    deleteUser: vi.fn(),
    updateUser: vi.fn(),
    forceLogout: vi.fn(),
  },
  authAPI: { getRole: vi.fn().mockReturnValue("ADMIN") },
  statisticsAPI: { getAdmin: vi.fn() },
}));

import AdminUsers from "../../components/admin/AdminUsers";
import { adminAPI, statisticsAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";
import { ToastProvider } from "../../components/common/Toast";

const listUsers = adminAPI.listUsers as unknown as ReturnType<typeof vi.fn>;
const updateUser = adminAPI.updateUser as unknown as ReturnType<typeof vi.fn>;
const getAdmin = statisticsAPI.getAdmin as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  getAdmin.mockResolvedValue({
    users: { total: 1, byRole: { USER: 1, POWER_USER: 0, ADMIN: 0 } },
    articles: { total: 0 },
    warranties: { total: 0, active: 0, expired: 0, withAttachment: 0 },
    alerts: { total: 0 },
    sharing: { totalSharedArticles: 0 },
  });
  // adminAPI.listUsers returns a raw array — not the {items,total,page,limit}
  // shape used by other paginated endpoints. setUsers(data) feeds users.map
  // directly; an object wrapper here crashes the component.
  listUsers.mockResolvedValue([
    {
      userId: 7,
      email: "u@x.com",
      role: "USER",
      currency: "USD",
      emailReminders: true,
      weeklyDigest: false,
      createdAt: new Date().toISOString(),
    },
  ]);
});

function renderAdmin() {
  return render(
    <I18nProvider>
      <ToastProvider>
        <AdminUsers />
      </ToastProvider>
    </I18nProvider>
  );
}

describe("<AdminUsers /> tab semantics", () => {
  it("renders the four tabs as a WAI-ARIA tablist with aria-selected on the active one", async () => {
    renderAdmin();
    await waitFor(() => expect(getAdmin).toHaveBeenCalled());
    const tablist = screen.getByRole("tablist");
    expect(tablist).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(4);
    // Dashboard is the default active tab.
    const dashboard = tabs.find((t) => t.id === "admin-tab-dashboard");
    expect(dashboard?.getAttribute("aria-selected")).toBe("true");
    for (const t of tabs) {
      if (t !== dashboard) {
        expect(t.getAttribute("aria-selected")).toBe("false");
      }
    }
  });

  it("flips aria-selected when a different tab is clicked", async () => {
    const user = userEvent.setup();
    renderAdmin();
    await waitFor(() => expect(getAdmin).toHaveBeenCalled());

    const usersTab = screen
      .getAllByRole("tab")
      .find((t) => t.id === "admin-tab-users")!;
    await user.click(usersTab);
    expect(usersTab.getAttribute("aria-selected")).toBe("true");
    const dashboard = screen
      .getAllByRole("tab")
      .find((t) => t.id === "admin-tab-dashboard")!;
    expect(dashboard.getAttribute("aria-selected")).toBe("false");
  });
});

describe("<AdminUsers /> users tab", () => {
  it("fetches the user list when the Users tab is activated", async () => {
    const user = userEvent.setup();
    renderAdmin();
    await waitFor(() => expect(getAdmin).toHaveBeenCalled());

    const usersTab = screen
      .getAllByRole("tab")
      .find((t) => t.id === "admin-tab-users")!;
    await user.click(usersTab);

    await waitFor(() => expect(listUsers).toHaveBeenCalled());
    // listUsers takes an options object — q/sort/dir, no page/limit.
    // We only assert the call happened, not its argument shape, so the
    // test is robust to future opt additions.
    expect(updateUser).not.toHaveBeenCalled();
  });
});
