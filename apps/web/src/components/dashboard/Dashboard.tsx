import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { statisticsAPI, profileAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";
import { formatMoney } from "../../utils/money";
import { DashboardStatsSkeleton, Skeleton } from "../common/Skeleton";
import { ErrorBanner } from "../common/States";
import BarList from "../common/BarList";

interface DashboardStatistics {
  articles: {
    total: number;
    withWarranty: number;
    withoutWarranty: number;
  };
  locations: {
    byLocation: Array<{
      locationId: number;
      name: string;
      articlesCount: number;
    }>;
    unassigned: number;
  };
  warranties: {
    total: number;
    active: number;
    expired: number;
    expiringSoon: number;
    withAttachment: number;
  };
  alerts: {
    total: number;
  };
  sharing: {
    ownedSharedArticles: number;
    totalSharedArticles: number;
  };
  inventoryValue: {
    total: number;
    currentTotal: number;
    atRisk: number;
    byLocation: Array<{ locationId: number; name: string; value: number }>;
    byTag: Array<{ tagId: number; name: string; value: number }>;
  };
}

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  // ReactNode so callers can embed a Link to a filtered view.
  subtitle?: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  color,
  subtitle,
}) => (
  <div className="ui-card rounded-lg shadow p-6">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium ui-text-muted">{title}</p>
        <p className="text-3xl font-semibold">{value}</p>
        {subtitle && <p className="text-sm ui-text-muted mt-1">{subtitle}</p>}
      </div>
      <div
        className={`p-3 rounded-full ${color} text-white text-2xl flex items-center justify-center w-12 h-12`}
      >
        {icon}
      </div>
    </div>
  </div>
);

interface DetailCardProps {
  title: string;
  data: { label: string; value: number | string; color?: string }[];
}

