import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsMenu from "../../components/layout/SettingsMenu";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";

function renderMenu() {
  return render(
    <I18nProvider>
      <ThemeProvider>
        <SettingsMenu />
      </ThemeProvider>
    </I18nProvider>
  );
}

// The language + theme selects used to sit inline in the header, visible
// only at `lg` and up. Behind a gear they are reachable at every width and
// stop being the widest element in the bar.
describe("<SettingsMenu />", () => {
  it("keeps the selectors behind a gear button until opened", async () => {
    renderMenu();
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    const gear = screen.getByRole("button", { name: "Language & theme" });
    expect(gear).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(gear);
    expect(gear).toHaveAttribute("aria-expanded", "true");
    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(2);
    expect(screen.getByLabelText("Language")).toHaveValue("en");
    expect(screen.getByLabelText("Theme")).toHaveValue("light");
  });

  it("applies a theme change from inside the popover", async () => {
    renderMenu();
    await userEvent.click(
      screen.getByRole("button", { name: "Language & theme" })
    );
    await userEvent.selectOptions(screen.getByLabelText("Theme"), "dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
