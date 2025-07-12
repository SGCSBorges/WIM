/**
 * Dashboard Component
 * Main dashboard page showing inventory statistics and overview
 */

import React, { useState, useEffect } from "react";
import { statisticsAPI } from "../../services/api";

interface DashboardStatistics {
  articles: {
    total: number;
    withWarranty: number;
    withoutWarranty: number;
  };
  warranties: {
    total: number;
    active: number;
    expired: number;
    expiringSoon: number;
  };
  users: {
    total: number;
    byRole: {
      USER: number;
      POWER_USER: number;
      ADMIN: number;
    };
  };
  alerts: {
    total: number;
  };
}

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  color,
  subtitle,
}) => (
  <div className="bg-white rounded-lg shadow p-6">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-600">{title}</p>
        <p className="text-3xl font-semibold text-gray-900">{value}</p>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
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
  data: { label: string; value: number; color?: string }[];
}

const DetailCard: React.FC<DetailCardProps> = ({ title, data }) => (
  <div className="bg-white rounded-lg shadow p-6">
    <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
    <div className="space-y-3">
      {data.map((item, index) => (
        <div key={index} className="flex items-center justify-between">
          <span className="text-sm text-gray-600">{item.label}</span>
          <span
            className={`text-sm font-medium ${item.color || "text-gray-900"}`}
          >
            {item.value}
          </span>
        </div>
      ))}
    </div>
  </div>
);

const Dashboard: React.FC = () => {
  const [statistics, setStatistics] = useState<DashboardStatistics | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStatistics = async () => {
      try {
        setLoading(true);
        const data = await statisticsAPI.getAll();
        setStatistics(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        console.error("Error fetching statistics:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchStatistics();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center">
          <span className="text-red-400 mr-2">❌</span>
          <p className="text-sm text-red-700">
            Error loading dashboard: {error}
          </p>
        </div>
      </div>
    );
  }

  if (!statistics) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-center">
          <span className="text-yellow-400 mr-2">⚠️</span>
          <p className="text-sm text-yellow-700">No statistics available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">
          Overview of your inventory management system
        </p>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Articles"
          value={statistics.articles.total}
          icon="📦"
          color="bg-blue-500"
          subtitle={`${statistics.articles.withWarranty} with warranty`}
        />

        <StatCard
          title="Active Warranties"
          value={statistics.warranties.active}
          icon="🛡️"
          color="bg-green-500"
          subtitle={`${statistics.warranties.expiringSoon} expiring soon`}
        />

        <StatCard
          title="Total Users"
          value={statistics.users.total}
          icon="👥"
          color="bg-purple-500"
          subtitle={`${statistics.users.byRole.ADMIN} admin(s)`}
        />

        <StatCard
          title="Active Alerts"
          value={statistics.alerts.total}
          icon="🚨"
          color="bg-orange-500"
        />
      </div>

      {/* Detailed Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <DetailCard
          title="Articles Overview"
          data={[
            { label: "Total Articles", value: statistics.articles.total },
            {
              label: "With Warranty",
              value: statistics.articles.withWarranty,
              color: "text-green-600",
            },
            {
              label: "Without Warranty",
              value: statistics.articles.withoutWarranty,
              color: "text-orange-600",
            },
          ]}
        />

        <DetailCard
          title="Warranties Status"
          data={[
            { label: "Total Warranties", value: statistics.warranties.total },
            {
              label: "Active",
              value: statistics.warranties.active,
              color: "text-green-600",
            },
            {
              label: "Expired",
              value: statistics.warranties.expired,
              color: "text-red-600",
            },
            {
              label: "Expiring Soon",
              value: statistics.warranties.expiringSoon,
              color: "text-orange-600",
            },
          ]}
        />

        <DetailCard
          title="Users by Role"
          data={[
            { label: "Total Users", value: statistics.users.total },
            {
              label: "Admins",
              value: statistics.users.byRole.ADMIN,
              color: "text-purple-600",
            },
            {
              label: "Power Users",
              value: statistics.users.byRole.POWER_USER,
              color: "text-blue-600",
            },
            {
              label: "Regular Users",
              value: statistics.users.byRole.USER,
              color: "text-gray-600",
            },
          ]}
        />
      </div>

      {/* Quick Actions or Additional Info */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          System Health
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center">
            <span className="text-green-500 mr-2">✅</span>
            <span className="text-sm text-gray-600">
              {(
                (statistics.warranties.active / statistics.warranties.total) *
                100
              ).toFixed(1)}
              % warranties active
            </span>
          </div>

          <div className="flex items-center">
            <span className="text-blue-500 mr-2">📈</span>
            <span className="text-sm text-gray-600">
              {(
                (statistics.articles.withWarranty / statistics.articles.total) *
                100
              ).toFixed(1)}
              % articles covered
            </span>
          </div>

          <div className="flex items-center">
            <span className="text-orange-500 mr-2">⏰</span>
            <span className="text-sm text-gray-600">
              {statistics.warranties.expiringSoon} warranties need attention
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
