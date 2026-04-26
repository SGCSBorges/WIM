import React, { useState, useRef } from "react";
import { useI18n } from "../../i18n/i18n";

interface Attachment {
  attachmentId?: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileUrl: string;
  type: "INVOICE" | "WARRANTY" | "OTHER";
  articleId?: number;
  garantieId?: number;
}

interface AttachmentFormProps {
  attachment?: Attachment;
  articleId?: number;
  garantieId?: number;
  onSubmit: (attachmentData: FormData) => void;
  onCancel?: () => void;
  isLoading?: boolean;
}

const AttachmentForm: React.FC<AttachmentFormProps> = ({
  attachment,
  articleId,
  garantieId,
  onSubmit,
  onCancel,
  isLoading = false,
}) => {
  const { t } = useI18n();
  const [formData, setFormData] = useState({
    type: attachment?.type || ("OTHER" as const),
    articleId: attachment?.articleId || articleId || undefined,
    garantieId: attachment?.garantieId || garantieId || undefined,
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!attachment && !selectedFile) {
      newErrors.file = t("attachments.form.error.fileRequired");
    }

    if (selectedFile) {
      // Check file size (10MB limit)
      if (selectedFile.size > 10 * 1024 * 1024) {
        newErrors.file = t("attachments.form.error.fileTooLarge");
      }

      // Must match ALLOWED_MIME_TYPES in attachment.routes.ts
      const allowedTypes = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
      ];

      if (!allowedTypes.includes(selectedFile.type)) {
        newErrors.file = t("attachments.form.error.fileTypeNotSupported");
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (validateForm()) {
      const submitData = new FormData();

      if (selectedFile) {
        submitData.append("file", selectedFile);
      }

      submitData.append("type", formData.type);

      if (formData.articleId) {
        submitData.append("articleId", formData.articleId.toString());
      }

      if (formData.garantieId) {
        submitData.append("garantieId", formData.garantieId.toString());
      }

      onSubmit(submitData);
    }
  };

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);

    // Clear file error when user selects a file
    if (errors.file) {
      setErrors((prev) => ({ ...prev, file: "" }));
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="max-w-2xl mx-auto p-6 ui-card rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6">
        {attachment
          ? t("attachments.form.editTitle")
          : t("attachments.form.addTitle")}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* File Upload */}
        {!attachment && (
          <div>
            <label className="block text-sm font-medium ui-text-muted mb-2">
              {t("attachments.form.fileUpload")} *
            </label>

            <div
              className={`relative border-2 border-dashed rounded-lg p-6 transition-colors ${
                dragActive
                  ? "border-blue-400 bg-blue-50"
                  : errors.file
                    ? "border-red-300 bg-red-50"
                    : "border-[var(--border)] hover:border-[var(--primary)]"
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={(e) =>
                  e.target.files?.[0] && handleFileSelect(e.target.files[0])
                }
                disabled={isLoading}
              />

              <div className="text-center">
                {selectedFile ? (
                  <div className="space-y-2">
                    <svg
                      className="mx-auto h-12 w-12 text-green-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div>
                      <p className="text-sm font-medium">
                        {selectedFile.name}
                      </p>
                      <p className="text-xs ui-text-muted">
                        {formatFileSize(selectedFile.size)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedFile(null)}
                      className="text-xs ui-action-danger"
                    >
                      {t("attachments.form.fileRemove")}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <svg
                      className="mx-auto h-12 w-12 text-gray-400"
                      stroke="currentColor"
                      fill="none"
                      viewBox="0 0 48 48"
                    >
                      <path
                        d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <div>
                      <p className="text-sm ui-text-muted">
                        <span className="font-medium ui-action-primary">
                          {t("attachments.form.drop.clickToUpload")}
                        </span>{" "}
                        {t("attachments.form.drop.orDrag")}
                      </p>
                      <p className="text-xs ui-text-muted">
                        {t("attachments.form.drop.help")}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {errors.file && (
              <p className="mt-1 text-sm text-red-600">{errors.file}</p>
            )}
          </div>
        )}

        {/* Current file info for edit mode */}
        {attachment && (
          <div className="p-4 ui-panel rounded-lg">
            <h3 className="text-sm font-medium mb-2">
              {t("attachments.form.currentFile")}
            </h3>
            <div className="flex items-center space-x-3">
              <svg
                className="h-8 w-8 text-gray-400"
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
              <div>
                <p className="text-sm font-medium">
                  {attachment.fileName}
                </p>
                <p className="text-xs ui-text-muted">
                  {formatFileSize(attachment.fileSize)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Attachment Type */}
        <div>
          <label
            htmlFor="type"
            className="block text-sm font-medium ui-text-muted mb-2"
          >
            {t("attachments.form.type")} *
          </label>
          <select
            id="type"
            value={formData.type}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                type: e.target.value as typeof formData.type,
              }))
            }
            className="ui-select w-full rounded-md"
            disabled={isLoading}
          >
            <option value="OTHER">{t("attachments.type.other")}</option>
            <option value="INVOICE">{t("attachments.type.invoice")}</option>
            <option value="WARRANTY">{t("attachments.type.warranty")}</option>
          </select>
        </div>

        {/* Linked Entity Info */}
        {(formData.articleId || formData.garantieId) && (
          <div className="p-3 bg-blue-50 rounded-md">
            <p className="text-sm text-blue-800">
              <strong>{t("attachments.form.linkedTo")}</strong>{" "}
              {formData.articleId
                ? t("attachments.for.article")
                : t("attachments.for.warranty")}{" "}
              ID: {formData.articleId || formData.garantieId}
            </p>
          </div>
        )}

        {/* Form Actions */}
        <div className="flex justify-end space-x-4 pt-4 border-t ui-divider">
          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-2 ui-btn-primary rounded-md"
          >
            {isLoading
              ? t("attachments.form.uploading")
              : attachment
                ? t("attachments.form.update")
                : t("attachments.form.upload")}
          </button>

          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 ui-btn-ghost border ui-divider rounded-md"
            >
              {t("common.cancel")}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default AttachmentForm;
