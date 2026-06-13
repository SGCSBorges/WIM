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

// Keep the mobile browser chrome / installed-PWA status bar in sync with the
// chosen theme. index.html ships static prefers-color-scheme metas for the
// pre-hydration first paint; once the theme is known we set a single
// media-less <meta name="theme-color"> (last-in-document wins) to the active
// theme's page background, so ocean/cyber/sunset — and a light theme chosen
// under an OS dark preference — colour the chrome correctly.
function syncThemeColorMeta() {
  const bg = getComputedStyle(document.documentElement)
    .getPropertyValue("--bg")
    .trim();
  if (!bg) return;
  let meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]:not([media])'
  );
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", bg);
}

function applyThemeToDom(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  // Read back the resolved token *after* data-theme is set so the value
  // always matches index.css without duplicating hex codes here.
  syncThemeColorMeta();
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
