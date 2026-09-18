import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { createRef } from "react";
import MobileDrawer from "../../components/layout/MobileDrawer";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";

vi.mock("../../messages/unread", () => ({
  useMessagesUnread: () => ({ unreadCount: 3 }),
}));

function renderDrawer(open: boolean, role = "POWER_USER") {
  const toggleRef = createRef<HTMLButtonElement>();
  return render(
    <MemoryRouter initialEntries={["/warranties"]}>
      <I18nProvider>
        <ThemeProvider>
          <MobileDrawer
            open={open}
            onClose={() => {}}
            role={role}
            onLogout={() => {}}
            toggleRef={toggleRef}
          />
        </ThemeProvider>
      </I18nProvider>
    </MemoryRouter>
  );
}

describe("<MobileDrawer />", () => {
  it("is inert and hidden from assistive tech while closed", () => {
    const { container } = renderDrawer(false);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute("aria-hidden", "true");
    // Stays mounted for the slide transition, so it must be inert or its
    // ~18 nav buttons remain in the tab order behind the page.
    expect(root).toHaveAttribute("inert");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders grouped navigation with the unread badge when open", () => {
    const { container } = renderDrawer(true);
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toHaveAttribute("inert");
    const nav = screen.getByRole("navigation", { name: "Mobile navigation" });
    expect(
      within(nav)
        .getAllByRole("group")
        .map((g) => g.getAttribute("aria-label"))
    ).toEqual(["Inventory", "Planning", "Insights", "Collaborate"]);
    expect(
      within(nav).getByRole("button", { name: "Warranties" })
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(nav).getByRole("button", { name: /Messages/ })
    ).toHaveTextContent("3");
    // Language/theme moved to the top-bar gear; the drawer no longer
    // duplicates the selects.
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
