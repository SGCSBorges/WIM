/**
 * i18n completeness guard. `t()` falls back to English when a key is absent
 * in the active language, so a key added to `en` but forgotten in
 * fr/pt/es/nl would silently render English to those users. These tests
 * fail CI on any such drift, in both the main dict and the extras dict.
 */
import { describe, it, expect } from "vitest";
import { translations, type Language } from "../../i18n/translations";
import { extras } from "../../i18n/translations.extras";

const LANGS: Language[] = ["en", "fr", "pt", "es", "nl"];

describe.each([
  ["translations", translations as Record<Language, Record<string, string>>],
  ["translations.extras", extras as Record<Language, Record<string, string>>],
])("%s key parity across languages", (_name, dict) => {
  const enKeys = Object.keys(dict.en).sort();

  it.each(LANGS.filter((l) => l !== "en"))(
    "%s has exactly the same keys as en",
    (lang) => {
      const langKeys = Object.keys(dict[lang]).sort();
      const missing = enKeys.filter((k) => !(k in dict[lang]));
      const extra = langKeys.filter((k) => !(k in dict.en));
      // Surfaced in the assertion message so a failure names the drifted keys.
      expect({ lang, missing, extra }).toEqual({
        lang,
        missing: [],
        extra: [],
      });
    }
  );

  it.each(LANGS)("%s has no empty translation values", (lang) => {
    const empty = Object.entries(dict[lang])
      .filter(([, v]) => typeof v !== "string" || v.trim() === "")
      .map(([k]) => k);
    expect(empty).toEqual([]);
  });
});
