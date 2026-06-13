/**
 * Article detail — read-mostly view with claim workflow, notes, attached
 * photos, activity timeline, and PDF claim sheet download. Article identity
 * + warranty come from one `articlesAPI.getById` fetch; notes + alerts +
 * attachments load in parallel. The claim status edit is inline and posts
 * immediately on save. "Duplicate" copies identity + locations + tags
 * (not warranty / attachments) — see article.service.ts duplicate().
 */
import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { usePreferences } from "../../preferences/preferences";
import {
  Copy,
  Download,
  Phone,
  ExternalLink,
  ImagePlus,
  Star,
  Trash2,
  Pencil,
  Check,
  Clock,
  Paperclip,
  StickyNote,
  RotateCw,
  History,
  ShieldCheck,
  Send,
  Bell,
  ArrowRightLeft,
} from "lucide-react";
import { useI18n } from "../../i18n/i18n";
import { useFileDrop } from "../../hooks/useFileDrop";
import {
  alertsAPI,
  articlesAPI,
  attachmentsAPI,
  notesAPI,
  profileAPI,
  warrantiesAPI,
  type ArticleNote,
} from "../../services/api";
import type {
  ArticleNoteKind,
  ClaimStatus,
  FetchedArticle,
  WarrantyHistoryItem,
} from "../../types";
import { warrantyStatusFor } from "../../utils/warrantyStatus";
import RenewWarrantyDialog from "../warranties/RenewWarrantyDialog";
import TransferDialog from "./TransferDialog";
import { ARTICLE_NOTE_KINDS } from "@wim/types";
import { getErrorMessage } from "../../utils/error";
import { formatMoney } from "../../utils/money";
import { currentValue } from "../../utils/depreciation";
import { downloadBlob } from "../../utils/csv";
import { ErrorBanner, EmptyState } from "../common/States";
import { Skeleton } from "../common/Skeleton";
import { useToast } from "../common/Toast";
import ArticleThumb from "./ArticleThumb";
import {
  PageHeader,
  Section,
  Button,
  Input,
  Select,
  Badge,
  Segmented,
  type BadgeTone,
} from "../ui";

const CLAIM_STATUSES: ClaimStatus[] = [
  "NONE",
  "OPEN",
  "APPROVED",
  "REJECTED",
  "RESOLVED",
];

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

const TIMELINE_TONE: Record<TimelineEntry["kind"], BadgeTone> = {
  note: "neutral",
  attachment: "info",
  claim: "warning",
  alert: "success",
};

const TIMELINE_ICON: Record<TimelineEntry["kind"], React.ReactNode> = {
  note: <StickyNote className="h-3 w-3" />,
  attachment: <Paperclip className="h-3 w-3" />,
  claim: <ShieldCheck className="h-3 w-3" />,
  alert: <Bell className="h-3 w-3" />,
};

