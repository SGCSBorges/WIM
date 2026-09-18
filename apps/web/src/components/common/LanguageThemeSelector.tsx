/**
 * Two-dropdown widget: language (en/fr/pt/es/nl) and theme
 * (light/dark/ocean/cyber/sunset). Both choices persist to localStorage via
 * their respective providers; no API round-trip. Inline on the login screen;
 * stacked (`layout="stack"`) inside the top bar's settings popover.
 */
import { useId } from "react";
import { useI18n } from "../../i18n/i18n";
import { Language } from "../../i18n/translations";
import { useTheme, Theme } from "../../theme/theme";

export default function LanguageThemeSelector({
  layout = "inline",
}: {
  layout?: "inline" | "stack";
}) {
  const { t, language, setLanguage } = useI18n();
  const { theme, setTheme } = useTheme();
  const langId = useId();
  const themeId = useId();
  const stack = layout === "stack";
  const selectClass = stack
    ? "ui-select w-full rounded-md px-2 py-1.5 text-sm"
    : "ui-select px-2 py-1 rounded-md text-sm";

  return (
    <div
      className={
        stack ? "flex flex-col gap-3" : "flex items-center gap-2 flex-wrap"
      }
    >
      <label htmlFor={langId} className="text-xs ui-text-muted">
        {t("nav.language")}
      </label>
      <select
        id={langId}
        value={language}
        onChange={(e) => setLanguage(e.target.value as Language)}
        className={selectClass}
      >
        <option value="en">English</option>
        <option value="fr">Français</option>
        <option value="pt">Português</option>
        <option value="es">Español</option>
        <option value="nl">Nederlands</option>
      </select>

      <label htmlFor={themeId} className="text-xs ui-text-muted">
        {t("nav.theme")}
      </label>
      <select
        id={themeId}
        value={theme}
        onChange={(e) => setTheme(e.target.value as Theme)}
        className={selectClass}
      >
        <option value="light">{t("theme.light")}</option>
        <option value="dark">{t("theme.dark")}</option>
        <option value="ocean">{t("theme.ocean")}</option>
        <option value="cyber">{t("theme.cyber")}</option>
        <option value="sunset">{t("theme.sunset")}</option>
      </select>
    </div>
  );
}
