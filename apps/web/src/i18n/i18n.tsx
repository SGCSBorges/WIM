import React, { createContext, useContext, useMemo, useState } from "react";
import { Language, TranslationKey, translations } from "./translations";

type I18nContextValue = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
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
    detectInitialLanguage(),
  );

  const setLanguage = (lang: Language) => {
    _setLanguage(lang);
    localStorage.setItem(STORAGE_KEY, lang);
  };

  const value = useMemo<I18nContextValue>(() => {
    return {
      language,
      setLanguage,
      t: (key: TranslationKey) => {
        const dict = translations[language] as Record<string, string>;
        return dict[key] ?? (translations.en as any)[key] ?? key;
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
