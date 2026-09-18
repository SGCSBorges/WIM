import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TagChip, {
  contrastText,
  contrastRatio,
  TAG_COLOR_PRESETS,
} from "../../components/articles/TagChip";
import { I18nProvider } from "../../i18n/i18n";

function wrap(ui: React.ReactNode) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

describe("contrastText", () => {
  it("clears WCAG AA (4.5:1) on every preset swatch", () => {
    for (const hex of TAG_COLOR_PRESETS) {
      expect({ hex, ratio: contrastRatio(hex, contrastText(hex)) }).toEqual({
        hex,
        ratio: expect.any(Number),
      });
      expect(contrastRatio(hex, contrastText(hex))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("returns black text on light backgrounds and white on dark", () => {
    expect(contrastText("#ffffff")).toBe("#000000");
    expect(contrastText("#eab308")).toBe("#000000"); // amber → dark text
    expect(contrastText("#000000")).toBe("#ffffff");
    // blue: white would be 3.7:1, black is 5.7:1 — the higher ratio wins
    expect(contrastText("#3b82f6")).toBe("#000000");
    expect(contrastText("#1d4ed8")).toBe("#ffffff"); // darker blue → light
  });

  it("falls back to white for a malformed value", () => {
    expect(contrastText("nope")).toBe("#ffffff");
  });
});

describe("<TagChip />", () => {
  it("fills the pill with the tag color and a readable text color", () => {
    wrap(<TagChip name="Tools" color="#3b82f6" />);
    const chip = screen.getByText("Tools");
    expect(chip).toHaveStyle({ backgroundColor: "#3b82f6" });
    expect(chip).toHaveStyle({ color: "#000000" });
    // Full text is available via title for truncation/AT.
    expect(chip).toHaveAttribute("title", "Tools");
  });

  it("falls back to the neutral Badge when the tag has no color", () => {
    wrap(<TagChip name="Uncolored" color={null} />);
    const chip = screen.getByText("Uncolored");
    // No inline background color is applied in the fallback path.
    expect(chip.getAttribute("style") ?? "").not.toContain("background");
  });
});
