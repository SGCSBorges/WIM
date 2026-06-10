/**
 * Actionable "Needs attention" panel above the Dashboard charts. Pulls the
 * caller's expired + expiring-soon articles via the existing articles list
 * endpoint (small limit, warrantyStatus filter), and renders each row with a
 * link to the article + a quick-snooze for any scheduled warranty alert
 * already linked to it.
 *
 * Why this and not the dashboard time-series widget? Charts inform; this
 * panel acts — it's the single most important thing on the home screen for
 * a warranty manager: "what's about to bite you".
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  TriangleAlert,
  ShieldAlert,
  Clock,
  ArrowRight,
  RotateCw,
} from "lucide-react";
import { alertsAPI, articlesAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { usePreferences } from "../../preferences/preferences";
import { useToast } from "../common/Toast";
import { Section, Button, Badge } from "../ui";
import RenewWarrantyDialog from "../warranties/RenewWarrantyDialog";
import type { FetchedArticle } from "../../types";

interface Row {
  article: FetchedArticle;
  tone: "danger" | "warning";
  endDate: string | null;
}

const VISIBLE_LIMIT = 5;

function endDate(a: FetchedArticle): string | null {
  return a.garantie?.garantieFin ?? null;
}

export default function NeedsAttention() {
  const { t } = useI18n();
  const { formatDate } = usePreferences();
  const navigate = useNavigate();
  const toast = useToast();

  const [rows, setRows] = useState<Row[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  // Article whose warranty the user is renewing/extending right now. We pin
  // the article (not just the warranty) so the optimistic remove can match
  // the row by articleId after the dialog closes.
  const [renewing, setRenewing] = useState<FetchedArticle | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [expired, soon] = await Promise.all([
          articlesAPI.getAll({ warrantyStatus: "expired", limit: 8 }),
          articlesAPI.getAll({ warrantyStatus: "expiringSoon", limit: 8 }),
        ]);
        if (cancelled) return;
        const merged: Row[] = [
          ...expired.items.map((a) => ({
            article: a,
            tone: "danger" as const,
            endDate: endDate(a),
          })),
          ...soon.items.map((a) => ({
            article: a,
            tone: "warning" as const,
            endDate: endDate(a),
          })),
        ];
        setRows(merged.slice(0, VISIBLE_LIMIT));
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return null;
  // Skeleton-ish space; the rest of the dashboard already shows its own.
  if (!rows) return null;
  if (rows.length === 0) return null;

  // Snooze the next scheduled warranty alert (if any) for this article.
  const snooze = async (a: FetchedArticle) => {
    setBusyId(a.articleId);
    try {
      const items = await alertsAPI.getAll(
        "SCHEDULED",
        1,
        1,
        "WARRANTY",
        a.articleId
      );
      const next = Array.isArray(items) ? items[0] : null;
      if (!next) {
        toast.show(t("needsAttention.noPendingAlert"), { kind: "info" });
        return;
      }
      await alertsAPI.snooze(next.alerteId, 7);
      setRows((prev) =>
        prev ? prev.filter((r) => r.article.articleId !== a.articleId) : prev
      );
      toast.show(t("needsAttention.snoozed"), { kind: "success" });
    } catch {
      toast.show(t("notifications.snoozeError"), { kind: "error" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Section
      icon={<TriangleAlert className="h-5 w-5" />}
      title={t("needsAttention.title")}
      description={t("needsAttention.subtitle")}
      className="mb-6"
      actions={
        <Button
          variant="ghost"
          size="sm"
          rightIcon={<ArrowRight className="h-4 w-4" />}
          onClick={() => navigate("/articles")}
        >
          {t("needsAttention.seeAll")}
        </Button>
      }
    >
      <ul className="divide-y divide-line">
        {rows.map(({ article, tone, endDate: end }) => (
          <li
            key={`${tone}-${article.articleId}`}
            className="flex flex-wrap items-center gap-3 py-2"
          >
            <Badge tone={tone}>
              {tone === "danger" ? (
                <ShieldAlert className="h-3 w-3" />
              ) : (
                <Clock className="h-3 w-3" />
              )}
              {tone === "danger"
                ? t("dashboard.expired")
                : t("dashboard.expiringSoon")}
            </Badge>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium ui-title">
                {article.articleNom}
              </p>
              {end && (
                <p className="truncate text-xs ui-text-muted">
                  {tone === "danger"
                    ? t("needsAttention.expiredOn")
                    : t("needsAttention.expiresOn")}{" "}
                  {formatDate(end)}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={busyId === article.articleId}
              onClick={() => snooze(article)}
            >
              {t("notifications.snooze.7d")}
            </Button>
            {article.garantie && (
              <Button
                variant="outline"
                size="sm"
                leftIcon={<RotateCw className="h-4 w-4" />}
                onClick={() => setRenewing(article)}
              >
                {t("warranty.renew.button")}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/articles/${article.articleId}`)}
            >
              {t("notifications.viewArticle")}
            </Button>
          </li>
        ))}
      </ul>

      {renewing?.garantie && (
        <RenewWarrantyDialog
          open
          mode={
            renewing.garantie.garantieFin &&
            new Date(renewing.garantie.garantieFin).getTime() < Date.now()
              ? "renew"
              : "extend"
          }
          warranty={renewing.garantie}
          onClose={() => setRenewing(null)}
          onUpdated={() => {
            // Once renewed/extended, the article no longer needs attention —
            // drop it from the list optimistically.
            setRows((prev) =>
              prev
                ? prev.filter((r) => r.article.articleId !== renewing.articleId)
                : prev
            );
          }}
        />
      )}
    </Section>
  );
}
