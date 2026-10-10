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

  // `Alerte.alerteNom` is persisted, not translated at render time, so it has
  // to be written in the owner's language — otherwise a French user's alerts
  // list, agenda and data export show an English row among French copy.
  it("writes the stored alert name in the owner's language", () => {
    expect(reminderKindLabel("J30", "fr")).toBe("Rappel garantie J-30");
    expect(reminderKindLabel("J7", "pt")).toBe("Lembrete de garantia J-7");
    expect(reminderKindLabel("J1", "es")).toBe("Recordatorio de garantía J-1");
    expect(reminderKindLabel("J30", "nl")).toBe("Garantieherinnering J-30");
  });

  it("falls back to English for an absent or unsupported language", () => {
    expect(reminderKindLabel("J30")).toBe("Warranty reminder J-30");
    expect(reminderKindLabel("J30", null)).toBe("Warranty reminder J-30");
    expect(reminderKindLabel("J30", "de")).toBe("Warranty reminder J-30");
  });

  it("honours a custom offset, not just the J-30/J-7/J-1 defaults", () => {
    expect(reminderKindLabel(reminderKindForDays(90), "fr")).toBe(
      "Rappel garantie J-90"
    );
  });
});
