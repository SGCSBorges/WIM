import React, { useCallback, useEffect, useState } from "react";
import { sharedAPI, SharedArticleRow } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";

export default function SharedArticlesView() {
  const { t } = useI18n();
  const [rows, setRows] = useState<SharedArticleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await sharedAPI.getSharedArticles();
      setRows(data);
    } catch (e: unknown) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  if (loading) {
    return (
      <div className="ui-card rounded-lg p-6">
        <div className="text-sm ui-text-muted">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("shared.title")}</h1>
          <p className="text-sm ui-text-muted">{t("shared.subtitle")}</p>
        </div>
        <button
          className="ui-btn-ghost px-3 py-2 rounded border ui-divider"
          onClick={fetchRows}
        >
          {t("common.refresh")}
        </button>
      </div>

      {error && (
        <div className="border ui-alert-error rounded-lg p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="ui-card rounded-lg p-6">
          <p className="text-sm ui-text-muted">{t("shared.none")}</p>
        </div>
      ) : (
        <div className="ui-card rounded-lg">
          <div className="divide-y">
            {rows.map((r) => (
              <div key={r.rowId} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {r.article.articleNom} — {r.article.articleModele}
                    </div>
                    <div className="text-xs ui-text-muted">
                      {t("shared.owner")}: {r.owner.email}
                    </div>
                    {r.article.articleDescription && (
                      <div className="text-sm mt-2 ui-text-muted">
                        {r.article.articleDescription}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      className="ui-btn-ghost px-3 py-1.5 rounded border ui-divider"
                      disabled
                      title={t("shared.subtitle")}
                    >
                      {t("shared.action.edit")}
                    </button>
                    <button
                      className="ui-btn-ghost px-3 py-1.5 rounded border ui-divider"
                      disabled
                      title={t("shared.subtitle")}
                    >
                      {t("shared.action.unshare")}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
