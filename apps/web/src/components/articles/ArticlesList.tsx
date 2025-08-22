/**
 * Articles List Component
 * Display and manage articles
 */

import React, { useState, useEffect } from "react";
import ArticleForm from "./ArticleForm";
import ShareArticleButton from "./ShareArticleButton";
import { API_BASE_URL, articlesAPI, locationsAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";

type ArticleShareInfo = {
  articleShareId: number;
  targetUserId: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  target: { userId: number; email: string; role: string };
};

interface Article {
  articleId: number;
  articleNom: string;
  articleModele: string;
  articleDescription?: string | null;
  productImageUrl?: string | null;
  garantie?: {
    garantieId: number;
    garantieNom: string;
    garantieDateAchat?: string;
    garantieDuration?: number;
    garantieImageAttachmentId?: number | null;
  } | null;
  locations?: Array<{
    locationId: number;
    location?: { name: string };
  }>;
}

interface Location {
  locationId: number;
  name: string;
}

const ArticlesList: React.FC = () => {
  const { t } = useI18n();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);

  const [shareBusyArticleId, setShareBusyArticleId] = useState<number | null>(
    null,
  );

  const [openSharesArticleId, setOpenSharesArticleId] = useState<number | null>(
    null,
  );
  const [sharesByArticleId, setSharesByArticleId] = useState<
    Record<number, ArticleShareInfo[]>
  >({});
  const [sharesLoadingArticleId, setSharesLoadingArticleId] = useState<
    number | null
  >(null);

  const [locations, setLocations] = useState<Location[]>([]);
  const [locationFilterId, setLocationFilterId] = useState<number | undefined>(
    undefined,
  );

  // Fetch articles from API
  const fetchArticles = async () => {
    try {
      setLoading(true);
      const data = await articlesAPI.getAll(locationFilterId);
      setArticles(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.errorOccurred"));
      console.error("Error fetching articles:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLocations = async () => {
    try {
      const data = await locationsAPI.getAll();
      const mapped: Location[] = (data || []).map((l: any) => ({
        locationId: l.locationId,
        name: l.name,
      }));
      setLocations(mapped);
    } catch {
      // non-blocking
    }
  };

  const loadShares = async (articleId: number) => {
    const token = localStorage.getItem("token");
    setSharesLoadingArticleId(articleId);
    try {
      const res = await fetch(`${API_BASE_URL}/articles/${articleId}/shares`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
        },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to load shares (${res.status})`);
      }

      const data = (await res.json()) as ArticleShareInfo[];
      setSharesByArticleId((prev) => ({ ...prev, [articleId]: data }));
    } catch (e: any) {
      alert(e?.message || "Failed to load shares");
    } finally {
      setSharesLoadingArticleId(null);
    }
  };

  const handleUnshare = async (articleId: number, targetUserId: number) => {
    if (!confirm("Unshare this article from that user?")) {
      return;
    }

    const token = localStorage.getItem("token");
    setShareBusyArticleId(articleId);
    try {
      const res = await fetch(
        `${API_BASE_URL}/articles/${articleId}/share/${targetUserId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: token ? `Bearer ${token}` : "",
          },
        },
      );

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Unshare failed (${res.status})`);
      }

      await loadShares(articleId);
    } catch (e: any) {
      alert(e?.message || "Unshare failed");
    } finally {
      setShareBusyArticleId(null);
    }
  };

  // Create or update article
  const handleSubmit = async (articleData: Omit<Article, "articleId">) => {
    try {
      if (editingArticle) {
        await articlesAPI.update(editingArticle.articleId, articleData);
      } else {
        await articlesAPI.create(articleData);
      }

      // Refresh articles list
      await fetchArticles();

      // Reset form
      setShowForm(false);
      setEditingArticle(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.errorOccurred"));
      console.error("Error submitting article:", err);
    }
  };

  // Delete article
  const handleDelete = async (articleId: number) => {
    if (!confirm(t("articles.delete.confirm"))) {
      return;
    }

    try {
      await articlesAPI.delete(articleId);
      // Refresh articles list
      await fetchArticles();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.errorOccurred"));
      console.error("Error deleting article:", err);
    }
  };

  // Load articles on component mount
  useEffect(() => {
    fetchLocations();
  }, []);

  useEffect(() => {
    fetchArticles();
  }, [locationFilterId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t("articles.title")}
          </h1>
          <p className="text-gray-600">{t("articles.subtitle")}</p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={locationFilterId ?? ""}
            onChange={(e) =>
              setLocationFilterId(
                e.target.value ? Number(e.target.value) : undefined,
              )
            }
            className="px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="">{t("common.allLocations")}</option>
            {locations.map((l) => (
              <option key={l.locationId} value={l.locationId}>
                {l.name}
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            {t("articles.create")}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <span className="text-red-400 mr-2">❌</span>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {showForm && (
        <ArticleForm
          article={editingArticle || undefined}
          onSubmit={handleSubmit}
          onCancel={() => {
            setShowForm(false);
            setEditingArticle(null);
          }}
        />
      )}

      <div className="bg-white rounded-lg shadow">
        {articles.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-gray-400 text-6xl mb-4">📦</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {t("articles.none.title")}
            </h3>
            <p className="text-gray-600 mb-4">{t("articles.none.subtitle")}</p>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              {t("articles.create")}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("articles.table.name")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("articles.table.model")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("articles.table.description")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("articles.table.warranty")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("articles.table.proof")}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t("articles.table.actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {articles.map((article) => (
                  <React.Fragment key={article.articleId}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {article.articleNom}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {article.articleModele}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {article.articleDescription || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {article.garantie ? (
                          <span className="px-2 py-1 rounded bg-green-50 text-green-700 border border-green-200">
                            {t("common.yes")}
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded bg-gray-50 text-gray-600 border border-gray-200">
                            {t("common.no")}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {article.garantie?.garantieImageAttachmentId ? (
                          <span className="px-2 py-1 rounded bg-green-50 text-green-700 border border-green-200">
                            {t("common.yes")}
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded bg-gray-50 text-gray-600 border border-gray-200">
                            {t("common.no")}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => {
                            setEditingArticle(article);
                            setShowForm(true);
                          }}
                          className="text-blue-600 hover:text-blue-900 mr-3"
                        >
                          {t("common.edit")}
                        </button>

                        <span className="inline-block mr-3 align-middle">
                          <ShareArticleButton
                            articleId={article.articleId}
                            onShared={() => {
                              if (openSharesArticleId === article.articleId) {
                                loadShares(article.articleId);
                              }
                            }}
                          />
                        </span>

                        <button
                          type="button"
                          onClick={() => {
                            const next =
                              openSharesArticleId === article.articleId
                                ? null
                                : article.articleId;
                            setOpenSharesArticleId(next);
                            if (next != null) {
                              loadShares(article.articleId);
                            }
                          }}
                          disabled={
                            sharesLoadingArticleId === article.articleId
                          }
                          className="ui-btn-ghost px-3 py-1.5 rounded border ui-divider mr-3"
                          title="Manage shares (owner-only)"
                        >
                          {sharesLoadingArticleId === article.articleId
                            ? t("common.loading")
                            : openSharesArticleId === article.articleId
                              ? "Hide shares"
                              : "Shares"}
                        </button>

                        <button
                          onClick={() => handleDelete(article.articleId)}
                          className="text-red-600 hover:text-red-900"
                        >
                          {t("common.delete")}
                        </button>
                      </td>
                    </tr>

                    {openSharesArticleId === article.articleId && (
                      <tr className="bg-gray-50">
                        <td colSpan={6} className="px-6 py-4 text-sm">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="font-medium">Shared with</div>
                              <div className="text-xs ui-text-muted">
                                Owner-only. Unsharing removes access
                                immediately.
                              </div>
                            </div>
                            <button
                              type="button"
                              className="ui-btn-ghost px-3 py-1.5 rounded border ui-divider"
                              onClick={() => loadShares(article.articleId)}
                              disabled={
                                sharesLoadingArticleId === article.articleId
                              }
                            >
                              {sharesLoadingArticleId === article.articleId
                                ? t("common.loading")
                                : t("common.refresh")}
                            </button>
                          </div>

                          <div className="mt-3 space-y-2">
                            {(sharesByArticleId[article.articleId] || [])
                              .length === 0 ? (
                              <div className="text-sm ui-text-muted">
                                No active shares.
                              </div>
                            ) : (
                              (sharesByArticleId[article.articleId] || []).map(
                                (s) => (
                                  <div
                                    key={s.articleShareId}
                                    className="flex items-center justify-between gap-3"
                                  >
                                    <div className="min-w-0">
                                      <div className="truncate">
                                        {s.target?.email ||
                                          `User #${s.targetUserId}`}
                                      </div>
                                      <div className="text-xs ui-text-muted">
                                        userId: {s.targetUserId}
                                        {s.target?.role
                                          ? ` • ${s.target.role}`
                                          : ""}
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      className="text-red-600 hover:text-red-900"
                                      disabled={
                                        shareBusyArticleId === article.articleId
                                      }
                                      onClick={() =>
                                        handleUnshare(
                                          article.articleId,
                                          s.targetUserId,
                                        )
                                      }
                                    >
                                      {shareBusyArticleId === article.articleId
                                        ? t("common.loading")
                                        : "Unshare"}
                                    </button>
                                  </div>
                                ),
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ArticlesList;
