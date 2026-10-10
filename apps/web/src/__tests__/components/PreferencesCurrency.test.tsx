import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  PreferencesProvider,
  usePreferences,
} from "../../preferences/preferences";

function Probe() {
  const { currency } = usePreferences();
  return <span data-testid="currency">{currency}</span>;
}

afterEach(() => {
  localStorage.clear();
});

describe("display currency default", () => {
  it("is EUR for a visitor with no saved preference", () => {
    render(
      <PreferencesProvider>
        <Probe />
      </PreferencesProvider>
    );
    expect(screen.getByTestId("currency").textContent).toBe("EUR");
  });

  it("is EUR outside a provider (component unit tests)", () => {
    render(<Probe />);
    expect(screen.getByTestId("currency").textContent).toBe("EUR");
  });

  it("keeps a currency the visitor already chose", () => {
    localStorage.setItem("wim.currency", "GBP");
    render(
      <PreferencesProvider>
        <Probe />
      </PreferencesProvider>
    );
    expect(screen.getByTestId("currency").textContent).toBe("GBP");
  });
});
