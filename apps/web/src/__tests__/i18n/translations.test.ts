/**
 * i18n completeness guard. `t()` falls back to English when a key is absent
 * in the active language, so a key added to `en` but forgotten in
 * fr/pt/es/nl would silently render English to those users. The locale
 * files are typed `Record<EnglishKey, string>`, which already makes a
 * missing or extra key a compile error; these tests keep the runtime side
 * honest (empty strings, mojibake) and pin the loader wiring.
 */
import { describe, it, expect } from "vitest";
import { translations, type Language } from "../../i18n/translations";
import { extras } from "../../i18n/translations.extras";
import { LOCALE_LOADERS, type LazyLanguage } from "../../i18n/locales";

const LAZY: LazyLanguage[] = ["fr", "pt", "es", "nl"];

async function dictFor(lang: Language) {
  if (lang === "en") return { main: translations.en, extras: extras.en };
  return LOCALE_LOADERS[lang]();
}

describe.each(["main", "extras"] as const)(
  "%s key parity across languages",
  (part) => {
    const enKeys = Object.keys(part === "main" ? translations.en : extras.en);

    it.each(LAZY)("%s has exactly the same keys as en", async (lang) => {
      const dict = await dictFor(lang);
      const langKeys = Object.keys(dict[part]);
      const missing = enKeys.filter((k) => !langKeys.includes(k));
      const extra = langKeys.filter((k) => !enKeys.includes(k));
      // Surfaced in the assertion message so a failure names the drifted keys.
      expect({ lang, missing, extra }).toEqual({
        lang,
        missing: [],
        extra: [],
      });
    });
  }
);

describe.each(["en", ...LAZY] as Language[])("%s dictionary values", (lang) => {
  it("has no empty translation values", async () => {
    const dict = await dictFor(lang);
    const empty = [...Object.entries(dict.main), ...Object.entries(dict.extras)]
      .filter(([, v]) => typeof v !== "string" || v.trim() === "")
      .map(([k]) => k);
    expect(empty).toEqual([]);
  });

  // A double-encoded string (UTF-8 bytes read as Latin-1 and re-encoded)
  // puts C1 control characters (U+0080–U+009F) into the value. That is
  // exactly what the English dashboard nudge shipped with: an em dash
  // rendered as "â". No legitimate translation contains a C1 control.
  it("contains no C1 control characters (mojibake)", async () => {
    const dict = await dictFor(lang);
    const bad = [...Object.entries(dict.main), ...Object.entries(dict.extras)]
      // eslint-disable-next-line no-control-regex
      .filter(([, v]) => /[\u0080-\u009f]/.test(v))
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
    expect(bad).toEqual([]);
  });
});

describe("lazy locale loading", () => {
  it("has a loader for every non-English language and none for English", () => {
    expect(Object.keys(LOCALE_LOADERS).sort()).toEqual([
      "es",
      "fr",
      "nl",
      "pt",
    ]);
  });
});
