/**
 * "Articles I've shared publicly" view — owner-side. Reads
 * `articlesAPI.getMySharedPublic`, lets the owner flip the public-share
 * flag off per row (the per-user invites surface lives in `<SharesList>`).
 */
import { useCallback, useEffect, useState } from "react";
import { Globe, RotateCw, EyeOff } from "lucide-react";
import { articlesAPI } from "../../services/api";
import type { FetchedArticle } from "../../types";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";
import { ErrorBanner, EmptyState } from "../common/States";
import { Skeleton } from "../common/Skeleton";
import { useToast } from "../common/Toast";
import ArticleThumb from "../articles/ArticleThumb";
import { Section, Button, Badge } from "../ui";

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
    <Section
      icon={<Globe className="h-5 w-5" />}
      title={t("mySharedArticles.title")}
      description={t("mySharedArticles.subtitle")}
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
    >
      {error && (
        <ErrorBanner
          message={error}
          onRetry={fetchAll}
          retryLabel={t("common.retry")}
          className="mb-4"
        />
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={56} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Globe className="h-6 w-6" />}
          title={t("mySharedArticles.empty")}
        />
      ) : (
        <ul className="divide-y ui-divider">
          {items.map((a) => (
            <li
              key={a.articleId}
              className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
            >
              <ArticleThumb
                src={a.productImageUrl}
                alt={a.articleNom}
                size={48}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium ui-title">
                    {a.articleNom}
                  </span>
                  <Badge tone="info" icon={<Globe className="h-3 w-3" />}>
                    {t("articles.share.state.publicLabel")}
                  </Badge>
                </div>
                <div className="truncate text-xs ui-text-muted">
                  {a.articleModele}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => unshare(a.articleId)}
                loading={busy === a.articleId}
                leftIcon={<EyeOff className="h-4 w-4" />}
              >
                {t("articles.share.unshare")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
