/**
 * Recipient-side "Shared with me" view — articles other users have shared
 * with the current account. Read-only for the public-flag flavor;
 * editable when the per-user share grants WRITE (`<EditDraft>` POSTs back
 * via `sharedAPI.updateArticle`).
 */
import { useCallback, useEffect, useState } from "react";
import { sharedAPI, SharedArticleRow } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";
import ArticleThumb from "../articles/ArticleThumb";
import { ErrorBanner } from "../common/States";
import { Skeleton } from "../common/Skeleton";

type EditDraft = {
  articleNom: string;
  articleModele: string;
  articleDescription: string;
  productImageUrl: string;
};

function draftFrom(row: SharedArticleRow): EditDraft {
  return {
    articleNom: row.article.articleNom,
    articleModele: row.article.articleModele,
    articleDescription: row.article.articleDescription ?? "",
    productImageUrl: row.article.productImageUrl ?? "",
  };
}

export default function SharedArticlesView() {
  const { t } = useI18n();
  const [rows, setRows] = useState<SharedArticleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingArticleId, setEditingArticleId] = useState<number | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [savingArticleId, setSavingArticleId] = useState<number | null>(null);

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

  const startEdit = (row: SharedArticleRow) => {
    setEditingArticleId(row.article.articleId);
    setDraft(draftFrom(row));
  };

  const cancelEdit = () => {
    setEditingArticleId(null);
    setDraft(null);
  };

  const saveEdit = async () => {
    if (editingArticleId === null || !draft) return;
    setSavingArticleId(editingArticleId);
    setError(null);
    try {
      await sharedAPI.updateSharedArticle(editingArticleId, {
        articleNom: draft.articleNom.trim(),
        articleModele: draft.articleModele.trim(),
        articleDescription: draft.articleDescription.trim() || null,
        productImageUrl: draft.productImageUrl.trim() || null,
      });
      cancelEdit();
      await fetchRows();
    } catch (e) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setSavingArticleId(null);
    }
  };

  if (loading) {
    return (
      <div className="ui-card rounded-lg p-6 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height={56} />
        ))}
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
        <ErrorBanner
          message={error}
          onRetry={fetchRows}
          retryLabel={t("common.retry")}
        />
      )}

      {rows.length === 0 ? (
        <div className="ui-card rounded-lg p-6">
          <p className="text-sm ui-text-muted">{t("shared.none")}</p>
        </div>
      ) : (
        <div className="ui-card rounded-lg">
          <div className="divide-y">
            {rows.map((r) => {
              const isEditing = editingArticleId === r.article.articleId;
              const canEdit = r.permission === "WRITE";
              return (
                <div key={r.rowId} className="p-4">
                  {!isEditing ? (
                    <div className="flex items-start gap-4">
                      <ArticleThumb
                        src={r.article.productImageUrl}
                        alt={r.article.articleNom}
                        size={56}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium truncate">
                            {r.article.articleNom} — {r.article.articleModele}
                          </span>
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${
                              r.permission === "WRITE"
                                ? "ui-badge-warning"
                                : "ui-badge-success"
                            }`}
                            title={t(
                              r.permission === "WRITE"
                                ? "shared.permission.write.tooltip"
                                : "shared.permission.read.tooltip"
                            )}
                          >
                            {r.permission}
                          </span>
                          <span
                            className="px-2 py-0.5 text-[10px] font-medium uppercase rounded ui-badge"
                            title={t(
                              r.source === "user"
                                ? "shared.source.user.tooltip"
                                : "shared.source.global.tooltip"
                            )}
                          >
                            {t(
                              r.source === "user"
                                ? "shared.source.user"
                                : "shared.source.global"
                            )}
                          </span>
                        </div>
                        <div className="text-xs ui-text-muted mt-1">
                          {t("shared.owner")}: {r.owner.email}
                        </div>
                        {r.article.articleDescription && (
                          <div className="text-sm mt-2 ui-text-muted">
                            {r.article.articleDescription}
                          </div>
                        )}
                      </div>

                      {canEdit && (
                        <button
                          className="ui-btn-ghost px-3 py-1.5 rounded border ui-divider shrink-0"
                          onClick={() => startEdit(r)}
                        >
                          {t("common.edit")}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <ArticleThumb
                          src={draft?.productImageUrl || null}
                          alt={r.article.articleNom}
                          size={56}
                        />
                        <span className="text-xs ui-text-muted">
                          {t("shared.editing.note")}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          className="ui-input px-3 py-2 rounded"
                          value={draft?.articleNom ?? ""}
                          onChange={(e) =>
                            setDraft((d) =>
                              d ? { ...d, articleNom: e.target.value } : d
                            )
                          }
                          placeholder={t("articleForm.name")}
                        />
                        <input
                          className="ui-input px-3 py-2 rounded"
                          value={draft?.articleModele ?? ""}
                          onChange={(e) =>
                            setDraft((d) =>
                              d ? { ...d, articleModele: e.target.value } : d
                            )
                          }
                          placeholder={t("articleForm.model")}
                        />
                      </div>
                      <input
                        className="w-full ui-input px-3 py-2 rounded"
                        value={draft?.productImageUrl ?? ""}
                        onChange={(e) =>
                          setDraft((d) =>
                            d ? { ...d, productImageUrl: e.target.value } : d
                          )
                        }
                        placeholder={t("articleForm.placeholder.imageUrl")}
                      />
                      <textarea
                        className="w-full ui-input px-3 py-2 rounded"
                        rows={2}
                        value={draft?.articleDescription ?? ""}
                        onChange={(e) =>
                          setDraft((d) =>
                            d ? { ...d, articleDescription: e.target.value } : d
                          )
                        }
                        placeholder={t("articleForm.description")}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={saveEdit}
                          disabled={savingArticleId === r.article.articleId}
                          className="ui-btn-primary px-3 py-1.5 text-sm rounded"
                        >
                          {savingArticleId === r.article.articleId
                            ? t("common.loading")
                            : t("common.save")}
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={savingArticleId === r.article.articleId}
                          className="ui-btn-ghost px-3 py-1.5 text-sm rounded border ui-divider"
                        >
                          {t("common.cancel")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
