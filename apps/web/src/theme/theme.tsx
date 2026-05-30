/**
 * Theme provider. Four themes (`light` / `dark` / `ocean` / `cyber`) are
 * driven by a `data-theme` attribute on `<html>`; the actual colour
 * tokens live as CSS variables in `src/index.css`. Selection persists in
 * `localStorage` under STORAGE_KEY. Shared components consume the
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

export type Theme = "light" | "dark" | "ocean" | "cyber";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "wim.theme";

function detectInitialTheme(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (
    saved === "light" ||
    saved === "dark" ||
    saved === "ocean" ||
    saved === "cyber"
  ) {
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
  };

  useEffect(() => {
    applyThemeToDom(theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme }),
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
