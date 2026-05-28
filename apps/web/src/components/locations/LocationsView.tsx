import { useCallback, useEffect, useState } from "react";
import { locationsAPI, profileAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";
import { ErrorBanner } from "../common/States";
import { Skeleton } from "../common/Skeleton";
import { useToast } from "../common/Toast";
import { formatMoney } from "../../utils/money";

type LocationRow = {
  locationId: number;
  name: string;
  description?: string | null;
  totalValue?: number;
};

export default function LocationsView() {
  const { t, language } = useI18n();
  const toast = useToast();

  const [items, setItems] = useState<LocationRow[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const refreshCounts = useCallback(async (rows: LocationRow[]) => {
    // Fire all listArticles requests in parallel. Each is small so a wave
    // of N is acceptable; pagination kicks in server-side at 50.
    const entries = await Promise.all(
      rows.map(async (r) => {
        try {
          const articles = await locationsAPI.listArticles(r.locationId);
          return [
            r.locationId,
            Array.isArray(articles) ? articles.length : 0,
          ] as const;
        } catch {
          return [r.locationId, -1] as const;
        }
      })
    );
    setCounts(Object.fromEntries(entries));
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = (await locationsAPI.getAll()) as LocationRow[];
      setItems(data);
      void refreshCounts(data);
    } catch (e) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setLoading(false);
    }
  }, [t, refreshCounts]);

  useEffect(() => {
    fetchAll();
    // Pull the user's display currency so totals render in the right unit.
    profileAPI
      .getMe()
      .then((me) => me.currency && setCurrency(me.currency))
      .catch(() => {});
  }, [fetchAll]);

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await locationsAPI.create({
        name,
        description: newDescription.trim() || null,
      });
      setNewName("");
      setNewDescription("");
      toast.show(t("locations.created"), { kind: "success" });
      await fetchAll();
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (row: LocationRow) => {
    setEditingId(row.locationId);
    setEditName(row.name);
    setEditDescription(row.description ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditDescription("");
  };

  const saveEdit = async (id: number) => {
    const name = editName.trim();
    if (!name) return;
    setBusy(id);
    try {
      await locationsAPI.update(id, {
        name,
        description: editDescription.trim() || null,
      });
      cancelEdit();
      toast.show(t("locations.updated"), { kind: "success" });
      await fetchAll();
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: number) => {
    setConfirmDeleteId(null);
    setBusy(id);
    try {
      await locationsAPI.delete(id);
      toast.show(t("locations.deleted"), { kind: "success" });
      await fetchAll();
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("locations.title")}</h1>
        <p className="ui-text-muted">{t("locations.subtitle")}</p>
      </div>

      {error && (
        <ErrorBanner
          message={error}
          onRetry={fetchAll}
          retryLabel={t("common.retry")}
        />
      )}

      <div className="ui-card rounded-lg p-4 space-y-3">
        <h2 className="font-semibold">{t("locations.createTitle")}</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <input
            type="text"
            className="ui-input px-3 py-2 rounded"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("locations.placeholder.name")}
            maxLength={120}
          />
          <input
            type="text"
            className="ui-input px-3 py-2 rounded"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder={t("locations.placeholder.description")}
            maxLength={255}
          />
        </div>
        <button
          onClick={create}
          disabled={creating || !newName.trim()}
          className="ui-btn-primary px-4 py-2 rounded-md"
        >
          {creating ? t("common.loading") : t("locations.create")}
        </button>
      </div>

      <div className="ui-card rounded-lg">
        <div className="p-4 border-b ui-divider flex items-center justify-between">
          <h2 className="font-semibold">{t("locations.allTitle")}</h2>
          <button
            onClick={fetchAll}
            disabled={loading}
            className="text-sm ui-btn-ghost rounded px-2 py-1"
          >
            {loading ? t("common.loading") : t("common.refresh")}
          </button>
        </div>

        <div className="divide-y ui-divider">
          {loading && (
            <div className="p-4 space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={48} />
              ))}
            </div>
          )}

          {!loading && items.length === 0 && (
            <div className="p-4 text-sm ui-text-muted">
              {t("locations.none")}
            </div>
          )}

          {!loading &&
            items.map((l) => {
              const isEditing = editingId === l.locationId;
              const articleCount = counts[l.locationId];
              return (
                <div key={l.locationId} className="p-4 space-y-2">
                  {!isEditing ? (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{l.name}</span>
                          {l.totalValue !== undefined && l.totalValue > 0 && (
                            <span className="text-xs ui-badge px-2 py-0.5 rounded">
                              {formatMoney(l.totalValue, currency, language)}
                            </span>
                          )}
                          {articleCount !== undefined && articleCount >= 0 && (
                            <span className="text-xs ui-badge px-2 py-0.5 rounded">
                              {t("locations.articleCount").replace(
                                "{count}",
                                String(articleCount)
                              )}
                            </span>
                          )}
                        </div>
                        {l.description && (
                          <p className="text-sm ui-text-muted mt-1">
                            {l.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => startEdit(l)}
                          disabled={busy === l.locationId}
                          className="text-sm px-3 py-1.5 ui-btn-ghost border ui-divider rounded-md"
                        >
                          {t("common.edit")}
                        </button>
                        {confirmDeleteId === l.locationId ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="text-xs ui-text-error">
                              {t("locations.deleteConfirm")}
                            </span>
                            <button
                              onClick={() => remove(l.locationId)}
                              disabled={busy === l.locationId}
                              className="text-xs px-2 py-1 ui-btn-danger rounded"
                            >
                              {t("common.yes")}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-xs px-2 py-1 ui-btn-ghost border ui-divider rounded"
                            >
                              {t("common.no")}
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(l.locationId)}
                            disabled={busy === l.locationId}
                            className="text-sm px-3 py-1.5 ui-action-danger"
                          >
                            {t("common.delete")}
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid sm:grid-cols-2 gap-3">
                        <input
                          type="text"
                          className="ui-input px-3 py-2 rounded"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder={t("locations.placeholder.name")}
                          maxLength={120}
                        />
                        <input
                          type="text"
                          className="ui-input px-3 py-2 rounded"
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          placeholder={t("locations.placeholder.description")}
                          maxLength={255}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(l.locationId)}
                          disabled={busy === l.locationId || !editName.trim()}
                          className="ui-btn-primary px-3 py-1.5 text-sm rounded"
                        >
                          {busy === l.locationId
                            ? t("common.loading")
                            : t("common.save")}
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={busy === l.locationId}
                          className="ui-btn-ghost px-3 py-1.5 text-sm rounded border ui-divider"
                        >
                          {t("common.cancel")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
