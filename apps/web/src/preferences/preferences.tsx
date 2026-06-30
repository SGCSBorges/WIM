/**
 * Display preferences that aren't theme/language: the `dateFormat`
 * (persisted to the account so it follows across devices) and UI `density`
 * (purely cosmetic → device-local only). Both fall back to localStorage so
 * a logged-out user still gets a consistent experience; `dateFormat` syncs
 * to the server on change when signed in, and is hydrated from the account
 * on login via `hydrateDateFormat`.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { DateFormatPref } from "../types";
import { authAPI, profileAPI } from "../services/api";
import {
  formatDate as fmtDate,
  formatDateTime as fmtDateTime,
} from "../utils/date";
import { safeGetItem, safeSetItem } from "../utils/safeStorage";

export type Density = "comfortable" | "compact";

const DATE_KEY = "wim.dateFormat";
const DENSITY_KEY = "wim.density";
const CURRENCY_KEY = "wim.currency";

function detectCurrency(): string {
  const saved = safeGetItem(CURRENCY_KEY);
  return saved && saved.trim() ? saved : "USD";
}

const DATE_FORMATS: DateFormatPref[] = [
  "system",
  "dd/MM/yyyy",
  "MM/dd/yyyy",
  "yyyy-MM-dd",
];

function isDateFormat(v: unknown): v is DateFormatPref {
  return typeof v === "string" && DATE_FORMATS.includes(v as DateFormatPref);
}

function detectDateFormat(): DateFormatPref {
  const saved = safeGetItem(DATE_KEY);
  return isDateFormat(saved) ? saved : "system";
}

function detectDensity(): Density {
  return safeGetItem(DENSITY_KEY) === "compact" ? "compact" : "comfortable";
}

type PreferencesContextValue = {
  dateFormat: DateFormatPref;
  setDateFormat: (f: DateFormatPref) => void;
  hydrateDateFormat: (f: string) => void;
  /** Display currency (ISO code), hydrated from the account at login so money
   *  views don't each refetch /profile/me just to format figures. */
  currency: string;
  setCurrency: (c: string) => void;
  hydrateCurrency: (c: string | null | undefined) => void;
  density: Density;
  setDensity: (d: Density) => void;
  /** Pre-bound to the current `dateFormat` for ergonomic call sites. */
  formatDate: (value: Date | string | number | null | undefined) => string;
  formatDateTime: (value: Date | string | number | null | undefined) => string;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [dateFormat, _setDateFormat] = useState<DateFormatPref>(() =>
    detectDateFormat()
  );
  const [currency, _setCurrency] = useState<string>(() => detectCurrency());
  const [density, _setDensity] = useState<Density>(() => detectDensity());

  const setDateFormat = (f: DateFormatPref) => {
    _setDateFormat(f);
    safeSetItem(DATE_KEY, f);
    if (authAPI.getRole()) {
      void profileAPI.updatePreferences({ dateFormat: f }).catch(() => {});
    }
  };

  const hydrateDateFormat = (f: string) => {
    if (!isDateFormat(f)) return;
    _setDateFormat(f);
    safeSetItem(DATE_KEY, f);
  };

  const setCurrency = (c: string) => {
    _setCurrency(c);
    safeSetItem(CURRENCY_KEY, c);
    if (authAPI.getRole()) {
      void profileAPI.updateCurrency(c).catch(() => {});
    }
  };

  const hydrateCurrency = (c: string | null | undefined) => {
    if (!c || !c.trim()) return;
    _setCurrency(c);
    safeSetItem(CURRENCY_KEY, c);
  };

  const setDensity = (d: Density) => {
    _setDensity(d);
    safeSetItem(DENSITY_KEY, d);
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-density", density);
  }, [density]);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      dateFormat,
      setDateFormat,
      hydrateDateFormat,
      currency,
      setCurrency,
      hydrateCurrency,
      density,
      setDensity,
      formatDate: (v) => fmtDate(v, dateFormat),
      formatDateTime: (v) => fmtDateTime(v, dateFormat),
    }),
    [dateFormat, currency, density]
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

// Defaults used outside a PreferencesProvider (e.g. focused unit tests of
// components that consume only `formatDate`). Mirrors the real provider's
// initial state with no-op writers so callers don't need to wrap.
const FALLBACK: PreferencesContextValue = {
  dateFormat: "system",
  setDateFormat: () => {},
  hydrateDateFormat: () => {},
  currency: "USD",
  setCurrency: () => {},
  hydrateCurrency: () => {},
  density: "comfortable",
  setDensity: () => {},
  formatDate: (v) => fmtDate(v, "system"),
  formatDateTime: (v) => fmtDateTime(v, "system"),
};

export function usePreferences() {
  return useContext(PreferencesContext) ?? FALLBACK;
}
