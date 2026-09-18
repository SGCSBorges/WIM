import { describe, it, expect } from "vitest";
import {
  EMAIL_LANGS,
  EMAIL_STRINGS,
  emailT,
  emailTranslator,
  normalizeEmailLang,
} from "../../modules/email/email.i18n";

describe("email i18n", () => {
  it("keeps every language at key parity with English, with no empty copy", () => {
    const enKeys = Object.keys(EMAIL_STRINGS.en).sort();
    for (const lang of EMAIL_LANGS) {
      const keys = Object.keys(EMAIL_STRINGS[lang]).sort();
      expect({ lang, keys }).toEqual({ lang, keys: enKeys });
      for (const [k, v] of Object.entries(EMAIL_STRINGS[lang])) {
        expect(`${lang}.${k}=${v.trim()}`).not.toMatch(/=$/);
      }
    }
  });

  it("keeps the same placeholders in every translation of a key", () => {
    const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(EMAIL_STRINGS.en) as Array<
      keyof typeof EMAIL_STRINGS.en
    >) {
      const expected = holes(EMAIL_STRINGS.en[key]);
      for (const lang of EMAIL_LANGS) {
        expect({ lang, key, holes: holes(EMAIL_STRINGS[lang][key]) }).toEqual({
          lang,
          key,
          holes: expected,
        });
      }
    }
  });

  it("maps User.language (and loose variants) onto a supported dictionary", () => {
    expect(normalizeEmailLang("fr")).toBe("fr");
    expect(normalizeEmailLang("pt-BR")).toBe("pt");
    expect(normalizeEmailLang(" NL ")).toBe("nl");
    expect(normalizeEmailLang("de")).toBe("en");
    expect(normalizeEmailLang(null)).toBe("en");
    expect(normalizeEmailLang(undefined)).toBe("en");
  });

  it("interpolates once and leaves unknown placeholders visible", () => {
    expect(
      emailT("en", "warranty.reminder.subject", { name: "AppleCare" })
    ).toBe("Warranty reminder: AppleCare");
    // A value containing braces must not be expanded a second time.
    expect(emailT("en", "found.contact", { contact: "{name}" })).toBe(
      "Contact: {name}"
    );
    expect(emailT("fr", "digest.subject", {})).toBe(
      "Récapitulatif des garanties — {count} expirent bientôt"
    );
  });

  it("binds a translator per recipient, defaulting to English", () => {
    expect(emailTranslator("es")("openInApp")).toBe("Abrir en WIM");
    expect(emailTranslator(null)("openInApp")).toBe("Open in WIM");
  });
});
