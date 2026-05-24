/**
 * Articles List Component
 * Display and manage articles
 */

import React, { useState, useEffect, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ArticleForm from "./ArticleForm";
import ShareArticleButton from "./ShareArticleButton";
import {
  articlesAPI,
  locationsAPI,
  authAPI,
  profileAPI,
  tagsAPI,
  savedViewsAPI,
  type SavedView,
} from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import type { Article, FetchedArticle, Location, Tag } from "../../types";
import { getErrorMessage } from "../../utils/error";
import { formatMoney } from "../../utils/money";
import { downloadBlob } from "../../utils/csv";
import ArticleThumb from "./ArticleThumb";
import { ErrorBanner } from "../common/States";
import BulkActionBar from "./BulkActionBar";
import CsvImportModal from "./CsvImportModal";
import { useToast } from "../common/Toast";

const ArticlesList: React.FC = () => {
  const { t, language } = useI18n();
  const toast = useToast();
  const role = authAPI.getRole();
  const isPowerUser = role === "POWER_USER" || role === "ADMIN";
  const [currency, setCurrency] = useState("USD");

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
      t("articles.table.value"),
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
        a.purchasePrice != null ? String(a.purchasePrice) : "",
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

  const [locations, setLocations] = useState<Location[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [total, setTotal] = useState(0);

  // All filter/search/pagination state lives in the URL so a filtered view is
  // shareable and survives reload. The search box keeps a local mirror so it
  // can debounce before writing back to the URL.
  const [searchParams, setSearchParams] = useSearchParams();
  const qParam = searchParams.get("q") ?? "";
  const warrantyStatus = searchParams.get("warranty") ?? "";
  const priceMin = searchParams.get("priceMin") ?? "";
  const priceMax = searchParams.get("priceMax") ?? "";
  const locationFilterId = searchParams.get("location")
    ? Number(searchParams.get("location"))
    : undefined;
  const tagFilterId = searchParams.get("tag")
    ? Number(searchParams.get("tag"))
    : undefined;
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const LIMIT = 50;
  const hasActiveFilters = Boolean(
    qParam ||
    warrantyStatus ||
    priceMin ||
    priceMax ||
    locationFilterId ||
    tagFilterId
  );

  const [searchInput, setSearchInput] = useState(qParam);

  const updateParams = useCallback(
    (patch: Record<string, string | undefined>, resetPage = true) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v == null || v === "") next.delete(k);
            else next.set(k, v);
          }
          if (resetPage) next.delete("page");
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // Debounce the search box into the URL `q` param.
  useEffect(() => {
    if (searchInput === qParam) return;
    const id = setTimeout(() => updateParams({ q: searchInput }), 350);
    return () => clearTimeout(id);
  }, [searchInput, qParam, updateParams]);

  // Bulk selection: ids of articles currently checked. Cleared on refetch
  // so the bar doesn't keep references to articles that just left the page.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const fetchArticles = useCallback(async () => {
    try {
      setLoading(true);
      const { items, total: t0 } = await articlesAPI.getAll({
        locationId: locationFilterId,
        tagId: tagFilterId,
        q: qParam || undefined,
        warrantyStatus:
          (warrantyStatus as
            | "valid"
            | "expiringSoon"
            | "expired"
            | "none"
            | "") || undefined,
        priceMin: priceMin ? Number(priceMin) : undefined,
        priceMax: priceMax ? Number(priceMax) : undefined,
        page,
        limit: LIMIT,
      });
      setArticles(items);
      setTotal(t0);
      setError(null);
      // Drop selections that left the page after a filter/page change.
      setSelectedIds((prev) => {
        if (prev.size === 0) return prev;
        const visible = new Set(items.map((a) => a.articleId));
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
  }, [
    locationFilterId,
    tagFilterId,
    qParam,
    warrantyStatus,
    priceMin,
    priceMax,
    page,
    t,
  ]);

  const toggleSelected = (articleId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(articleId)) next.delete(articleId);
      else next.add(articleId);
      return next;
    });
  };

  const allPageSelected =
    articles.length > 0 && articles.every((a) => selectedIds.has(a.articleId));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (allPageSelected) {
        const next = new Set(prev);
        articles.forEach((a) => next.delete(a.articleId));
        return next;
      }
      const next = new Set(prev);
      articles.forEach((a) => next.add(a.articleId));
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

  const loadSavedViews = () =>
    savedViewsAPI
      .list()
      .then(setSavedViews)
      .catch(() => {});

  useEffect(() => {
    fetchLocations();
    tagsAPI
      .getAll()
      .then((data) =>
        setTags(data.map((tg) => ({ tagId: tg.tagId, name: tg.name })))
      )
      .catch(() => {});
    loadSavedViews();
    // Load the user's display currency for the value column (best-effort).
    profileAPI
      .getMe()
      .then((me) => {
        if (me.currency) setCurrency(me.currency);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  const saveCurrentView = async () => {
    const name = window.prompt(t("savedViews.namePrompt"))?.trim();
    if (!name) return;
    try {
      await savedViewsAPI.create(name, searchParams.toString());
      await loadSavedViews();
      toast.show(t("savedViews.saved"), { kind: "success" });
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    }
  };

  const deleteView = async (id: number) => {
    try {
      await savedViewsAPI.remove(id);
      setSavedViews((prev) => prev.filter((v) => v.id !== id));
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    }
  };

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
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("articles.search.placeholder")}
            className="ui-input px-3 py-2 rounded-md text-sm w-52"
          />

          <select
            value={locationFilterId ?? ""}
            onChange={(e) =>
              updateParams({ location: e.target.value || undefined })
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

          {tags.length > 0 && (
            <select
              value={tagFilterId ?? ""}
              onChange={(e) =>
                updateParams({ tag: e.target.value || undefined })
              }
              className="ui-select px-3 py-2 rounded-md"
              aria-label={t("articles.filter.tag")}
            >
              <option value="">{t("articles.filter.allTags")}</option>
              {tags.map((tg) => (
                <option key={tg.tagId} value={tg.tagId}>
                  {tg.name}
                </option>
              ))}
            </select>
          )}

          <select
            value={warrantyStatus}
            onChange={(e) =>
              updateParams({ warranty: e.target.value || undefined })
            }
            className="ui-select px-3 py-2 rounded-md"
            aria-label={t("articles.filter.warranty")}
          >
            <option value="">{t("articles.filter.allWarranties")}</option>
            <option value="valid">{t("articles.filter.warrantyValid")}</option>
            <option value="expiringSoon">
              {t("articles.filter.warrantyExpiringSoon")}
            </option>
            <option value="expired">
              {t("articles.filter.warrantyExpired")}
            </option>
            <option value="none">{t("articles.filter.warrantyNone")}</option>
          </select>

          <input
            type="number"
            min="0"
            value={priceMin}
            onChange={(e) => updateParams({ priceMin: e.target.value })}
            placeholder={t("articles.filter.priceMin")}
            className="ui-input px-3 py-2 rounded-md text-sm w-24"
            aria-label={t("articles.filter.priceMin")}
          />
          <input
            type="number"
            min="0"
            value={priceMax}
            onChange={(e) => updateParams({ priceMax: e.target.value })}
            placeholder={t("articles.filter.priceMax")}
            className="ui-input px-3 py-2 rounded-md text-sm w-24"
            aria-label={t("articles.filter.priceMax")}
          />

          <button
            onClick={exportToCsv}
            disabled={articles.length === 0}
            className="ui-btn-ghost px-4 py-2 rounded-md border ui-divider text-sm"
          >
            {t("articles.export.csv")}
          </button>

          <button
            onClick={async () => {
              try {
                downloadBlob(
                  "inventory-manifest.pdf",
                  await articlesAPI.inventoryPdf()
                );
              } catch (e) {
                toast.show(getErrorMessage(e, t("common.errorOccurred")), {
                  kind: "error",
                });
              }
            }}
            className="ui-btn-ghost px-4 py-2 rounded-md border ui-divider text-sm"
          >
            {t("articles.export.pdf")}
          </button>

          <button
            onClick={() => setShowImport(true)}
            className="ui-btn-ghost px-4 py-2 rounded-md border ui-divider text-sm"
          >
            {t("articles.import.csv")}
          </button>

          <button
            onClick={() => setShowForm(true)}
            className="ui-btn-primary px-4 py-2 rounded-md"
          >
            {t("articles.create")}
          </button>
        </div>
      </div>

      {/* Saved filter views */}
      <div className="flex flex-wrap items-center gap-2">
        {savedViews.map((v) => (
          <span
            key={v.id}
            className="inline-flex items-center gap-1 ui-badge px-2 py-1 rounded-full text-xs"
          >
            <button
              type="button"
              onClick={() =>
                setSearchParams(new URLSearchParams(v.query), {
                  replace: true,
                })
              }
              className="hover:underline"
            >
              {v.name}
            </button>
            <button
              type="button"
              onClick={() => deleteView(v.id)}
              aria-label={t("savedViews.delete")}
              className="ui-action-danger leading-none"
            >
              ✕
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={saveCurrentView}
          className="text-xs ui-btn-ghost border ui-divider rounded-full px-2 py-1"
        >
          + {t("savedViews.save")}
        </button>
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
                    t("articles.table.value"),
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
                    {[12, 60, 40, 80, 20, 24, 20, 24, 16, 48].map((w, j) => (
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
        ) : articles.length === 0 && hasActiveFilters ? (
          <div className="p-8 text-center">
            <p className="ui-text-muted">
              {t("articles.search.noResults").replace("{query}", qParam.trim())}
            </p>
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
                    {t("articles.table.value")}
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
                {articles.map((article) => (
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
                      <td className="px-6 py-4 text-sm font-medium">
                        <Link
                          to={`/articles/${article.articleId}`}
                          className="ui-action-primary hover:underline"
                        >
                          {article.articleNom}
                        </Link>
                        {article.tags && article.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {article.tags.map((at) => (
                              <span
                                key={at.tagId}
                                className="px-1.5 py-0.5 text-[10px] rounded-full ui-badge-info"
                              >
                                {at.tag?.name ?? `#${at.tagId}`}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm ui-text-muted">
                        {article.articleModele}
                      </td>
                      <td className="px-6 py-4 text-sm ui-text-muted">
                        {article.articleDescription || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm ui-text-muted">
                        {article.purchasePrice != null
                          ? formatMoney(
                              article.purchasePrice,
                              currency,
                              language
                            )
                          : "—"}
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

        {!loading && total > 0 && (
          <div className="p-4 border-t ui-divider flex items-center justify-between gap-3 text-sm">
            <span className="ui-text-muted">
              {t("articles.results.count").replace("{total}", String(total))}
            </span>
            {total > LIMIT && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    updateParams({ page: String(page - 1) }, false)
                  }
                  disabled={page <= 1}
                  className="ui-btn-ghost border ui-divider rounded px-3 py-1 disabled:opacity-50"
                >
                  {t("common.prev")}
                </button>
                <span className="ui-text-muted">
                  {page} / {Math.max(1, Math.ceil(total / LIMIT))}
                </span>
                <button
                  onClick={() =>
                    updateParams({ page: String(page + 1) }, false)
                  }
                  disabled={page >= Math.ceil(total / LIMIT)}
                  className="ui-btn-ghost border ui-divider rounded px-3 py-1 disabled:opacity-50"
                >
                  {t("common.next")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <CsvImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={fetchArticles}
      />
    </div>
  );
};

export default ArticlesList;
