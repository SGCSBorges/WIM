/**
 * Dashboard — the user's home metrics page. Fetches one big aggregate
 * from `statisticsAPI.getDashboard` (totals, by-location/by-tag value,
 * 12-month forecasting series) and renders KPI cards + recharts
 * visualizations. Chart colors come from the theme CSS vars so they
 * adapt across light/dark/ocean/cyber.
 */
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Wallet,
  TrendingDown,
  Package,
  ShieldCheck,
  Share2,
  Inbox,
  Activity,
  AlertTriangle,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { statisticsAPI, profileAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";
import { formatMoney } from "../../utils/money";
import { formatCount } from "../../utils/number";
import { DashboardStatsSkeleton, Skeleton } from "../common/Skeleton";
import { ErrorBanner } from "../common/States";
import { PageHeader, Stat, Section, type StatTone } from "../ui";
import NeedsAttention from "./NeedsAttention";
import BudgetCard from "./BudgetCard";
import type { DashboardStatistics } from "@wim/types";

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
const PIE_COLORS = [
  "var(--text-success)",
  "var(--accent)",
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
        // role="img" + the chart title as the label gives screen readers a
        // single meaningful announcement instead of diving into the
        // unlabeled recharts SVG.
        <div className="h-56" role="img" aria-label={title}>
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      )}
    </Section>
  );
}

