/**
 * Theme provider. Five themes (`light` / `dark` / `ocean` / `cyber` /
 * `sunset`) are driven by a `data-theme` attribute on `<html>`; the actual
 * colour tokens live as CSS variables in `src/index.css`. Selection persists
 * in `localStorage` under STORAGE_KEY. Shared components consume the
 * variables via the `.ui-*` utility classes — don't hardcode Tailwind
 * colours on shared widgets if you want them to respect every theme.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { authAPI, profileAPI } from "../services/api";

export type Theme = "light" | "dark" | "ocean" | "cyber" | "sunset";

type ThemeContextValue = {
  theme: Theme;
  /** User-initiated change: persists locally and (when signed in) to the
   *  account so the choice follows across devices. */
  setTheme: (theme: Theme) => void;
  /** Apply a server-provided preference on login without echoing it back.
   *  Accepts a raw string and ignores anything not in the theme set. */
  hydrateTheme: (theme: string) => void;
};

function isTheme(v: unknown): v is Theme {
  return (
    v === "light" ||
    v === "dark" ||
    v === "ocean" ||
    v === "cyber" ||
    v === "sunset"
  );
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "wim.theme";

function detectInitialTheme(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (isTheme(saved)) {
    return saved;
  }

  // Default to system preference when possible.
  if (
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

function applyThemeToDom(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, _setTheme] = useState<Theme>(() => detectInitialTheme());

  const setTheme = (t: Theme) => {
    _setTheme(t);
    localStorage.setItem(STORAGE_KEY, t);
    // Persist to the account so the choice follows across devices. Gated on
    // an in-memory role (only set once authenticated) so logged-out toggles
    // stay local; best-effort — a failed sync never blocks the UI.
    if (authAPI.getRole()) {
      void profileAPI.updatePreferences({ theme: t }).catch(() => {});
    }
  };

  const hydrateTheme = (t: string) => {
    if (!isTheme(t)) return;
    _setTheme(t);
    localStorage.setItem(STORAGE_KEY, t);
  };

  useEffect(() => {
    applyThemeToDom(theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, hydrateTheme }),
    [theme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
