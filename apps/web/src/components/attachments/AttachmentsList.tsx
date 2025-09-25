import React, { useState, useEffect } from "react";
import { useI18n } from "../../i18n/i18n";
import AttachmentForm from "./AttachmentForm";
import { attachmentsAPI } from "../../services/api";

interface Attachment {
  attachmentId: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileUrl: string;
  type: "INVOICE" | "WARRANTY" | "OTHER";
  createdAt: string;
  articleId?: number;
  garantieId?: number;
  article?: {
    articleId: number;
    articleNom: string;
    articleModele: string;
  };
  garantie?: {
    garantieId: number;
    garantieNom: string;
  };
}

interface AttachmentsListProps {
  articleId?: number;
  garantieId?: number;
  onEdit?: (attachment: Attachment) => void;
  onDelete?: (attachmentId: number) => void;
  onAdd?: () => void;
  onView?: (attachment: Attachment) => void;
  isLoading?: boolean;
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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<
    "ALL" | "INVOICE" | "WARRANTY" | "OTHER"
  >("ALL");
  const [sortBy, setSortBy] = useState<"name" | "date" | "type" | "size">(
    "date",
  );

  const [showAddForm, setShowAddForm] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchAttachments();
  }, [articleId, garantieId]);

  const fetchAttachments = async () => {
    try {
      const data = await attachmentsAPI.getAll({
        articleId: articleId || undefined,
        garantieId: garantieId || undefined,
      });
      setAttachments(data);
    } catch (error) {
      console.error("Failed to fetch attachments:", error);
    }
  };

  const handleAdd = async (formData: FormData) => {
    const file = formData.get("file");
    const type = String(formData.get("type") || "OTHER") as
      | "INVOICE"
      | "WARRANTY"
      | "OTHER";

    if (!(file instanceof File)) {
      alert(t("attachments.form.error.fileRequired"));
      return;
    }

    try {
      setUploading(true);
      await attachmentsAPI.uploadFile(file, type);
      setShowAddForm(false);
      await fetchAttachments();
    } catch (e) {
      alert(e instanceof Error ? e.message : t("common.errorOccurred"));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (attachmentId: number) => {
    if (window.confirm(t("attachments.confirmDelete"))) {
      if (onDelete) {
        onDelete(attachmentId);
      }

      try {
        const response = await fetch(`/api/attachments/${attachmentId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });

        if (response.ok) {
          setAttachments(
            attachments.filter((a) => a.attachmentId !== attachmentId),
          );
        }
      } catch (error) {
        console.error("Failed to delete attachment:", error);
      }
    }
  };

  const handleDownload = async (attachment: Attachment) => {
    try {
      const response = await fetch(
        `/api/attachments/${attachment.attachmentId}/download`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        },
      );

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = attachment.fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error("Failed to download attachment:", error);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) {
      return (
        <svg
          className="h-8 w-8 text-green-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      );
    } else if (mimeType === "application/pdf") {
      return (
        <svg
          className="h-8 w-8 text-red-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
          />
        </svg>
      );
    } else {
      return (
        <svg
          className="h-8 w-8 text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      );
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "INVOICE":
        return "bg-blue-100 text-blue-800";
      case "WARRANTY":
        return "bg-green-100 text-green-800";
      case "OTHER":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
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
    return (
      <div className="flex justify-center items-center h-64">
        <div className="ui-spinner animate-spin rounded-full h-32 w-32 border-b-2"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">
          {t("attachments.title")}
          {(articleId || garantieId) && (
            <span className="text-lg font-normal ui-text-muted ml-2">
              {t("attachments.for")}{" "}
              {articleId
                ? t("attachments.for.article")
                : t("attachments.for.warranty")}
            </span>
          )}
        </h2>
        <button
          onClick={() => {
            if (onAdd) onAdd();
            setShowAddForm((v) => !v);
          }}
          className="ui-btn-primary px-4 py-2 rounded-md transition-colors"
        >
          {showAddForm ? t("common.cancel") : t("attachments.add")}
        </button>
      </div>

      {showAddForm && (
        <AttachmentForm
          onSubmit={handleAdd}
          onCancel={() => setShowAddForm(false)}
          isLoading={uploading}
        />
      )}

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder={t("attachments.search.placeholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="ui-input w-full px-3 py-2 rounded-md"
          />
        </div>

        <div className="flex gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="ui-select px-3 py-2 rounded-md"
          >
            <option value="date">{t("attachments.sort.date")}</option>
            <option value="name">{t("attachments.sort.name")}</option>
            <option value="type">{t("attachments.sort.type")}</option>
            <option value="size">{t("attachments.sort.size")}</option>
          </select>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as typeof filterType)}
            className="ui-select px-3 py-2 rounded-md"
          >
            <option value="ALL">{t("attachments.filter.all")}</option>
            <option value="INVOICE">{t("attachments.filter.invoices")}</option>
            <option value="WARRANTY">
              {t("attachments.filter.warranties")}
            </option>
            <option value="OTHER">{t("attachments.filter.other")}</option>
          </select>
        </div>
      </div>

      {/* Attachments Grid */}
      {filteredAndSortedAttachments.length === 0 ? (
        <div className="text-center py-12">
          <div className="ui-text-muted mb-4">
            <svg
              className="mx-auto h-12 w-12"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium mb-2">
            {t("attachments.none.title")}
          </h3>
          <p className="ui-text-muted">
            {searchTerm || filterType !== "ALL"
              ? t("attachments.none.filtered")
              : t("attachments.none.empty")}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredAndSortedAttachments.map((attachment) => (
            <div
              key={attachment.attachmentId}
              className="ui-card rounded-lg transition-shadow hover:shadow-md"
            >
              <div className="p-4">
                <div className="flex items-start space-x-3">
                  {getFileIcon(attachment.mimeType)}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm font-medium truncate">
                        {attachment.fileName}
                      </h3>
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${getTypeColor(attachment.type)}`}
                      >
                        {attachment.type}
                      </span>
                    </div>

                    <p className="text-xs ui-text-muted mb-2">
                      {formatFileSize(attachment.fileSize)}
                    </p>

                    <p className="text-xs ui-text-muted">
                      {new Date(attachment.createdAt).toLocaleDateString()}
                    </p>

                    {/* Linked entities */}
                    {(attachment.article || attachment.garantie) && (
                      <div className="mt-2 text-xs ui-text-muted">
                        {attachment.article && (
                          <p>
                            {t("attachments.linked.article")}:{" "}
                            {attachment.article.articleNom}
                          </p>
                        )}
                        {attachment.garantie && (
                          <p>
                            {t("attachments.linked.warranty")}:{" "}
                            {attachment.garantie.garantieNom}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center mt-4 pt-3 border-t ui-divider">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleDownload(attachment)}
                      className="text-xs ui-btn-ghost px-2 py-1 rounded transition-colors"
                      title={t("attachments.action.download")}
                    >
                      {t("attachments.action.download")}
                    </button>

                    {onView && (
                      <button
                        onClick={() => onView(attachment)}
                        className="text-xs ui-btn-ghost px-2 py-1 rounded transition-colors"
                        title={t("attachments.action.view")}
                      >
                        {t("attachments.action.view")}
                      </button>
                    )}
                  </div>

                  <div className="flex space-x-2">
                    {onEdit && (
                      <button
                        onClick={() => onEdit(attachment)}
                        className="text-xs ui-btn-ghost px-2 py-1 rounded transition-colors"
                      >
                        {t("attachments.action.edit")}
                      </button>
                    )}

                    <button
                      onClick={() => handleDelete(attachment.attachmentId)}
                      className="text-xs text-red-600 hover:text-red-800 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                    >
                      {t("attachments.action.delete")}
                    </button>
                  </div>
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
