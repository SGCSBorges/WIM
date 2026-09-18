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

/**
 * A double-encoded string (UTF-8 bytes read as Latin-1 and re-encoded) puts
 * C1 control characters (U+0080–U+009F) into the value. That is exactly what
 * the English dashboard nudge shipped with: an em dash rendered as "â".
 * No legitimate translation contains a C1 control, so this is a clean tell.
 */
describe.each([
  ["translations", translations as Record<Language, Record<string, string>>],
  ["translations.extras", extras as Record<Language, Record<string, string>>],
])("%s has no mojibake", (_name, dict) => {
  it.each(LANGS)("%s contains no C1 control characters", (lang) => {
    const bad = Object.entries(dict[lang])
      // eslint-disable-next-line no-control-regex
      .filter(([, v]) => /[\u0080-\u009f]/.test(v))
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
    expect(bad).toEqual([]);
  });
});
