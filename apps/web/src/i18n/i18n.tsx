import React, { createContext, useContext, useMemo, useState } from "react";
import { Language, TranslationKey, translations } from "./translations";
import { extras, ExtrasKey } from "./translations.extras";

// `t` accepts both keys baked into the main dict and keys added later
// via translations.extras. Lookups prefer extras (so copy fixes there
// override the main file), then fall back through the language chain.
type AnyKey = TranslationKey | ExtrasKey;

type I18nContextValue = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: AnyKey) => string;
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
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within an I18nProvider");
  return ctx;
}
