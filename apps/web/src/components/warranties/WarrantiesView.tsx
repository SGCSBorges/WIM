/**
 * Warranties list — owner-scoped, with status filter (active/expiring
 * soon/expired) + claim status filter. Inline expand-to-edit per row;
 * full editor lives in `<WarrantyForm>`. Status badges use color +
 * label so the signal isn't color-only.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ShieldCheck,
  RotateCw,
  Info,
  CalendarClock,
  Package,
} from "lucide-react";
import { useI18n } from "../../i18n/i18n";
import { usePreferences } from "../../preferences/preferences";
import { warrantiesAPI } from "../../services/api";
import { getErrorMessage } from "../../utils/error";
import { ErrorBanner, EmptyState } from "../common/States";
import { Skeleton } from "../common/Skeleton";
import { PageHeader, Section, Button, Badge, Segmented } from "../ui";
import {
  warrantyStatusFor,
  type WarrantyStatus,
} from "../../utils/warrantyStatus";
import RenewWarrantyDialog from "./RenewWarrantyDialog";

type Warranty = {
  garantieId: number;
  garantieNom: string;
  garantieDateAchat: string;
  garantieDuration: number;
  garantieFin?: string | null;
  garantieEndDate?: string | null;
  garantieIsValide?: boolean;
  garantieArticleId: number;
  renewedAt?: string | null;
};

type StatusFilter = WarrantyStatus | "all";

export default function WarrantiesView() {
  const { t } = useI18n();
  const { formatDate } = usePreferences();
  // Pref-aware date with a defensive em-dash fallback — a malformed value
  // from the API must not crash the whole list.
  const safeFormat = (iso: string | null | undefined) => formatDate(iso) || "—";
  const [items, setItems] = useState<Warranty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [renewing, setRenewing] = useState<Warranty | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await warrantiesAPI.getAll();
      setItems(data as Warranty[]);
    } catch (e: unknown) {
      setError(getErrorMessage(e, t("warranties.error.fetch")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Sort newest-first, then filter by warranty status. The status check uses
  // the shared `warrantyStatusFor` so the badge in the row and the filter
  // pill always agree.
  const sorted = useMemo(() => {
    const ordered = [...items].sort((a, b) => {
      const ta = a.garantieDateAchat
        ? new Date(a.garantieDateAchat).getTime()
        : 0;
      const tb = b.garantieDateAchat
        ? new Date(b.garantieDateAchat).getTime()
        : 0;
      return tb - ta;
    });
    if (statusFilter === "all") return ordered;
    return ordered.filter(
      (w) =>
        warrantyStatusFor(w.garantieFin ?? w.garantieEndDate).status ===
        statusFilter
    );
  }, [items, statusFilter]);

  return (
    <div>
      <PageHeader
        icon={<ShieldCheck className="h-5 w-5" />}
        title={t("warranties.title")}
        subtitle={t("warranties.subtitle")}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAll}
            disabled={loading}
            leftIcon={<RotateCw className="h-4 w-4" />}
          >
            {t("common.refresh")}
          </Button>
        }
      />

      <div className="mb-6 flex items-start gap-2 rounded-xl border ui-alert-info p-4 text-sm">
        <Info
          className="mt-0.5 h-4 w-4 shrink-0 text-primary"
          aria-hidden="true"
        />
        <span>{t("warranties.createDisabled.message")}</span>
      </div>

      {error && (
        <ErrorBanner
          message={error}
          onRetry={fetchAll}
          retryLabel={t("common.retry")}
          className="mb-6"
        />
      )}

      <div className="mb-3">
        <Segmented
          ariaLabel={t("warranties.statusFilter")}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          options={[
            { value: "all", label: t("warranties.statusFilter.all") },
            { value: "active", label: t("warrantyStatus.active") },
            { value: "expiringSoon", label: t("warrantyStatus.expiringSoon") },
            { value: "expired", label: t("warrantyStatus.expired") },
          ]}
        />
      </div>

      <Section title={t("warranties.all")}>
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={64} />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="h-6 w-6" />}
            title={
              statusFilter !== "all"
                ? t("warranties.emptyFiltered")
                : t("warranties.none")
            }
          />
        ) : (
          <ul className="divide-y ui-divider">
            {sorted.map((w) => {
              const info = warrantyStatusFor(
                w.garantieFin ?? w.garantieEndDate
              );
              return (
                <li
                  key={w.garantieId}
                  className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium ui-title">
                        {w.garantieNom}
                      </span>
                      <Badge tone={info.tone}>{t(info.labelKey)}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ui-text-muted">
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                        {t("warranties.purchase")}:{" "}
                        {safeFormat(w.garantieDateAchat)}
                      </span>
                      <span>
                        {t("warranties.duration")}: {w.garantieDuration}{" "}
                        {t("warranties.months")}
                      </span>
                      {(w.garantieFin ?? w.garantieEndDate) && (
                        <span>
                          {t("warrantyForm.expiresOn")}{" "}
                          {safeFormat(w.garantieFin ?? w.garantieEndDate)}
                        </span>
                      )}
                      <Link
                        to={`/articles/${w.garantieArticleId}`}
                        className="inline-flex items-center gap-1 hover:text-primary"
                      >
                        <Package className="h-3.5 w-3.5" aria-hidden="true" />
                        {t("warranties.viewArticle")}
                      </Link>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<RotateCw className="h-4 w-4" />}
                    onClick={() => setRenewing(w)}
                  >
                    {t("warranty.renew.button")}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {renewing && (
        <RenewWarrantyDialog
          open
          warranty={renewing}
          mode={
            warrantyStatusFor(renewing.garantieFin ?? renewing.garantieEndDate)
              .status === "expired"
              ? "renew"
              : "extend"
          }
          onClose={() => setRenewing(null)}
          onUpdated={(updated) => {
            setItems((prev) =>
              prev.map((w) =>
                w.garantieId === updated.garantieId
                  ? ({ ...w, ...updated } as Warranty)
                  : w
              )
            );
          }}
        />
      )}

      <p className="mt-4 text-xs ui-text-muted">{t("warranties.note")}</p>
    </div>
  );
}
