/**
 * Sticky footer on the Articles list shown whenever ≥1 row is selected.
 * Delegates every action to the parent via the on* props — the bar itself
 * is presentational. canShare flips Share/Unshare in/out of the UI based
 * on the caller's role.
 */
import { useI18n } from "../../i18n/i18n";
import type { Location, Tag } from "../../types";

interface BulkActionBarProps {
  selectedCount: number;
  canShare: boolean;
  canEditFields: boolean;
  busy: boolean;
  locations: Location[];
  tags: Tag[];
  onClear: () => void;
  onDelete: () => void;
  onShare: () => void;
  onUnshare: () => void;
  onAssignLocation: (locationId: number) => void;
  onAssignTag: (tagId: number) => void;
  onEditFields: () => void;
}

export default function BulkActionBar({
  selectedCount,
  canShare,
  canEditFields,
  busy,
  locations,
  tags,
  onClear,
  onDelete,
  onShare,
  onUnshare,
  onAssignLocation,
  onAssignTag,
  onEditFields,
}: BulkActionBarProps) {
  const { t } = useI18n();

  if (selectedCount === 0) return null;

  return (
    <div
      role="region"
      aria-label={t("articles.bulk.selectionLabel")}
      aria-busy={busy}
      className="ui-card rounded-lg shadow p-3 flex flex-wrap items-center gap-3 sticky top-2 z-10"
    >
      <span className="font-medium text-sm">
        {t("articles.bulk.selected").replace("{count}", String(selectedCount))}
      </span>

      <div className="flex flex-wrap items-center gap-2 ml-auto">
        {locations.length > 0 && (
          <select
            value=""
            disabled={busy}
            onChange={(e) => {
              const id = Number(e.target.value);
              if (id) onAssignLocation(id);
              e.target.value = "";
            }}
            className="ui-select text-sm px-3 py-1.5 rounded-md"
            aria-label={t("articles.bulk.addLocation")}
          >
            <option value="">{t("articles.bulk.addLocation")}</option>
            {locations.map((l) => (
              <option key={l.locationId} value={l.locationId}>
                {l.name}
              </option>
            ))}
          </select>
        )}

        {tags.length > 0 && (
          <select
            value=""
            disabled={busy}
            onChange={(e) => {
              const id = Number(e.target.value);
              if (id) onAssignTag(id);
              e.target.value = "";
            }}
            className="ui-select text-sm px-3 py-1.5 rounded-md"
            aria-label={t("articles.bulk.addTag")}
          >
            <option value="">{t("articles.bulk.addTag")}</option>
            {tags.map((tg) => (
              <option key={tg.tagId} value={tg.tagId}>
                {tg.name}
              </option>
            ))}
          </select>
        )}

        {canShare && (
          <>
            <button
              type="button"
              onClick={onShare}
              disabled={busy}
              className="text-sm px-3 py-1.5 ui-btn-ghost border ui-divider rounded-md"
              title={t("articles.bulk.shareTooltip")}
            >
              {t("articles.bulk.share")}
            </button>
            <button
              type="button"
              onClick={onUnshare}
              disabled={busy}
              className="text-sm px-3 py-1.5 ui-btn-ghost border ui-divider rounded-md"
            >
              {t("articles.bulk.unshare")}
            </button>
          </>
        )}

        {canEditFields && (
          <button
            type="button"
            onClick={onEditFields}
            disabled={busy}
            className="text-sm px-3 py-1.5 ui-btn-ghost border ui-divider rounded-md"
          >
            {t("articles.bulk.editFields")}
          </button>
        )}

        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="text-sm px-3 py-1.5 ui-btn-danger rounded-md"
        >
          {t("articles.bulk.delete")}
        </button>

        <button
          type="button"
          onClick={onClear}
          disabled={busy}
          className="text-sm px-3 py-1.5 ui-btn-ghost border ui-divider rounded-md"
        >
          {t("articles.bulk.clear")}
        </button>
      </div>
    </div>
  );
}
