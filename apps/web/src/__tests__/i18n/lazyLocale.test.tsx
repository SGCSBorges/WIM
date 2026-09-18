import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  I18nProvider,
  isLocaleLoaded,
  loadLocale,
  preloadInitialLanguage,
  useI18n,
} from "../../i18n/i18n";

function Probe() {
  const { t, language } = useI18n();
  return (
    <p>
      {language}: {t("nav.home")}
    </p>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("lazy locales", () => {
  it("serves English synchronously and the saved language once its chunk lands", async () => {
    localStorage.setItem("wim.language", "pt");
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    );
    // Either the fallback (before the chunk) or the real copy (after) is
    // acceptable at first paint; what must be true is that it *becomes*
    // Portuguese without any further user action.
    expect(await screen.findByText("pt: Início")).toBeInTheDocument();
    expect(isLocaleLoaded("pt")).toBe(true);
  });

  it("preloads the saved language so main.tsx can render it on first paint", async () => {
    localStorage.setItem("wim.language", "nl");
    await preloadInitialLanguage();
    expect(isLocaleLoaded("nl")).toBe(true);
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    );
    // Loaded up front → no English flash, synchronously Dutch.
    expect(screen.getByText("nl: Start")).toBeInTheDocument();
  });

  it("loads each dictionary once and reuses it", async () => {
    const a = await loadLocale("fr");
    const b = await loadLocale("fr");
    expect(a).toBe(b);
    expect(a.main["nav.home"]).toBe("Accueil");
  });
});
