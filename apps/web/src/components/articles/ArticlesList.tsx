/**
 * Articles list — the main inventory surface. Three concerns layered in
 * one component:
 *
 *   • Filter + pagination + sort state lives in the URL search params
 *     (`useSearchParams`) so any view is bookmarkable and survives reload.
 *     `searchInput` is a local debounced mirror for the search box.
 *   • Bulk selection is a `Set<number>` of articleIds with a sticky
 *     `BulkActionBar` footer. Selection is dropped per-fetch so it can't
 *     point at rows that left the page.
 *   • The single-row delete is optimistically hidden, then DELETE'd after
 *     a 5s window so an Undo toast can roll back without an API round-trip.
 *
 * Refactor candidate (large file, ~1.3k lines): the filter panel + table
 * and mobile card list could be extracted into sub-components. The state
 * is already URL-driven so a split would be mechanical.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Package,
  Plus,
  Search,
  FileDown,
  FileText,
  Upload,
  Tag as TagIcon,
  Trash2,
  X,
  Lock,
  Check,
} from "lucide-react";
import ArticleForm from "./ArticleForm";
import ArticlesFilterBar from "./ArticlesFilterBar";
import ArticlesTable from "./ArticlesTable";
import ArticlesCardList from "./ArticlesCardList";
import {
  articlesAPI,
  attachmentsAPI,
  locationsAPI,
  tagsAPI,
  savedViewsAPI,
  type SavedView,
} from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { usePreferences } from "../../preferences/preferences";
import type { Article, FetchedArticle, Location, Tag } from "../../types";
import { getErrorMessage } from "../../utils/error";
import { formatCount } from "../../utils/number";
import { downloadBlob } from "../../utils/csv";
import { ErrorBanner, EmptyState } from "../common/States";
import BulkActionBar from "./BulkActionBar";
import BulkEditDialog from "./BulkEditDialog";
import CsvImportModal from "./CsvImportModal";
import TagsManager from "./TagsManager";
import { useToast } from "../common/Toast";
import { useUndoableDelete } from "../../hooks/useUndoableDelete";
import { consumeSharedDraft } from "../../utils/shareTarget";
import { useFeature, useFeatures } from "../../features/features";
import { useUpgrade } from "../../features/upgrade";
import { warrantyStatusFor } from "../../utils/warrantyStatus";
import type { ArticleStatus, ArticleCategory } from "@wim/types";
import { PageHeader, Button, Input, Pagination } from "../ui";

const ArticlesList: React.FC = () => {
  const { t, language } = useI18n();
  const toast = useToast();
  const undoableDelete = useUndoableDelete();
  const isPowerUser = useFeature("sharing");
  const canBulkEdit = useFeature("bulk_edit");
  const canSavedViews = useFeature("saved_views");
  const canCsvImport = useFeature("csv_import");
  const canCsvExport = useFeature("csv_export");
  const { loaded: featuresLoaded } = useFeatures();
  const { promptUpgrade } = useUpgrade();
  const { currency } = usePreferences();

  const getDaysUntilExpiry = (
    garantieFin: string | Date | null | undefined
  ) => {
    if (!garantieFin) return null;
    const end = new Date(garantieFin);
    const now = new Date();
    return Math.floor((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  // Busy flag per export so a Render cold start (~30s) shows a spinner
  // instead of a dead-looking button that queues duplicate downloads.
  const [exporting, setExporting] = useState<"csv" | "pdf" | "labels" | null>(
    null
  );
  // Briefly swaps the export icon for a Check after a successful download, so
  // the user gets a completion confirmation beyond the file landing.
  const [justExported, setJustExported] = useState<
    "csv" | "pdf" | "labels" | null
  >(null);
  const runExport = async (
    kind: "csv" | "pdf" | "labels",
    job: () => Promise<void>
  ) => {
    if (exporting !== null) return;
    setExporting(kind);
    try {
      await job();
      setJustExported(kind);
      setTimeout(() => setJustExported(null), 2000);
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setExporting(null);
    }
  };

  // Defer to the server-side CSV export: it honours every list filter, returns
  // a full structured export (locations/tags/warranty columns), and isn't
  // capped to the current page like a client-side serializer would be.
  const exportToCsv = async () => {
    const qs = searchParams.toString();
    const blob = await articlesAPI.inventoryCsv(qs);
    downloadBlob(
      `wim-inventory-${new Date().toISOString().slice(0, 10)}.csv`,
      blob
    );
  };

  // Shared classifier so the list badge can never disagree with the detail
  // page, the filter pill, or the dashboard (see utils/warrantyStatus).
  const getWarrantyStatus = (garantie: Article["garantie"]) => {
    const info = warrantyStatusFor(garantie?.garantieFin);
    return { tone: info.tone, label: t(info.labelKey) };
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
  const [showTagsManager, setShowTagsManager] = useState(false);
  const [total, setTotal] = useState(0);

  // All filter/search/pagination state lives in the URL so a filtered view is
  // shareable and survives reload. The search box keeps a local mirror so it
  // can debounce before writing back to the URL.
  const [searchParams, setSearchParams] = useSearchParams();
  const qParam = searchParams.get("q") ?? "";
  const warrantyStatus = searchParams.get("warranty") ?? "";
  const statusFilter = searchParams.get("status") ?? "";
  const categoryFilter = searchParams.get("category") ?? "";
  const verificationFilter = searchParams.get("verification") ?? "";
  const favoriteFilter = searchParams.get("favorite") === "1";
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
    statusFilter ||
    categoryFilter ||
    verificationFilter ||
    favoriteFilter ||
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

  // Strip every list-state param at once. Triggered by the "Clear filters"
  // affordance and is a no-op when nothing is set.
  const clearAllFilters = useCallback(() => {
    setSearchInput("");
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [setSearchParams]);

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
  const [showBulkEdit, setShowBulkEdit] = useState(false);

  // Monotonic request id so a slow, superseded fetch (rapid filter/search/page
  // changes, or a manual refetch racing the debounced one) can't overwrite the
  // results of a newer request — only the latest-issued request applies state.
  const requestSeqRef = useRef(0);

  const fetchArticles = useCallback(async () => {
    const seq = ++requestSeqRef.current;
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
        status: (statusFilter as ArticleStatus | "") || undefined,
        category: (categoryFilter as ArticleCategory | "") || undefined,
        verification:
          (verificationFilter as "needed" | "verified" | "") || undefined,
        favorite: favoriteFilter || undefined,
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
      if (seq !== requestSeqRef.current) return;
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
      if (seq !== requestSeqRef.current) return;
      setError(getErrorMessage(err, t("common.errorOccurred")));
    } finally {
      if (seq === requestSeqRef.current) setLoading(false);
    }
  }, [
    locationFilterId,
    tagFilterId,
    qParam,
    warrantyStatus,
    statusFilter,
    categoryFilter,
    verificationFilter,
    favoriteFilter,
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
  // Some-but-not-all of this page selected → render the checkbox's native
  // indeterminate dash (can't be expressed via `checked`; needs a ref).
  const pagePartiallySelected =
    !allPageSelected && articles.some((a) => selectedIds.has(a.articleId));
  const selectAllRef = useCallback(
    (el: HTMLInputElement | null) => {
      if (el) el.indeterminate = pagePartiallySelected;
    },
    [pagePartiallySelected]
  );

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

  const toggleFavorite = async (article: FetchedArticle) => {
    const next = !article.isFavorite;
    // Optimistic — flip in place, revert on failure.
    setArticles((prev) =>
      prev.map((a) =>
        a.articleId === article.articleId ? { ...a, isFavorite: next } : a
      )
    );
    try {
      await articlesAPI.setFavorite(article.articleId, next);
    } catch (e) {
      setArticles((prev) =>
        prev.map((a) =>
          a.articleId === article.articleId ? { ...a, isFavorite: !next } : a
        )
      );
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    }
  };

  const bulkVerify = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const { count } = await articlesAPI.bulkVerify(ids);
      toast.show(
        t("articles.bulk.verifySuccess").replace("{count}", String(count)),
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
    undoableDelete({
      message: t("articles.delete.deleted").replace(
        "{name}",
        article.articleNom
      ),
      remove: () => {
        setArticles((prev) =>
          prev.filter((a) => a.articleId !== article.articleId)
        );
        setTotal((t0) => Math.max(0, t0 - 1));
      },
      restore: () => restoreArticle(article),
      commit: () => articlesAPI.delete(article.articleId),
    });
  };

  const loadSavedViews = () =>
    savedViewsAPI
      .list()
      .then(setSavedViews)
      .catch(() => {});

  const loadTags = useCallback(() => {
    tagsAPI
      .getAll()
      .then((data) =>
        setTags(data.map((tg) => ({ tagId: tg.tagId, name: tg.name })))
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchLocations();
    loadTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Saved views load in their own effect keyed on the feature flag: it
  // resolves asynchronously after mount, so a mount-only fetch would skip an
  // entitled user (flag still false at mount) and leave the list empty.
  useEffect(() => {
    if (canSavedViews) loadSavedViews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSavedViews]);

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

  // ⌘K / `c` shortcut + command-palette action navigate to /articles?new=1
  // to open the create form. Strip the param so a reload doesn't loop.
  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setEditingArticle(null);
    setShowForm(true);
    updateParams({ new: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Themed inline naming form (window.prompt is unstyled, blocks the main
  // thread, and looks broken inside the installed PWA).
  const [namingView, setNamingView] = useState(false);
  const [viewName, setViewName] = useState("");
  const [savingView, setSavingView] = useState(false);

  const saveCurrentView = async () => {
    const name = viewName.trim();
    if (!name || savingView) return;
    setSavingView(true);
    try {
      await savedViewsAPI.create(name, searchParams.toString());
      await loadSavedViews();
      toast.show(t("savedViews.saved"), { kind: "success" });
      setNamingView(false);
      setViewName("");
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setSavingView(false);
    }
  };

  // Optimistic remove + Undo toast — same pattern as single-article delete,
  // since the X sits a few px from the apply button and misclicks happen.
  const deleteView = (view: SavedView) => {
    setSavedViews((prev) => prev.filter((v) => v.id !== view.id));
    const state = { fired: false, undone: false };
    const timer = setTimeout(() => {
      if (state.undone) return;
      state.fired = true;
      savedViewsAPI.remove(view.id).catch((e) => {
        setSavedViews((prev) => [...prev, view]);
        toast.show(getErrorMessage(e, t("common.errorOccurred")), {
          kind: "error",
        });
      });
    }, 5000);
    toast.show(t("savedViews.deleted").replace("{name}", view.name), {
      ttl: 5000,
      action: {
        label: t("common.undo"),
        onClick: () => {
          if (state.fired) return;
          state.undone = true;
          clearTimeout(timer);
          setSavedViews((prev) => [...prev, view]);
        },
      },
    });
  };

  return (
    <div>
      <PageHeader
        icon={<Package className="h-5 w-5" />}
        title={t("articles.title")}
        subtitle={t("articles.subtitle")}
        actions={
          <Button
            onClick={() => setShowForm(true)}
            leftIcon={<Plus className="h-4 w-4" />}
          >
            {t("articles.create")}
          </Button>
        }
      />

      {/* Toolbar */}
      <div className="ui-card mb-4 space-y-3 p-3">
        <ArticlesFilterBar
          searchInput={searchInput}
          setSearchInput={setSearchInput}
          locationFilterId={locationFilterId}
          tagFilterId={tagFilterId}
          warrantyStatus={warrantyStatus}
          statusFilter={statusFilter}
          categoryFilter={categoryFilter}
          verificationFilter={verificationFilter}
          favoriteFilter={favoriteFilter}
          priceMin={priceMin}
          priceMax={priceMax}
          createdFrom={createdFrom}
          createdTo={createdTo}
          sortParam={sortParam}
          dirParam={dirParam}
          locations={locations}
          tags={tags}
          hasActiveFilters={hasActiveFilters}
          updateParams={updateParams}
          clearAllFilters={clearAllFilters}
        />

        {/* Secondary actions */}
        <div className="flex flex-wrap items-center gap-2 border-t ui-divider pt-3">
          {canCsvExport ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void runExport("csv", exportToCsv)}
              loading={exporting === "csv"}
              disabled={articles.length === 0 || exporting !== null}
              leftIcon={
                justExported === "csv" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <FileDown className="h-4 w-4" />
                )
              }
            >
              {t("articles.export.csv")}
            </Button>
          ) : (
            featuresLoaded && (
              <Button
                variant="outline"
                size="sm"
                onClick={promptUpgrade}
                title={t("upgrade.lockedHint")}
                leftIcon={<Lock className="h-4 w-4" />}
              >
                {t("articles.export.csv")}
              </Button>
            )
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void runExport("pdf", async () =>
                downloadBlob(
                  `wim-inventory-${new Date().toISOString().slice(0, 10)}.pdf`,
                  await articlesAPI.inventoryPdf()
                )
              )
            }
            loading={exporting === "pdf"}
            disabled={exporting !== null}
            leftIcon={
              justExported === "pdf" ? (
                <Check className="h-4 w-4" />
              ) : (
                <FileText className="h-4 w-4" />
              )
            }
          >
            {t("articles.export.pdf")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void runExport("labels", async () =>
                downloadBlob(
                  `wim-labels-${new Date().toISOString().slice(0, 10)}.pdf`,
                  await articlesAPI.labelsPdf()
                )
              )
            }
            loading={exporting === "labels"}
            disabled={articles.length === 0 || exporting !== null}
            leftIcon={
              justExported === "labels" ? (
                <Check className="h-4 w-4" />
              ) : (
                <FileText className="h-4 w-4" />
              )
            }
          >
            {t("articles.export.labels")}
          </Button>
          {canCsvImport ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowImport(true)}
              leftIcon={<Upload className="h-4 w-4" />}
            >
              {t("articles.import.csv")}
            </Button>
          ) : (
            featuresLoaded && (
              <Button
                variant="outline"
                size="sm"
                onClick={promptUpgrade}
                title={t("upgrade.lockedHint")}
                leftIcon={<Lock className="h-4 w-4" />}
              >
                {t("articles.import.csv")}
              </Button>
            )
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTagsManager(true)}
            leftIcon={<TagIcon className="h-4 w-4" />}
          >
            {t("tags.manage.button")}
          </Button>
          <Link to="/articles/trash" className="ml-auto">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Trash2 className="h-4 w-4" />}
            >
              {t("trash.link")}
            </Button>
          </Link>
        </div>
      </div>

      {/* Saved filter views */}
      {canSavedViews && (
        <div
          className="mb-4 flex flex-wrap items-center gap-2"
          role="group"
          aria-label={t("savedViews.title")}
        >
          {savedViews.map((v) => (
            <span
              key={v.id}
              className="inline-flex items-center gap-1 rounded-full ui-badge px-2.5 py-1 text-xs"
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
                onClick={() => deleteView(v)}
                aria-label={t("savedViews.delete")}
                className="text-danger leading-none"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
          {namingView ? (
            <form
              className="inline-flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                void saveCurrentView();
              }}
            >
              {/* Callback ref focuses on mount: the user's explicit "save
                view" click moves focus into the form's only input. */}
              <Input
                ref={(el: HTMLInputElement | null) => el?.focus()}
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setNamingView(false);
                    setViewName("");
                  }
                }}
                placeholder={t("savedViews.namePrompt")}
                className="h-7 w-44 rounded-full px-2.5 text-xs"
              />
              <Button
                type="submit"
                size="sm"
                loading={savingView}
                disabled={!viewName.trim()}
              >
                {t("common.save")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setNamingView(false);
                  setViewName("");
                }}
              >
                {t("common.cancel")}
              </Button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setNamingView(true)}
              className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs ui-text-muted hover:bg-surface-muted"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              {t("savedViews.save")}
            </button>
          )}
        </div>
      )}

      {error && (
        <ErrorBanner
          message={error}
          onRetry={fetchArticles}
          retryLabel={t("common.retry")}
          className="mb-4"
        />
      )}

      <BulkActionBar
        selectedCount={selectedIds.size}
        canShare={isPowerUser}
        canEditFields={canBulkEdit}
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
        onEditFields={() => setShowBulkEdit(true)}
        onVerify={() => void bulkVerify()}
      />

      {showBulkEdit && (
        <BulkEditDialog
          open
          ids={Array.from(selectedIds)}
          onClose={() => setShowBulkEdit(false)}
          onApplied={(count) => {
            toast.show(
              t("bulkEdit.success").replace("{count}", String(count)),
              { kind: "success" }
            );
            void fetchArticles();
            clearSelection();
          }}
        />
      )}

      {showBulkDeleteConfirm && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border ui-alert-error p-4"
        >
          <p className="flex-1 text-sm ui-text-error">
            {t("articles.bulk.deleteConfirm").replace(
              "{count}",
              String(selectedIds.size)
            )}
          </p>
          <Button
            variant="danger"
            size="sm"
            onClick={bulkDelete}
            loading={bulkBusy}
            leftIcon={<Trash2 className="h-4 w-4" />}
          >
            {t("common.yes")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowBulkDeleteConfirm(false)}
            disabled={bulkBusy}
          >
            {t("common.no")}
          </Button>
        </div>
      )}

      {showForm && (
        <div className="mb-4">
          <ArticleForm
            article={editingArticle || sharedDraft || undefined}
            onSubmit={handleSubmit}
            onCancel={() => {
              setShowForm(false);
              setEditingArticle(null);
              setSharedDraft(null);
            }}
          />
        </div>
      )}

      <div className="ui-card overflow-hidden">
        {loading ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="ui-panel">
                <tr>
                  <th className="w-10 px-3 py-3" aria-hidden="true">
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
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ui-text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y ui-divider">
                {[1, 2, 3, 4].map((i) => (
                  <tr key={i}>
                    <td className="w-10 px-3 py-4">
                      <div className="h-4 w-4 animate-pulse rounded ui-panel" />
                    </td>
                    {/* Inline width: an interpolated `w-${w}` class would be
                        purged by Tailwind's scanner and render zero-width. */}
                    {[12, 60, 40, 80, 20, 24, 20, 24, 16, 48].map((w, j) => (
                      <td key={j} className="px-6 py-4">
                        <div
                          className="h-4 animate-pulse rounded ui-panel"
                          style={{ width: `${w * 4}px`, maxWidth: "100%" }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : articles.length === 0 && hasActiveFilters ? (
          <EmptyState
            icon={<Search className="h-6 w-6" />}
            title={
              qParam.trim()
                ? t("articles.search.noResults").replace(
                    "{query}",
                    qParam.trim()
                  )
                : t("articles.filter.noResults")
            }
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={clearAllFilters}
                leftIcon={<X className="h-4 w-4" />}
              >
                {t("articles.filter.clearAll")}
              </Button>
            }
            className="m-4"
          />
        ) : articles.length === 0 ? (
          <EmptyState
            icon={<Package className="h-8 w-8" />}
            title={t("articles.none.title")}
            description={t("articles.none.subtitle")}
            action={
              <Button
                onClick={() => setShowForm(true)}
                leftIcon={<Plus className="h-4 w-4" />}
              >
                {t("articles.create")}
              </Button>
            }
            className="m-4"
          />
        ) : (
          <>
            {/* Mobile cards (below sm:) — extracted to ArticlesCardList. */}
            <ArticlesCardList
              articles={articles}
              selectedIds={selectedIds}
              allPageSelected={allPageSelected}
              selectAllRef={selectAllRef}
              onToggleSelectAll={toggleSelectAll}
              onToggleSelected={toggleSelected}
              getWarrantyStatus={getWarrantyStatus}
              getDaysUntilExpiry={getDaysUntilExpiry}
              currency={currency}
              language={language}
              onEdit={(a) => {
                setEditingArticle(a);
                setShowForm(true);
              }}
              onDelete={handleDelete}
              onToggleFavorite={toggleFavorite}
            />

            {/* Desktop table (sm+) — extracted to ArticlesTable. */}
            <ArticlesTable
              articles={articles}
              selectedIds={selectedIds}
              allPageSelected={allPageSelected}
              selectAllRef={selectAllRef}
              onToggleSelectAll={toggleSelectAll}
              onToggleSelected={toggleSelected}
              getWarrantyStatus={getWarrantyStatus}
              getDaysUntilExpiry={getDaysUntilExpiry}
              currency={currency}
              language={language}
              isPowerUser={isPowerUser}
              onEdit={(a) => {
                setEditingArticle(a);
                setShowForm(true);
              }}
              onDelete={handleDelete}
              onToggleFavorite={toggleFavorite}
              onShareChanged={fetchArticles}
            />
          </>
        )}

        {!loading && total > 0 && (
          <div className="border-t ui-divider p-4 text-sm">
            {total > LIMIT ? (
              <Pagination
                page={page}
                limit={LIMIT}
                total={total}
                onPage={(p) => updateParams({ page: String(p) }, false)}
                prevLabel={t("common.prev")}
                nextLabel={t("common.next")}
                rangeLabel={t("articles.results.count").replace(
                  "{total}",
                  formatCount(total, language)
                )}
              />
            ) : (
              <span className="ui-text-muted tabular-nums">
                {t("articles.results.count").replace(
                  "{total}",
                  formatCount(total, language)
                )}
              </span>
            )}
          </div>
        )}
      </div>

      <CsvImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={fetchArticles}
      />

      <TagsManager
        open={showTagsManager}
        onClose={() => setShowTagsManager(false)}
        onChanged={() => {
          loadTags();
          void fetchArticles();
        }}
      />
    </div>
  );
};

export default ArticlesList;
