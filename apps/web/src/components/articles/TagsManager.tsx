/**
 * Tag manager modal — list all tags, inline rename, merge-into-another,
 * delete with confirm. Merge folds one tag into another in a single
 * server transaction (see tags/tag.service.ts merge()); deduplicates
 * articles already carrying both.
 */
import { useCallback, useEffect, useState } from "react";
import { Pencil, GitMerge, Trash2, Check, X } from "lucide-react";
import Modal from "../common/Modal";
import { tagsAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";
import { useToast } from "../common/Toast";
import { Skeleton } from "../common/Skeleton";
import { Button, Input, Select, Badge } from "../ui";

type TagRow = { tagId: number; name: string; articleCount: number };

interface TagsManagerProps {
  open: boolean;
  onClose: () => void;
  /** Called after any mutation so the parent can refresh its own tag list. */
  onChanged?: () => void;
}

export default function TagsManager({
  open,
  onClose,
  onChanged,
}: TagsManagerProps) {
  const { t } = useI18n();
  const toast = useToast();
  const [tags, setTags] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [mergeFor, setMergeFor] = useState<number | null>(null);
  const [deleteFor, setDeleteFor] = useState<TagRow | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setTags(await tagsAPI.getAll());
    } catch (e) {
      toast.show(getErrorMessage(e, t("tags.manage.loadError")), {
        kind: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const afterChange = async () => {
    await load();
    onChanged?.();
  };

  const saveRename = async (id: number) => {
    const name = editName.trim();
    if (!name) return;
    setBusyId(id);
    try {
      await tagsAPI.rename(id, name);
      setEditId(null);
      await afterChange();
    } catch (e) {
      toast.show(getErrorMessage(e, t("tags.manage.renameError")), {
        kind: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  const doMerge = async (fromId: number, intoId: number) => {
    setBusyId(fromId);
    try {
      const { articlesAffected } = await tagsAPI.merge(fromId, intoId);
      setMergeFor(null);
      toast.show(
        t("tags.manage.merged").replace("{count}", String(articlesAffected)),
        { kind: "success" }
      );
      await afterChange();
    } catch (e) {
      toast.show(getErrorMessage(e, t("tags.manage.mergeError")), {
        kind: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  const doDelete = async (id: number) => {
    setBusyId(id);
    try {
      await tagsAPI.remove(id);
      setDeleteFor(null);
      await afterChange();
    } catch (e) {
      toast.show(getErrorMessage(e, t("tags.manage.deleteError")), {
        kind: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      titleId="tags-manager-title"
      panelClassName="ui-card w-full max-w-lg p-6 rounded-xl animate-scale-in"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 id="tags-manager-title" className="text-lg font-semibold ui-title">
          {t("tags.manage.title")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg ui-btn-ghost"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={40} />
          ))}
        </div>
      ) : tags.length === 0 ? (
        <p className="py-8 text-center text-sm ui-text-muted">
          {t("tags.manage.empty")}
        </p>
      ) : (
        <ul className="max-h-96 divide-y ui-divider overflow-y-auto">
          {tags.map((tag) => (
            <li key={tag.tagId} className="flex items-center gap-2 py-2">
              {deleteFor?.tagId === tag.tagId ? (
                <>
                  <span className="flex-1 truncate text-sm ui-text-error">
                    {t("tags.manage.deleteConfirm")}
                  </span>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => doDelete(tag.tagId)}
                    loading={busyId === tag.tagId}
                    leftIcon={<Trash2 className="h-4 w-4" />}
                  >
                    {t("common.delete")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteFor(null)}
                  >
                    {t("common.cancel")}
                  </Button>
                </>
              ) : editId === tag.tagId ? (
                <>
                  <Input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    maxLength={40}
                    className="flex-1"
                    aria-label={t("tags.manage.renameLabel")}
                  />
                  <Button
                    size="sm"
                    onClick={() => saveRename(tag.tagId)}
                    loading={busyId === tag.tagId}
                    leftIcon={<Check className="h-4 w-4" />}
                  >
                    {t("common.save")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditId(null)}
                  >
                    {t("common.cancel")}
                  </Button>
                </>
              ) : mergeFor === tag.tagId ? (
                <>
                  <span className="flex-1 truncate text-sm">
                    {t("tags.manage.mergeInto").replace("{name}", tag.name)}
                  </span>
                  <Select
                    className="w-44"
                    aria-label={t("tags.manage.mergeTarget")}
                    defaultValue=""
                    onChange={(e) => {
                      const intoId = Number(e.target.value);
                      if (intoId) void doMerge(tag.tagId, intoId);
                    }}
                  >
                    <option value="">{t("tags.manage.mergePick")}</option>
                    {tags
                      .filter((other) => other.tagId !== tag.tagId)
                      .map((other) => (
                        <option key={other.tagId} value={other.tagId}>
                          {other.name}
                        </option>
                      ))}
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMergeFor(null)}
                  >
                    {t("common.cancel")}
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate text-sm font-medium ui-title">
                    {tag.name}
                  </span>
                  <Badge tone="neutral">
                    {t("tags.manage.count").replace(
                      "{count}",
                      String(tag.articleCount)
                    )}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditId(tag.tagId);
                      setEditName(tag.name);
                    }}
                    aria-label={t("common.edit")}
                    leftIcon={<Pencil className="h-4 w-4" />}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMergeFor(tag.tagId)}
                    disabled={tags.length < 2}
                    aria-label={t("tags.manage.merge")}
                    leftIcon={<GitMerge className="h-4 w-4" />}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteFor(tag)}
                    disabled={busyId === tag.tagId}
                    aria-label={t("common.delete")}
                    className="text-danger"
                    leftIcon={<Trash2 className="h-4 w-4" />}
                  />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
