import React, { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { useI18n } from "../../i18n/i18n";
import { warrantiesAPI } from "../../services/api";
import { getErrorMessage } from "../../utils/error";

type Warranty = {
  garantieId: number;
  garantieNom: string;
  garantieDateAchat: string;
  garantieDuration: number;
  garantieEndDate?: string | null;
  garantieIsValide?: boolean;
  garantieArticleId: number;
};

export default function WarrantiesView() {
  const { t } = useI18n();
  const [items, setItems] = useState<Warranty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await warrantiesAPI.getAll();
      setItems(data as Warranty[]);
    } catch (e: unknown) {
      setError(getErrorMessage(e, t("warranties.error.fetch")));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const sorted = useMemo(() => {
    return [...items].sort(
      (a, b) =>
        new Date(b.garantieDateAchat).getTime() -
        new Date(a.garantieDateAchat).getTime(),
    );
  }, [items]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("warranties.title")}</h1>
        <p className="ui-text-muted">{t("warranties.subtitle")}</p>
      </div>

      <div className="ui-panel rounded-md p-4 text-sm">
        {t("warranties.createDisabled.message")}
      </div>

      {error && (
        <div role="alert" className="border ui-alert-error rounded-lg p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="ui-card rounded-lg">
        <div className="p-4 border-b ui-divider flex items-center justify-between">
          <h2 className="font-semibold">{t("warranties.all")}</h2>
          <button
            onClick={fetchAll}
            disabled={loading}
            className="text-sm ui-btn-ghost rounded px-2 py-1"
          >
            {loading ? t("common.loading") : t("common.refresh")}
          </button>
        </div>

        <div className="divide-y">
          {loading && (
            <>
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 space-y-2 animate-pulse">
                  <div className="h-4 ui-card rounded w-1/3" />
                  <div className="h-3 ui-card rounded w-1/2" />
                </div>
              ))}
            </>
          )}

          {!loading && sorted.length === 0 && (
            <div className="p-4 text-sm ui-text-muted">
              {t("warranties.none")}
            </div>
          )}

          {!loading && sorted.map((w) => (
            <div key={w.garantieId} className="p-4">
              <div className="font-medium">{w.garantieNom}</div>
              <div className="text-xs ui-text-muted">
                {t("warranties.purchase")}:{" "}
                {format(parseISO(w.garantieDateAchat), "dd MMM yyyy")} —{" "}
                {t("warranties.duration")}: {w.garantieDuration}{" "}
                {t("warranties.months")}
              </div>
              <div className="text-xs ui-text-muted">
                {t("warranties.articleId")}: {w.garantieArticleId}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="text-xs ui-text-muted">{t("warranties.note")}</div>
    </div>
  );
}
