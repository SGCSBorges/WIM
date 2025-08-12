import React, { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n/i18n";

const API_BASE_URL = "http://localhost:3000/api";

type Warranty = {
  garantieId: number;
  garantieNom: string;
  garantieDateAchat: string;
  garantieDuration: number;
  garantieEndDate?: string | null;
  garantieIsValide?: boolean;
  garantieArticleId: number;
};

function headers() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    Authorization: token ? `Bearer ${token}` : "",
  };
}

export default function WarrantiesView() {
  const { t } = useI18n();
  const [items, setItems] = useState<Warranty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/warranties`, {
        headers: headers(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.error || `Failed to fetch warranties (${res.status})`,
        );
      }
      const data = (await res.json()) as Warranty[];
      setItems(data);
    } catch (e: any) {
      setError(e?.message || t("warranties.error.fetch"));
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
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="ui-card rounded-lg">
        <div className="p-4 border-b ui-divider flex items-center justify-between">
          <h2 className="font-semibold">{t("warranties.all")}</h2>
          {loading ? (
            <span className="text-xs ui-text-muted">{t("common.loading")}</span>
          ) : (
            <button
              onClick={fetchAll}
              className="text-sm ui-btn-ghost rounded px-2 py-1"
            >
              {t("common.refresh")}
            </button>
          )}
        </div>

        <div className="divide-y">
          {!loading && sorted.length === 0 && (
            <div className="p-4 text-sm ui-text-muted">
              {t("warranties.none")}
            </div>
          )}

          {sorted.map((w) => (
            <div key={w.garantieId} className="p-4">
              <div className="font-medium">{w.garantieNom}</div>
              <div className="text-xs ui-text-muted">
                {t("warranties.purchase")}:{" "}
                {new Date(w.garantieDateAchat).toLocaleDateString()} —{" "}
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
