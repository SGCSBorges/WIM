import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import Sidebar from "../../components/layout/Sidebar";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";

vi.mock("../../messages/unread", () => ({
  useMessagesUnread: () => ({ unreadCount: 0 }),
}));

function renderSidebar(role: string, collapsed = false) {
  return render(
    <MemoryRouter initialEntries={["/articles"]}>
      <I18nProvider>
        <ThemeProvider>
          <Sidebar
            role={role}
            collapsed={collapsed}
            onToggleCollapsed={() => {}}
          />
        </ThemeProvider>
      </I18nProvider>
    </MemoryRouter>
  );
}

describe("<Sidebar />", () => {
  it("renders the navigation in labelled groups", () => {
    renderSidebar("ADMIN");
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    const groups = within(nav).getAllByRole("group");
    expect(groups.map((g) => g.getAttribute("aria-label"))).toEqual([
      "Inventory",
      "Planning",
      "Insights",
      "Collaborate",
      "Administration",
    ]);
    // Items sit under their own heading, not in one flat run.
    const inventory = groups[0];
    expect(within(inventory).getByText("Inventory")).toBeInTheDocument();
    expect(
      within(inventory).getByRole("button", { name: "Articles" })
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(groups[3]).getByRole("button", { name: "Sharing" })
    ).toBeInTheDocument();
  });

  it("drops the groups a plain user has nothing in", () => {
    renderSidebar("USER");
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(
      within(nav)
        .getAllByRole("group")
        .map((g) => g.getAttribute("aria-label"))
    ).toEqual(["Inventory", "Planning", "Insights", "Collaborate"]);
    expect(screen.queryByText("Administration")).not.toBeInTheDocument();
    // Collaborate keeps only the feature-gated Messages entry for a USER;
    // the role-gated share items are gone with their group intact.
    expect(
      screen.queryByRole("button", { name: "Sharing" })
    ).not.toBeInTheDocument();
  });

  it("hides the group labels on the collapsed rail but keeps the groups", () => {
    renderSidebar("ADMIN", true);
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(nav).getAllByRole("group")).toHaveLength(5);
    expect(within(nav).queryByText("Inventory")).not.toBeInTheDocument();
    // Icon-only buttons still carry their name via title.
    expect(within(nav).getByTitle("Articles")).toBeInTheDocument();
  });
});
