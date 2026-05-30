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
        const { items: rows } = await articlesAPI.getAll({ limit: 200 });
        if (format === "json") {
          downloadFile(
            filename,
            JSON.stringify(rows, null, 2),
            "application/json"
          );
        } else {
          const csv = toCSV(
            rows.map((r) => ({
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
            })),
            [
              { key: "articleId", header: t("export.headers.articleId") },
              { key: "name", header: t("export.headers.name") },
              { key: "model", header: t("export.headers.model") },
              { key: "description", header: t("export.headers.description") },
              { key: "imageUrl", header: t("export.headers.imageUrl") },
              {
                key: "sharedPublicly",
                header: t("export.headers.sharedPublicly"),
              },
              {
                key: "warrantyName",
                header: t("export.headers.warrantyName"),
              },
              {
                key: "warrantyEndDate",
                header: t("export.headers.warrantyEndDate"),
              },
              {
                key: "warrantyActive",
                header: t("export.headers.warrantyActive"),
              },
              { key: "createdAt", header: t("export.headers.createdAt") },
              { key: "updatedAt", header: t("export.headers.updatedAt") },
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
              { key: "garantieId", header: t("export.headers.warrantyId") },
              { key: "articleId", header: t("export.headers.articleId") },
              { key: "name", header: t("export.headers.name") },
              {
                key: "purchaseDate",
                header: t("export.headers.purchaseDate"),
              },
              {
                key: "durationMonths",
                header: t("export.headers.durationMonths"),
              },
              { key: "endDate", header: t("export.headers.endDate") },
              { key: "active", header: t("export.headers.active") },
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
              {
                key: "attachmentId",
                header: t("export.headers.attachmentId"),
              },
              { key: "fileName", header: t("export.headers.fileName") },
              { key: "mimeType", header: t("export.headers.mimeType") },
              { key: "fileSize", header: t("export.headers.fileSize") },
              { key: "type", header: t("export.headers.type") },
              { key: "articleId", header: t("export.headers.articleId") },
              { key: "garantieId", header: t("export.headers.warrantyId") },
              { key: "createdAt", header: t("export.headers.createdAt") },
              { key: "fileUrl", header: t("export.headers.fileUrl") },
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
