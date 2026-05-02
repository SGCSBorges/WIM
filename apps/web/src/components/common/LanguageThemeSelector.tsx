import { useI18n } from "../../i18n/i18n";
import { Language } from "../../i18n/translations";
import { useTheme, Theme } from "../../theme/theme";

export default function LanguageThemeSelector() {
  const { t, language, setLanguage } = useI18n();
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label className="text-xs ui-text-muted">{t("nav.language")}</label>
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value as Language)}
        className="ui-select px-2 py-1 rounded-md text-sm"
      >
        <option value="en">English</option>
        <option value="fr">Français</option>
        <option value="pt">Português</option>
      </select>

      <label className="text-xs ui-text-muted">{t("nav.theme")}</label>
      <select
        value={theme}
        onChange={(e) => setTheme(e.target.value as Theme)}
        className="ui-select px-2 py-1 rounded-md text-sm"
      >
        <option value="light">{t("theme.light")}</option>
        <option value="dark">{t("theme.dark")}</option>
        <option value="ocean">{t("theme.ocean")}</option>
      </select>
    </div>
  );
}
