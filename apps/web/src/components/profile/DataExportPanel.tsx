/**
 * "Export your data" panel inside Profile. Per-target buttons (articles,
 * warranties, attachments) × per-format (CSV, JSON). Server returns rows
 * via the regular list endpoints; the CSV path uses `toCSV` from utils/csv
 * with i18n'd column headers. Sub-component of ProfileView, hoisted to
 * keep that file scannable.
 */
import { useState } from "react";
import { DatabaseBackup, Loader2 } from "lucide-react";
import {
  articlesAPI,
  warrantiesAPI,
  attachmentsAPI,
  profileAPI,
} from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";
import { useToast } from "../common/Toast";
import { toCSV, downloadFile, downloadBlob } from "../../utils/csv";

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

  // Server-side full-account export — every owned record in one JSON file
  // (not capped like the per-target client-side exports below).
  const exportFullAccount = async () => {
    setBusy("account:json");
    try {
      const blob = await profileAPI.exportAccount();
      const stamp = formatDateForFilename(new Date());
      downloadBlob(`wim-account-export-${stamp}.json`, blob);
      toast.show(
        t("export.success")
          .replace("{target}", t("export.target.account"))
          .replace("{format}", "JSON"),
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

  const exportData = async (target: ExportTarget, format: ExportFormat) => {
    setBusy(`${target}:${format}`);
    try {
      const stamp = formatDateForFilename(new Date());
      const filename = `wim-${target}-${stamp}.${format}`;

      if (target === "articles") {
        const { items: rows, total } = await articlesAPI.getAll({ limit: 200 });
        if (total > rows.length) {
          toast.show(t("export.truncated").replace("{total}", String(total)), {
            kind: "info",
          });
        }
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
        const rows = await warrantiesAPI.getAll(1, 500);
        if (rows.length >= 500) {
          toast.show(t("export.truncated").replace("{total}", "500+"), {
            kind: "info",
          });
        }
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
        aria-busy={busy === `${target}:csv`}
        className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 ui-btn-ghost border ui-divider rounded-md"
      >
        {busy === `${target}:csv` && (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        )}
        CSV
      </button>
      <button
        type="button"
        onClick={() => exportData(target, "json")}
        disabled={busy !== null}
        aria-busy={busy === `${target}:json`}
        className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 ui-btn-ghost border ui-divider rounded-md"
      >
        {busy === `${target}:json` && (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        )}
        JSON
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
        <div className="pt-2 flex flex-wrap items-center gap-2">
          <span className="text-sm flex-1 min-w-0">
            {t("export.target.account")}
          </span>
          <button
            type="button"
            onClick={exportFullAccount}
            disabled={busy !== null}
            aria-busy={busy === "account:json"}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 ui-btn-ghost border ui-divider rounded-md"
          >
            {busy === "account:json" ? (
              <Loader2
                className="h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <DatabaseBackup className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {t("export.account.button")}
          </button>
        </div>
      </div>
    </div>
  );
}
