import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { useI18n } from "../../i18n/i18n";
import {
  articlesAPI,
  attachmentsAPI,
  notesAPI,
  profileAPI,
  type ArticleNote,
} from "../../services/api";
import type { FetchedArticle } from "../../types";
import { getErrorMessage } from "../../utils/error";
import { formatMoney } from "../../utils/money";
import { downloadBlob } from "../../utils/csv";
import { ErrorBanner } from "../common/States";
import { Skeleton } from "../common/Skeleton";
import { useToast } from "../common/Toast";
import ArticleThumb from "./ArticleThumb";

type Attachment = {
  attachmentId: number;
  fileName: string;
  fileUrl: string;
  type: string;
};

function safeDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = parseISO(iso);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "dd MMM yyyy");
}

export default function ArticleDetail() {
  const { t, language } = useI18n();
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const articleId = Number(id);

  const [article, setArticle] = useState<FetchedArticle | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [notes, setNotes] = useState<ArticleNote[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, atts, ns] = await Promise.all([
        articlesAPI.getById(articleId),
        attachmentsAPI.getAll({ articleId }).catch(() => []),
        notesAPI.list(articleId).catch(() => []),
      ]);
      setArticle(a);
      setAttachments(atts as Attachment[]);
      setNotes(ns);
    } catch (e) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setLoading(false);
    }
  }, [articleId, t]);

  useEffect(() => {
    load();
    profileAPI
      .getMe()
      .then((me) => me.currency && setCurrency(me.currency))
      .catch(() => {});
  }, [load]);

  const addNote = async () => {
    const content = noteInput.trim();
    if (!content) return;
    setSavingNote(true);
    try {
      const note = await notesAPI.create(articleId, content);
      setNotes((prev) => [note, ...prev]);
      setNoteInput("");
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setSavingNote(false);
    }
  };

  const removeNote = async (noteId: number) => {
    try {
      await notesAPI.remove(articleId, noteId);
      setNotes((prev) => prev.filter((n) => n.noteId !== noteId));
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4" role="status" aria-busy="true">
        <Skeleton height={28} width="40%" />
        <Skeleton height={160} />
      </div>
    );
  }

  if (error || !article) {
    return (
      <ErrorBanner
        message={error ?? t("common.errorOccurred")}
        onRetry={load}
        retryLabel={t("common.retry")}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link to="/articles" className="text-sm ui-action-primary">
          ← {t("articleDetail.back")}
        </Link>
        <button
          onClick={async () => {
            try {
              downloadBlob(
                `article-${articleId}-claim.pdf`,
                await articlesAPI.claimPdf(articleId)
              );
            } catch (e) {
              toast.show(getErrorMessage(e, t("common.errorOccurred")), {
                kind: "error",
              });
            }
          }}
          className="ui-btn-ghost px-3 py-1.5 rounded-md border ui-divider text-sm"
        >
          {t("articleDetail.downloadPdf")}
        </button>
      </div>

      <div className="ui-card rounded-lg p-6 flex flex-col sm:flex-row gap-6">
        <ArticleThumb
          src={article.productImageUrl}
          alt={article.articleNom}
          size={96}
        />
        <div className="flex-1 space-y-2">
          <h1 className="text-2xl font-bold ui-title">{article.articleNom}</h1>
          <p className="ui-text-muted">{article.articleModele}</p>
          {article.articleDescription && (
            <p className="text-sm">{article.articleDescription}</p>
          )}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm pt-2">
            <span>
              <span className="ui-text-muted">
                {t("articleDetail.value")}:{" "}
              </span>
              {article.purchasePrice != null
                ? formatMoney(article.purchasePrice, currency, language)
                : "—"}
            </span>
            <span>
              <span className="ui-text-muted">
                {t("articleDetail.locations")}:{" "}
              </span>
              {article.locations && article.locations.length > 0
                ? article.locations
                    .map((l) => l.location?.name)
                    .filter(Boolean)
                    .join(", ")
                : "—"}
            </span>
          </div>
          {article.tags && article.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {article.tags.map((tg) => (
                <span
                  key={tg.tagId}
                  className="px-1.5 py-0.5 text-[10px] rounded-full ui-badge-info"
                >
                  {tg.tag?.name ?? `#${tg.tagId}`}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {article.garantie && (
        <div className="ui-card rounded-lg p-6 space-y-1">
          <h2 className="font-semibold ui-title">
            {t("articleDetail.warranty")}
          </h2>
          <p className="text-sm">{article.garantie.garantieNom}</p>
          <p className="text-sm ui-text-muted">
            {t("articleDetail.warrantyPurchased")}:{" "}
            {safeDate(article.garantie.garantieDateAchat)} —{" "}
            {t("articleDetail.warrantyEnds")}:{" "}
            {safeDate(article.garantie.garantieFin)}
          </p>
        </div>
      )}

      <div className="ui-card rounded-lg p-6 space-y-3">
        <h2 className="font-semibold ui-title">
          {t("articleDetail.attachments")}
        </h2>
        {attachments.length === 0 ? (
          <p className="text-sm ui-text-muted">
            {t("articleDetail.noAttachments")}
          </p>
        ) : (
          <ul className="text-sm space-y-1">
            {attachments.map((att) => (
              <li key={att.attachmentId}>
                <a
                  className="ui-action-primary hover:underline"
                  href={att.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {att.fileName}
                </a>{" "}
                <span className="ui-text-muted">({att.type})</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="ui-card rounded-lg p-6 space-y-3">
        <h2 className="font-semibold ui-title">{t("notes.title")}</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addNote();
              }
            }}
            placeholder={t("notes.placeholder")}
            className="ui-input flex-1 px-3 py-2 rounded-md"
            maxLength={2000}
          />
          <button
            onClick={addNote}
            disabled={savingNote || !noteInput.trim()}
            className="ui-btn-primary px-4 py-2 rounded-md text-sm"
          >
            {t("notes.add")}
          </button>
        </div>
        {notes.length === 0 ? (
          <p className="text-sm ui-text-muted">{t("notes.empty")}</p>
        ) : (
          <ul className="divide-y ui-divider">
            {notes.map((n) => (
              <li
                key={n.noteId}
                className="py-2 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm break-words">{n.content}</p>
                  <p className="text-xs ui-text-muted">
                    {safeDate(n.createdAt)}
                  </p>
                </div>
                <button
                  onClick={() => removeNote(n.noteId)}
                  className="text-xs ui-action-danger shrink-0"
                >
                  {t("common.delete")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
