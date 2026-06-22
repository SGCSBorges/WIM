/**
 * Reports surface — currently one report: the insurance portfolio PDF. The
 * filter set mirrors the article list (location / tag / warranty status) so
 * a user can scope the PDF to one room or one tag, and the report renders
 * server-side with the same depreciation logic the dashboard uses (so
 * totals don't drift between surfaces).
 *
 * Built lazily so PDFKit's blob path stays out of the main bundle until the
 * user actually opens /reports.
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, Download, FileText } from "lucide-react";
import { locationsAPI, reportsAPI, tagsAPI } from "../../services/api";
import { ARTICLE_STATUSES, type ArticleStatus } from "@wim/types";
import { useI18n } from "../../i18n/i18n";
import { useToast } from "../common/Toast";
import { getErrorMessage } from "../../utils/error";
import { downloadBlob } from "../../utils/csv";
import { Button, Field, PageHeader, Section, Select } from "../ui";

type WarrantyStatus = "valid" | "expiringSoon" | "expired" | "none";

interface LocationOption {
  locationId: number;
  name: string;
}
interface TagOption {
  tagId: number;
  name: string;
}

export default function ReportsView() {
  const { t } = useI18n();
  const toast = useToast();

  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [locationId, setLocationId] = useState<string>("");
  const [tagId, setTagId] = useState<string>("");
  const [warrantyStatus, setWarrantyStatus] = useState<"" | WarrantyStatus>("");
  // Allow deep-linking a status-scoped report, e.g. /reports?status=LOST from a
  // lost item's detail page — the lost/sold/disposed "records report" path.
  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get("status") ?? "";
  const [status, setStatus] = useState<"" | ArticleStatus>(
    (ARTICLE_STATUSES as readonly string[]).includes(initialStatus)
      ? (initialStatus as ArticleStatus)
      : ""
  );
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    void locationsAPI
      .getAll(1, 200)
      .then((data) => {
        // The locations endpoint can return either { items, total } or a
        // bare list depending on whether pagination params are supplied.
        const items = Array.isArray(data) ? data : (data.items ?? []);
        setLocations(items);
      })
      .catch(() => {});
    void tagsAPI
      .getAll()
      .then(setTags)
      .catch(() => {});
  }, []);

  const downloadPortfolio = async () => {
    setDownloading(true);
    try {
      const blob = await reportsAPI.portfolioPdf({
        locationId: locationId ? Number(locationId) : null,
        tagId: tagId ? Number(tagId) : null,
        warrantyStatus: warrantyStatus || null,
        status: status || null,
      });
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(`wim-portfolio-${date}.pdf`, blob);
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 2000);
      toast.show(t("reports.portfolio.success"), { kind: "success" });
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <PageHeader
        icon={<FileText className="h-5 w-5" />}
        title={t("reports.title")}
        subtitle={t("reports.subtitle")}
      />

      <Section
        title={t("reports.portfolio.title")}
        description={t("reports.portfolio.subtitle")}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("reports.filter.location")} htmlFor="report-location">
            <Select
              id="report-location"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              <option value="">{t("reports.filter.allLocations")}</option>
              {locations.map((l) => (
                <option key={l.locationId} value={l.locationId}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("reports.filter.tag")} htmlFor="report-tag">
            <Select
              id="report-tag"
              value={tagId}
              onChange={(e) => setTagId(e.target.value)}
            >
              <option value="">{t("reports.filter.allTags")}</option>
              {tags.map((tg) => (
                <option key={tg.tagId} value={tg.tagId}>
                  {tg.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={t("reports.filter.warrantyStatus")}
            htmlFor="report-warranty"
          >
            <Select
              id="report-warranty"
              value={warrantyStatus}
              onChange={(e) =>
                setWarrantyStatus(e.target.value as "" | WarrantyStatus)
              }
            >
              <option value="">{t("reports.filter.allWarranties")}</option>
              <option value="valid">{t("warrantyStatus.active")}</option>
              <option value="expiringSoon">
                {t("warrantyStatus.expiringSoon")}
              </option>
              <option value="expired">{t("warrantyStatus.expired")}</option>
              <option value="none">{t("warrantyStatus.none")}</option>
            </Select>
          </Field>
          <Field label={t("reports.filter.status")} htmlFor="report-status">
            <Select
              id="report-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as "" | ArticleStatus)}
            >
              <option value="">{t("reports.filter.status.owned")}</option>
              {ARTICLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`articleStatus.${s}`)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            onClick={downloadPortfolio}
            loading={downloading}
            leftIcon={
              downloaded ? (
                <Check className="h-4 w-4" />
              ) : (
                <Download className="h-4 w-4" />
              )
            }
          >
            {t("reports.portfolio.download")}
          </Button>
          <span className="text-xs ui-text-muted">
            {t("reports.portfolio.includesNote")}
          </span>
        </div>
      </Section>
    </div>
  );
}
