/**
 * Full-section upgrade teaser shown in place of a feature-gated route when
 * the current user isn't entitled (instead of silently redirecting home).
 * Names the feature they tried to open, then reuses the shared benefits list
 * + checkout actions from the upgrade provider.
 */
import { Lock } from "lucide-react";
import { useI18n } from "../../i18n/i18n";
import { Card } from "../ui";
import { UpgradeBenefits, UpgradeActions } from "../../features/upgrade";
import type { NavKey } from "../../lib/navItems";

export default function UpgradeTeaser({ feature }: { feature: NavKey }) {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-lg animate-fade-in">
      <Card className="space-y-5 text-center">
        <div className="flex flex-col items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent/15 text-accent">
            <Lock className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight ui-title">
              {t(`nav.${feature}`)}
            </h1>
            <p className="mt-1 text-sm ui-text-muted">
              {t("upgrade.subtitle")}
            </p>
          </div>
        </div>

        <div className="mx-auto inline-block text-left">
          <UpgradeBenefits />
        </div>

        <UpgradeActions stacked />
      </Card>
    </div>
  );
}
