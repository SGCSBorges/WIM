/**
 * A label and its colon, as each language writes them. The warranties page
 * read "Achat: 07/10/2026"; French puts a non-breaking space before the
 * colon ("Achat : …"), and the other languages none.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nProvider, useI18n } from "../../i18n/i18n";

function Probe() {
  const { tLabel, language } = useI18n();
  return (
    <p data-testid="probe">
      {language}|{tLabel("warranties.purchase")}
    </p>
  );
}

beforeEach(() => localStorage.clear());

describe("tLabel", () => {
  it("puts a non-breaking space before the colon in French", async () => {
    localStorage.setItem("wim.language", "fr");
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    );
    // textContent, not findByText: the matcher would normalise the space.
    await waitFor(() =>
      expect(screen.getByTestId("probe").textContent).toBe("fr|Achat\u00a0:")
    );
  });

  it("puts the colon straight after the label in English", () => {
    localStorage.setItem("wim.language", "en");
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    );
    expect(screen.getByTestId("probe").textContent).toBe("en|Purchase:");
  });
});
