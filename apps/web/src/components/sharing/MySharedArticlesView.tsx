/**
 * "Articles I've shared publicly" view — owner-side. Reads
 * `articlesAPI.getMySharedPublic`, lets the owner flip the public-share
 * flag off per row (the per-user invites surface lives in `<SharesList>`).
 */
import { useCallback, useEffect, useState } from "react";
import { articlesAPI } from "../../services/api";
import type { FetchedArticle } from "../../types";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";
import { ErrorBanner } from "../common/States";
import { Skeleton } from "../common/Skeleton";
import { useToast } from "../common/Toast";
import ArticleThumb from "../articles/ArticleThumb";

/**
 * Single source of truth for "articles I'm currently sharing publicly."
 *
 * Reuses the same backend endpoint that powers the Profile page's
 * "Articles you've shared publicly" panel; the Sharing page is the
 * more discoverable home for outgoing shares so this component lives
 * here too.
 */
export default function MySharedArticlesView() {
  const { t } = useI18n();
  const toast = useToast();
  const [items, setItems] = useState<FetchedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await articlesAPI.getMySharedPublic();
      setItems(rows);
    } catch (e) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const unshare = async (articleId: number) => {
    setBusy(articleId);
    try {
      await articlesAPI.setSharedWithPowerUsers(articleId, false);
      toast.show(t("articles.share.state.unshared"), { kind: "success" });
      await fetchAll();
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("mySharedArticles.title")}</h1>
          <p className="text-sm ui-text-muted">
            {t("mySharedArticles.subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={fetchAll}
          disabled={loading}
          className="ui-btn-ghost px-3 py-2 rounded border ui-divider"
        >
          {t("common.refresh")}
        </button>
      </div>

      {error && (
        <ErrorBanner
          message={error}
          onRetry={fetchAll}
          retryLabel={t("common.retry")}
        />
      )}

      {loading ? (
        <div className="ui-card rounded-lg p-4 space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={56} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="ui-card rounded-lg p-6 text-center">
          <p className="text-sm ui-text-muted">{t("mySharedArticles.empty")}</p>
        </div>
      ) : (
        <div className="ui-card rounded-lg">
          <ul className="divide-y ui-divider">
            {items.map((a) => (
              <li key={a.articleId} className="flex items-center gap-3 p-4">
                <ArticleThumb
                  src={a.productImageUrl}
                  alt={a.articleNom}
                  size={48}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{a.articleNom}</span>
                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded ui-badge-info">
                      🌐 {t("articles.share.state.publicLabel")}
                    </span>
                  </div>
                  <div className="text-xs ui-text-muted truncate">
                    {a.articleModele}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => unshare(a.articleId)}
                  disabled={busy === a.articleId}
                  className="ui-btn-ghost px-3 py-1.5 text-sm rounded border ui-divider shrink-0"
                >
                  {busy === a.articleId
                    ? t("common.loading")
                    : t("articles.share.unshare")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
