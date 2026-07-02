/**
 * Locations list + per-row inline edit/delete. Each row shows the article
 * count for that location, refreshed in parallel via
 * `locationsAPI.listArticles({ page: 1, limit: 1 })` — we only need the
 * `total` so the limit=1 keeps payloads tiny.
 */
import { useCallback, useEffect, useState } from "react";
import { MapPin, Plus, Pencil, Trash2, RotateCw, Check } from "lucide-react";
import { locationsAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { usePreferences } from "../../preferences/preferences";
import { getErrorMessage } from "../../utils/error";
import { ErrorBanner, EmptyState } from "../common/States";
import { Skeleton } from "../common/Skeleton";
import { useToast } from "../common/Toast";
import { useUndoableDelete } from "../../hooks/useUndoableDelete";
import { formatMoney } from "../../utils/money";
import { PageHeader, Section, Button, Input, Select, Badge } from "../ui";

type LocationRow = {
  locationId: number;
  name: string;
  description?: string | null;
  parentLocationId?: number | null;
  totalValue?: number;
  // Live article count, returned by GET /api/locations via Prisma `_count`.
  // Reading it from the list response avoids an N+1 (one extra request per
  // location just to fetch this number).
  _count?: { articles: number };
};

export default function LocationsView() {
  const { t, language } = useI18n();
  const { currency } = usePreferences();
  const toast = useToast();
  const undoableDelete = useUndoableDelete();

  const [items, setItems] = useState<LocationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newParentId, setNewParentId] = useState("");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editParentId, setEditParentId] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = (await locationsAPI.getAll()) as LocationRow[];
      setItems(data);
    } catch (e) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Hierarchy helpers. `pathOf` renders the ancestor chain ("Home › Garage");
  // `descendantIds` powers the edit select's exclusion list so a location
  // can't be moved under itself or its own subtree (the server enforces the
  // same invariant — this just keeps the picker honest).
  const byId = new Map(items.map((l) => [l.locationId, l]));
  const pathOf = (row: LocationRow): string => {
    const parts: string[] = [];
    let cursor = row.parentLocationId ?? null;
    for (let depth = 0; cursor != null && depth < 10; depth++) {
      const parent = byId.get(cursor);
      if (!parent) break;
      parts.unshift(parent.name);
      cursor = parent.parentLocationId ?? null;
    }
    return parts.join(" › ");
  };
  const descendantIds = (rootId: number): Set<number> => {
    const out = new Set<number>([rootId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const l of items) {
        if (
          l.parentLocationId != null &&
          out.has(l.parentLocationId) &&
          !out.has(l.locationId)
        ) {
          out.add(l.locationId);
          grew = true;
        }
      }
    }
    return out;
  };

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await locationsAPI.create({
        name,
        description: newDescription.trim() || null,
        parentLocationId: newParentId ? Number(newParentId) : null,
      });
      setNewName("");
      setNewDescription("");
      setNewParentId("");
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
    setEditParentId(
      row.parentLocationId != null ? String(row.parentLocationId) : ""
    );
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditDescription("");
    setEditParentId("");
  };

  const saveEdit = async (id: number) => {
    const name = editName.trim();
    if (!name) return;
    setBusy(id);
    try {
      await locationsAPI.update(id, {
        name,
        description: editDescription.trim() || null,
        parentLocationId: editParentId ? Number(editParentId) : null,
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
  // schedule the API call, and let the user cancel from the toast. No restore
  // endpoint needed because the delete simply never fires if undo wins.
  const remove = (id: number) => {
    setConfirmDeleteId(null);
    const snapshot = items.find((l) => l.locationId === id);
    if (!snapshot) return;
    undoableDelete({
      message: t("locations.deleted"),
      kind: "success",
      remove: () => setItems((prev) => prev.filter((l) => l.locationId !== id)),
      restore: () =>
        setItems((prev) =>
          prev.some((l) => l.locationId === id) ? prev : [...prev, snapshot]
        ),
      commit: () => locationsAPI.delete(id),
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
            <Select
              value={newParentId}
              onChange={(e) => setNewParentId(e.target.value)}
              aria-label={t("locations.parent.label")}
            >
              <option value="">{t("locations.parent.none")}</option>
              {items.map((p) => (
                <option key={p.locationId} value={p.locationId}>
                  {pathOf(p) ? `${pathOf(p)} › ${p.name}` : p.name}
                </option>
              ))}
            </Select>
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
                const articleCount = l._count?.articles;
                return (
                  <li key={l.locationId} className="py-3 first:pt-0 last:pb-0">
                    {!isEditing ? (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className="truncate font-medium ui-title"
                              title={
                                pathOf(l) ? `${pathOf(l)} › ${l.name}` : l.name
                              }
                            >
                              {pathOf(l) && (
                                <span className="font-normal ui-text-muted">
                                  {pathOf(l)} ›{" "}
                                </span>
                              )}
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
                          <Select
                            value={editParentId}
                            onChange={(e) => setEditParentId(e.target.value)}
                            aria-label={t("locations.parent.label")}
                          >
                            <option value="">
                              {t("locations.parent.none")}
                            </option>
                            {items
                              .filter(
                                (p) =>
                                  !descendantIds(l.locationId).has(p.locationId)
                              )
                              .map((p) => (
                                <option key={p.locationId} value={p.locationId}>
                                  {pathOf(p)
                                    ? `${pathOf(p)} › ${p.name}`
                                    : p.name}
                                </option>
                              ))}
                          </Select>
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
