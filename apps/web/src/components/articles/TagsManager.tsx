/**
 * Tag manager modal — list all tags, inline rename, merge-into-another,
 * delete with confirm. Merge folds one tag into another in a single
 * server transaction (see tags/tag.service.ts merge()); deduplicates
 * articles already carrying both.
 */
import { useCallback, useEffect, useState } from "react";
import Modal from "../common/Modal";
import { tagsAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";
import { useToast } from "../common/Toast";
import { Skeleton } from "../common/Skeleton";

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
    if (!window.confirm(t("tags.manage.deleteConfirm"))) return;
    setBusyId(id);
    try {
      await tagsAPI.remove(id);
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
      panelClassName="ui-card w-full max-w-lg p-6 rounded-lg"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 id="tags-manager-title" className="text-lg font-semibold ui-title">
          {t("tags.manage.title")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="ui-btn-ghost px-2 py-1 rounded"
        >
          ✕
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={40} />
          ))}
        </div>
      ) : tags.length === 0 ? (
        <p className="ui-text-muted text-sm py-6 text-center">
          {t("tags.manage.empty")}
        </p>
      ) : (
        <ul className="divide-y ui-divider max-h-96 overflow-y-auto">
          {tags.map((tag) => (
            <li key={tag.tagId} className="py-2 flex items-center gap-2">
              {editId === tag.tagId ? (
                <>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    maxLength={40}
                    className="ui-input flex-1 px-2 py-1 rounded text-sm"
                    aria-label={t("tags.manage.renameLabel")}
                  />
                  <button
                    type="button"
                    onClick={() => saveRename(tag.tagId)}
                    disabled={busyId === tag.tagId}
                    className="ui-btn-primary px-2 py-1 rounded text-sm"
                  >
                    {t("common.save")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditId(null)}
                    className="ui-btn-ghost px-2 py-1 rounded text-sm border ui-divider"
                  >
                    {t("common.cancel")}
                  </button>
                </>
              ) : mergeFor === tag.tagId ? (
                <>
                  <span className="flex-1 text-sm truncate">
                    {t("tags.manage.mergeInto").replace("{name}", tag.name)}
                  </span>
                  <select
                    className="ui-select px-2 py-1 rounded text-sm"
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
                  </select>
                  <button
                    type="button"
                    onClick={() => setMergeFor(null)}
                    className="ui-btn-ghost px-2 py-1 rounded text-sm border ui-divider"
                  >
                    {t("common.cancel")}
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm truncate">{tag.name}</span>
                  <span className="text-xs ui-text-muted shrink-0">
                    {t("tags.manage.count").replace(
                      "{count}",
                      String(tag.articleCount)
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditId(tag.tagId);
                      setEditName(tag.name);
                    }}
                    className="ui-btn-ghost px-2 py-1 rounded text-sm border ui-divider"
                  >
                    {t("common.edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMergeFor(tag.tagId)}
                    disabled={tags.length < 2}
                    className="ui-btn-ghost px-2 py-1 rounded text-sm border ui-divider"
                  >
                    {t("tags.manage.merge")}
                  </button>
                  <button
                    type="button"
                    onClick={() => doDelete(tag.tagId)}
                    disabled={busyId === tag.tagId}
                    className="ui-btn-ghost px-2 py-1 rounded text-sm border ui-divider ui-text-error"
                  >
                    {t("common.delete")}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
