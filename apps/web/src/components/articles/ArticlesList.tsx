/**
 * Articles List Component
 * Display and manage articles
 */

import React, { useState, useEffect, useCallback } from "react";
import ArticleForm from "./ArticleForm";
import ShareArticleButton from "./ShareArticleButton";
import { articlesAPI, locationsAPI, authAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import type { Article, FetchedArticle, Location } from "../../types";
import { getErrorMessage } from "../../utils/error";
import ArticleThumb from "./ArticleThumb";
import { ErrorBanner } from "../common/States";
import BulkActionBar from "./BulkActionBar";
import { useToast } from "../common/Toast";

const ArticlesList: React.FC = () => {
  const { t } = useI18n();
  const toast = useToast();
  const role = authAPI.getRole();
  const isPowerUser = role === "POWER_USER" || role === "ADMIN";

  const getDaysUntilExpiry = (
    garantieFin: string | Date | null | undefined
  ) => {
    if (!garantieFin) return null;
    const end = new Date(garantieFin);
    const now = new Date();
    return Math.floor((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  const exportToCsv = () => {
    const headers = [
      t("articles.table.name"),
      t("articles.table.model"),
      t("articles.table.description"),
      t("articles.table.warranty"),
      t("articles.table.expiresIn"),
    ];
    const rows = articles.map((a) => {
      const ws = getWarrantyStatus(a.garantie);
      const days = getDaysUntilExpiry(a.garantie?.garantieFin);
      return [
        a.articleNom,
        a.articleModele,
        a.articleDescription ?? "",
        ws.label,
        days !== null ? `${days} ${t("articles.warranty.daysLeft")}` : "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
    });
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "articles.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const getWarrantyStatus = (garantie: Article["garantie"]) => {
    if (!garantie || !garantie.garantieFin) {
      return { status: "none", label: t("common.no"), color: "gray" };
    }

    const endDate = new Date(garantie.garantieFin);
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    if (endDate < now) {
      return {
        status: "expired",
        label: t("articles.warranty.expired"),
        color: "red",
      };
    } else if (endDate <= thirtyDaysFromNow) {
      return {
        status: "expiring-soon",
        label: t("articles.warranty.expiringSoon"),
        color: "yellow",
      };
    } else {
      return {
        status: "valid",
        label: t("articles.warranty.valid"),
        color: "green",
      };
    }
  };

  const [articles, setArticles] = useState<FetchedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingArticle, setEditingArticle] = useState<FetchedArticle | null>(
    null
  );

  const [confirmDeleteArticleId, setConfirmDeleteArticleId] = useState<
    number | null
  >(null);

  const [searchQuery, setSearchQuery] = useState("");

  const [locations, setLocations] = useState<Location[]>([]);
  const [locationFilterId, setLocationFilterId] = useState<number | undefined>(
    undefined
  );

  // Bulk selection: ids of articles currently checked. Cleared on refetch
  // so the bar doesn't keep references to articles that just left the page.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const filteredArticles = searchQuery.trim()
    ? articles.filter((a) => {
        const q = searchQuery.trim().toLowerCase();
        return (
          a.articleNom.toLowerCase().includes(q) ||
          (a.articleModele ?? "").toLowerCase().includes(q)
        );
      })
    : articles;

  const fetchArticles = useCallback(async () => {
    try {
      setLoading(true);
      const data = await articlesAPI.getAll(locationFilterId);
      setArticles(data);
      setError(null);
      // Drop any selections whose article no longer appears in the list
      // (filter changed, item was deleted/moved). Avoids the BulkActionBar
      // counting articles that aren't visible anymore.
      setSelectedIds((prev) => {
        if (prev.size === 0) return prev;
        const visible = new Set(data.map((a) => a.articleId));
        const next = new Set<number>();
        prev.forEach((id) => {
          if (visible.has(id)) next.add(id);
        });
        return next.size === prev.size ? prev : next;
      });
    } catch (err) {
      setError(getErrorMessage(err, t("common.errorOccurred")));
    } finally {
      setLoading(false);
    }
  }, [locationFilterId, t]);

  const toggleSelected = (articleId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(articleId)) next.delete(articleId);
      else next.add(articleId);
      return next;
    });
  };

  const allPageSelected =
    filteredArticles.length > 0 &&
    filteredArticles.every((a) => selectedIds.has(a.articleId));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (allPageSelected) {
        const next = new Set(prev);
        filteredArticles.forEach((a) => next.delete(a.articleId));
        return next;
      }
      const next = new Set(prev);
      filteredArticles.forEach((a) => next.add(a.articleId));
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const bulkDelete = async () => {
    setShowBulkDeleteConfirm(false);
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const { count } = await articlesAPI.bulkDelete(ids);
      toast.show(
        t("articles.bulk.deleteSuccess").replace("{count}", String(count)),
        { kind: "success" }
      );
      clearSelection();
      await fetchArticles();
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkShare = async (shared: boolean) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const { count } = await articlesAPI.bulkSetSharedWithPowerUsers(
        ids,
        shared
      );
      toast.show(
        t("articles.bulk.shareSuccess").replace("{count}", String(count)),
        { kind: "success" }
      );
      await fetchArticles();
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const fetchLocations = async () => {
    try {
      const data = await locationsAPI.getAll();
      const mapped: Location[] = (data || []).map(
        (l: { locationId: number; name: string }) => ({
          locationId: l.locationId,
          name: l.name,
        })
      );
      setLocations(mapped);
    } catch {
      // non-blocking
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
      setError(getErrorMessage(err, t("common.errorOccurred")));
    }
  };

  const handleDelete = async (articleId: number) => {
    setConfirmDeleteArticleId(null);
    setError(null);
    try {
      await articlesAPI.delete(articleId);
      await fetchArticles();
    } catch (err) {
      setError(getErrorMessage(err, t("common.errorOccurred")));
    }
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("articles.title")}</h1>
          <p className="ui-text-muted">{t("articles.subtitle")}</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("articles.search.placeholder")}
            className="ui-input px-3 py-2 rounded-md text-sm w-52"
          />

          <select
            value={locationFilterId ?? ""}
            onChange={(e) =>
              setLocationFilterId(
                e.target.value ? Number(e.target.value) : undefined
              )
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
            onClick={exportToCsv}
            disabled={articles.length === 0}
            className="ui-btn-ghost px-4 py-2 rounded-md border ui-divider text-sm"
          >
            {t("articles.export.csv")}
          </button>

          <button
            onClick={() => setShowForm(true)}
            className="ui-btn-primary px-4 py-2 rounded-md"
          >
            {t("articles.create")}
          </button>
        </div>
      </div>

      {error && (
        <ErrorBanner
          message={error}
          onRetry={fetchArticles}
          retryLabel={t("common.retry")}
        />
      )}

      <BulkActionBar
        selectedCount={selectedIds.size}
        canShare={isPowerUser}
        busy={bulkBusy}
        onClear={clearSelection}
        onDelete={() => setShowBulkDeleteConfirm(true)}
        onShare={() => bulkShare(true)}
        onUnshare={() => bulkShare(false)}
      />

      {showBulkDeleteConfirm && (
        <div className="border ui-alert-error rounded-lg p-4 flex flex-wrap items-center gap-3">
          <p className="text-sm ui-text-error flex-1">
            {t("articles.bulk.deleteConfirm").replace(
              "{count}",
              String(selectedIds.size)
            )}
          </p>
          <button
            type="button"
            onClick={bulkDelete}
            disabled={bulkBusy}
            className="text-sm px-3 py-1.5 ui-btn-danger rounded-md"
          >
            {t("common.yes")}
          </button>
          <button
            type="button"
            onClick={() => setShowBulkDeleteConfirm(false)}
            disabled={bulkBusy}
            className="text-sm px-3 py-1.5 ui-btn-ghost border ui-divider rounded-md"
          >
            {t("common.no")}
          </button>
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
                  <th className="px-3 py-3 w-10" aria-hidden="true">
                    <input
                      type="checkbox"
                      disabled
                      aria-hidden="true"
                      tabIndex={-1}
                    />
                  </th>
                  {[
                    t("articles.table.image"),
                    t("articles.table.name"),
                    t("articles.table.model"),
                    t("articles.table.description"),
                    t("articles.table.warranty"),
                    t("articles.table.expiresIn"),
                    t("articles.table.proof"),
                    t("articles.table.shared"),
                    t("articles.table.actions"),
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-6 py-3 text-left text-xs font-medium ui-text-muted uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y ui-divider">
                {[1, 2, 3, 4].map((i) => (
                  <tr key={i}>
                    <td className="px-3 py-4 w-10">
                      <div className="h-4 w-4 animate-pulse rounded ui-panel" />
                    </td>
                    {[12, 60, 40, 80, 24, 20, 24, 16, 48].map((w, j) => (
                      <td key={j} className="px-6 py-4">
                        <div
                          className={`h-4 animate-pulse rounded ui-panel w-${w}`}
                        />
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
        ) : filteredArticles.length === 0 ? (
          <div className="p-8 text-center">
            <p className="ui-text-muted">
              {t("articles.search.noResults").replace(
                "{query}",
                searchQuery.trim()
              )}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="ui-panel">
                <tr>
                  <th className="px-3 py-3 w-10">
                    <input
                      type="checkbox"
                      aria-label={t("articles.bulk.selectAll")}
                      checked={allPageSelected}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium ui-text-muted uppercase tracking-wider">
                    {t("articles.table.image")}
                  </th>
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
                    {t("articles.table.expiresIn")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium ui-text-muted uppercase tracking-wider">
                    {t("articles.table.proof")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium ui-text-muted uppercase tracking-wider">
                    {t("articles.table.shared")}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium ui-text-muted uppercase tracking-wider">
                    {t("articles.table.actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y ui-divider">
                {filteredArticles.map((article) => (
                  <React.Fragment key={article.articleId}>
                    <tr className="hover-surface">
                      <td className="px-3 py-4">
                        <input
                          type="checkbox"
                          aria-label={`Select ${article.articleNom}`}
                          checked={selectedIds.has(article.articleId)}
                          onChange={() => toggleSelected(article.articleId)}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <ArticleThumb
                          src={article.productImageUrl}
                          alt={article.articleNom}
                        />
                      </td>
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
                            <span
                              className={`px-2 py-1 rounded ${colorClasses[ws.color as keyof typeof colorClasses]}`}
                            >
                              {ws.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {(() => {
                          if (!article.garantie?.garantieFin)
                            return <span className="ui-text-muted">—</span>;
                          const days = getDaysUntilExpiry(
                            article.garantie.garantieFin
                          );
                          if (days === null)
                            return <span className="ui-text-muted">—</span>;
                          if (days < 0)
                            return (
                              <span className="ui-text-error font-medium">
                                {t("articles.warranty.expired")}
                              </span>
                            );
                          return (
                            <span
                              className={
                                days <= 30
                                  ? "ui-text-warn font-medium"
                                  : "ui-text-muted"
                              }
                            >
                              {days} {t("articles.warranty.daysLeft")}
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {article.sharedWithPowerUsers ? (
                          <span
                            className="px-2 py-1 rounded ui-badge-info"
                            title={t("articles.share.state.publicTooltip")}
                          >
                            🌐 {t("articles.share.state.publicLabel")}
                          </span>
                        ) : (
                          <span className="ui-text-muted">—</span>
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
                            sharedWithPowerUsers={Boolean(
                              article.sharedWithPowerUsers
                            )}
                            isPowerUser={isPowerUser}
                            onChanged={fetchArticles}
                          />
                        </span>

                        {confirmDeleteArticleId === article.articleId ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="text-xs ui-text-error">
                              {t("articles.delete.confirm")}
                            </span>
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
                            onClick={() =>
                              setConfirmDeleteArticleId(article.articleId)
                            }
                            className="ui-action-danger"
                          >
                            {t("common.delete")}
                          </button>
                        )}
                      </td>
                    </tr>
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
