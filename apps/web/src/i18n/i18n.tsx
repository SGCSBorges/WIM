/**
 * i18n provider + `t()` helper.
 *
 * Lookup chain (in order):
 *   1. extras[lang][key]
 *   2. translations[lang][key]
 *   3. extras.en[key]
 *   4. translations.en[key]
 *   5. the raw key (so a missing translation is visible in dev)
 *
 * Convention: NEW keys go into `translations.extras.ts` so the 70 KB main
 * dictionary stays low-churn. Extras can also OVERRIDE an existing key
 * (priority 1 wins over 2) — useful for a copy fix without touching the
 * big file.
 *
 * The `AnyKey` template-literal type accepts any string so `t(...)` can be
 * called with a templated key (e.g. `t(\`claim.status.${status}\`)`); the
 * lookup returns the raw key when no translation exists.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Language, translations } from "./translations";
import { extras, ExtrasKey } from "./translations.extras";
import { authAPI, profileAPI } from "../services/api";

// Derived from the English dict so it stays a single source of truth.
// Re-exported for components that build keys via template strings — they
// need the union to satisfy `t()`'s typed argument.
export type TranslationKey = keyof (typeof translations)["en"];

// `t` accepts both keys baked into the main dict and keys added later
// via translations.extras. Lookups prefer extras (so copy fixes there
// override the main file), then fall back through the language chain.
type AnyKey = TranslationKey | ExtrasKey;

// `plural(count, forms)` picks the right form for the current language
// using Intl.PluralRules. Call sites that previously did raw
// `"{count} article(s)".replace("{count}", n)` can now write proper
// "1 article" / "N articles" once their translations expose .one/.other
// keys. Forms not provided fall through to `.other`.
type PluralCategory = Intl.LDMLPluralRule;
type PluralForms = Partial<Record<PluralCategory, string>>;

type I18nContextValue = {
  language: Language;
  /** User-initiated change: persists locally and (when signed in) to the
   *  account so the choice follows across devices. */
  setLanguage: (lang: Language) => void;
  /** Apply a server-provided preference on login without echoing it back.
   *  Accepts a raw string and ignores anything not in the language set. */
  hydrateLanguage: (lang: string) => void;
  t: (key: AnyKey) => string;
  plural: (count: number, forms: PluralForms) => string;
};

function isLanguage(v: unknown): v is Language {
  return v === "en" || v === "fr" || v === "pt" || v === "es" || v === "nl";
}

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = "wim.language";

function detectInitialLanguage(): Language {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (isLanguage(saved)) return saved;

  const nav = (navigator.language || "en").toLowerCase();
  if (nav.startsWith("fr")) return "fr";
  if (nav.startsWith("pt")) return "pt";
  if (nav.startsWith("es")) return "es";
  if (nav.startsWith("nl")) return "nl";
  return "en";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, _setLanguage] = useState<Language>(() =>
    detectInitialLanguage()
  );

  const setLanguage = (lang: Language) => {
    _setLanguage(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    if (authAPI.getRole()) {
      void profileAPI.updatePreferences({ language: lang }).catch(() => {});
    }
  };

  const hydrateLanguage = (lang: string) => {
    if (!isLanguage(lang)) return;
    _setLanguage(lang);
    localStorage.setItem(STORAGE_KEY, lang);
  };

  // Keep <html lang> in sync with the active language. The document ships
  // lang="en" for first paint; reflecting the real choice lets screen
  // readers switch pronunciation and helps browser translation heuristics.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<I18nContextValue>(() => {
    // BCP-47 tags so Intl.PluralRules picks the right rule set
    // (English: one/other, French: one/many/other, Portuguese/Spanish/Dutch:
    // one/other).
    const localeMap: Record<Language, string> = {
      en: "en-US",
      fr: "fr-FR",
      pt: "pt-PT",
      es: "es-ES",
      nl: "nl-NL",
    };
    const pluralRules = new Intl.PluralRules(localeMap[language]);

    return {
      language,
      setLanguage,
      hydrateLanguage,
      t: (key: AnyKey) => {
        const eDict = extras[language] as Record<string, string>;
        const mDict = translations[language] as Record<string, string>;
        return (
          eDict[key] ??
          mDict[key] ??
          (extras.en as Record<string, string>)[key] ??
          (translations.en as Record<string, string>)[key] ??
          key
        );
      },
      plural: (count: number, forms: PluralForms) => {
        const cat = pluralRules.select(count) as PluralCategory;
        return forms[cat] ?? forms.other ?? "";
      },
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within an I18nProvider");
  return ctx;
}
