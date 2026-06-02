/**
 * Warranties list — owner-scoped, with status filter (active/expiring
 * soon/expired) + claim status filter. Inline expand-to-edit per row;
 * full editor lives in `<WarrantyForm>`. Status badges use color +
 * label so the signal isn't color-only.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  ShieldCheck,
  RotateCw,
  Info,
  CalendarClock,
  Package,
} from "lucide-react";
import { useI18n } from "../../i18n/i18n";
import { warrantiesAPI } from "../../services/api";
import { getErrorMessage } from "../../utils/error";
import { ErrorBanner, EmptyState } from "../common/States";
import { Skeleton } from "../common/Skeleton";
import { PageHeader, Section, Button } from "../ui";

// Format an ISO date defensively — a malformed/empty value from the API must
// not crash the whole list. Falls back to an em dash.
function safeFormat(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = parseISO(iso);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "dd MMM yyyy");
}

type Warranty = {
  garantieId: number;
  garantieNom: string;
  garantieDateAchat: string;
  garantieDuration: number;
  garantieEndDate?: string | null;
  garantieIsValide?: boolean;
  garantieArticleId: number;
};

export default function WarrantiesView() {
  const { t } = useI18n();
  const [items, setItems] = useState<Warranty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const ta = a.garantieDateAchat
        ? new Date(a.garantieDateAchat).getTime()
        : 0;
      const tb = b.garantieDateAchat
        ? new Date(b.garantieDateAchat).getTime()
        : 0;
      return tb - ta;
    });
  }, [items]);

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
            title={t("warranties.none")}
          />
        ) : (
          <ul className="divide-y ui-divider">
            {sorted.map((w) => (
              <li key={w.garantieId} className="py-3 first:pt-0 last:pb-0">
                <div className="font-medium ui-title">{w.garantieNom}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ui-text-muted">
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("warranties.purchase")}:{" "}
                    {safeFormat(w.garantieDateAchat)}
                  </span>
                  <span>
                    {t("warranties.duration")}: {w.garantieDuration}{" "}
                    {t("warranties.months")}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Package className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("warranties.articleId")}: {w.garantieArticleId}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <p className="mt-4 text-xs ui-text-muted">{t("warranties.note")}</p>
    </div>
  );
}
