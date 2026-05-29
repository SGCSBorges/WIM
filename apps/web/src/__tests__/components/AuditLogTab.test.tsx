import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../services/api", () => ({
  adminAPI: { listAuditLog: vi.fn() },
}));

import AuditLogTab from "../../components/admin/AuditLogTab";
import { adminAPI } from "../../services/api";
import { I18nProvider } from "../../i18n/i18n";

const list = adminAPI.listAuditLog as unknown as ReturnType<typeof vi.fn>;

const row = (id: number, action: string) => ({
  id,
  userId: 1,
  action,
  entity: "Article",
  entityId: 99,
  method: "POST",
  path: "/api/articles",
  status: 201,
  metadata: {},
  createdAt: new Date().toISOString(),
  user: { email: "a@x.com" },
});

beforeEach(() => {
  vi.clearAllMocks();
});

function renderTab() {
  return render(
    <I18nProvider>
      <AuditLogTab />
    </I18nProvider>
  );
}

describe("<AuditLogTab />", () => {
  it("loads on mount and asks the API with cursor=undefined on the first call", async () => {
    list.mockResolvedValueOnce({
      entries: [row(1, "CREATE"), row(2, "DELETE")],
      nextCursor: null,
    });
    renderTab();
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: undefined })
    );
    // CREATE / DELETE strings appear both in the filter <select> options and
    // in the rendered rows. getAllByText asserts the rendered rows showed up.
    expect(screen.getAllByText("CREATE").length).toBeGreaterThan(1);
  });

  it("renders the empty state when no entries match the current filters", async () => {
    list.mockResolvedValueOnce({ entries: [], nextCursor: null });
    renderTab();
    // The component ships "No audit entries" copy via admin.auditLog.empty;
    // both desktop and mobile views render it.
    await waitFor(() => {
      expect(screen.queryAllByText(/no audit entries/i).length).toBeGreaterThan(
        0
      );
    });
  });

  it("re-fetches with the selected action when the filter changes", async () => {
    list.mockResolvedValue({ entries: [], nextCursor: null });
    const user = userEvent.setup();
    renderTab();
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));

    // The label is just "Action" in en; match exactly to avoid the
    // "Entity"-prefixed label.
    await user.selectOptions(screen.getByLabelText("Action"), "LOGOUT");
    await waitFor(() => {
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: "LOGOUT" })
      );
    });
  });
});
