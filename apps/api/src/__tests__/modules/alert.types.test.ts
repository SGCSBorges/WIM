import { describe, it, expect } from "vitest";
import {
  reminderKindForDays,
  reminderKindLabel,
} from "../../modules/alerts/alert.types";

describe("warranty reminder labels", () => {
  it("derives the kind from the day offset", () => {
    expect(reminderKindForDays(30)).toBe("J30");
    expect(reminderKindForDays(1)).toBe("J1");
  });

  // Every other server-generated string (reminder emails, push text, the
  // weekly digest) is English; this one shipped in French and is what the
  // alerts list, agenda and personal-data export show as the alert name.
  it("names the stored alert in English, like the rest of the server copy", () => {
    expect(reminderKindLabel("J30")).toBe("Warranty reminder J-30");
    expect(reminderKindLabel("J7")).toBe("Warranty reminder J-7");
    expect(reminderKindLabel("J1")).not.toMatch(/Rappel/);
  });
});