interface DetailRow {
  label: string;
  value: number | string;
  tone?: string;
}
function DetailCard({
  title,
  data,
  locale,
}: {
  title: string;
  data: DetailRow[];
  locale?: string;
}) {
  return (
    <Section title={title}>
      <ul className="space-y-2.5">
        {data.map((item, i) => (
          <li key={i} className="flex items-center justify-between gap-3">
            <span className="text-sm ui-text-muted">{item.label}</span>
            <span
              className={`text-sm font-semibold tabular-nums ${item.tone ?? "ui-title"}`}
            >
              {typeof item.value === "number"
                ? formatCount(item.value, locale)
                : item.value}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const Dashboard: React.FC = () => {
  const { t, language } = useI18n();
  const [statistics, setStatistics] = useState<DashboardStatistics | null>(
    null
  );
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatistics = React.useCallback(async () => {
    try {
      setLoading(true);
      const data = await statisticsAPI.getDashboard();
      setStatistics(data);
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, t("common.errorOccurred")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchStatistics();
    profileAPI
      .getMe()
      .then((me) => {
        if (me.currency) setCurrency(me.currency);
      })
      .catch(() => {});
  }, [fetchStatistics]);

  if (loading) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label={t("dashboard.title")}
        className="space-y-6"
      >
        <div className="space-y-2">
          <Skeleton height={32} width="35%" />
          <Skeleton height={16} width="55%" />
        </div>
        <DashboardStatsSkeleton cards={4} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="ui-card space-y-3 p-6">
              <Skeleton height={20} width="40%" />
              <Skeleton height={160} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorBanner
        message={`${t("dashboard.errorLoading")} ${error}`}
        onRetry={fetchStatistics}
        retryLabel={t("common.retry")}
      />
    );
  }

  if (!statistics) {
    return (
      <div className="flex items-center gap-2 rounded-xl border ui-alert-warning p-4">
        <AlertTriangle className="h-4 w-4 ui-text-warn" aria-hidden="true" />
        <p className="text-sm ui-text-warn">{t("dashboard.noStats")}</p>
      </div>
    );
  }

  const money = (n: number) => formatMoney(n, currency, language);
  const count = (n: number) => formatCount(n, language);

  const kpis: {
    title: string;
    value: number | string;
    icon: React.ReactNode;
    tone: StatTone;
    footer?: React.ReactNode;
  }[] = [
    {
      title: t("dashboard.inventoryValue"),
      value: money(statistics.inventoryValue.total),
      icon: <Wallet className="h-5 w-5" />,
      tone: "success",
      footer: (
        <Link
          to="/articles?warranty=expired"
          className="ui-action-primary hover:underline"
          title={t("dashboard.showExpired")}
        >
          {money(statistics.inventoryValue.atRisk)} {t("dashboard.valueAtRisk")}
        </Link>
      ),
    },
    {
      title: t("dashboard.currentValue"),
      value: money(statistics.inventoryValue.currentTotal),
      icon: <TrendingDown className="h-5 w-5" />,
      tone: "primary",
      footer: (
        <span className="ui-text-muted">
          {money(statistics.inventoryValue.total)} {t("dashboard.atPurchase")}
        </span>
      ),
    },
    {
      title: t("dashboard.totalArticles"),
      value: count(statistics.articles.total),
      icon: <Package className="h-5 w-5" />,
      tone: "primary",
      footer: (
        <span className="ui-text-muted">
          {count(statistics.articles.withWarranty)}{" "}
          {t("dashboard.withWarranty")}
        </span>
      ),
    },
    {
      title: t("dashboard.activeWarranties"),
      value: count(statistics.warranties.active),
      icon: <ShieldCheck className="h-5 w-5" />,
      tone: "success",
      footer: (
        <Link
          to="/articles?warranty=expiringSoon"
          className="ui-action-primary hover:underline"
          title={t("dashboard.showExpiringSoon")}
        >
          {count(statistics.warranties.expiringSoon)}{" "}
          {t("dashboard.expiringSoon")}
        </Link>
      ),
    },
    {
      title: t("dashboard.sharedByMe"),
      value: count(statistics.sharing.ownedSharedArticles),
      icon: <Share2 className="h-5 w-5" />,
      tone: "accent",
      footer: (
        <span className="ui-text-muted">
          {t("dashboard.ownedArticlesShared")}
        </span>
      ),
    },
    {
      title: t("dashboard.sharedWithMe"),
      value: count(statistics.sharing.totalSharedArticles),
      icon: <Inbox className="h-5 w-5" />,
      tone: "warning",
      footer: (
        <span className="ui-text-muted">
          {t("dashboard.availableInSharedView")}
        </span>
      ),
    },
  ];

  const warrantyPie = [
    { name: t("dashboard.active"), value: statistics.warranties.active },
    {
      name: t("dashboard.expiringSoon"),
      value: statistics.warranties.expiringSoon,
    },
    { name: t("dashboard.expired"), value: statistics.warranties.expired },
  ];
  const warrantyPieEmpty = warrantyPie.every((s) => s.value === 0);

  const expirations = statistics.warrantyExpirationsByMonth ?? [];
  const additions = statistics.articlesAddedByMonth ?? [];

  return (
    <div>
      <PageHeader
        icon={<Activity className="h-5 w-5" />}
        title={t("dashboard.title")}
        subtitle={t("dashboard.subtitle")}
      />

      <NeedsAttention />

      <BudgetCard />

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <Stat
            key={k.title}
            label={k.title}
            value={k.value}
            icon={k.icon}
            tone={k.tone}
            footer={k.footer}
          />
        ))}
      </div>

      {/* Charts */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ChartCard
          title={t("dashboard.charts.valueByLocation")}
          empty={statistics.inventoryValue.byLocation.length === 0}
          emptyLabel={t("dashboard.charts.noData")}
        >
          <BarChart data={statistics.inventoryValue.byLocation}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={GRID}
              vertical={false}
            />
            <XAxis dataKey="name" {...AXIS} />
            <YAxis {...AXIS} width={48} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              cursor={{ fill: "var(--surface-muted)" }}
              formatter={(value) => money(Number(value))}
            />
            <Bar dataKey="value" fill="var(--primary)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartCard>

        <ChartCard
          title={t("dashboard.charts.valueByTag")}
          empty={statistics.inventoryValue.byTag.length === 0}
          emptyLabel={t("dashboard.charts.noData")}
        >
          <BarChart data={statistics.inventoryValue.byTag}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={GRID}
              vertical={false}
            />
            <XAxis dataKey="name" {...AXIS} />
            <YAxis {...AXIS} width={48} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              cursor={{ fill: "var(--surface-muted)" }}
              formatter={(value) => money(Number(value))}
            />
            <Bar dataKey="value" fill="var(--accent)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartCard>

        <ChartCard
          title={t("dashboard.charts.warrantyStatus")}
          empty={warrantyPieEmpty}
          emptyLabel={t("dashboard.charts.noData")}
        >
          <PieChart>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Pie
              data={warrantyPie}
              dataKey="value"
              nameKey="name"
              innerRadius={48}
              outerRadius={80}
              paddingAngle={2}
              stroke="var(--surface)"
            >
              {warrantyPie.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ChartCard>
      </div>

      {/* Forecasting: rolling 12-month series */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard
          title={t("dashboard.charts.warrantyExpirations12m")}
          empty={expirations.length === 0}
          emptyLabel={t("dashboard.charts.noData")}
        >
          <AreaChart data={expirations}>
            <defs>
              <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--primary)"
                  stopOpacity={0.4}
                />
                <stop
                  offset="100%"
                  stopColor="var(--primary)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={GRID}
              vertical={false}
            />
            <XAxis dataKey="month" {...AXIS} />
            <YAxis {...AXIS} width={36} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Area
              type="monotone"
              dataKey="count"
              stroke="var(--primary)"
              strokeWidth={2}
              fill="url(#expGrad)"
            />
          </AreaChart>
        </ChartCard>

        <ChartCard
          title={t("dashboard.charts.articlesAdded12m")}
          empty={additions.length === 0}
          emptyLabel={t("dashboard.charts.noData")}
        >
          <AreaChart data={additions}>
            <defs>
              <linearGradient id="addGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={GRID}
              vertical={false}
            />
            <XAxis dataKey="month" {...AXIS} />
            <YAxis {...AXIS} width={36} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Area
              type="monotone"
              dataKey="count"
              stroke="var(--accent)"
              strokeWidth={2}
              fill="url(#addGrad)"
            />
          </AreaChart>
        </ChartCard>
      </div>

      {/* Detailed breakdowns */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <DetailCard
          locale={language}
          title={t("dashboard.articlesOverview")}
          data={[
            {
              label: t("dashboard.totalArticles"),
              value: statistics.articles.total,
            },
            {
              label: t("dashboard.withWarranty"),
              value: statistics.articles.withWarranty,
              tone: "ui-text-success",
            },
            {
              label: t("dashboard.withoutWarranty"),
              value: statistics.articles.withoutWarranty,
              tone: "ui-text-warn",
            },
          ]}
        />

        <DetailCard
          locale={language}
          title={t("dashboard.sharing")}
          data={[
            {
              label: t("dashboard.ownedSharedArticles"),
              value: statistics.sharing.ownedSharedArticles,
            },
            {
              label: t("dashboard.totalSharedArticles"),
              value: statistics.sharing.totalSharedArticles,
            },
          ]}
        />

        <DetailCard
          locale={language}
          title={t("dashboard.articlesByLocation")}
          data={[
            ...statistics.locations.byLocation.map((l) => ({
              label: l.name,
              value: l.articlesCount,
            })),
            {
              label: t("dashboard.unassigned"),
              value: statistics.locations.unassigned,
              tone: "ui-text-muted",
            },
          ]}
        />

        <DetailCard
          locale={language}
          title={t("dashboard.warrantiesStatus")}
          data={[
            {
              label: t("dashboard.totalWarranties"),
              value: statistics.warranties.total,
            },
            {
              label: t("dashboard.active"),
              value: statistics.warranties.active,
              tone: "ui-text-success",
            },
            {
              label: t("dashboard.expired"),
              value: statistics.warranties.expired,
              tone: "ui-text-error",
            },
            {
              label: t("dashboard.expiringSoon"),
              value: statistics.warranties.expiringSoon,
              tone: "ui-text-warn",
            },
            {
              label: t("dashboard.withAttachment"),
              value: statistics.warranties.withAttachment,
              tone: "ui-text-success",
            },
          ]}
        />
      </div>

      {/* System health */}
      <Section title={t("dashboard.systemHealth")} className="mt-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="flex items-center gap-2">
            <ShieldCheck
              className="h-4 w-4 ui-text-success"
              aria-hidden="true"
            />
            <span className="text-sm ui-text-muted">
              {(statistics.warranties.total
                ? (statistics.warranties.active / statistics.warranties.total) *
                  100
                : 0
              ).toFixed(1)}
              {t("dashboard.warrantiesActivePct")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className="text-sm ui-text-muted">
              {(statistics.articles.total
                ? (statistics.articles.withWarranty /
                    statistics.articles.total) *
                  100
                : 0
              ).toFixed(1)}
              {t("dashboard.articlesCoveredPct")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-accent" aria-hidden="true" />
            <span className="text-sm ui-text-muted">
              {statistics.warranties.expiringSoon}{" "}
              {t("dashboard.warrantiesNeedAttention")}
            </span>
          </div>
        </div>
      </Section>
    </div>
  );
};

export default Dashboard;
