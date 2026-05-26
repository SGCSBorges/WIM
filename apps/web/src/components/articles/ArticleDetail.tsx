import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { useI18n } from "../../i18n/i18n";
import {
  articlesAPI,
  attachmentsAPI,
  notesAPI,
  profileAPI,
  warrantiesAPI,
  type ArticleNote,
} from "../../services/api";
import type { ClaimStatus, FetchedArticle } from "../../types";

const CLAIM_STATUSES: ClaimStatus[] = [
  "NONE",
  "OPEN",
  "APPROVED",
  "REJECTED",
  "RESOLVED",
];
import { getErrorMessage } from "../../utils/error";
import { formatMoney } from "../../utils/money";
import { currentValue } from "../../utils/depreciation";
import { downloadBlob } from "../../utils/csv";
import { ErrorBanner } from "../common/States";
import { Skeleton } from "../common/Skeleton";
import { useToast } from "../common/Toast";
import ArticleThumb from "./ArticleThumb";

type Attachment = {
  attachmentId: number;
  fileName: string;
  fileUrl: string;
  thumbUrl?: string | null;
  mimeType?: string;
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

  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const uploadPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingPhoto(true);
    try {
      for (const file of Array.from(files)) {
        await attachmentsAPI.uploadFile(file, "OTHER", { articleId });
      }
      const atts = await attachmentsAPI.getAll({ articleId }).catch(() => []);
      setAttachments(atts as Attachment[]);
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const setPrimaryPhoto = async (url: string) => {
    try {
      const updated = await articlesAPI.setPrimaryImage(articleId, url);
      setArticle((prev) =>
        prev ? { ...prev, productImageUrl: updated.productImageUrl } : prev
      );
      toast.show(t("gallery.primarySet"), { kind: "success" });
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    }
  };

  const deletePhoto = async (att: Attachment) => {
    try {
      await attachmentsAPI.deleteAttachment(att.attachmentId, {
        removeFile: true,
      });
      setAttachments((prev) =>
        prev.filter((a) => a.attachmentId !== att.attachmentId)
      );
      // If the primary image pointed at the deleted file, clear it.
      if (article?.productImageUrl === att.fileUrl) {
        const updated = await articlesAPI.setPrimaryImage(articleId, null);
        setArticle((prev) =>
          prev ? { ...prev, productImageUrl: updated.productImageUrl } : prev
        );
      }
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    }
  };

  const photos = attachments.filter((a) => a.mimeType?.startsWith("image/"));

  const [claimStatus, setClaimStatus] = useState<ClaimStatus>("NONE");
  const [claimNote, setClaimNote] = useState("");
  const [savingClaim, setSavingClaim] = useState(false);

  // Mirror the warranty's claim fields into local editable state on load.
  useEffect(() => {
    setClaimStatus(article?.garantie?.claimStatus ?? "NONE");
    setClaimNote(article?.garantie?.claimNote ?? "");
  }, [article?.garantie?.claimStatus, article?.garantie?.claimNote]);

  const saveClaim = async () => {
    const garantieId = article?.garantie?.garantieId;
    if (!garantieId) return;
    setSavingClaim(true);
    try {
      const updated = await warrantiesAPI.updateClaim(garantieId, {
        status: claimStatus,
        note: claimNote.trim() || null,
      });
      setArticle((prev) =>
        prev && prev.garantie
          ? {
              ...prev,
              garantie: {
                ...prev.garantie,
                claimStatus: updated.claimStatus,
                claimNote: updated.claimNote,
                claimUpdatedAt: updated.claimUpdatedAt,
              },
            }
          : prev
      );
      toast.show(t("claim.saved"), { kind: "success" });
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setSavingClaim(false);
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
            {(() => {
              const current = currentValue(
                article.purchasePrice,
                article.depreciationRate,
                article.garantie?.garantieDateAchat ?? article.createdAt
              );
              if (current == null) return null;
              return (
                <span>
                  <span className="ui-text-muted">
                    {t("articleDetail.currentValue")}:{" "}
                  </span>
                  {formatMoney(current, currency, language)}
                  <span className="ui-text-muted">
                    {" "}
                    ({Number(article.depreciationRate)}%/
                    {t("articleDetail.perYear")})
                  </span>
                </span>
              );
            })()}
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

          <div className="pt-3 mt-2 border-t ui-divider space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="claim-status" className="text-sm font-medium">
                {t("claim.title")}
              </label>
              <select
                id="claim-status"
                value={claimStatus}
                onChange={(e) => setClaimStatus(e.target.value as ClaimStatus)}
                className="ui-select px-2 py-1 rounded-md text-sm"
              >
                {CLAIM_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`claim.status.${s}`)}
                  </option>
                ))}
              </select>
              {article.garantie.claimUpdatedAt && (
                <span className="text-xs ui-text-muted">
                  {safeDate(article.garantie.claimUpdatedAt)}
                </span>
              )}
            </div>
            {claimStatus !== "NONE" && (
              <input
                type="text"
                value={claimNote}
                onChange={(e) => setClaimNote(e.target.value)}
                placeholder={t("claim.notePlaceholder")}
                maxLength={2000}
                className="ui-input w-full px-3 py-2 rounded-md text-sm"
              />
            )}
            <button
              type="button"
              onClick={saveClaim}
              disabled={savingClaim}
              className="ui-btn-ghost border ui-divider px-3 py-1.5 rounded-md text-sm"
            >
              {savingClaim ? t("common.loading") : t("claim.save")}
            </button>
          </div>
        </div>
      )}

      <div className="ui-card rounded-lg p-6 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold ui-title">{t("gallery.title")}</h2>
          <label className="ui-btn-ghost px-3 py-1.5 rounded-md border ui-divider text-sm cursor-pointer">
            {uploadingPhoto ? t("common.loading") : t("gallery.add")}
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={uploadingPhoto}
              onChange={(e) => {
                void uploadPhotos(e.target.files);
                e.target.value = "";
              }}
              className="sr-only"
            />
          </label>
        </div>
        {photos.length === 0 ? (
          <p className="text-sm ui-text-muted">{t("gallery.empty")}</p>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {photos.map((att) => {
              const isPrimary = article.productImageUrl === att.fileUrl;
              return (
                <li
                  key={att.attachmentId}
                  className="space-y-1 border ui-divider rounded-md p-2"
                >
                  <a href={att.fileUrl} target="_blank" rel="noreferrer">
                    <img
                      src={att.thumbUrl || att.fileUrl}
                      alt={att.fileName}
                      loading="lazy"
                      className="w-full h-24 object-cover rounded"
                    />
                  </a>
                  <div className="flex items-center justify-between gap-1 text-xs">
                    {isPrimary ? (
                      <span className="ui-badge-info px-1.5 py-0.5 rounded">
                        {t("gallery.primary")}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPrimaryPhoto(att.fileUrl)}
                        className="ui-action-primary hover:underline"
                      >
                        {t("gallery.setPrimary")}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => deletePhoto(att)}
                      className="ui-action-danger"
                      aria-label={`${t("common.delete")} ${att.fileName}`}
                    >
                      {t("common.delete")}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

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
