/**
 * Household roll-up card for the dashboard: combined article count +
 * currently-owned inventory value across every household member, with a
 * per-member breakdown. Self-hides when the household feature is off or the
 * caller isn't in a household — no nag where there's nothing to show.
 * Visibility is safe by construction: a household IS a mutual WRITE-share
 * mesh, so members already see each other's inventories.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Home } from "lucide-react";
import { statisticsAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { usePreferences } from "../../preferences/preferences";
import { useFeature } from "../../features/features";
import { formatMoney } from "../../utils/money";
import { formatCount } from "../../utils/number";
import { Section, Badge } from "../ui";

type HouseholdStats = {
  householdId: number;
  name: string;
  members: Array<{
    userId: number;
    email: string;
    articles: number;
    value: number;
  }>;
  totalArticles: number;
  totalValue: number;
};

export default function HouseholdCard() {
  const { t, language } = useI18n();
  const { currency } = usePreferences();
  const allowed = useFeature("household");
  const [stats, setStats] = useState<HouseholdStats | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    statisticsAPI
      .getHousehold()
      .then((h) => alive && setStats(h))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [allowed]);

  if (!allowed || !stats) return null;

  return (
    <Section
      icon={<Home className="h-5 w-5" />}
      title={t("household.card.title").replace("{name}", stats.name)}
      description={t("household.card.subtitle")}
      actions={
        <Link
          to="/sharing"
          className="text-sm font-medium text-primary hover:underline"
        >
          {t("household.card.manage")}
        </Link>
      }
      className="mb-6"
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Badge tone="info">
          {t("household.card.totalArticles").replace(
            "{count}",
            formatCount(stats.totalArticles, language)
          )}
        </Badge>
        <Badge tone="power">
          {formatMoney(stats.totalValue, currency, language)}
        </Badge>
      </div>
      <ul className="divide-y ui-divider">
        {stats.members.map((m) => (
          <li
            key={m.userId}
            className="flex items-center justify-between gap-3 py-2 text-sm"
          >
            <span className="min-w-0 truncate" title={m.email}>
              {m.email}
            </span>
            <span className="shrink-0 tabular-nums ui-text-muted">
              {formatCount(m.articles, language)} ·{" "}
              {formatMoney(m.value, currency, language)}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
