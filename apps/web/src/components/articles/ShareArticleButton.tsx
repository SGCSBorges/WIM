import { useState } from "react";
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
        className="ui-btn-ghost px-3 py-1.5 rounded border ui-divider"
        title={t("articles.share.tooltip")}
      >
        {busy ? t("common.loading") : t("articles.share.button")}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
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
        className="text-xs ui-action-danger"
      >
        {busy ? t("common.loading") : t("articles.share.unshare")}
      </button>
    </span>
  );
}
