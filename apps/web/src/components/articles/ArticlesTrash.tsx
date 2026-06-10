/**
 * Trash view — lists soft-deleted articles and lets the owner restore or
 * permanently delete. Per-row Restore + two-step Delete-forever confirm,
 * plus bulk action bar for selecting many at once. Backed by
 * `articlesAPI.listTrash` / `.restore` / `.purge` / `.bulkRestoreTrash` /
 * `.bulkPurgeTrash`. Articles older than ARTICLE_TRASH_RETENTION_DAYS are
 * auto-purged by the daily maintenance job.
 */
import { useCallback, useEffect, useState } from "react";
import { Trash2, Undo2 } from "lucide-react";
import { articlesAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { usePreferences } from "../../preferences/preferences";
import { getErrorMessage } from "../../utils/error";
import type { FetchedArticle } from "@wim/types";
import { ErrorBanner, EmptyState } from "../common/States";
import { Skeleton } from "../common/Skeleton";
import { useToast } from "../common/Toast";
import { PageHeader, Button } from "../ui";

export default function ArticlesTrash() {
  const { t } = useI18n();
  const { formatDate } = usePreferences();
  const toast = useToast();
  const [items, setItems] = useState<FetchedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmPurgeId, setConfirmPurgeId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
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
      toast.show(t("trash.bulk.restored").replace("{count}", String(count)), {
        kind: "success",
      });
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
      toast.show(t("trash.bulk.purged").replace("{count}", String(count)), {
        kind: "success",
      });
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
    <div>
      <PageHeader
        icon={<Trash2 className="h-5 w-5" />}
        title={t("trash.title")}
        subtitle={t("trash.subtitle")}
        breadcrumbs={[
          { label: t("nav.articles"), to: "/articles" },
          { label: t("trash.title") },
        ]}
      />

      {error && <ErrorBanner message={error} onRetry={load} className="mb-6" />}

      {selectedIds.size > 0 && (
        <div
          role="region"
          aria-label={t("trash.bulk.selectionLabel")}
          className="ui-card sticky top-20 z-10 mb-4 flex flex-wrap items-center gap-3 p-3 animate-slide-up"
        >
          <span className="text-sm font-medium">
            {t("trash.bulk.selected").replace(
              "{count}",
              String(selectedIds.size)
            )}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={bulkRestore}
              disabled={bulkBusy}
              leftIcon={<Undo2 className="h-4 w-4" />}
            >
              {t("trash.bulk.restore")}
            </Button>
            {showBulkPurgeConfirm ? (
              <>
                <span className="text-xs ui-text-error">
                  {t("trash.confirmPurge")}
                </span>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={bulkPurge}
                  loading={bulkBusy}
                >
                  {t("trash.purgeNow")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowBulkPurgeConfirm(false)}
                  disabled={bulkBusy}
                >
                  {t("common.cancel")}
                </Button>
              </>
            ) : (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setShowBulkPurgeConfirm(true)}
                disabled={bulkBusy}
                leftIcon={<Trash2 className="h-4 w-4" />}
              >
                {t("trash.bulk.purge")}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkBusy}
            >
              {t("trash.bulk.clear")}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <Skeleton className="h-32 rounded-xl" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Trash2 className="h-6 w-6" />}
          title={t("trash.empty")}
        />
      ) : (
        <ul className="ui-card divide-y ui-divider">
          {items.map((a) => (
            <li
              key={a.articleId}
              className="flex flex-wrap items-center gap-3 p-3"
            >
              <input
                type="checkbox"
                aria-label={t("trash.bulk.selectRow").replace(
                  "{name}",
                  a.articleNom
                )}
                checked={selectedIds.has(a.articleId)}
                onChange={() => toggleSelected(a.articleId)}
                className="h-4 w-4 accent-[var(--primary)]"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium ui-title">{a.articleNom}</p>
                <p className="truncate text-xs ui-text-muted">
                  {a.articleModele}
                  {a.updatedAt ? ` · ${formatDate(a.updatedAt)}` : ""}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => restore(a.articleId)}
                disabled={busyId === a.articleId}
                leftIcon={<Undo2 className="h-4 w-4" />}
              >
                {t("trash.restore")}
              </Button>
              {confirmPurgeId === a.articleId ? (
                <span className="flex items-center gap-2">
                  <span className="text-xs ui-text-error">
                    {t("trash.confirmPurge")}
                  </span>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => purge(a.articleId)}
                    loading={busyId === a.articleId}
                  >
                    {t("trash.purgeNow")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmPurgeId(null)}
                  >
                    {t("common.cancel")}
                  </Button>
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmPurgeId(a.articleId)}
                  className="text-danger"
                  leftIcon={<Trash2 className="h-4 w-4" />}
                >
                  {t("trash.purge")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
