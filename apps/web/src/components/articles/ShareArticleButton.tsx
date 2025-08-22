import React, { useState } from "react";
import { API_BASE_URL } from "../../services/api";
import { useI18n } from "../../i18n/i18n";

type Props = {
  articleId: number;
  disabled?: boolean;
  onShared?: () => void;
};

export default function ShareArticleButton({
  articleId,
  disabled,
  onShared,
}: Props) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);

  const share = async () => {
    const raw = prompt("Target user ID to share with:");
    if (!raw) return;
    const targetUserId = Number(raw);
    if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
      alert("Invalid user id");
      return;
    }

    const token = localStorage.getItem("token");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/articles/${articleId}/share`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({ targetUserId }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Share failed (${res.status})`);
      }

      alert("Shared");
      onShared?.();
    } catch (e: any) {
      alert(e?.message || "Share failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      disabled={disabled || loading}
      className="ui-btn-ghost px-3 py-1.5 rounded border ui-divider"
      title="Share this article with another POWER_USER by user id"
    >
      {loading ? t("common.loading") : "Share"}
    </button>
  );
}
