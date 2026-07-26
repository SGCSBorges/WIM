/**
 * Recipient-side "Shared with me" view — articles other users have shared
 * with the current account. Read-only for the public-flag flavor;
 * editable when the per-user share grants WRITE (`<EditDraft>` POSTs back
 * via `sharedAPI.updateArticle`).
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  Inbox,
  RotateCw,
  Pencil,
  Check,
  ArrowRightLeft,
  MessagesSquare,
  Eye,
} from "lucide-react";
import { sharedAPI, SharedArticleRow } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { useFeature } from "../../features/features";
import { getErrorMessage } from "../../utils/error";
import ArticleThumb from "../articles/ArticleThumb";
import { ErrorBanner, EmptyState } from "../common/States";
import { Skeleton } from "../common/Skeleton";
import { Section, Button, Input, Textarea, Badge } from "../ui";
import TransferDialog from "../articles/TransferDialog";
import MessageComposeDialog from "../messages/MessageComposeDialog";
import SharedArticleHeroDialog from "./SharedArticleHeroDialog";
import { useToast } from "../common/Toast";

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
  const toast = useToast();
  const navigate = useNavigate();
  const canMessage = useFeature("messaging");
  const [rows, setRows] = useState<SharedArticleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pullTransferRow, setPullTransferRow] =
    useState<SharedArticleRow | null>(null);
  const [messageRow, setMessageRow] = useState<SharedArticleRow | null>(null);
  const [viewRow, setViewRow] = useState<SharedArticleRow | null>(null);

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

  return (
    <Section
      icon={<Inbox className="h-5 w-5" />}
      title={t("shared.title")}
      description={t("shared.subtitle")}
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={fetchRows}
          disabled={loading}
          leftIcon={
            <RotateCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          }
        >
          {t("common.refresh")}
        </Button>
      }
    >
      {error && (
        <ErrorBanner
          message={error}
          onRetry={fetchRows}
          retryLabel={t("common.retry")}
          className="mb-4"
        />
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={64} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-6 w-6" />}
          title={t("shared.none")}
        />
      ) : (
        <ul className="divide-y ui-divider">
          {rows.map((r) => {
            const isEditing = editingArticleId === r.article.articleId;
            const canEdit = r.permission === "WRITE";
            return (
              <li key={r.rowId} className="py-3 first:pt-0 last:pb-0">
                {!isEditing ? (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                    <div className="flex min-w-0 flex-1 items-start gap-4">
                      <ArticleThumb
                        src={r.article.productImageUrl}
                        alt={r.article.articleNom}
                        size={56}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="truncate font-medium ui-title"
                            title={`${r.article.articleNom}${r.article.articleModele ? ` — ${r.article.articleModele}` : ""}`}
                          >
                            {r.article.articleNom} — {r.article.articleModele}
                          </span>
                          <Badge
                            tone={
                              r.permission === "WRITE" ? "warning" : "success"
                            }
                            title={t(
                              r.permission === "WRITE"
                                ? "shared.permission.write.tooltip"
                                : "shared.permission.read.tooltip"
                            )}
                          >
                            {t(
                              r.permission === "WRITE"
                                ? "shared.permission.write"
                                : "shared.permission.read"
                            )}
                          </Badge>
                          <Badge
                            tone="neutral"
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
                          </Badge>
                        </div>
                        <div className="mt-1 break-words text-xs ui-text-muted">
                          {t("shared.owner")}: {r.owner.email}
                        </div>
                        {r.article.articleDescription && (
                          <div className="mt-2 break-words text-sm ui-text-muted">
                            {r.article.articleDescription}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setViewRow(r)}
                        leftIcon={<Eye className="h-4 w-4" />}
                      >
                        {t("shared.view")}
                      </Button>
                      {canEdit && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEdit(r)}
                          leftIcon={<Pencil className="h-4 w-4" />}
                        >
                          {t("common.edit")}
                        </Button>
                      )}
                      {canMessage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setMessageRow(r)}
                          leftIcon={<MessagesSquare className="h-4 w-4" />}
                          title={t("messages.messageOwner")}
                        >
                          {t("messages.messageOwner")}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPullTransferRow(r)}
                        leftIcon={<ArrowRightLeft className="h-4 w-4" />}
                        title={t("transfer.pull")}
                      >
                        {t("transfer.pull")}
                      </Button>
                    </div>
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
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Input
                        value={draft?.articleNom ?? ""}
                        onChange={(e) =>
                          setDraft((d) =>
                            d ? { ...d, articleNom: e.target.value } : d
                          )
                        }
                        placeholder={t("articleForm.name")}
                        aria-label={t("articleForm.name")}
                      />
                      <Input
                        value={draft?.articleModele ?? ""}
                        onChange={(e) =>
                          setDraft((d) =>
                            d ? { ...d, articleModele: e.target.value } : d
                          )
                        }
                        placeholder={t("articleForm.model")}
                        aria-label={t("articleForm.model")}
                      />
                    </div>
                    <Input
                      value={draft?.productImageUrl ?? ""}
                      onChange={(e) =>
                        setDraft((d) =>
                          d ? { ...d, productImageUrl: e.target.value } : d
                        )
                      }
                      placeholder={t("articleForm.placeholder.imageUrl")}
                      aria-label={t("articleForm.placeholder.imageUrl")}
                    />
                    <Textarea
                      rows={2}
                      value={draft?.articleDescription ?? ""}
                      onChange={(e) =>
                        setDraft((d) =>
                          d ? { ...d, articleDescription: e.target.value } : d
                        )
                      }
                      placeholder={t("articleForm.description")}
                      aria-label={t("articleForm.description")}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={saveEdit}
                        loading={savingArticleId === r.article.articleId}
                        leftIcon={<Check className="h-4 w-4" />}
                      >
                        {t("common.save")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={cancelEdit}
                        disabled={savingArticleId === r.article.articleId}
                      >
                        {t("common.cancel")}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pullTransferRow && (
        <TransferDialog
          articleId={pullTransferRow.article.articleId}
          articleName={pullTransferRow.article.articleNom}
          direction="pull"
          onDone={() => {
            setPullTransferRow(null);
            toast.show(t("transfer.requested"), { kind: "success" });
          }}
          onClose={() => setPullTransferRow(null)}
        />
      )}

      {messageRow && (
        <MessageComposeDialog
          articleId={messageRow.article.articleId}
          articleName={messageRow.article.articleNom}
          articleModel={messageRow.article.articleModele}
          productImageUrl={messageRow.article.productImageUrl}
          ownerEmail={messageRow.owner.email}
          onClose={() => setMessageRow(null)}
          onSent={(threadId) => {
            setMessageRow(null);
            toast.show(t("messages.sent"), { kind: "success" });
            navigate(`/messages?thread=${threadId}`);
          }}
        />
      )}

      {viewRow && (
        <SharedArticleHeroDialog
          row={viewRow}
          onClose={() => setViewRow(null)}
        />
      )}
    </Section>
  );
}
