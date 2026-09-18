/**
 * Gear button in the top bar that opens the language + theme selectors in a
 * small popover. Replaces the two always-visible selects, which only fit at
 * `lg` and up — phones and tablets had no way to change either without
 * opening the mobile drawer.
 */
import { Settings } from "lucide-react";
import { useI18n } from "../../i18n/i18n";
import LanguageThemeSelector from "../common/LanguageThemeSelector";
import { Popover } from "../ui";

export default function SettingsMenu() {
  const { t } = useI18n();
  return (
    <Popover
      ariaLabel={t("nav.settings")}
      buttonClassName="inline-flex h-10 w-10 items-center justify-center rounded-lg ui-btn-ghost"
      panelClassName="ui-card w-64 p-4 shadow-xl"
      button={() => <Settings className="h-5 w-5" aria-hidden="true" />}
    >
      {() => (
        <div>
          <p className="mb-3 text-sm font-semibold ui-title">
            {t("nav.settings")}
          </p>
          <LanguageThemeSelector layout="stack" />
        </div>
      )}
    </Popover>
  );
}
