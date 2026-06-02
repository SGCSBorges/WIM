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

export type Density = "comfortable" | "compact";

const DATE_KEY = "wim.dateFormat";
const DENSITY_KEY = "wim.density";

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
  const saved = localStorage.getItem(DATE_KEY);
  return isDateFormat(saved) ? saved : "system";
}

function detectDensity(): Density {
  return localStorage.getItem(DENSITY_KEY) === "compact"
    ? "compact"
    : "comfortable";
}

type PreferencesContextValue = {
  dateFormat: DateFormatPref;
  setDateFormat: (f: DateFormatPref) => void;
  hydrateDateFormat: (f: string) => void;
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
  const [density, _setDensity] = useState<Density>(() => detectDensity());

  const setDateFormat = (f: DateFormatPref) => {
    _setDateFormat(f);
    localStorage.setItem(DATE_KEY, f);
    if (authAPI.getRole()) {
      void profileAPI.updatePreferences({ dateFormat: f }).catch(() => {});
    }
  };

  const hydrateDateFormat = (f: string) => {
    if (!isDateFormat(f)) return;
    _setDateFormat(f);
    localStorage.setItem(DATE_KEY, f);
  };

  const setDensity = (d: Density) => {
    _setDensity(d);
    localStorage.setItem(DENSITY_KEY, d);
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-density", density);
  }, [density]);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      dateFormat,
      setDateFormat,
      hydrateDateFormat,
      density,
      setDensity,
      formatDate: (v) => fmtDate(v, dateFormat),
      formatDateTime: (v) => fmtDateTime(v, dateFormat),
    }),
    [dateFormat, density]
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx)
    throw new Error("usePreferences must be used within a PreferencesProvider");
  return ctx;
}
