/**
 * Locations list + per-row inline edit/delete. Each row shows the article
 * count for that location, refreshed in parallel via
 * `locationsAPI.listArticles({ page: 1, limit: 1 })` — we only need the
 * `total` so the limit=1 keeps payloads tiny.
 */
import { useCallback, useEffect, useState } from "react";
import { MapPin, Plus, Pencil, Trash2, RotateCw, Check } from "lucide-react";
import { locationsAPI, profileAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";
import { ErrorBanner, EmptyState } from "../common/States";
import { Skeleton } from "../common/Skeleton";
import { useToast } from "../common/Toast";
import { formatMoney } from "../../utils/money";
import { PageHeader, Section, Button, Input, Badge } from "../ui";

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
    const entries = await Promise.all(
      rows.map(async (r) => {
        try {
          const res = await locationsAPI.listArticles(r.locationId, {
            page: 1,
            limit: 1,
          });
          return [r.locationId, res.total ?? 0] as const;
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

  // Optimistic delete with a 5s undo window: hide the row immediately,
  // schedule the API call, and let the user cancel from the toast. Same
  // pattern as ArticlesList — no restore endpoint needed because the
  // delete simply never fires if undo wins.
  const remove = (id: number) => {
    setConfirmDeleteId(null);
    const snapshot = items.find((l) => l.locationId === id);
    if (!snapshot) return;
    setItems((prev) => prev.filter((l) => l.locationId !== id));

    // The toast ttl must match the delete timer: the default undo-toast ttl
    // (8s, pausable on hover) outlives the 5s window, leaving a clickable
    // Undo after the DELETE has already been sent. The fired/undone flags
    // close the remaining hover-pause edge.
    const state = { fired: false, undone: false };
    const timer = window.setTimeout(() => {
      if (state.undone) return;
      state.fired = true;
      void locationsAPI.delete(id).catch((e) => {
        setItems((prev) =>
          prev.some((l) => l.locationId === id) ? prev : [...prev, snapshot]
        );
        toast.show(getErrorMessage(e, t("common.errorOccurred")), {
          kind: "error",
        });
      });
    }, 5000);

    toast.show(t("locations.deleted"), {
      kind: "success",
      ttl: 5000,
      action: {
        label: t("common.undo"),
        onClick: () => {
          if (state.fired) return;
          state.undone = true;
          window.clearTimeout(timer);
          setItems((prev) =>
            prev.some((l) => l.locationId === id) ? prev : [...prev, snapshot]
          );
        },
      },
    });
  };

  return (
    <div>
      <PageHeader
        icon={<MapPin className="h-5 w-5" />}
        title={t("locations.title")}
        subtitle={t("locations.subtitle")}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAll}
            disabled={loading}
            leftIcon={<RotateCw className="h-4 w-4" />}
          >
            {t("common.refresh")}
          </Button>
        }
      />

      {error && (
        <ErrorBanner
          message={error}
          onRetry={fetchAll}
          retryLabel={t("common.retry")}
          className="mb-6"
        />
      )}

      <div className="space-y-6">
        <Section title={t("locations.createTitle")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("locations.placeholder.name")}
              maxLength={120}
              aria-label={t("locations.placeholder.name")}
            />
            <Input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder={t("locations.placeholder.description")}
              maxLength={255}
              aria-label={t("locations.placeholder.description")}
            />
          </div>
          <div className="mt-3">
            <Button
              onClick={create}
              loading={creating}
              disabled={!newName.trim()}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              {t("locations.create")}
            </Button>
          </div>
        </Section>

        <Section title={t("locations.allTitle")}>
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={56} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<MapPin className="h-6 w-6" />}
              title={t("locations.none")}
            />
          ) : (
            <ul className="divide-y ui-divider">
              {items.map((l) => {
                const isEditing = editingId === l.locationId;
                const articleCount = counts[l.locationId];
                return (
                  <li key={l.locationId} className="py-3 first:pt-0 last:pb-0">
                    {!isEditing ? (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-medium ui-title">
                              {l.name}
                            </span>
                            {l.totalValue !== undefined && l.totalValue > 0 && (
                              <Badge tone="info">
                                {formatMoney(l.totalValue, currency, language)}
                              </Badge>
                            )}
                            {articleCount !== undefined &&
                              articleCount >= 0 && (
                                <Badge tone="neutral">
                                  {t("locations.articleCount").replace(
                                    "{count}",
                                    String(articleCount)
                                  )}
                                </Badge>
                              )}
                          </div>
                          {l.description && (
                            <p className="mt-1 text-sm ui-text-muted">
                              {l.description}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {confirmDeleteId === l.locationId ? (
                            <span className="inline-flex items-center gap-2">
                              <span className="text-xs ui-text-error">
                                {t("locations.deleteConfirm")}
                              </span>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => remove(l.locationId)}
                              >
                                {t("common.yes")}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirmDeleteId(null)}
                              >
                                {t("common.no")}
                              </Button>
                            </span>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => startEdit(l)}
                                disabled={busy === l.locationId}
                                aria-label={t("common.edit")}
                                leftIcon={<Pencil className="h-4 w-4" />}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirmDeleteId(l.locationId)}
                                disabled={busy === l.locationId}
                                aria-label={t("common.delete")}
                                className="text-danger"
                                leftIcon={<Trash2 className="h-4 w-4" />}
                              />
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && editName.trim()) {
                                e.preventDefault();
                                saveEdit(l.locationId);
                              }
                            }}
                            placeholder={t("locations.placeholder.name")}
                            maxLength={120}
                            aria-label={t("locations.placeholder.name")}
                          />
                          <Input
                            type="text"
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            placeholder={t("locations.placeholder.description")}
                            maxLength={255}
                            aria-label={t("locations.placeholder.description")}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => saveEdit(l.locationId)}
                            loading={busy === l.locationId}
                            disabled={!editName.trim()}
                            leftIcon={<Check className="h-4 w-4" />}
                          >
                            {t("common.save")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={cancelEdit}
                            disabled={busy === l.locationId}
                          >
                            {t("common.cancel")}
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
