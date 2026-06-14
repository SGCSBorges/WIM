/**
 * Two-dropdown widget shown in the nav: language (en/fr/pt/es/nl) and theme
 * (light/dark/ocean/cyber/sunset). Both choices persist to localStorage via
 * their respective providers; no API round-trip.
 */
import { useId } from "react";
import { useI18n } from "../../i18n/i18n";
import { Language } from "../../i18n/translations";
import { useTheme, Theme } from "../../theme/theme";

export default function LanguageThemeSelector() {
  const { t, language, setLanguage } = useI18n();
  const { theme, setTheme } = useTheme();
  const langId = useId();
  const themeId = useId();

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label htmlFor={langId} className="text-xs ui-text-muted">
        {t("nav.language")}
      </label>
      <select
        id={langId}
        value={language}
        onChange={(e) => setLanguage(e.target.value as Language)}
        className="ui-select px-2 py-1 rounded-md text-sm"
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
        className="ui-select px-2 py-1 rounded-md text-sm"
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
