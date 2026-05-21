import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LanguageThemeSelector from "../../components/common/LanguageThemeSelector";
import { I18nProvider } from "../../i18n/i18n";
import { ThemeProvider } from "../../theme/theme";

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <I18nProvider>
      <ThemeProvider>{ui}</ThemeProvider>
    </I18nProvider>
  );
}

describe("<LanguageThemeSelector />", () => {
  it("renders language and theme dropdowns with all options", () => {
    renderWithProviders(<LanguageThemeSelector />);

    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(2);

    const [languageSelect, themeSelect] = selects;
    expect(languageSelect).toHaveValue("en");
    expect(
      Array.from(languageSelect.querySelectorAll("option")).map((o) => o.value)
    ).toEqual(["en", "fr", "pt"]);

    expect(
      Array.from(themeSelect.querySelectorAll("option")).map((o) => o.value)
    ).toEqual(["light", "dark", "ocean", "cyber"]);
  });

  it("persists language selection to localStorage", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LanguageThemeSelector />);

    const [languageSelect] = screen.getAllByRole("combobox");
    await user.selectOptions(languageSelect, "fr");

    expect(languageSelect).toHaveValue("fr");
    expect(localStorage.getItem("wim.language")).toBe("fr");
  });
});
