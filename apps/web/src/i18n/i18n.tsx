import React, { createContext, useContext, useMemo, useState } from "react";
import { Language, translations } from "./translations";
import { extras, ExtrasKey } from "./translations.extras";

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
  setLanguage: (lang: Language) => void;
  t: (key: AnyKey) => string;
  plural: (count: number, forms: PluralForms) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = "wim.language";

function detectInitialLanguage(): Language {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "en" || saved === "fr" || saved === "pt") return saved;

  const nav = (navigator.language || "en").toLowerCase();
  if (nav.startsWith("fr")) return "fr";
  if (nav.startsWith("pt")) return "pt";
  return "en";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, _setLanguage] = useState<Language>(() =>
    detectInitialLanguage()
  );

  const setLanguage = (lang: Language) => {
    _setLanguage(lang);
    localStorage.setItem(STORAGE_KEY, lang);
  };

  const value = useMemo<I18nContextValue>(() => {
    // BCP-47 tags so Intl.PluralRules picks the right rule set
    // (English: one/other, French: one/many/other, Portuguese: one/other).
    const localeMap: Record<Language, string> = {
      en: "en-US",
      fr: "fr-FR",
      pt: "pt-PT",
    };
    const pluralRules = new Intl.PluralRules(localeMap[language]);

    return {
      language,
      setLanguage,
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
