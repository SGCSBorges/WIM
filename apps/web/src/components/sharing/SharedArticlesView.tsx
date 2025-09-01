import React, { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../../services/api";
import { useI18n } from "../../i18n/i18n";

type SharedOwner = { userId: number; email: string };

type SharedArticle = {
  articleId: number;
  articleNom: string;
  articleModele: string;
  articleDescription?: string | null;
  createdAt: string;
  updatedAt: string;
  garantie?: any;
  locations?: any[];
  ownerUserId: number;
};

type SharedArticleRow = {
  rowId: number;
  owner: SharedOwner;
  article: SharedArticle;
  createdAt: string;
  updatedAt: string;
};

export default function SharedArticlesView() {
  const { t } = useI18n();
  const [rows, setRows] = useState<SharedArticleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useMemo(() => {
    // Keep hook order stable in case future UI wants user context.
    return null;
  }, []);

  const token = localStorage.getItem("token");

  const fetchRows = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/shared/articles`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to fetch (${res.status})`);
      }
      setRows((await res.json()) as SharedArticleRow[]);
    } catch (e: any) {
      setError(e?.message || "Failed to load shared articles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="ui-card rounded-lg p-6">
        <div className="text-sm ui-text-muted">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Shared articles</h1>
          <p className="text-sm ui-text-muted">
            Read-only. Only the owner can edit or unshare.
          </p>
        </div>
        <button
          className="ui-btn-ghost px-3 py-2 rounded border ui-divider"
          onClick={fetchRows}
        >
          {t("common.refresh")}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="ui-card rounded-lg p-6">
          <p className="text-sm ui-text-muted">No shared articles.</p>
        </div>
      ) : (
        <div className="ui-card rounded-lg">
          <div className="divide-y">
            {rows.map((r) => {
              return (
                <div key={r.rowId} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {r.article.articleNom} — {r.article.articleModele}
                      </div>
                      <div className="text-xs ui-text-muted">
                        Owner: {r.owner.email}
                      </div>
                      {r.article.articleDescription && (
                        <div className="text-sm mt-2 ui-text-muted">
                          {r.article.articleDescription}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        className="ui-btn-ghost px-3 py-1.5 rounded border ui-divider"
                        disabled
                        title="Read-only"
                      >
                        Edit
                      </button>
                      <button
                        className="ui-btn-ghost px-3 py-1.5 rounded border ui-divider"
                        disabled
                        title="Only the owner can unshare (from their Articles view)"
                      >
                        Unshare
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
