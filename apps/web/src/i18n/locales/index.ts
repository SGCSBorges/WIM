/**
 * One dynamic import per non-English language. Vite turns each into its
 * own chunk, fetched the first time that language is selected (or before
 * first paint, via `preloadInitialLanguage()` in main.tsx, for a returning
 * user whose saved language isn't English).
 */
import type { Language } from "../translations";
import type { LocaleDict } from "./types";

export type { LocaleDict };
export type LazyLanguage = Exclude<Language, "en">;

export const LOCALE_LOADERS: Record<LazyLanguage, () => Promise<LocaleDict>> = {
  fr: () => import("./fr").then((m) => m.default),
  pt: () => import("./pt").then((m) => m.default),
  es: () => import("./es").then((m) => m.default),
  nl: () => import("./nl").then((m) => m.default),
};
