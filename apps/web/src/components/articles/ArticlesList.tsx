/**
 * Articles List Component
 * Display and manage articles
 */

import React, { useState, useEffect } from "react";
import ArticleForm from "./ArticleForm";
import ShareArticleButton from "./ShareArticleButton";
import { articlesAPI, locationsAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import type { Article, FetchedArticle, Location } from "../../types";
import { getErrorMessage } from "../../utils/error";

type ArticleShareStatus = {
  articleId: number;
  sharedWithPowerUsers: boolean;
  updatedAt: string;
} | null;

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

  const [articles, setArticles] = useState<FetchedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingArticle, setEditingArticle] = useState<FetchedArticle | null>(null);

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
      const mapped: Location[] = (data || []).map((l: { locationId: number; name: string }) => ({
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
    } catch (e: unknown) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
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
    } catch (e: unknown) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setShareBusyArticleId(null);
    }
  };

  const handleSubmit = async (articleData: Omit<Article, "articleId">) => {
    setError(null);
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
    setError(null);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("articles.title")}</h1>
          <p className="ui-text-muted">{t("articles.subtitle")}</p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={locationFilterId ?? ""}
            onChange={(e) =>
              setLocationFilterId(e.target.value ? Number(e.target.value) : undefined)
            }
            className="ui-select px-3 py-2 rounded-md"
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
            className="ui-btn-primary px-4 py-2 rounded-md"
          >
            {t("articles.create")}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="border ui-alert-error rounded-lg p-4">
          <div className="flex items-center">
            <span className="text-red-400 mr-2" aria-hidden="true">❌</span>
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

      <div className="ui-card rounded-lg shadow">
        {loading ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="ui-panel">
                <tr>
                  {[t("articles.table.name"), t("articles.table.model"), t("articles.table.description"), t("articles.table.warranty"), t("articles.table.proof"), t("articles.table.actions")].map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium ui-text-muted uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y ui-divider">
                {[1, 2, 3, 4].map((i) => (
                  <tr key={i}>
                    {[60, 40, 80, 24, 24, 48].map((w, j) => (
                      <td key={j} className="px-6 py-4">
                        <div className={`h-4 animate-pulse rounded ui-panel w-${w}`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : articles.length === 0 ? (
          <div className="p-8 text-center">
            <div className="ui-text-muted text-6xl mb-4">📦</div>
            <h3 className="text-lg font-semibold mb-2">
              {t("articles.none.title")}
            </h3>
            <p className="ui-text-muted mb-4">{t("articles.none.subtitle")}</p>
            <button
              onClick={() => setShowForm(true)}
              className="ui-btn-primary px-4 py-2 rounded-md"
            >
              {t("articles.create")}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="ui-panel">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium ui-text-muted uppercase tracking-wider">
                    {t("articles.table.name")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium ui-text-muted uppercase tracking-wider">
                    {t("articles.table.model")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium ui-text-muted uppercase tracking-wider">
                    {t("articles.table.description")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium ui-text-muted uppercase tracking-wider">
                    {t("articles.table.warranty")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium ui-text-muted uppercase tracking-wider">
                    {t("articles.table.proof")}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium ui-text-muted uppercase tracking-wider">
                    {t("articles.table.actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y ui-divider">
                {articles.map((article) => (
                  <React.Fragment key={article.articleId}>
                    <tr className="hover-surface">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {article.articleNom}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm ui-text-muted">
                        {article.articleModele}
                      </td>
                      <td className="px-6 py-4 text-sm ui-text-muted">
                        {article.articleDescription || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {(() => {
                          const ws = getWarrantyStatus(article.garantie);
                          const colorClasses = {
                            gray: "ui-badge",
                            green: "ui-badge-success",
                            yellow: "ui-badge-warning",
                            red: "ui-badge-danger",
                          };
                          return (
                            <span className={`px-2 py-1 rounded ${colorClasses[ws.color as keyof typeof colorClasses]}`}>
                              {ws.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {article.garantie?.garantieImageAttachmentId ? (
                          <span className="px-2 py-1 rounded ui-badge-success">
                            {t("common.yes")}
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded ui-badge">
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
                          className="ui-action-primary mr-3"
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
                              className="text-xs px-2 py-1 ui-btn-danger rounded"
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
                            className="ui-action-danger"
                          >
                            {t("common.delete")}
                          </button>
                        )}
                      </td>
                    </tr>

                    {openSharesArticleId === article.articleId && (
                      <tr className="ui-panel">
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
                                      className="text-xs px-2 py-1 ui-btn-danger rounded"
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
                                    className="ui-action-danger"
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
