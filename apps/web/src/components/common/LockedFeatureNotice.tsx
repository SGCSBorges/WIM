/**
 * Inline "this is a paid feature" placeholder for a gated article-detail /
 * profile section. Mirrors the section it replaces (same icon + title) so the
 * page layout is stable, and offers a one-tap upgrade prompt. Used where a full
 * route-level UpgradeTeaser would be too heavy (sections embedded in a page).
 */
import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { useI18n } from "../../i18n/i18n";
import { useUpgrade } from "../../features/upgrade";
import { Section, Button } from "../ui";

export default function LockedFeatureNotice({
  icon,
  title,
}: {
  icon: ReactNode;
  title: string;
}) {
  const { t } = useI18n();
  const { promptUpgrade } = useUpgrade();
  return (
    <Section icon={icon} title={title} className="mb-6">
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm ui-text-muted">{t("upgrade.lockedHint")}</p>
        <Button
          size="sm"
          leftIcon={<Lock className="h-4 w-4" />}
          onClick={promptUpgrade}
        >
          {t("upgrade.title")}
        </Button>
      </div>
    </Section>
  );
}
