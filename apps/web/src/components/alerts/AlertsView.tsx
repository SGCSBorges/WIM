import React, { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n/i18n";
import { alertsAPI } from "../../services/api";

type AlertStatus = "SCHEDULED" | "SENT" | "CANCELLED" | "FAILED";

type Alert = {
  alerteId: number;
  alerteNom: string;
  alerteDate: string;
  alerteDescription?: string | null;
  status: AlertStatus;
  sentAt?: string | null;
  failedAt?: string | null;
  errorMessage?: string | null;
  alerteGarantieId?: number | null;
  alerteArticleId?: number | null;
  garantie?: {
    garantieId: number;
    garantieNom: string;
  } | null;
  article?: {
    articleId: number;
    articleNom: string;
    articleModele: string;
  } | null;
};

function statusBadge(status: AlertStatus) {
  switch (status) {
    case "SCHEDULED":
      return "bg-blue-100 text-blue-800";
    case "SENT":
      return "bg-green-100 text-green-800";
    case "CANCELLED":
      return "bg-gray-100 text-gray-800";
    case "FAILED":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export default function AlertsView() {
  const { t } = useI18n();
  const [items, setItems] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | AlertStatus>("ALL");
  const [sortBy, setSortBy] = useState<"date" | "status" | "name">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await alertsAPI.getAll(
        statusFilter === "ALL" ? undefined : statusFilter,
      );
      setItems(data);
    } catch (e: any) {
      setError(e?.message || "Failed to fetch alerts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const sorted = useMemo(() => {
    const arr = [...items];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "date") {
        cmp =
          new Date(a.alerteDate).getTime() - new Date(b.alerteDate).getTime();
      } else if (sortBy === "status") {
        cmp = a.status.localeCompare(b.status);
      } else {
        cmp = a.alerteNom.localeCompare(b.alerteNom);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [items, sortBy, sortDir]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // silent (some browsers disallow clipboard without HTTPS)
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {t("alerts.title")}
        </h1>
        <p className="text-gray-600">{t("alerts.subtitle")}</p>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between gap-4">
          <h2 className="font-semibold">{t("alerts.all")}</h2>
          <div className="flex items-center gap-3">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-2 py-1 border border-gray-300 rounded-md text-sm"
              title={t("alerts.sortBy")}
            >
              <option value="date">{t("alerts.sort.date")}</option>
              <option value="name">{t("alerts.sort.name")}</option>
              <option value="status">{t("alerts.sort.status")}</option>
            </select>

            <button
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="px-2 py-1 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50"
              title={t("alerts.sortDirection")}
            >
              {sortDir === "asc" ? t("alerts.sort.asc") : t("alerts.sort.desc")}
            </button>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-2 py-1 border border-gray-300 rounded-md text-sm"
            >
              <option value="ALL">{t("alerts.filters.all")}</option>
              <option value="SCHEDULED">{t("alerts.status.scheduled")}</option>
              <option value="SENT">{t("alerts.status.sent")}</option>
              <option value="CANCELLED">{t("alerts.status.cancelled")}</option>
              <option value="FAILED">{t("alerts.status.failed")}</option>
            </select>

            {loading ? (
              <span className="text-xs text-gray-500">
                {t("common.loading")}
              </span>
            ) : (
              <button
                onClick={fetchAll}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                {t("common.refresh")}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="p-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        <div className="divide-y">
          {!loading && sorted.length === 0 && (
            <div className="p-4 text-sm text-gray-500">{t("alerts.none")}</div>
          )}

          {sorted.map((a) => (
            <div key={a.alerteId} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium text-gray-900">{a.alerteNom}</div>
                  <div className="text-xs text-gray-600">
                    {t("alerts.date")}:{" "}
                    {new Date(a.alerteDate).toLocaleString()}
                  </div>

                  {(a.garantie ||
                    a.article ||
                    a.alerteGarantieId ||
                    a.alerteArticleId) && (
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
                      {(a.garantie || a.alerteGarantieId) && (
                        <button
                          type="button"
                          onClick={() =>
                            copyToClipboard(
                              String(
                                a.garantie?.garantieId ?? a.alerteGarantieId,
                              ),
                            )
                          }
                          className="hover:text-gray-900 underline"
                          title={t("alerts.copyId")}
                        >
                          {t("alerts.warranty")}:{" "}
                          {a.garantie?.garantieNom ?? `#${a.alerteGarantieId}`}
                        </button>
                      )}

                      {(a.article || a.alerteArticleId) && (
                        <button
                          type="button"
                          onClick={() =>
                            copyToClipboard(
                              String(a.article?.articleId ?? a.alerteArticleId),
                            )
                          }
                          className="hover:text-gray-900 underline"
                          title={t("alerts.copyId")}
                        >
                          {t("alerts.article")}:{" "}
                          {a.article
                            ? `${a.article.articleNom} (${a.article.articleModele})`
                            : `#${a.alerteArticleId}`}
                        </button>
                      )}
                    </div>
                  )}

                  {a.status === "FAILED" && a.errorMessage && (
                    <div className="mt-2 text-xs text-red-700">
                      {t("alerts.error")}: {a.errorMessage}
                    </div>
                  )}
                </div>

                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge(
                    a.status,
                  )}`}
                >
                  {t(`alerts.status.${a.status.toLowerCase()}` as any)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="text-xs text-gray-500">{t("alerts.note")}</div>
    </div>
  );
}
