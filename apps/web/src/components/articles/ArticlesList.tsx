/**
 * Articles List Component
 * Display and manage articles
 */

import React, { useState, useEffect } from "react";
import ArticleForm from "./ArticleForm";
import ShareArticleButton from "./ShareArticleButton";
import { articlesAPI, locationsAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";

type ArticleShareStatus = {
  articleId: number;
  sharedWithPowerUsers: boolean;
  updatedAt: string;
} | null;

interface Article {
  articleId: number;
  articleNom: string;
  articleModele: string;
  articleDescription?: string | null;
  productImageUrl?: string | null;
  sharedWithPowerUsers?: boolean;
  garantie?: {
    garantieId: number;
    garantieNom: string;
    garantieDateAchat?: string;
    garantieDuration?: number;
    garantieFin?: string;
    garantieIsValide?: boolean;
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

  const getWarrantyStatus = (garantie: Article["garantie"]) => {
    if (!garantie || !garantie.garantieFin) {
      return { status: "none", label: t("common.no"), color: "gray" };
    }

    const endDate = new Date(garantie.garantieFin);
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    if (endDate < now) {
      return { status: "expired", label: t("articles.warranty.expired"), color: "red" };
    } else if (endDate <= thirtyDaysFromNow) {
      return { status: "expiring-soon", label: t("articles.warranty.expiringSoon"), color: "yellow" };
    } else {
      return { status: "valid", label: t("articles.warranty.valid"), color: "green" };
    }
  };

  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);

  const [shareBusyArticleId, setShareBusyArticleId] = useState<number | null>(null);
  const [openSharesArticleId, setOpenSharesArticleId] = useState<number | null>(null);
  const [shareStatusByArticleId, setShareStatusByArticleId] = useState<Record<number, ArticleShareStatus>>({});
  const [sharesLoadingArticleId, setSharesLoadingArticleId] = useState<number | null>(null);
  const [confirmUnshareArticleId, setConfirmUnshareArticleId] = useState<number | null>(null);
  const [confirmDeleteArticleId, setConfirmDeleteArticleId] = useState<number | null>(null);

  const [locations, setLocations] = useState<Location[]>([]);
  const [locationFilterId, setLocationFilterId] = useState<number | undefined>(undefined);

  const fetchArticles = async () => {
    try {
      setLoading(true);
      const data = await articlesAPI.getAll(locationFilterId);
      setArticles(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.errorOccurred"));
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

  const loadShareStatus = async (articleId: number) => {
    setSharesLoadingArticleId(articleId);
    try {
      const data = await articlesAPI.getShares(articleId) as ArticleShareStatus;
      setShareStatusByArticleId((prev) => ({ ...prev, [articleId]: data }));
    } catch (e: any) {
      setError(e?.message || t("common.errorOccurred"));
    } finally {
      setSharesLoadingArticleId(null);
    }
  };

  const handleUnshareAll = async (articleId: number) => {
    setConfirmUnshareArticleId(null);
    setShareBusyArticleId(articleId);
    try {
      await articlesAPI.setSharedWithPowerUsers(articleId, false);
      await loadShareStatus(articleId);
    } catch (e: any) {
      setError(e?.message || t("common.errorOccurred"));
    } finally {
      setShareBusyArticleId(null);
    }
  };

  const handleSubmit = async (articleData: Omit<Article, "articleId">) => {
    try {
      if (editingArticle) {
        await articlesAPI.update(editingArticle.articleId, articleData);
      } else {
        await articlesAPI.create(articleData);
      }
      await fetchArticles();
      setShowForm(false);
      setEditingArticle(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.errorOccurred"));
    }
  };

  const handleDelete = async (articleId: number) => {
    setConfirmDeleteArticleId(null);
    try {
      await articlesAPI.delete(articleId);
      await fetchArticles();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.errorOccurred"));
    }
  };

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
          <h1 className="text-2xl font-bold text-gray-900">{t("articles.title")}</h1>
          <p className="text-gray-600">{t("articles.subtitle")}</p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={locationFilterId ?? ""}
            onChange={(e) =>
              setLocationFilterId(e.target.value ? Number(e.target.value) : undefined)
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
                        {(() => {
                          const ws = getWarrantyStatus(article.garantie);
                          const colorClasses = {
                            gray: "bg-gray-50 text-gray-600 border-gray-200",
                            green: "bg-green-50 text-green-700 border-green-200",
                            yellow: "bg-yellow-50 text-yellow-700 border-yellow-200",
                            red: "bg-red-50 text-red-700 border-red-200",
                          };
                          return (
                            <span className={`px-2 py-1 rounded border ${colorClasses[ws.color as keyof typeof colorClasses]}`}>
                              {ws.label}
                            </span>
                          );
                        })()}
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
                                loadShareStatus(article.articleId);
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
                              loadShareStatus(article.articleId);
                            }
                          }}
                          disabled={sharesLoadingArticleId === article.articleId}
                          className="ui-btn-ghost px-3 py-1.5 rounded border ui-divider mr-3"
                        >
                          {sharesLoadingArticleId === article.articleId
                            ? t("common.loading")
                            : openSharesArticleId === article.articleId
                              ? t("articles.shares.hideButton")
                              : t("articles.shares.button")}
                        </button>

                        {confirmDeleteArticleId === article.articleId ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="text-xs text-red-700">{t("articles.delete.confirm")}</span>
                            <button
                              onClick={() => handleDelete(article.articleId)}
                              className="text-xs px-2 py-1 bg-red-600 text-white rounded"
                            >
                              {t("common.yes")}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteArticleId(null)}
                              className="text-xs px-2 py-1 ui-btn-ghost border ui-divider rounded"
                            >
                              {t("common.no")}
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteArticleId(article.articleId)}
                            className="text-red-600 hover:text-red-900"
                          >
                            {t("common.delete")}
                          </button>
                        )}
                      </td>
                    </tr>

                    {openSharesArticleId === article.articleId && (
                      <tr className="bg-gray-50">
                        <td colSpan={6} className="px-6 py-4 text-sm">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="font-medium">{t("articles.shares.title")}</div>
                              <div className="text-xs ui-text-muted">
                                {t("articles.shares.description")}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="ui-btn-ghost px-3 py-1.5 rounded border ui-divider"
                              onClick={() => loadShareStatus(article.articleId)}
                              disabled={sharesLoadingArticleId === article.articleId}
                            >
                              {sharesLoadingArticleId === article.articleId
                                ? t("common.loading")
                                : t("common.refresh")}
                            </button>
                          </div>

                          <div className="mt-3 space-y-2">
                            {shareStatusByArticleId[article.articleId]?.sharedWithPowerUsers ? (
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-sm ui-text-muted">
                                  {t("articles.shares.sharedStatus")}
                                </div>
                                {confirmUnshareArticleId === article.articleId ? (
                                  <span className="inline-flex items-center gap-2">
                                    <span className="text-xs text-red-700">{t("articles.shares.unshareConfirm")}</span>
                                    <button
                                      type="button"
                                      className="text-xs px-2 py-1 bg-red-600 text-white rounded"
                                      disabled={shareBusyArticleId === article.articleId}
                                      onClick={() => handleUnshareAll(article.articleId)}
                                    >
                                      {t("common.yes")}
                                    </button>
                                    <button
                                      type="button"
                                      className="text-xs px-2 py-1 ui-btn-ghost border ui-divider rounded"
                                      onClick={() => setConfirmUnshareArticleId(null)}
                                    >
                                      {t("common.no")}
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className="text-red-600 hover:text-red-900"
                                    disabled={shareBusyArticleId === article.articleId}
                                    onClick={() => setConfirmUnshareArticleId(article.articleId)}
                                  >
                                    {shareBusyArticleId === article.articleId
                                      ? t("common.loading")
                                      : t("articles.shares.unshareButton")}
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="text-sm ui-text-muted">
                                {t("articles.shares.notSharedStatus")}
                              </div>
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
