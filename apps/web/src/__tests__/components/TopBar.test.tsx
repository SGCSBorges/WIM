import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import TopBar from "../../components/layout/TopBar";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";

vi.mock("../../components/layout/NotificationBell", () => ({
  default: () => null,
}));
vi.mock("../../components/common/InstallPwaButton", () => ({
  default: () => null,
}));

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + loc.search}</p>;
}

function renderBar(onLogout = vi.fn(), onOpenSearch = vi.fn()) {
  render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <I18nProvider>
        <ThemeProvider>
          <TopBar
            mobileNavOpen={false}
            onToggleMobileNav={() => {}}
            onLogout={onLogout}
            onOpenSearch={onOpenSearch}
          />
          <Routes>
            <Route path="*" element={<Where />} />
          </Routes>
        </ThemeProvider>
      </I18nProvider>
    </MemoryRouter>
  );
  return { onLogout, onOpenSearch };
}

describe("<TopBar />", () => {
  it("sends the global create button to /articles?new=1", async () => {
    renderBar();
    await userEvent.click(
      screen.getByRole("button", { name: "Create Article" })
    );
    expect(screen.getByTestId("where")).toHaveTextContent("/articles?new=1");
  });

  it("holds language and theme behind the settings gear", async () => {
    renderBar();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Language & theme" })
    );
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
  });

  it("wires search and logout", async () => {
    const { onLogout, onOpenSearch } = renderBar();
    await userEvent.click(
      screen.getByRole("button", { name: /search and run/i })
    );
    expect(onOpenSearch).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Logout" }));
    expect(onLogout).toHaveBeenCalled();
  });
});
