import { describe, it, expect } from "vitest";
import { labelFromUserAgent } from "../../modules/auth/session.service";

describe("labelFromUserAgent", () => {
  it("picks browser + OS for common UAs", () => {
    expect(
      labelFromUserAgent(
        "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36"
      )
    ).toBe("Chrome on macOS");
    expect(
      labelFromUserAgent(
        "Mozilla/5.0 (iPhone) AppleWebKit/605 Version/16 Safari/605"
      )
    ).toBe("Safari on iOS");
    expect(
      labelFromUserAgent(
        "Mozilla/5.0 (Windows NT 10.0) Gecko/20100101 Firefox/120.0"
      )
    ).toBe("Firefox on Windows");
  });

  it("falls back to a 'Unknown device' label when the UA is missing", () => {
    expect(labelFromUserAgent(null)).toBe("Unknown device");
    expect(labelFromUserAgent("")).toBe("Unknown device");
  });

  it("returns a truncated raw UA when no family matches", () => {
    expect(labelFromUserAgent("WeirdBot/1.0 (custom)")).toMatch(/^WeirdBot/);
  });
});
