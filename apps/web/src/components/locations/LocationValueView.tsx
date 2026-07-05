/**
 * Location value dashboard — where the portfolio's worth physically sits.
 * A treemap sizes each location by its current-holdings value, and a table
 * lists value / item count / warranty exposure per location (with the nested
 * "Home › Garage" path). Same owned-scope + per-unit × quantity value rule as
 * the main dashboard. Lazy-loaded so recharts stays out of the main bundle
 * until /locations/value is opened.
 */
import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, Treemap, Tooltip } from "recharts";
import { MapPin, Wallet, PackageOpen, ShieldAlert } from "lucide-react";
import { statisticsAPI } from "../../services/api";
import type { LocationBreakdown, LocationValueEntry } from "../../types";
import { useI18n } from "../../i18n/i18n";
import { usePreferences } from "../../preferences/preferences";
import { formatMoney } from "../../utils/money";
import { formatCount } from "../../utils/number";
import { getErrorMessage } from "../../utils/error";
import { PageHeader, Section, Stat, Badge } from "../ui";
import { EmptyState, ErrorBanner } from "../common/States";
import { DashboardStatsSkeleton } from "../common/Skeleton";

const TREEMAP_COLORS = [
  "var(--primary)",
  "var(--accent)",
  "var(--text-success)",
  "var(--text-error)",
];
const TOOLTIP_STYLE = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "0.75rem",
  color: "var(--text)",
  fontSize: "0.8rem",
};

// Build "Home › Garage" from the parent chain (cap the walk so a corrupt cycle
// can't loop — assertValidParent blocks cycles server-side, belt-and-braces).
function pathFor(
  entry: LocationValueEntry,
  byId: Map<number, LocationValueEntry>
): string {
  const parts = [entry.name];
  let parentId = entry.parentLocationId;
  let guard = 0;
  while (parentId != null && guard++ < 20) {
    const parent = byId.get(parentId);
    if (!parent) break;
    parts.unshift(parent.name);
    parentId = parent.parentLocationId;
  }
  return parts.join(" › ");
}

export default function LocationValueView() {
  const { t, language } = useI18n();
  const { currency } = usePreferences();
  const [data, setData] = useState<LocationBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const breakdown = await statisticsAPI.getLocationBreakdown();
        if (alive) setData(breakdown);
      } catch (e) {
        if (alive) setError(getErrorMessage(e, t("common.errorOccurred")));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [t]);

  const money = (n: number) => formatMoney(n, currency, language);

  const byId = useMemo(() => {
    const m = new Map<number, LocationValueEntry>();
    for (const l of data?.locations ?? []) m.set(l.locationId, l);
    return m;
  }, [data]);

  const totalValue = useMemo(
    () =>
      (data?.locations.reduce((s, l) => s + l.value, 0) ?? 0) +
      (data?.unlocated.value ?? 0),
    [data]
  );

  const treemapData = useMemo(
    () =>
      (data?.locations ?? [])
        .filter((l) => l.value > 0)
        .map((l, i) => ({
          name: l.name,
          size: l.value,
          fill: TREEMAP_COLORS[i % TREEMAP_COLORS.length],
        })),
    [data]
  );

  // Rows sorted by value desc; nested path for readability.
  const rows = useMemo(
    () =>
      [...(data?.locations ?? [])]
        .map((l) => ({ ...l, path: pathFor(l, byId) }))
        .sort((a, b) => b.value - a.value),
    [data, byId]
  );

  const header = (
    <PageHeader
      icon={<MapPin className="h-5 w-5" />}
      title={t("locationValue.title")}
      subtitle={t("locationValue.subtitle")}
    />
  );

  if (loading) return <DashboardStatsSkeleton />;
  if (error)
    return (
      <div>
        {header}
        <ErrorBanner message={error} />
      </div>
    );
  if (!data) return null;

  const hasData = data.locations.length > 0 || data.unlocated.articleCount > 0;
  if (!hasData) {
    return (
      <div>
        {header}
        <EmptyState
          icon={<MapPin className="h-8 w-8" />}
          title={t("locationValue.empty.title")}
          description={t("locationValue.empty.hint")}
        />
      </div>
    );
  }

  return (
    <div>
      {header}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          label={t("locationValue.totalValue")}
          value={money(totalValue)}
          icon={<Wallet className="h-5 w-5" />}
          tone="primary"
        />
        <Stat
          label={t("locationValue.locations")}
          value={formatCount(data.locations.length, language)}
          icon={<MapPin className="h-5 w-5" />}
          tone="accent"
        />
        <Stat
          label={t("locationValue.unlocated")}
          value={money(data.unlocated.value)}
          icon={<PackageOpen className="h-5 w-5" />}
          tone="warning"
        />
      </div>

      <div className="mb-6">
        <Section title={t("locationValue.treemap")}>
          {treemapData.length === 0 ? (
            <div className="grid h-64 place-items-center text-sm ui-text-muted">
              {t("locationValue.noValued")}
            </div>
          ) : (
            <div
              className="h-64"
              role="img"
              aria-label={t("locationValue.treemap")}
            >
              <ResponsiveContainer width="100%" height="100%">
                <Treemap
                  data={treemapData}
                  dataKey="size"
                  nameKey="name"
                  stroke="var(--surface)"
                  isAnimationActive={false}
                >
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) =>
                      [money(Number(value)), t("locationValue.value")] as [
                        string,
                        string,
                      ]
                    }
                  />
                </Treemap>
              </ResponsiveContainer>
            </div>
          )}
        </Section>
      </div>

      <Section title={t("locationValue.breakdown")}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b ui-divider text-left ui-text-muted">
                <th scope="col" className="py-2 pr-4 font-medium">
                  {t("locationValue.location")}
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">
                  {t("locationValue.items")}
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">
                  {t("locationValue.value")}
                </th>
                <th scope="col" className="py-2 font-medium">
                  {t("locationValue.warrantyExposure")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.locationId} className="border-b ui-divider">
                  <th
                    scope="row"
                    className="py-2 pr-4 text-left font-normal"
                    title={l.path}
                  >
                    {l.path}
                  </th>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {formatCount(l.articleCount, language)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums font-medium">
                    {money(l.value)}
                  </td>
                  <td className="py-2">
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {l.expiredCount > 0 && (
                        <Badge tone="danger">
                          <ShieldAlert
                            className="mr-1 inline h-3 w-3"
                            aria-hidden="true"
                          />
                          {t("locationValue.expired").replace(
                            "{n}",
                            String(l.expiredCount)
                          )}
                        </Badge>
                      )}
                      {l.expiringCount > 0 && (
                        <Badge tone="warning">
                          {t("locationValue.expiring").replace(
                            "{n}",
                            String(l.expiringCount)
                          )}
                        </Badge>
                      )}
                      {l.expiredCount === 0 && l.expiringCount === 0 && (
                        <span className="ui-text-muted">—</span>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