export default function ArticleDetail() {
  const { t, language } = useI18n();
  const { formatDate, formatDateTime } = usePreferences();
  const safeDate = (iso: string | null | undefined) => formatDate(iso) || "—";
  const safeDateTime = (iso: string | null | undefined) =>
    formatDateTime(iso) || "—";
  const toast = useToast();
  const navigate = useNavigate();
  const [duplicating, setDuplicating] = useState(false);
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
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [editingKind, setEditingKind] = useState<ArticleNoteKind>("OTHER");
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

  const uploadPhotos = async (files: File[]) => {
    if (files.length === 0) return;
    setUploadingPhoto(true);
    try {
      for (const file of files) {
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

  // Drag-drop wrapper for the whole gallery section. The "Add photos" label
  // (with its sr-only <input>) keeps the keyboard / a11y path intact.
  const { isOver: galleryDragOver, dropProps: galleryDropProps } = useFileDrop({
    onFiles: (files) => void uploadPhotos(files),
    accept: ["image/"],
    disabled: uploadingPhoto,
  });

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

  const [renewOpen, setRenewOpen] = useState(false);
  const [renewMode, setRenewMode] = useState<"renew" | "extend">("renew");
  const [transferOpen, setTransferOpen] = useState(false);
  const [warrantyHistory, setWarrantyHistory] = useState<WarrantyHistoryItem[]>(
    []
  );

  const warrantyInfo = warrantyStatusFor(article?.garantie?.garantieFin);

  useEffect(() => {
    setClaimStatus(article?.garantie?.claimStatus ?? "NONE");
    setClaimNote(article?.garantie?.claimNote ?? "");
  }, [article?.garantie?.claimStatus, article?.garantie?.claimNote]);

  // History loads lazily once we know there's a warranty; refresh after a
  // renew/extend so the new entry appears without a hard reload.
  const loadHistory = useCallback(async () => {
    if (!article?.garantie?.garantieId) return;
    try {
      const items = await warrantiesAPI.getHistory(article.garantie.garantieId);
      setWarrantyHistory(items);
    } catch {
      // non-blocking — the panel is purely informational
    }
  }, [article?.garantie?.garantieId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

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
    <div>
      <PageHeader
        title={article.articleNom}
        subtitle={[article.brand, article.articleModele]
          .filter(Boolean)
          .join(" · ")}
        breadcrumbs={[{ label: t("nav.articles"), to: "/articles" }]}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (duplicating) return;
                setDuplicating(true);
                try {
                  const created = await articlesAPI.duplicate(articleId);
                  toast.show(t("articleDetail.duplicated"), {
                    kind: "success",
                  });
                  navigate(`/articles/${created.articleId}`);
                } catch (e) {
                  toast.show(getErrorMessage(e, t("common.errorOccurred")), {
                    kind: "error",
                  });
                } finally {
                  setDuplicating(false);
                }
              }}
              loading={duplicating}
              leftIcon={<Copy className="h-4 w-4" />}
            >
              {t("articleDetail.duplicate")}
            </Button>
            <Button
              variant="outline"
              size="sm"
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
              leftIcon={<Download className="h-4 w-4" />}
            >
              {t("articleDetail.downloadPdf")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTransferOpen(true)}
              leftIcon={<ArrowRightLeft className="h-4 w-4" />}
            >
              {t("transfer.dialog.pushTitle")}
            </Button>
          </>
        }
      />

      {/* Hero */}
      <div className="ui-card mb-6 flex flex-col gap-6 p-6 sm:flex-row">
        <ArticleThumb
          src={article.productImageUrl}
          alt={article.articleNom}
          size={120}
        />
        <div className="min-w-0 flex-1 space-y-3">
          {article.serialNumber && (
            <p className="select-all font-mono text-xs ui-text-muted">
              {t("articleDetail.serialNumber")}: {article.serialNumber}
            </p>
          )}
          {article.articleDescription && (
            <p className="text-sm">{article.articleDescription}</p>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-xs ui-text-muted">
                {t("articleDetail.value")}
              </p>
              <p className="text-sm font-semibold ui-title tabular-nums">
                {article.purchasePrice != null
                  ? formatMoney(article.purchasePrice, currency, language)
                  : "—"}
              </p>
            </div>
            {(() => {
              const current = currentValue(
                article.purchasePrice,
                article.depreciationRate,
                article.garantie?.garantieDateAchat ?? article.createdAt
              );
              if (current == null) return null;
              return (
                <div>
                  <p className="text-xs ui-text-muted">
                    {t("articleDetail.currentValue")}
                  </p>
                  <p className="text-sm font-semibold ui-title tabular-nums">
                    {formatMoney(current, currency, language)}
                  </p>
                  <p className="text-[10px] ui-text-muted">
                    {Number(article.depreciationRate)}%/
                    {t("articleDetail.perYear")}
                  </p>
                </div>
              );
            })()}
            <div>
              <p className="text-xs ui-text-muted">
                {t("articleDetail.locations")}
              </p>
              <p className="text-sm ui-title">
                {article.locations && article.locations.length > 0
                  ? article.locations
                      .map((l) => l.location?.name)
                      .filter(Boolean)
                      .join(", ")
                  : "—"}
              </p>
            </div>
          </div>

          {article.tags && article.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {article.tags.map((tg) => (
                <Badge key={tg.tagId} tone="info">
                  {tg.tag?.name ?? `#${tg.tagId}`}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Warranty + claim */}
      {article.garantie && (
        <Section
          icon={<ShieldCheck className="h-5 w-5" />}
          title={t("articleDetail.warranty")}
          className="mb-6"
          actions={
            <div className="flex items-center gap-2">
              <Badge tone={warrantyInfo.tone}>{t(warrantyInfo.labelKey)}</Badge>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<RotateCw className="h-4 w-4" />}
                onClick={() => {
                  setRenewMode("renew");
                  setRenewOpen(true);
                }}
              >
                {t("warranty.renew.button")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRenewMode("extend");
                  setRenewOpen(true);
                }}
              >
                {t("warranty.extend.button")}
              </Button>
            </div>
          }
        >
          <div className="space-y-1">
            <p className="font-medium ui-title">
              {article.garantie.garantieNom}
            </p>
            <p className="text-sm ui-text-muted">
              {t("articleDetail.warrantyPurchased")}:{" "}
              {safeDate(article.garantie.garantieDateAchat)} —{" "}
              {t("articleDetail.warrantyEnds")}:{" "}
              {safeDate(article.garantie.garantieFin)}
              {article.garantie.renewedAt && (
                <>
                  {" "}
                  ·{" "}
                  <span className="ui-text-muted">
                    {t("warranty.lastRenewed")}{" "}
                    {safeDate(article.garantie.renewedAt)}
                  </span>
                </>
              )}
            </p>
          </div>

          {(article.garantie.providerName ||
            article.garantie.providerPhone ||
            article.garantie.providerUrl) && (
            <div className="mt-3 space-y-1 rounded-lg border ui-divider p-3 text-sm">
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
                    className="inline-flex items-center gap-1 ui-action-primary hover:underline"
                  >
                    <Phone className="h-3 w-3" aria-hidden="true" />
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
                    className="inline-flex items-center gap-1 break-all ui-action-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    {article.garantie.providerUrl}
                  </a>
                </p>
              )}
            </div>
          )}

          <div className="mt-4 space-y-2 border-t ui-divider pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="claim-status" className="text-sm font-medium">
                {t("claim.title")}
              </label>
              <Select
                id="claim-status"
                value={claimStatus}
                onChange={(e) => setClaimStatus(e.target.value as ClaimStatus)}
                className="w-auto"
              >
                {CLAIM_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`claim.status.${s}`)}
                  </option>
                ))}
              </Select>
              {article.garantie.claimUpdatedAt && (
                <span className="inline-flex items-center gap-1 text-xs ui-text-muted">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  {safeDate(article.garantie.claimUpdatedAt)}
                </span>
              )}
            </div>
            {claimStatus !== "NONE" && (
              <Input
                type="text"
                value={claimNote}
                onChange={(e) => setClaimNote(e.target.value)}
                placeholder={t("claim.notePlaceholder")}
                aria-label={t("claim.notePlaceholder")}
                maxLength={2000}
              />
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={saveClaim}
              loading={savingClaim}
              leftIcon={<Check className="h-4 w-4" />}
            >
              {t("claim.save")}
            </Button>
          </div>

          {warrantyHistory.length > 0 && (
            <div className="mt-4 border-t ui-divider pt-4">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium ui-text-muted">
                <History className="h-4 w-4" aria-hidden="true" />
                {t("warranty.history.title")}
              </p>
              <ul className="space-y-1 text-xs">
                {warrantyHistory.map((h) => (
                  <li key={h.id} className="flex flex-wrap gap-2">
                    <Badge tone="neutral">
                      {t(`warranty.history.event.${h.event}`)}
                    </Badge>
                    <span className="ui-text-muted">
                      {safeDate(h.priorDateAchat)} → {safeDate(h.priorFin)}
                    </span>
                    <span className="ml-auto ui-text-muted">
                      {safeDate(h.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>
      )}

      {article.garantie && (
        <RenewWarrantyDialog
          open={renewOpen}
          mode={renewMode}
          warranty={article.garantie}
          onClose={() => setRenewOpen(false)}
          onUpdated={(updated) => {
            setArticle((prev) =>
              prev
                ? { ...prev, garantie: { ...prev.garantie, ...updated } }
                : prev
            );
            void loadHistory();
          }}
        />
      )}

      {transferOpen && (
        <TransferDialog
          articleId={articleId}
          articleName={article.articleNom}
          direction="push"
          onDone={() => {
            setTransferOpen(false);
            toast.show(t("transfer.sent"), { kind: "success" });
          }}
          onClose={() => setTransferOpen(false)}
        />
      )}

      {/* Activity timeline */}
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
        return (
          <Section
            icon={<Clock className="h-5 w-5" />}
            title={t("timeline.title")}
            className="mb-6"
          >
            <ul className="divide-y ui-divider">
              {entries.map((e) => (
                <li key={e.key} className="space-y-0.5 py-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <Badge
                        tone={TIMELINE_TONE[e.kind]}
                        icon={TIMELINE_ICON[e.kind]}
                      >
                        {t(`timeline.kind.${e.kind}`)}
                      </Badge>
                      <span className="truncate font-medium ui-title">
                        {e.title}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs ui-text-muted">
                      {safeDateTime(e.date)}
                    </span>
                  </div>
                  {e.body && (
                    <p className="break-words text-xs ui-text-muted">
                      {e.body}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        );
      })()}

      {/* Gallery */}
      <Section
        icon={<ImagePlus className="h-5 w-5" />}
        title={t("gallery.title")}
        actions={
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border ui-divider px-3 py-1.5 text-sm ui-btn-ghost">
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
            {uploadingPhoto ? t("common.loading") : t("gallery.add")}
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={uploadingPhoto}
              onChange={(e) => {
                void uploadPhotos(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
              className="sr-only"
            />
          </label>
        }
        className="mb-6"
      >
        <div
          {...galleryDropProps}
          className={`rounded-lg p-1 transition-colors ${
            galleryDragOver ? "bg-surface-muted ring-2 ring-primary" : ""
          }`}
        >
          {photos.length === 0 ? (
            <EmptyState
              icon={<ImagePlus className="h-6 w-6" />}
              title={t("gallery.empty")}
              description={t("articleDetail.gallery.dropHint")}
            />
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {photos.map((att) => {
                const isPrimary = article.productImageUrl === att.fileUrl;
                return (
                  <li
                    key={att.attachmentId}
                    className="space-y-1 rounded-lg border ui-divider p-2"
                  >
                    <a href={att.fileUrl} target="_blank" rel="noreferrer">
                      <img
                        src={att.thumbUrl || att.fileUrl}
                        alt={att.fileName}
                        loading="lazy"
                        decoding="async"
                        className="h-24 w-full rounded-md object-cover"
                      />
                    </a>
                    <div className="flex items-center justify-between gap-1 text-xs">
                      {isPrimary ? (
                        <Badge tone="info" icon={<Star className="h-3 w-3" />}>
                          {t("gallery.primary")}
                        </Badge>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPrimaryPhoto(att.fileUrl)}
                          className="ui-action-primary hover:underline"
                        >
                          {t("gallery.setPrimary")}
                        </button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deletePhoto(att)}
                        className="text-danger"
                        aria-label={`${t("common.delete")} ${att.fileName}`}
                        leftIcon={<Trash2 className="h-4 w-4" />}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Section>

      {/* Attachments (non-image) */}
      <Section
        icon={<Paperclip className="h-5 w-5" />}
        title={t("articleDetail.attachments")}
        className="mb-6"
      >
        {attachments.length === 0 ? (
          <p className="text-sm ui-text-muted">
            {t("articleDetail.noAttachments")}
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {attachments.map((att) => (
              <li key={att.attachmentId} className="flex items-center gap-2">
                <Paperclip
                  className="h-3.5 w-3.5 ui-text-muted"
                  aria-hidden="true"
                />
                <a
                  className="ui-action-primary hover:underline"
                  href={att.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {att.fileName}
                </a>
                <Badge tone="neutral">{att.type}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Notes */}
      <Section
        icon={<StickyNote className="h-5 w-5" />}
        title={t("notes.title")}
      >
        <div className="flex flex-wrap gap-2">
          <Select
            value={noteKind}
            onChange={(e) => setNoteKind(e.target.value as ArticleNoteKind)}
            aria-label={t("notes.kindLabel")}
            className="w-auto"
          >
            {ARTICLE_NOTE_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`notes.kind.${k}`)}
              </option>
            ))}
          </Select>
          <Input
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
            maxLength={2000}
            className="min-w-0 flex-1"
          />
          <Button
            onClick={addNote}
            loading={savingNote}
            disabled={!noteInput.trim()}
            leftIcon={<Send className="h-4 w-4" />}
          >
            {t("notes.add")}
          </Button>
        </div>

        {notes.length > 0 && (
          <Segmented
            ariaLabel={t("notes.filterLabel")}
            value={noteFilter}
            onChange={setNoteFilter}
            options={[
              { value: "ALL" as const, label: t("notes.filter.all") },
              ...ARTICLE_NOTE_KINDS.map((k) => ({
                value: k,
                label: t(`notes.kind.${k}`),
              })),
            ]}
            className="mt-3"
          />
        )}

        {(() => {
          const visible = notes.filter(
            (n) => noteFilter === "ALL" || (n.kind ?? "OTHER") === noteFilter
          );
          if (visible.length === 0) {
            return (
              <p className="mt-4 text-sm ui-text-muted">{t("notes.empty")}</p>
            );
          }
          return (
            <ul className="mt-3 divide-y ui-divider">
              {visible.map((n) => {
                const kind = n.kind ?? "OTHER";
                const isEditing = editingNoteId === n.noteId;
                return (
                  <li key={n.noteId} className="space-y-1 py-2">
                    {isEditing ? (
                      <div className="flex flex-wrap items-start gap-2">
                        <Select
                          value={editingKind}
                          onChange={(e) =>
                            setEditingKind(e.target.value as ArticleNoteKind)
                          }
                          aria-label={t("notes.kindLabel")}
                          className="w-auto"
                        >
                          {ARTICLE_NOTE_KINDS.map((k) => (
                            <option key={k} value={k}>
                              {t(`notes.kind.${k}`)}
                            </option>
                          ))}
                        </Select>
                        <Input
                          type="text"
                          value={editingContent}
                          onChange={(e) => setEditingContent(e.target.value)}
                          maxLength={2000}
                          className="min-w-0 flex-1"
                        />
                        <Button
                          size="sm"
                          onClick={saveEditNote}
                          disabled={!editingContent.trim()}
                          leftIcon={<Check className="h-4 w-4" />}
                        >
                          {t("common.save")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingNoteId(null)}
                        >
                          {t("common.cancel")}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone="neutral">
                              {t(`notes.kind.${kind}`)}
                            </Badge>
                            <p className="break-words text-sm">{n.content}</p>
                          </div>
                          <p className="text-xs ui-text-muted">
                            {safeDateTime(n.createdAt)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => startEditNote(n)}
                            aria-label={t("common.edit")}
                            leftIcon={<Pencil className="h-4 w-4" />}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeNote(n.noteId)}
                            aria-label={t("common.delete")}
                            className="text-danger"
                            leftIcon={<Trash2 className="h-4 w-4" />}
                          />
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          );
        })()}
      </Section>
    </div>
  );
}
