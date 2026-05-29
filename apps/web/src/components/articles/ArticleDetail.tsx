import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { useI18n } from "../../i18n/i18n";
import {
  alertsAPI,
  articlesAPI,
  attachmentsAPI,
  notesAPI,
  profileAPI,
  warrantiesAPI,
  type ArticleNote,
} from "../../services/api";
import type { ArticleNoteKind, ClaimStatus, FetchedArticle } from "../../types";
import { ARTICLE_NOTE_KINDS } from "@wim/types";

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
  createdAt?: string;
};

type TimelineEntry = {
  key: string;
  date: string;
  kind: "note" | "attachment" | "claim" | "alert";
  title: string;
  body?: string;
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
  const [noteKind, setNoteKind] = useState<ArticleNoteKind>("OTHER");
  const [savingNote, setSavingNote] = useState(false);
  const [noteFilter, setNoteFilter] = useState<ArticleNoteKind | "ALL">("ALL");
  // When set, the row of that noteId is editable.
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [editingKind, setEditingKind] = useState<ArticleNoteKind>("OTHER");
  // Article-scoped alerts power the activity timeline below. Best-effort —
  // a fetch failure leaves the timeline lighter, not broken.
  const [articleAlerts, setArticleAlerts] = useState<
    Array<{
      alerteId: number;
      alerteNom: string;
      alerteDate: string;
      status: string;
      kind: string;
    }>
  >([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, atts, ns, al] = await Promise.all([
        articlesAPI.getById(articleId),
        attachmentsAPI.getAll({ articleId }).catch(() => []),
        notesAPI.list(articleId).catch(() => []),
        alertsAPI
          .getAll(undefined, undefined, undefined, undefined, articleId)
          .catch(() => []),
      ]);
      setArticle(a);
      setAttachments(atts as Attachment[]);
      setNotes(ns);
      setArticleAlerts(al as typeof articleAlerts);
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
      const note = await notesAPI.create(articleId, content, noteKind);
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

  const startEditNote = (note: {
    noteId: number;
    content: string;
    kind?: ArticleNoteKind;
  }) => {
    setEditingNoteId(note.noteId);
    setEditingContent(note.content);
    setEditingKind(note.kind ?? "OTHER");
  };

  const saveEditNote = async () => {
    if (editingNoteId == null) return;
    const content = editingContent.trim();
    if (!content) return;
    try {
      const updated = await notesAPI.update(articleId, editingNoteId, {
        content,
        kind: editingKind,
      });
      setNotes((prev) =>
        prev.map((n) => (n.noteId === updated.noteId ? updated : n))
      );
      setEditingNoteId(null);
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
          <p className="ui-text-muted">
            {article.brand ? `${article.brand} · ` : ""}
            {article.articleModele}
          </p>
          {article.serialNumber && (
            <p className="text-xs ui-text-muted font-mono select-all">
              {t("articleDetail.serialNumber")}: {article.serialNumber}
            </p>
          )}
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

      {(() => {
        const entries: TimelineEntry[] = [
          ...notes.map((n) => ({
            key: `note-${n.noteId}`,
            date: n.createdAt,
            kind: "note" as const,
            title: t(`notes.kind.${n.kind ?? "OTHER"}`),
            body: n.content,
          })),
          ...attachments
            .filter((a) => a.createdAt)
            .map((a) => ({
              key: `att-${a.attachmentId}`,
              date: a.createdAt!,
              kind: "attachment" as const,
              title: t("timeline.attachmentAdded"),
              body: a.fileName,
            })),
          ...(article.garantie?.claimUpdatedAt &&
          article.garantie.claimStatus &&
          article.garantie.claimStatus !== "NONE"
            ? [
                {
                  key: `claim-${article.garantie.garantieId}-${article.garantie.claimStatus}`,
                  date: article.garantie.claimUpdatedAt,
                  kind: "claim" as const,
                  title: `${t("timeline.claimUpdated")}: ${t(`claim.status.${article.garantie.claimStatus}`)}`,
                  body: article.garantie.claimNote ?? undefined,
                },
              ]
            : []),
          ...articleAlerts.map((al) => ({
            key: `alert-${al.alerteId}`,
            date: al.alerteDate,
            kind: "alert" as const,
            title: al.alerteNom,
            body: al.status,
          })),
        ].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

        if (entries.length === 0) return null;
        const KIND_BADGE = {
          note: "ui-badge",
          attachment: "ui-badge-info",
          claim: "ui-badge-warning",
          alert: "ui-badge-success",
        } as const;
        return (
          <div className="ui-card rounded-lg p-6 space-y-3">
            <h2 className="font-semibold ui-title">{t("timeline.title")}</h2>
            <ul className="divide-y ui-divider">
              {entries.map((e) => (
                <li key={e.key} className="py-2 space-y-0.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${KIND_BADGE[e.kind]}`}
                      >
                        {t(`timeline.kind.${e.kind}`)}
                      </span>
                      <span className="font-medium truncate">{e.title}</span>
                    </span>
                    <span className="text-xs ui-text-muted shrink-0">
                      {safeDate(e.date)}
                    </span>
                  </div>
                  {e.body && (
                    <p className="text-xs ui-text-muted break-words">
                      {e.body}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

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

          {(article.garantie.providerName ||
            article.garantie.providerPhone ||
            article.garantie.providerUrl) && (
            <div className="pt-2 text-sm space-y-1">
              <p className="font-medium ui-text-muted">
                {t("articleDetail.contactProvider")}
              </p>
              {article.garantie.providerName && (
                <p>{article.garantie.providerName}</p>
              )}
              {article.garantie.providerPhone && (
                <p>
                  <a
                    href={`tel:${article.garantie.providerPhone}`}
                    className="ui-link"
                  >
                    {article.garantie.providerPhone}
                  </a>
                </p>
              )}
              {article.garantie.providerUrl && (
                <p>
                  <a
                    href={article.garantie.providerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ui-link break-all"
                  >
                    {article.garantie.providerUrl}
                  </a>
                </p>
              )}
            </div>
          )}

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
        <div className="flex flex-wrap gap-2">
          <select
            value={noteKind}
            onChange={(e) => setNoteKind(e.target.value as ArticleNoteKind)}
            aria-label={t("notes.kindLabel")}
            className="ui-select px-2 py-2 rounded-md text-sm"
          >
            {ARTICLE_NOTE_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`notes.kind.${k}`)}
              </option>
            ))}
          </select>
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
            className="ui-input flex-1 min-w-0 px-3 py-2 rounded-md"
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

        {notes.length > 0 && (
          <div
            role="group"
            aria-label={t("notes.filterLabel")}
            className="flex flex-wrap items-center gap-1 text-xs"
          >
            <button
              type="button"
              onClick={() => setNoteFilter("ALL")}
              className={`px-2 py-0.5 rounded-full border ui-divider ${
                noteFilter === "ALL" ? "ui-badge-info" : "ui-btn-ghost"
              }`}
            >
              {t("notes.filter.all")}
            </button>
            {ARTICLE_NOTE_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setNoteFilter(k)}
                className={`px-2 py-0.5 rounded-full border ui-divider ${
                  noteFilter === k ? "ui-badge-info" : "ui-btn-ghost"
                }`}
              >
                {t(`notes.kind.${k}`)}
              </button>
            ))}
          </div>
        )}

        {(() => {
          const visible = notes.filter(
            (n) => noteFilter === "ALL" || (n.kind ?? "OTHER") === noteFilter
          );
          if (visible.length === 0) {
            return <p className="text-sm ui-text-muted">{t("notes.empty")}</p>;
          }
          return (
            <ul className="divide-y ui-divider">
              {visible.map((n) => {
                const kind = n.kind ?? "OTHER";
                const isEditing = editingNoteId === n.noteId;
                return (
                  <li key={n.noteId} className="py-2 space-y-1">
                    {isEditing ? (
                      <div className="flex flex-wrap items-start gap-2">
                        <select
                          value={editingKind}
                          onChange={(e) =>
                            setEditingKind(e.target.value as ArticleNoteKind)
                          }
                          aria-label={t("notes.kindLabel")}
                          className="ui-select px-2 py-1 rounded-md text-sm"
                        >
                          {ARTICLE_NOTE_KINDS.map((k) => (
                            <option key={k} value={k}>
                              {t(`notes.kind.${k}`)}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={editingContent}
                          onChange={(e) => setEditingContent(e.target.value)}
                          maxLength={2000}
                          className="ui-input flex-1 min-w-0 px-3 py-1 rounded-md text-sm"
                        />
                        <button
                          type="button"
                          onClick={saveEditNote}
                          disabled={!editingContent.trim()}
                          className="text-xs ui-btn-primary px-2 py-1 rounded"
                        >
                          {t("common.save")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingNoteId(null)}
                          className="text-xs ui-btn-ghost border ui-divider px-2 py-1 rounded"
                        >
                          {t("common.cancel")}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] ui-badge px-1.5 py-0.5 rounded uppercase tracking-wide">
                              {t(`notes.kind.${kind}`)}
                            </span>
                            <p className="text-sm break-words">{n.content}</p>
                          </div>
                          <p className="text-xs ui-text-muted">
                            {safeDate(n.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => startEditNote(n)}
                            className="text-xs ui-action-primary"
                          >
                            {t("common.edit")}
                          </button>
                          <button
                            onClick={() => removeNote(n.noteId)}
                            className="text-xs ui-action-danger"
                          >
                            {t("common.delete")}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          );
        })()}
      </div>
    </div>
  );
}
