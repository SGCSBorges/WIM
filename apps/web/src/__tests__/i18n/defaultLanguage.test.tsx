import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";

const updatePreferences = vi.fn();
vi.mock("../../services/api", () => ({
  authAPI: { getRole: () => "USER" },
  profileAPI: {
    updatePreferences: (...args: unknown[]) => updatePreferences(...args),
  },
}));

import { I18nProvider, useI18n } from "../../i18n/i18n";

let adopt: ((lang: string | null | undefined) => void) | null = null;
function Probe() {
  const { language, adoptServerLanguage } = useI18n();
  adopt = adoptServerLanguage;
  return <p data-testid="lang">{language}</p>;
}

function mount() {
  render(
    <I18nProvider>
      <Probe />
    </I18nProvider>
  );
}

function browserLanguage(tag: string) {
  vi.spyOn(navigator, "language", "get").mockReturnValue(tag);
}

beforeEach(() => {
  localStorage.clear();
  updatePreferences.mockReset();
  updatePreferences.mockResolvedValue(undefined);
  adopt = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("initial language", () => {
  it("is French when the browser speaks a language the app does not", () => {
    browserLanguage("de-DE");
    mount();
    expect(screen.getByTestId("lang").textContent).toBe("fr");
  });

  it("is French when the browser reports no language at all", () => {
    browserLanguage("");
    mount();
    expect(screen.getByTestId("lang").textContent).toBe("fr");
  });

  it("still follows a supported browser language, English included", () => {
    browserLanguage("en-GB");
    mount();
    expect(screen.getByTestId("lang").textContent).toBe("en");
  });

  it("prefers a saved choice over the browser", () => {
    browserLanguage("en-US");
    localStorage.setItem("wim.language", "nl");
    mount();
    expect(screen.getByTestId("lang").textContent).toBe("nl");
  });
});

describe("adoptServerLanguage", () => {
  it("applies the account's language without echoing it back", () => {
    browserLanguage("fr-FR");
    mount();
    act(() => adopt!("pt"));
    expect(screen.getByTestId("lang").textContent).toBe("pt");
    expect(localStorage.getItem("wim.language")).toBe("pt");
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it("records the language on screen when the account has none", () => {
    browserLanguage("nl-NL");
    mount();
    act(() => adopt!(null));
    // Without this the server never learns the browser-detected language and
    // writes this user's e-mails in the default language instead of Dutch.
    expect(updatePreferences).toHaveBeenCalledWith({ language: "nl" });
    expect(screen.getByTestId("lang").textContent).toBe("nl");
  });

  it("treats an unsupported stored value like a missing one", () => {
    browserLanguage("es-ES");
    mount();
    act(() => adopt!("de"));
    expect(updatePreferences).toHaveBeenCalledWith({ language: "es" });
    expect(screen.getByTestId("lang").textContent).toBe("es");
  });
});
