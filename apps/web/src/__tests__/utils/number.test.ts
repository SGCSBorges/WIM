import { describe, it, expect } from "vitest";
import { formatCompact, shortLabel } from "../../utils/number";

describe("formatCompact", () => {
  // The value axis is 40 px wide: "120000" was clipped to "20000".
  it("shortens large axis values in the reader's language", () => {
    expect(formatCompact(120000, "en")).toBe("120K");
    expect(formatCompact(120000, "fr").replace(/\s/g, " ")).toBe("120 k");
    expect(formatCompact(4500, "en")).toBe("4.5K");
    expect(formatCompact(800, "fr")).toBe("800");
  });
});

describe("shortLabel", () => {
  it("keeps short names and cuts long ones to one line", () => {
    expect(shortLabel("Rolex")).toBe("Rolex");
    expect(shortLabel("Speedmaster Moonwatch Professional")).toBe(
      "Speedmaster Moonw…"
    );
    expect(shortLabel("Speedmaster Moonwatch Professional").length).toBe(18);
  });
});
