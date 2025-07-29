import React, { useEffect, useMemo, useState } from "react";
import WarrantyForm from "./WarrantyForm";
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
  const [showForm, setShowForm] = useState(false);

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

  const createWarranty = async (data: any) => {
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/warranties`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(
          err?.error || `Failed to create warranty (${res.status})`,
        );
      }
      setShowForm(false);
      await fetchAll();
    } catch (e: any) {
      setError(e?.message || t("warranties.error.create"));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t("warranties.title")}
          </h1>
          <p className="text-gray-600">{t("warranties.subtitle")}</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          {showForm ? t("warranties.close") : t("warranties.add")}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {showForm && (
        <WarrantyForm
          onSubmit={createWarranty}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold">{t("warranties.all")}</h2>
          {loading && (
            <span className="text-xs text-gray-500">{t("common.loading")}</span>
          )}
          {!loading && (
            <button
              onClick={fetchAll}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              {t("common.refresh")}
            </button>
          )}
        </div>
        <div className="divide-y">
          {!loading && sorted.length === 0 && (
            <div className="p-4 text-sm text-gray-500">
              {t("warranties.none")}
            </div>
          )}
          {sorted.map((w) => (
            <div key={w.garantieId} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium text-gray-900">
                    {w.garantieNom}
                  </div>
                  <div className="text-xs text-gray-600">
                    {t("warranties.purchase")}:{" "}
                    {new Date(w.garantieDateAchat).toLocaleDateString()} —
                    {t("warranties.duration")}: {w.garantieDuration}{" "}
                    {t("warranties.months")}
                  </div>
                  <div className="text-xs text-gray-600">
                    {t("warranties.articleId")}: {w.garantieArticleId}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="text-xs text-gray-500">{t("warranties.note")}</div>
    </div>
  );
}
