import { useI18n } from "../../i18n/i18n";

interface BulkActionBarProps {
  selectedCount: number;
  canShare: boolean;
  busy: boolean;
  onClear: () => void;
  onDelete: () => void;
  onShare: () => void;
  onUnshare: () => void;
}

export default function BulkActionBar({
  selectedCount,
  canShare,
  busy,
  onClear,
  onDelete,
  onShare,
  onUnshare,
}: BulkActionBarProps) {
  const { t } = useI18n();

  if (selectedCount === 0) return null;

  return (
    <div
      role="region"
      aria-label={t("articles.bulk.selectionLabel")}
      className="ui-card rounded-lg shadow p-3 flex flex-wrap items-center gap-3 sticky top-2 z-10"
    >
      <span className="font-medium text-sm">
        {t("articles.bulk.selected").replace("{count}", String(selectedCount))}
      </span>

      <div className="flex flex-wrap items-center gap-2 ml-auto">
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
