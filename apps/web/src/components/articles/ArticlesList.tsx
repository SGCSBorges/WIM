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
  attachmentsAPI,
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
import { consumeSharedDraft } from "../../utils/shareTarget";

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

  // Defer to the server-side CSV export: it honours every list filter, returns
  // a full structured export (locations/tags/warranty columns), and isn't
  // capped to the current page like a client-side serializer would be.
  const exportToCsv = async () => {
    try {
      const qs = searchParams.toString();
      const blob = await articlesAPI.inventoryCsv(qs);
      downloadBlob(
        `wim-inventory-${new Date().toISOString().slice(0, 10)}.csv`,
        blob
      );
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    }
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
  // A create-mode draft prefilled from a PWA share-sheet payload.
  const [sharedDraft, setSharedDraft] = useState<Omit<
    Article,
    "articleId"
  > | null>(null);

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
  const createdFrom = searchParams.get("createdFrom") ?? "";
  const createdTo = searchParams.get("createdTo") ?? "";
  const sortParam = searchParams.get("sort") ?? "";
  const dirParam = searchParams.get("dir") ?? "";
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
    createdFrom ||
    createdTo ||
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
        createdFrom: createdFrom || undefined,
        createdTo: createdTo || undefined,
        sort:
          (sortParam as
            | "articleId"
            | "articleNom"
            | "purchasePrice"
            | "createdAt"
            | "") || undefined,
        dir: (dirParam as "asc" | "desc" | "") || undefined,
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
    createdFrom,
    createdTo,
    sortParam,
    dirParam,
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

  const bulkAssign = async (add: {
    addLocationIds?: number[];
    addTagIds?: number[];
  }) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const { count } = await articlesAPI.bulkAssign(ids, add);
      toast.show(
        t("articles.bulk.assignSuccess").replace("{count}", String(count)),
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

    // Edit path: optimistically patch the visible scalar fields so the row
    // updates instantly, then reconcile via refetch. Joined data (warranty,
    // tags, locations) is left untouched here and refreshed by fetchArticles.
    if (editingArticle) {
      const id = editingArticle.articleId;
      const previous = articles;
      setArticles((rows) =>
        rows.map((r) =>
          r.articleId === id
            ? {
                ...r,
                articleNom: articleData.articleNom,
                articleModele: articleData.articleModele,
                articleDescription: articleData.articleDescription ?? null,
                purchasePrice: articleData.purchasePrice ?? null,
              }
            : r
        )
      );
      setShowForm(false);
      setEditingArticle(null);
      try {
        await articlesAPI.update(id, articleData);
        await fetchArticles();
      } catch (err) {
        setArticles(previous);
        setError(getErrorMessage(err, t("common.errorOccurred")));
      }
      return;
    }

    try {
      await articlesAPI.create(articleData);
      await fetchArticles();
      setShowForm(false);
      setEditingArticle(null);
      setSharedDraft(null);
    } catch (err) {
      setError(getErrorMessage(err, t("common.errorOccurred")));
    }
  };

  // Optimistic delete with an undo window: hide the row immediately, and only
  // hit the server once the toast's grace period lapses. "Undo" cancels the
  // pending deletion and restores the row.
  const restoreArticle = (article: FetchedArticle) => {
    setArticles((prev) =>
      [...prev, article].sort((a, b) => b.articleId - a.articleId)
    );
    setTotal((t0) => t0 + 1);
  };

  const handleDelete = (article: FetchedArticle) => {
    setError(null);
    setArticles((prev) =>
      prev.filter((a) => a.articleId !== article.articleId)
    );
    setTotal((t0) => Math.max(0, t0 - 1));

    const timer = setTimeout(() => {
      articlesAPI.delete(article.articleId).catch((err) => {
        restoreArticle(article);
        toast.show(getErrorMessage(err, t("common.errorOccurred")), {
          kind: "error",
        });
      });
    }, 5000);

    toast.show(
      t("articles.delete.deleted").replace("{name}", article.articleNom),
      {
        ttl: 5000,
        action: {
          label: t("common.undo"),
          onClick: () => {
            clearTimeout(timer);
            restoreArticle(article);
          },
        },
      }
    );
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

  // Share-target landing: when arriving via the PWA share sheet (?shared=1),
  // pull the stashed payload, upload any shared photo, and open a prefilled
  // create form. Runs once; the param is stripped so a reload won't re-trigger.
  useEffect(() => {
    if (searchParams.get("shared") !== "1") return;
    let cancelled = false;
    (async () => {
      const draft = await consumeSharedDraft().catch(() => null);
      updateParams({ shared: undefined });
      if (cancelled || !draft) return;

      let productImageUrl: string | null = null;
      if (draft.photo) {
        try {
          const created = await attachmentsAPI.uploadFile(draft.photo, "OTHER");
          productImageUrl = created.fileUrl ?? null;
        } catch {
          // non-blocking: keep the rest of the prefill
        }
      }
      if (cancelled) return;

      const description = [draft.text, draft.url]
        .map((s) => (s ?? "").trim())
        .filter(Boolean)
        .join("\n");
      setSharedDraft({
        articleNom: (draft.title ?? "").trim(),
        articleModele: "",
        articleDescription: description || null,
        productImageUrl,
      });
      setEditingArticle(null);
      setShowForm(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
            aria-label={t("articles.search.placeholder")}
            className="ui-input px-3 py-2 rounded-md text-sm w-52"
          />

          <select
            value={locationFilterId ?? ""}
            onChange={(e) =>
              updateParams({ location: e.target.value || undefined })
            }
            aria-label={t("common.allLocations")}
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

          <input
            type="date"
            value={createdFrom}
            onChange={(e) => updateParams({ createdFrom: e.target.value })}
            className="ui-input px-3 py-2 rounded-md text-sm"
            aria-label={t("articles.filter.createdFrom")}
            title={t("articles.filter.createdFrom")}
          />
          <input
            type="date"
            value={createdTo}
            onChange={(e) => updateParams({ createdTo: e.target.value })}
            className="ui-input px-3 py-2 rounded-md text-sm"
            aria-label={t("articles.filter.createdTo")}
            title={t("articles.filter.createdTo")}
          />

          <select
            value={`${sortParam || "articleId"}:${dirParam || "desc"}`}
            onChange={(e) => {
              const [s, d] = e.target.value.split(":");
              updateParams({ sort: s, dir: d });
            }}
            aria-label={t("articles.filter.sort")}
            className="ui-select px-3 py-2 rounded-md text-sm"
          >
            <option value="articleId:desc">
              {t("articles.sort.newestFirst")}
            </option>
            <option value="articleId:asc">
              {t("articles.sort.oldestFirst")}
            </option>
            <option value="articleNom:asc">{t("articles.sort.nameAsc")}</option>
            <option value="articleNom:desc">
              {t("articles.sort.nameDesc")}
            </option>
            <option value="purchasePrice:desc">
              {t("articles.sort.priceDesc")}
            </option>
            <option value="purchasePrice:asc">
              {t("articles.sort.priceAsc")}
            </option>
            <option value="createdAt:desc">
              {t("articles.sort.createdDesc")}
            </option>
            <option value="createdAt:asc">
              {t("articles.sort.createdAsc")}
            </option>
          </select>

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
            onClick={async () => {
              try {
                downloadBlob(
                  "article-labels.pdf",
                  await articlesAPI.labelsPdf()
                );
              } catch (e) {
                toast.show(getErrorMessage(e, t("common.errorOccurred")), {
                  kind: "error",
                });
              }
            }}
            disabled={articles.length === 0}
            className="ui-btn-ghost px-4 py-2 rounded-md border ui-divider text-sm"
          >
            {t("articles.export.labels")}
          </button>

          <button
            onClick={() => setShowImport(true)}
            className="ui-btn-ghost px-4 py-2 rounded-md border ui-divider text-sm"
          >
            {t("articles.import.csv")}
          </button>

          <Link
            to="/articles/trash"
            className="ui-btn-ghost px-4 py-2 rounded-md border ui-divider text-sm"
          >
            {t("trash.link")}
          </Link>

          <button
            onClick={() => setShowForm(true)}
            className="ui-btn-primary px-4 py-2 rounded-md"
          >
            {t("articles.create")}
          </button>
        </div>
      </div>

      {/* Saved filter views */}
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label={t("savedViews.title")}
      >
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
        locations={locations}
        tags={tags}
        onClear={clearSelection}
        onDelete={() => setShowBulkDeleteConfirm(true)}
        onShare={() => bulkShare(true)}
        onUnshare={() => bulkShare(false)}
        onAssignLocation={(locationId) =>
          bulkAssign({ addLocationIds: [locationId] })
        }
        onAssignTag={(tagId) => bulkAssign({ addTagIds: [tagId] })}
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
          article={editingArticle || sharedDraft || undefined}
          onSubmit={handleSubmit}
          onCancel={() => {
            setShowForm(false);
            setEditingArticle(null);
            setSharedDraft(null);
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
          <>
            {/* Mobile: stacked-card layout (below sm:). The desktop table
                below is hidden at the same breakpoint. */}
            <ul
              className="sm:hidden divide-y ui-divider"
              aria-label={t("articles.title")}
            >
              <li className="p-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={t("articles.bulk.selectAll")}
                  checked={allPageSelected}
                  onChange={toggleSelectAll}
                />
                <span className="text-xs ui-text-muted">
                  {t("articles.bulk.selectAll")}
                </span>
              </li>
              {articles.map((article) => {
                const ws = getWarrantyStatus(article.garantie);
                const days = getDaysUntilExpiry(article.garantie?.garantieFin);
                const wsClass = {
                  gray: "ui-badge",
                  green: "ui-badge-success",
                  yellow: "ui-badge-warning",
                  red: "ui-badge-danger",
                }[ws.color as "gray" | "green" | "yellow" | "red"];
                return (
                  <li
                    key={`m-${article.articleId}`}
                    className="p-3 flex items-start gap-3"
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select ${article.articleNom}`}
                      checked={selectedIds.has(article.articleId)}
                      onChange={() => toggleSelected(article.articleId)}
                      className="mt-1"
                    />
                    <ArticleThumb
                      src={article.productImageUrl}
                      alt={article.articleNom}
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <Link
                        to={`/articles/${article.articleId}`}
                        className="block font-medium truncate ui-action-primary"
                      >
                        {article.articleNom}
                      </Link>
                      <p className="text-xs ui-text-muted truncate">
                        {article.articleModele}
                      </p>
                      <div className="flex flex-wrap items-center gap-1 text-xs">
                        <span className={`px-1.5 py-0.5 rounded ${wsClass}`}>
                          {ws.label}
                        </span>
                        {article.purchasePrice != null && (
                          <span className="ui-text-muted">
                            {formatMoney(
                              article.purchasePrice,
                              currency,
                              language
                            )}
                          </span>
                        )}
                        {days !== null && days >= 0 && days <= 30 && (
                          <span className="ui-text-warn">
                            {days} {t("articles.warranty.daysLeft")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-xs shrink-0">
                      <button
                        onClick={() => {
                          setEditingArticle(article);
                          setShowForm(true);
                        }}
                        className="ui-action-primary"
                      >
                        {t("common.edit")}
                      </button>
                      <button
                        onClick={() => handleDelete(article)}
                        className="ui-action-danger"
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Desktop: existing table (sm: and up). */}
            <div className="hidden sm:block overflow-x-auto">
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

                          <button
                            onClick={() => handleDelete(article)}
                            className="ui-action-danger"
                          >
                            {t("common.delete")}
                          </button>
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </>
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