const DetailCard: React.FC<DetailCardProps> = ({ title, data }) => (
  <div className="ui-card rounded-lg shadow p-6">
    <h3 className="text-lg font-semibold mb-4">{title}</h3>
    <div className="space-y-3">
      {data.map((item, index) => (
        <div key={index} className="flex items-center justify-between">
          <span className="text-sm ui-text-muted">{item.label}</span>
          <span className={`text-sm font-medium ${item.color || ""}`}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  </div>
);

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="ui-card rounded-lg shadow p-6 space-y-3">
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
      <div className="border ui-alert-warning rounded-lg p-4">
        <div className="flex items-center">
          <span className="ui-text-warn mr-2">⚠️</span>
          <p className="text-sm ui-text-warn">{t("dashboard.noStats")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("dashboard.title")}</h1>
        <p className="ui-text-muted">{t("dashboard.subtitle")}</p>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title={t("dashboard.inventoryValue")}
          value={formatMoney(
            statistics.inventoryValue.total,
            currency,
            language
          )}
          icon="💰"
          color="ui-icon-success"
          subtitle={
            <Link
              to="/articles?warranty=expired"
              className="hover:underline"
              title={t("dashboard.showExpired")}
            >
              {formatMoney(
                statistics.inventoryValue.atRisk,
                currency,
                language
              )}{" "}
              {t("dashboard.valueAtRisk")}
            </Link>
          }
        />

        <StatCard
          title={t("dashboard.currentValue")}
          value={formatMoney(
            statistics.inventoryValue.currentTotal,
            currency,
            language
          )}
          icon="📉"
          color="ui-icon-info"
          subtitle={`${formatMoney(
            statistics.inventoryValue.total,
            currency,
            language
          )} ${t("dashboard.atPurchase")}`}
        />

        <StatCard
          title={t("dashboard.totalArticles")}
          value={statistics.articles.total}
          icon="📦"
          color="ui-icon-primary"
          subtitle={`${statistics.articles.withWarranty} ${t("dashboard.withWarranty")}`}
        />

        <StatCard
          title={t("dashboard.activeWarranties")}
          value={statistics.warranties.active}
          icon="🛡️"
          color="ui-icon-success"
          subtitle={
            <Link
              to="/articles?warranty=expiringSoon"
              className="hover:underline"
              title={t("dashboard.showExpiringSoon")}
            >
              {statistics.warranties.expiringSoon} {t("dashboard.expiringSoon")}
            </Link>
          }
        />

        <StatCard
          title={t("dashboard.sharedByMe")}
          value={statistics.sharing.ownedSharedArticles}
          icon="📤"
          color="ui-icon-purple"
          subtitle={t("dashboard.ownedArticlesShared")}
        />

        <StatCard
          title={t("dashboard.sharedWithMe")}
          value={statistics.sharing.totalSharedArticles}
          icon="📥"
          color="ui-icon-warning"
          subtitle={t("dashboard.availableInSharedView")}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="ui-card rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">
            {t("dashboard.charts.valueByLocation")}
          </h3>
          <BarList
            items={statistics.inventoryValue.byLocation.map((l) => ({
              label: l.name,
              value: l.value,
            }))}
            formatValue={(n) => formatMoney(n, currency, language)}
            emptyLabel={t("dashboard.charts.noData")}
          />
        </div>
        <div className="ui-card rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">
            {t("dashboard.charts.valueByTag")}
          </h3>
          <BarList
            items={statistics.inventoryValue.byTag.map((tg) => ({
              label: tg.name,
              value: tg.value,
            }))}
            formatValue={(n) => formatMoney(n, currency, language)}
            emptyLabel={t("dashboard.charts.noData")}
          />
        </div>
        <div className="ui-card rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">
            {t("dashboard.charts.warrantyStatus")}
          </h3>
          <BarList
            items={[
              {
                label: t("dashboard.active"),
                value: statistics.warranties.active,
              },
              {
                label: t("dashboard.expiringSoon"),
                value: statistics.warranties.expiringSoon,
              },
              {
                label: t("dashboard.expired"),
                value: statistics.warranties.expired,
              },
            ]}
            emptyLabel={t("dashboard.charts.noData")}
          />
        </div>
      </div>

      {/* Detailed Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <DetailCard
          title={t("dashboard.articlesOverview")}
          data={[
            {
              label: t("dashboard.totalArticles"),
              value: statistics.articles.total,
            },
            {
              label: t("dashboard.withWarranty"),
              value: statistics.articles.withWarranty,
              color: "ui-text-success",
            },
            {
              label: t("dashboard.withoutWarranty"),
              value: statistics.articles.withoutWarranty,
              color: "text-orange-600",
            },
          ]}
        />

        <DetailCard
          title={t("dashboard.sharing")}
          data={[
            {
              label: t("dashboard.ownedSharedArticles"),
              value: statistics.sharing.ownedSharedArticles,
              color: "text-purple-600",
            },
            {
              label: t("dashboard.totalSharedArticles"),
              value: statistics.sharing.totalSharedArticles,
              color: "text-blue-600",
            },
          ]}
        />

        <DetailCard
          title={t("dashboard.articlesByLocation")}
          data={[
            ...statistics.locations.byLocation.map((l) => ({
              label: l.name,
              value: l.articlesCount,
            })),
            {
              label: t("dashboard.unassigned"),
              value: statistics.locations.unassigned,
              color: "ui-text-muted",
            },
          ]}
        />

        <DetailCard
          title={t("dashboard.valueByLocation")}
          data={[
            {
              label: t("dashboard.inventoryValue"),
              value: formatMoney(
                statistics.inventoryValue.total,
                currency,
                language
              ),
              color: "ui-text-success",
            },
            ...statistics.inventoryValue.byLocation.map((l) => ({
              label: l.name,
              value: formatMoney(l.value, currency, language),
            })),
          ]}
        />

        <DetailCard
          title={t("dashboard.warrantiesStatus")}
          data={[
            {
              label: t("dashboard.totalWarranties"),
              value: statistics.warranties.total,
            },
            {
              label: t("dashboard.active"),
              value: statistics.warranties.active,
              color: "ui-text-success",
            },
            {
              label: t("dashboard.expired"),
              value: statistics.warranties.expired,
              color: "ui-text-error",
            },
            {
              label: t("dashboard.expiringSoon"),
              value: statistics.warranties.expiringSoon,
              color: "text-orange-600",
            },
            {
              label: t("dashboard.withAttachment"),
              value: statistics.warranties.withAttachment,
              color: "ui-text-success",
            },
          ]}
        />
      </div>

      {/* Quick Actions or Additional Info */}
      <div className="ui-card rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">
          {t("dashboard.systemHealth")}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center">
            <span className="ui-text-success mr-2">✅</span>
            <span className="text-sm ui-text-muted">
              {(statistics.warranties.total
                ? (statistics.warranties.active / statistics.warranties.total) *
                  100
                : 0
              ).toFixed(1)}
              {t("dashboard.warrantiesActivePct")}
            </span>
          </div>

          <div className="flex items-center">
            <span className="text-blue-500 mr-2">📈</span>
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

          <div className="flex items-center">
            <span className="text-orange-500 mr-2">⏰</span>
            <span className="text-sm ui-text-muted">
              {statistics.warranties.expiringSoon}{" "}
              {t("dashboard.warrantiesNeedAttention")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
