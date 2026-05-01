import React, { useState } from "react";
import { articlesAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";

type Props = {
  articleId: number;
  disabled?: boolean;
  onShared?: () => void;
};

export default function ShareArticleButton({ articleId, disabled, onShared }: Props) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const share = async () => {
    setLoading(true);
    setError(null);
    try {
      await articlesAPI.setSharedWithPowerUsers(articleId, true);
      onShared?.();
    } catch (e: unknown) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setLoading(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={share}
        disabled={disabled || loading}
        className="ui-btn-ghost px-3 py-1.5 rounded border ui-divider"
        title={t("articles.share.tooltip")}
      >
        {loading ? t("common.loading") : t("articles.share.button")}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
