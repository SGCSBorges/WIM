/**
 * Attachments grid view. Used both as a standalone /attachments page and
 * embedded inside an article detail (articleId / garantieId props scope the
 * list). Supports per-row delete with confirm, bulk select + bulk-delete
 * client-side filter + sort + search, and a download button
 * that normalizes API-hosted /uploads paths to absolute URLs.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Paperclip,
  Plus,
  Search,
  Download,
  Check,
  Eye,
  Pencil,
  Trash2,
  FileText,
  Image as ImageIcon,
  File as FileIcon,
} from "lucide-react";
import { useI18n } from "../../i18n/i18n";
import { usePreferences } from "../../preferences/preferences";
import AttachmentForm from "./AttachmentForm";
import { attachmentsAPI } from "../../services/api";
import { getErrorMessage } from "../../utils/error";
import { ErrorBanner, EmptyState } from "../common/States";
import { Skeleton } from "../common/Skeleton";
import { Button, Input, Select, Badge, type BadgeTone } from "../ui";
import type { AttachmentItem as Attachment } from "@wim/types";

interface AttachmentsListProps {
  articleId?: number;
  garantieId?: number;
  onEdit?: (attachment: Attachment) => void;
  onDelete?: (attachmentId: number) => void;
  onAdd?: () => void;
  onView?: (attachment: Attachment) => void;
  isLoading?: boolean;
}

function fileIcon(mimeType: string) {
  if (mimeType.startsWith("image/"))
    return <ImageIcon className="h-8 w-8 text-success" aria-hidden="true" />;
  if (mimeType === "application/pdf")
    return <FileText className="h-8 w-8 text-danger" aria-hidden="true" />;
  return <FileIcon className="h-8 w-8 text-muted" aria-hidden="true" />;
}

function typeTone(type: string): BadgeTone {
  if (type === "INVOICE") return "info";
  if (type === "WARRANTY") return "success";
  return "neutral";
}

const AttachmentsList: React.FC<AttachmentsListProps> = ({
  articleId,
  garantieId,
  onEdit,
  onDelete,
  onAdd,
  onView,
  isLoading = false,
}) => {
  const { t } = useI18n();
  const { formatDate } = usePreferences();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<
    "ALL" | "INVOICE" | "WARRANTY" | "OTHER"
  >("ALL");
  const [sortBy, setSortBy] = useState<"name" | "date" | "type" | "size">(
    "date"
  );

  const [showAddForm, setShowAddForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [downloadedId, setDownloadedId] = useState<number | null>(null);

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    setShowBulkDeleteConfirm(false);
    const ids = Array.from(selectedIds);
    try {
      await attachmentsAPI.bulkDelete(ids);
      setAttachments((prev) =>
        prev.filter((a) => !selectedIds.has(a.attachmentId))
      );
      setSelectedIds(new Set());
    } catch (e: unknown) {
      setDeleteError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setBulkBusy(false);
    }
  };

  const fetchAttachments = useCallback(async () => {
    setFetchError(null);
    try {
      const data = await attachmentsAPI.getAll({
        articleId: articleId || undefined,
        garantieId: garantieId || undefined,
      });
      setAttachments(data);
    } catch (e: unknown) {
      setFetchError(getErrorMessage(e, t("common.errorOccurred")));
    }
  }, [articleId, garantieId, t]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  const handleAdd = async (formData: FormData) => {
    const file = formData.get("file");
    const rawType = String(formData.get("type") || "OTHER");
    const type: "INVOICE" | "WARRANTY" | "OTHER" =
      rawType === "INVOICE" || rawType === "WARRANTY" ? rawType : "OTHER";

    if (!(file instanceof File)) {
      setUploadError(t("attachments.form.error.fileRequired"));
      return;
    }

    try {
      setUploading(true);
      setUploadError(null);
      await attachmentsAPI.uploadFile(file, type);
      setShowAddForm(false);
      await fetchAttachments();
    } catch (e) {
      setUploadError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (attachmentId: number) => {
    setConfirmDeleteId(null);
    setDeleteError(null);
    if (onDelete) onDelete(attachmentId);
    try {
      await attachmentsAPI.deleteAttachment(attachmentId, {
        removeFile: true,
      });
      setAttachments(
        attachments.filter((a) => a.attachmentId !== attachmentId)
      );
    } catch (e: unknown) {
      setDeleteError(getErrorMessage(e, t("common.errorOccurred")));
    }
  };

  const handleDownload = async (attachment: Attachment) => {
    try {
      let href = attachment.fileUrl;
      try {
        const u = new URL(attachment.fileUrl);
        if (u.pathname.startsWith("/uploads/")) {
          const apiOrigin = new URL(`https://${u.host}`);
          apiOrigin.pathname = u.pathname;
          href = apiOrigin.toString();
        }
      } catch {
        // keep original href
      }
      if (!/^https?:\/\//i.test(href)) return;
      const a = document.createElement("a");
      a.href = href;
      a.download = attachment.fileName;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setDownloadedId(attachment.attachmentId);
      setTimeout(() => setDownloadedId(null), 2000);
    } catch {
      // browser-level download errors; nothing to surface
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const filteredAndSortedAttachments = attachments
    .filter((attachment) => {
      const matchesSearch =
        attachment.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        attachment.type.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter =
        filterType === "ALL" || attachment.type === filterType;
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.fileName.localeCompare(b.fileName);
        case "date":
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        case "type":
          return a.type.localeCompare(b.type);
        case "size":
          return b.fileSize - a.fileSize;
        default:
          return 0;
      }
    });

  if (isLoading) {
    // Skeleton mirrors the header + card grid so there's no layout shift when
    // the real attachments resolve (convention: skeleton, not a bare spinner).
    return (
      <div
        className="space-y-6"
        role="status"
        aria-busy="true"
        aria-label={t("attachments.title")}
      >
        <div className="flex items-center gap-3">
          <Skeleton width={44} height={44} rounded="lg" />
          <Skeleton width="35%" height={28} />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="ui-card space-y-3 p-4">
              <Skeleton height={160} />
              <Skeleton width="70%" height={16} />
              <Skeleton width="40%" height={12} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary bg-gradient-brand text-primary-contrast shadow-md">
            <Paperclip className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 className="truncate text-2xl font-bold tracking-tight ui-title">
            {t("attachments.title")}
            {(articleId || garantieId) && (
              <span className="ml-2 text-lg font-normal ui-text-muted">
                {t("attachments.for")}{" "}
                {articleId
                  ? t("attachments.for.article")
                  : t("attachments.for.warranty")}
              </span>
            )}
          </h2>
        </div>
        <Button
          onClick={() => {
            if (onAdd) onAdd();
            setShowAddForm((v) => !v);
          }}
          leftIcon={showAddForm ? undefined : <Plus className="h-4 w-4" />}
          variant={showAddForm ? "ghost" : "primary"}
        >
          {showAddForm ? t("common.cancel") : t("attachments.add")}
        </Button>
      </div>

      {showAddForm && (
        <AttachmentForm
          onSubmit={handleAdd}
          onCancel={() => {
            setShowAddForm(false);
            setUploadError(null);
          }}
          isLoading={uploading}
        />
      )}
      {uploadError && <ErrorBanner message={uploadError} />}
      {fetchError && (
        <ErrorBanner
          message={fetchError}
          onRetry={fetchAttachments}
          retryLabel={t("common.retry")}
        />
      )}
      {deleteError && <ErrorBanner message={deleteError} />}

      {/* Search and Filters */}
      <div className="flex flex-col gap-3 md:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <Input
            type="search"
            inputMode="search"
            placeholder={t("attachments.search.placeholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label={t("attachments.search.placeholder")}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            aria-label={t("attachments.sort.date")}
            className="w-auto"
          >
            <option value="date">{t("attachments.sort.date")}</option>
            <option value="name">{t("attachments.sort.name")}</option>
            <option value="type">{t("attachments.sort.type")}</option>
            <option value="size">{t("attachments.sort.size")}</option>
          </Select>
          <Select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as typeof filterType)}
            aria-label={t("attachments.filter.all")}
            className="w-auto"
          >
            <option value="ALL">{t("attachments.filter.all")}</option>
            <option value="INVOICE">{t("attachments.filter.invoices")}</option>
            <option value="WARRANTY">
              {t("attachments.filter.warranties")}
            </option>
            <option value="OTHER">{t("attachments.filter.other")}</option>
          </Select>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div
          role="region"
          aria-label={t("attachments.bulk.selectionLabel")}
          className="ui-card sticky top-20 z-10 flex flex-wrap items-center gap-3 p-3 animate-slide-up"
        >
          <span className="text-sm font-medium">
            {t("attachments.bulk.selected").replace(
              "{count}",
              String(selectedIds.size)
            )}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {showBulkDeleteConfirm ? (
              <>
                <p role="alert" className="text-xs ui-text-error">
                  {t("attachments.bulk.confirm")}
                </p>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleBulkDelete}
                  loading={bulkBusy}
                >
                  {t("attachments.bulk.confirmDelete")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowBulkDeleteConfirm(false)}
                  disabled={bulkBusy}
                >
                  {t("common.cancel")}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  disabled={bulkBusy}
                  leftIcon={<Trash2 className="h-4 w-4" />}
                >
                  {t("attachments.bulk.delete")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedIds(new Set())}
                  disabled={bulkBusy}
                >
                  {t("attachments.bulk.clear")}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Grid */}
      {filteredAndSortedAttachments.length === 0 ? (
        <EmptyState
          icon={<Paperclip className="h-6 w-6" />}
          title={t("attachments.none.title")}
          description={
            searchTerm || filterType !== "ALL"
              ? t("attachments.none.filtered")
              : t("attachments.none.empty")
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredAndSortedAttachments.map((attachment) => (
            <div key={attachment.attachmentId} className="ui-card ui-lift p-4">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  aria-label={t("attachments.bulk.selectRow").replace(
                    "{name}",
                    attachment.fileName
                  )}
                  checked={selectedIds.has(attachment.attachmentId)}
                  onChange={() => toggleSelected(attachment.attachmentId)}
                  className="mt-2 h-4 w-4 accent-[var(--primary)]"
                />
                {attachment.thumbUrl ? (
                  <img
                    src={attachment.thumbUrl}
                    alt={attachment.fileName}
                    loading="lazy"
                    decoding="async"
                    className="h-12 w-12 rounded-lg border ui-divider object-cover"
                  />
                ) : (
                  fileIcon(attachment.mimeType)
                )}

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <h3
                      className="truncate text-sm font-medium ui-title"
                      title={attachment.fileName}
                    >
                      {attachment.fileName}
                    </h3>
                    <Badge tone={typeTone(attachment.type)}>
                      {attachment.type}
                    </Badge>
                  </div>
                  <p className="text-xs ui-text-muted">
                    {formatFileSize(attachment.fileSize)} ·{" "}
                    {formatDate(attachment.createdAt)}
                  </p>

                  {(attachment.article || attachment.garantie) && (
                    <div className="mt-2 text-xs ui-text-muted">
                      {attachment.article && (
                        <p
                          className="truncate"
                          title={attachment.article.articleNom}
                        >
                          {t("attachments.linked.article")}:{" "}
                          {attachment.article.articleNom}
                        </p>
                      )}
                      {attachment.garantie && (
                        <p
                          className="truncate"
                          title={attachment.garantie.garantieNom}
                        >
                          {t("attachments.linked.warranty")}:{" "}
                          {attachment.garantie.garantieNom}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t ui-divider pt-3">
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownload(attachment)}
                    aria-label={t("attachments.action.download")}
                    title={t("attachments.action.download")}
                    leftIcon={
                      downloadedId === attachment.attachmentId ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (onView) return onView(attachment);
                      if (/^https?:\/\//i.test(attachment.fileUrl)) {
                        window.open(
                          attachment.fileUrl,
                          "_blank",
                          "noopener,noreferrer"
                        );
                      }
                    }}
                    aria-label={t("attachments.action.view")}
                    title={t("attachments.action.view")}
                    leftIcon={<Eye className="h-4 w-4" />}
                  />
                </div>

                <div className="flex items-center gap-1">
                  {onEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(attachment)}
                      aria-label={t("attachments.action.edit")}
                      leftIcon={<Pencil className="h-4 w-4" />}
                    />
                  )}
                  {confirmDeleteId === attachment.attachmentId ? (
                    <>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDelete(attachment.attachmentId)}
                      >
                        {t("common.yes")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        {t("common.no")}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setConfirmDeleteId(attachment.attachmentId)
                      }
                      aria-label={t("attachments.action.delete")}
                      className="text-danger"
                      leftIcon={<Trash2 className="h-4 w-4" />}
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AttachmentsList;
