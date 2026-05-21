import { useState } from "react";
import { articlesAPI, warrantiesAPI, attachmentsAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";
import { useToast } from "../common/Toast";
import { toCSV, downloadFile } from "../../utils/csv";

type ExportFormat = "csv" | "json";
type ExportTarget = "articles" | "warranties" | "attachments";

function formatDateForFilename(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("");
}

export default function DataExportPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const exportData = async (target: ExportTarget, format: ExportFormat) => {
    setBusy(`${target}:${format}`);
    try {
      const stamp = formatDateForFilename(new Date());
      const filename = `wim-${target}-${stamp}.${format}`;

      if (target === "articles") {
        const rows = await articlesAPI.getAll(undefined, 1, 1000);
        if (format === "json") {
          downloadFile(
            filename,
            JSON.stringify(rows, null, 2),
            "application/json"
          );
        } else {
          const csv = toCSV(
            rows.map(
              (r: {
                articleId: number;
                articleNom: string;
                articleModele: string;
                articleDescription?: string | null;
                productImageUrl?: string | null;
                sharedWithPowerUsers?: boolean;
                createdAt: string;
                updatedAt: string;
                garantie?: {
                  garantieNom?: string;
                  garantieFin?: string;
                  garantieIsValide?: boolean;
                } | null;
              }) => ({
                articleId: r.articleId,
                name: r.articleNom,
                model: r.articleModele,
                description: r.articleDescription ?? "",
                imageUrl: r.productImageUrl ?? "",
                sharedPublicly: r.sharedWithPowerUsers ? "yes" : "no",
                warrantyName: r.garantie?.garantieNom ?? "",
                warrantyEndDate: r.garantie?.garantieFin ?? "",
                warrantyActive: r.garantie
                  ? r.garantie.garantieIsValide
                    ? "yes"
                    : "no"
                  : "",
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
              })
            ),
            [
              { key: "articleId", header: "Article ID" },
              { key: "name", header: "Name" },
              { key: "model", header: "Model" },
              { key: "description", header: "Description" },
              { key: "imageUrl", header: "Image URL" },
              { key: "sharedPublicly", header: "Shared publicly" },
              { key: "warrantyName", header: "Warranty name" },
              { key: "warrantyEndDate", header: "Warranty end date" },
              { key: "warrantyActive", header: "Warranty active" },
              { key: "createdAt", header: "Created at" },
              { key: "updatedAt", header: "Updated at" },
            ]
          );
          downloadFile(filename, csv, "text/csv");
        }
      } else if (target === "warranties") {
        const rows = await warrantiesAPI.getAll(1, 1000);
        if (format === "json") {
          downloadFile(
            filename,
            JSON.stringify(rows, null, 2),
            "application/json"
          );
        } else {
          const csv = toCSV(
            rows.map((r) => ({
              garantieId: r.garantieId,
              articleId: r.garantieArticleId ?? "",
              name: r.garantieNom,
              purchaseDate: r.garantieDateAchat,
              durationMonths: r.garantieDuration,
              endDate: r.garantieFin,
              active: r.garantieIsValide ? "yes" : "no",
            })),
            [
              { key: "garantieId", header: "Warranty ID" },
              { key: "articleId", header: "Article ID" },
              { key: "name", header: "Name" },
              { key: "purchaseDate", header: "Purchase date" },
              { key: "durationMonths", header: "Duration (months)" },
              { key: "endDate", header: "End date" },
              { key: "active", header: "Active" },
            ]
          );
          downloadFile(filename, csv, "text/csv");
        }
      } else {
        const rows = await attachmentsAPI.getAll({ page: 1, limit: 1000 });
        if (format === "json") {
          downloadFile(
            filename,
            JSON.stringify(rows, null, 2),
            "application/json"
          );
        } else {
          const csv = toCSV(
            rows.map(
              (r: {
                attachmentId: number;
                fileName: string;
                mimeType: string;
                fileSize: number;
                type: string;
                articleId?: number;
                garantieId?: number;
                createdAt: string;
                fileUrl: string;
              }) => ({
                attachmentId: r.attachmentId,
                fileName: r.fileName,
                mimeType: r.mimeType,
                fileSize: r.fileSize,
                type: r.type,
                articleId: r.articleId ?? "",
                garantieId: r.garantieId ?? "",
                createdAt: r.createdAt,
                fileUrl: r.fileUrl,
              })
            ),
            [
              { key: "attachmentId", header: "Attachment ID" },
              { key: "fileName", header: "File name" },
              { key: "mimeType", header: "MIME type" },
              { key: "fileSize", header: "Size (bytes)" },
              { key: "type", header: "Type" },
              { key: "articleId", header: "Article ID" },
              { key: "garantieId", header: "Warranty ID" },
              { key: "createdAt", header: "Created at" },
              { key: "fileUrl", header: "File URL" },
            ]
          );
          downloadFile(filename, csv, "text/csv");
        }
      }

      toast.show(
        t("export.success")
          .replace("{target}", t(`export.target.${target}`))
          .replace("{format}", format.toUpperCase()),
        { kind: "success" }
      );
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  const Row = ({ target }: { target: ExportTarget }) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm flex-1 min-w-0">
        {t(`export.target.${target}`)}
      </span>
      <button
        type="button"
        onClick={() => exportData(target, "csv")}
        disabled={busy !== null}
        className="text-sm px-3 py-1.5 ui-btn-ghost border ui-divider rounded-md"
      >
        {busy === `${target}:csv` ? t("common.loading") : "CSV"}
      </button>
      <button
        type="button"
        onClick={() => exportData(target, "json")}
        disabled={busy !== null}
        className="text-sm px-3 py-1.5 ui-btn-ghost border ui-divider rounded-md"
      >
        {busy === `${target}:json` ? t("common.loading") : "JSON"}
      </button>
    </div>
  );

  return (
    <div className="ui-card rounded-xl p-6 space-y-3">
      <div>
        <h2 className="font-semibold ui-title">{t("export.title")}</h2>
        <p className="text-sm ui-text-muted">{t("export.subtitle")}</p>
      </div>
      <div className="space-y-2 divide-y ui-divider">
        <div className="pt-1 first:pt-0">
          <Row target="articles" />
        </div>
        <div className="pt-2">
          <Row target="warranties" />
        </div>
        <div className="pt-2">
          <Row target="attachments" />
        </div>
      </div>
    </div>
  );
}
