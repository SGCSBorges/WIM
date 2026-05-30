import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { articlesAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";
import type { FetchedArticle } from "@wim/types";
import { ErrorBanner } from "../common/States";
import { Skeleton } from "../common/Skeleton";
import { useToast } from "../common/Toast";

export default function ArticlesTrash() {
  const { t, language } = useI18n();
  const toast = useToast();
  const [items, setItems] = useState<FetchedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmPurgeId, setConfirmPurgeId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  // Bulk selection state mirrors AttachmentsList / ArticlesList.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showBulkPurgeConfirm, setShowBulkPurgeConfirm] = useState(false);

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkRestore = async () => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    const ids = Array.from(selectedIds);
    try {
      const { count } = await articlesAPI.bulkRestoreTrash(ids);
      setItems((prev) => prev.filter((a) => !selectedIds.has(a.articleId)));
      setSelectedIds(new Set());
      toast.show(
        t("trash.bulk.restored").replace("{count}", String(count)),
        { kind: "success" }
      );
    } catch (e) {
      toast.show(getErrorMessage(e, t("trash.error.restore")), {
        kind: "error",
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkPurge = async () => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    setShowBulkPurgeConfirm(false);
    const ids = Array.from(selectedIds);
    try {
      const { count } = await articlesAPI.bulkPurgeTrash(ids);
      setItems((prev) => prev.filter((a) => !selectedIds.has(a.articleId)));
      setSelectedIds(new Set());
      toast.show(
        t("trash.bulk.purged").replace("{count}", String(count)),
        { kind: "success" }
      );
    } catch (e) {
      toast.show(getErrorMessage(e, t("trash.error.purge")), {
        kind: "error",
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { items } = await articlesAPI.listTrash();
      setItems(items);
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e, t("trash.error.load")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const restore = async (id: number) => {
    setBusyId(id);
    try {
      await articlesAPI.restore(id);
      setItems((prev) => prev.filter((a) => a.articleId !== id));
      toast.show(t("trash.restored"), { kind: "success" });
    } catch (e) {
      toast.show(getErrorMessage(e, t("trash.error.restore")), {
        kind: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  const purge = async (id: number) => {
    setBusyId(id);
    try {
      await articlesAPI.purge(id);
      setItems((prev) => prev.filter((a) => a.articleId !== id));
      toast.show(t("trash.purged"), { kind: "success" });
      setConfirmPurgeId(null);
    } catch (e) {
      toast.show(getErrorMessage(e, t("trash.error.purge")), {
        kind: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold ui-title">{t("trash.title")}</h1>
        <Link to="/articles" className="text-sm ui-link">
          ← {t("trash.backToArticles")}
        </Link>
      </div>
      <p className="text-sm ui-text-muted">{t("trash.subtitle")}</p>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {selectedIds.size > 0 && (
        <div
          role="region"
          aria-label={t("trash.bulk.selectionLabel")}
          className="ui-card rounded-lg shadow p-3 flex flex-wrap items-center gap-3 sticky top-2 z-10"
        >
          <span className="font-medium text-sm">
            {t("trash.bulk.selected").replace(
              "{count}",
              String(selectedIds.size)
            )}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={bulkRestore}
              disabled={bulkBusy}
              className="text-sm px-3 py-1.5 ui-btn-ghost border ui-divider rounded-md"
            >
              {t("trash.bulk.restore")}
            </button>
            {showBulkPurgeConfirm ? (
              <>
                <span className="text-xs ui-text-error">
                  {t("trash.confirmPurge")}
                </span>
                <button
                  type="button"
                  onClick={bulkPurge}
                  disabled={bulkBusy}
                  className="text-sm px-3 py-1.5 ui-btn-danger rounded-md"
                >
                  {t("trash.purgeNow")}
                </button>
                <button
                  type="button"
                  onClick={() => setShowBulkPurgeConfirm(false)}
                  disabled={bulkBusy}
                  className="text-sm px-3 py-1.5 ui-btn-ghost border ui-divider rounded-md"
                >
                  {t("common.cancel")}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setShowBulkPurgeConfirm(true)}
                disabled={bulkBusy}
                className="text-sm px-3 py-1.5 ui-btn-danger rounded-md"
              >
                {t("trash.bulk.purge")}
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkBusy}
              className="text-sm px-3 py-1.5 ui-btn-ghost border ui-divider rounded-md"
            >
              {t("trash.bulk.clear")}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <Skeleton className="h-32 rounded-lg" />
      ) : items.length === 0 ? (
        <p className="ui-card rounded-lg p-6 text-center ui-text-muted">
          {t("trash.empty")}
        </p>
      ) : (
        <ul className="ui-card rounded-lg divide-y ui-divider">
          {items.map((a) => (
            <li
              key={a.articleId}
              className="p-3 flex flex-wrap items-center gap-3"
            >
              <input
                type="checkbox"
                aria-label={t("trash.bulk.selectRow").replace(
                  "{name}",
                  a.articleNom
                )}
                checked={selectedIds.has(a.articleId)}
                onChange={() => toggleSelected(a.articleId)}
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{a.articleNom}</p>
                <p className="text-xs ui-text-muted truncate">
                  {a.articleModele}
                  {a.updatedAt
                    ? ` · ${new Date(a.updatedAt).toLocaleDateString(language)}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => restore(a.articleId)}
                disabled={busyId === a.articleId}
                className="text-sm px-3 py-1.5 ui-btn-ghost border ui-divider rounded-md"
              >
                {t("trash.restore")}
              </button>
              {confirmPurgeId === a.articleId ? (
                <span className="flex items-center gap-2">
                  <span className="text-xs ui-text-error">
                    {t("trash.confirmPurge")}
                  </span>
                  <button
                    type="button"
                    onClick={() => purge(a.articleId)}
                    disabled={busyId === a.articleId}
                    className="text-sm px-3 py-1.5 ui-btn-danger rounded-md"
                  >
                    {t("trash.purgeNow")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmPurgeId(null)}
                    className="text-sm px-3 py-1.5 ui-btn-ghost border ui-divider rounded-md"
                  >
                    {t("common.cancel")}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmPurgeId(a.articleId)}
                  className="text-sm px-3 py-1.5 ui-btn-ghost border ui-divider rounded-md ui-text-error"
                >
                  {t("trash.purge")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
