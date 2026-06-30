/**
 * Analytics — the spending & value picture for a Power User's inventory.
 * Complements the operational dashboard (warranties / alerts / needs-attention)
 * with the money story the dashboard lacks: how much has been spent over time,
 * how the portfolio's acquisition value has grown, and where the spend sits by
 * location and tag, plus the most valuable items today.
 *
 * Figures are owner-scoped and exclude no-longer-owned items (sold/disposed/
 * lost), matching the dashboard's value rule. Lazy-loaded so recharts stays out
 * of the main bundle until /analytics is opened.
 */
import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { TrendingUp, Wallet, Package } from "lucide-react";
import { statisticsAPI } from "../../services/api";
import type { PortfolioAnalytics, ArticleCategory } from "../../types";
import { useI18n } from "../../i18n/i18n";
import { usePreferences } from "../../preferences/preferences";
import { formatMoney } from "../../utils/money";
import { getErrorMessage } from "../../utils/error";
import { PageHeader, Section, Stat } from "../ui";
import { EmptyState, ErrorBanner } from "../common/States";
import { DashboardStatsSkeleton } from "../common/Skeleton";

// Recharts reads colors as plain strings; CSS vars resolve per active theme.
const AXIS = { stroke: "var(--muted)", fontSize: 12 };
const GRID = "var(--border)";
const TOOLTIP_STYLE = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "0.75rem",
  color: "var(--text)",
  fontSize: "0.8rem",
};
const BAR_COLORS = [
  "var(--primary)",
  "var(--accent)",
  "var(--text-success)",
  "var(--text-error)",
];

function ChartCard({
  title,
  empty,
  emptyLabel,
  children,
}: {
  title: string;
  empty: boolean;
  emptyLabel: string;
  children: React.ReactElement;
}) {
  return (
    <Section title={title}>
      {empty ? (
        <div className="grid h-56 place-items-center text-sm ui-text-muted">
          {emptyLabel}
        </div>
      ) : (
        <div className="h-56" role="img" aria-label={title}>
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      )}
    </Section>
  );
}

export default function AnalyticsView() {
  const { t, language } = useI18n();
  const { currency } = usePreferences();
  const [data, setData] = useState<PortfolioAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const analytics = await statisticsAPI.getAnalytics();
        if (!alive) return;
        setData(analytics);
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
  // Trim the YYYY-MM key to a compact MM/YY for the crowded 24-month axis.
  const shortMonth = (m: string) => `${m.slice(5)}/${m.slice(2, 4)}`;

  if (loading) return <DashboardStatsSkeleton />;
  if (error)
    return (
      <div>
        <PageHeader
          icon={<TrendingUp className="h-5 w-5" />}
          title={t("analytics.title")}
          subtitle={t("analytics.subtitle")}
        />
        <ErrorBanner message={error} />
      </div>
    );
  if (!data) return null;

  const header = (
    <PageHeader
      icon={<TrendingUp className="h-5 w-5" />}
      title={t("analytics.title")}
      subtitle={t("analytics.subtitle")}
    />
  );

  if (data.itemsPriced === 0) {
    return (
      <div>
        {header}
        <EmptyState
          icon={<Wallet className="h-8 w-8" />}
          title={t("analytics.empty.title")}
          description={t("analytics.empty.hint")}
        />
      </div>
    );
  }

  return (
    <div>
      {header}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          label={t("analytics.totalSpend")}
          value={money(data.totalSpend)}
          icon={<Wallet className="h-5 w-5" />}
          tone="primary"
        />
        <Stat
          label={t("analytics.currentValue")}
          value={money(data.currentValue)}
          icon={<TrendingUp className="h-5 w-5" />}
          tone="success"
        />
        <Stat
          label={t("analytics.itemsPriced")}
          value={String(data.itemsPriced)}
          icon={<Package className="h-5 w-5" />}
          tone="accent"
        />
      </div>

      <div className="mb-6">
        <ChartCard
          title={t("analytics.valueTrend")}
          empty={false}
          emptyLabel={t("analytics.noData")}
        >
          <AreaChart data={data.spendByMonth}>
            <defs>
              <linearGradient id="valGrad" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--primary)"
                  stopOpacity={0.4}
                />
                <stop
                  offset="100%"
                  stopColor="var(--primary)"
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="month" tickFormatter={shortMonth} {...AXIS} />
            <YAxis {...AXIS} width={40} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={(m) => String(m)}
              formatter={(value) =>
                [money(Number(value)), t("analytics.cumulative")] as [
                  string,
                  string,
                ]
              }
            />
            <Area
              type="monotone"
              dataKey="cumulative"
              stroke="var(--primary)"
              strokeWidth={2}
              fill="url(#valGrad)"
            />
          </AreaChart>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard
          title={t("analytics.spendByMonth")}
          empty={data.spendByMonth.every((b) => b.amount === 0)}
          emptyLabel={t("analytics.noData")}
        >
          <BarChart data={data.spendByMonth}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="month" tickFormatter={shortMonth} {...AXIS} />
            <YAxis {...AXIS} width={40} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) =>
                [money(Number(value)), t("analytics.spend")] as [string, string]
              }
            />
            <Bar dataKey="amount" fill="var(--accent)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartCard>

        <ChartCard
          title={t("analytics.topItems")}
          empty={data.topItems.length === 0}
          emptyLabel={t("analytics.noData")}
        >
          <BarChart data={data.topItems} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis type="number" {...AXIS} />
            <YAxis
              type="category"
              dataKey="name"
              width={110}
              tick={{ ...AXIS, width: 100 }}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) =>
                [money(Number(value)), t("analytics.currentValue")] as [
                  string,
                  string,
                ]
              }
            />
            <Bar dataKey="value" radius={[0, 6, 6, 0]}>
              {data.topItems.map((_, i) => (
                <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ChartCard>

        <ChartCard
          title={t("analytics.byLocation")}
          empty={data.byLocation.length === 0}
          emptyLabel={t("analytics.noData")}
        >
          <BarChart data={data.byLocation}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="name" {...AXIS} />
            <YAxis {...AXIS} width={40} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) =>
                [money(Number(value)), t("analytics.spend")] as [string, string]
              }
            />
            <Bar dataKey="value" fill="var(--primary)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartCard>

        <ChartCard
          title={t("analytics.byTag")}
          empty={data.byTag.length === 0}
          emptyLabel={t("analytics.noData")}
        >
          <BarChart data={data.byTag}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="name" {...AXIS} />
            <YAxis {...AXIS} width={40} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) =>
                [money(Number(value)), t("analytics.spend")] as [string, string]
              }
            />
            <Bar
              dataKey="value"
              fill="var(--text-success)"
              radius={[6, 6, 0, 0]}
            />
          </BarChart>
        </ChartCard>

        <ChartCard
          title={t("analytics.byCategory")}
          empty={data.byCategory.length === 0}
          emptyLabel={t("analytics.noData")}
        >
          <BarChart
            data={data.byCategory.map((c) => ({
              name:
                c.category === "UNCATEGORIZED"
                  ? t("articleCategory.none")
                  : t(`articleCategory.${c.category as ArticleCategory}`),
              value: c.value,
            }))}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="name" {...AXIS} />
            <YAxis {...AXIS} width={40} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) =>
                [money(Number(value)), t("analytics.spend")] as [string, string]
              }
            />
            <Bar dataKey="value" fill="var(--accent)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartCard>
      </div>
    </div>
  );
}
