import { describe, it, expect } from "vitest";
import { deviceLabelText } from "../../utils/deviceLabel";
import fr from "../../i18n/locales/fr";
import { extras } from "../../i18n/translations.extras";

const frT = (
  k: "security.sessions.unknownDevice" | "security.sessions.deviceOn"
) => fr.extras[k];
const enT = (
  k: "security.sessions.unknownDevice" | "security.sessions.deviceOn"
) => extras.en[k];

describe("deviceLabelText", () => {
  it("speaks French for the API's English 'Browser on OS' label", () => {
    expect(deviceLabelText("Safari on iOS", frT)).toBe("Safari sur iOS");
    expect(deviceLabelText("Chrome on Windows", frT)).toBe(
      "Chrome sur Windows"
    );
  });

  it("translates the API's unknown-device label and a missing one", () => {
    expect(deviceLabelText("Unknown device", frT)).toBe("Appareil inconnu");
    expect(deviceLabelText(null, frT)).toBe("Appareil inconnu");
  });

  it("keeps English labels English and leaves other shapes untouched", () => {
    expect(deviceLabelText("Safari on iOS", enT)).toBe("Safari on iOS");
    expect(deviceLabelText("Firefox", frT)).toBe("Firefox");
    expect(deviceLabelText("WeirdBot/1.0 (custom)", frT)).toBe(
      "WeirdBot/1.0 (custom)"
    );
  });
});
