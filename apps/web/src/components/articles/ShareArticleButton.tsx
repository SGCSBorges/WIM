/**
 * Per-row "share publicly" toggle on articles. POWER_USER only; clicking
 * flips `Article.sharedWithPowerUsers` — visible to every POWER_USER (the
 * simpler of the two sharing flavors; the per-user `InventoryShare` path
 * is handled by `<ShareForm>` / `<AcceptInviteForm>`).
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { articlesAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";
import { useToast } from "../common/Toast";

type Props = {
  articleId: number;
  sharedWithPowerUsers: boolean;
  isPowerUser: boolean;
  disabled?: boolean;
  onChanged?: () => void;
};

/**
 * State-aware share toggle.
 *
 * - Hidden entirely for non-POWER_USER (the backend rejects them with 403,
 *   so showing a button that's guaranteed to fail is worse than no button).
 * - Renders one of two visual states driven by `sharedWithPowerUsers`:
 *   not shared → ghost "Share publicly" button;
 *   shared     → success-styled "🌐 Shared" + inline "Unshare".
 * - Success/error feedback routes through the project toast system.
 */
export default function ShareArticleButton({
  articleId,
  sharedWithPowerUsers,
  isPowerUser,
  disabled,
  onChanged,
}: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (!isPowerUser) return null;

  const toggle = async (next: boolean) => {
    setBusy(true);
    try {
      await articlesAPI.setSharedWithPowerUsers(articleId, next);
      toast.show(
        next
          ? t("articles.share.state.public")
          : t("articles.share.state.unshared"),
        { kind: "success" }
      );
      onChanged?.();
    } catch (e: unknown) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  if (!sharedWithPowerUsers) {
    return (
      <button
        type="button"
        onClick={() => toggle(true)}
        disabled={disabled || busy}
        className="ui-btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 rounded border ui-divider"
        title={t("articles.share.tooltip")}
      >
        {busy && (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        )}
        {t("articles.share.button")}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2" role="status">
      <span
        className="px-2 py-1 rounded text-xs font-medium ui-badge-success"
        title={t("articles.shares.sharedStatus")}
      >
        🌐 {t("articles.share.state.publicLabel")}
      </span>
      <button
        type="button"
        onClick={() => toggle(false)}
        disabled={disabled || busy}
        aria-label={t("articles.share.unshare")}
        className="inline-flex items-center gap-1 text-xs ui-action-danger"
      >
        {busy && (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        )}
        {t("articles.share.unshare")}
      </button>
    </span>
  );
}
