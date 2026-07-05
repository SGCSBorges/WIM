/**
 * Service / maintenance log for an article-detail page. Logs repairs, tune-ups
 * and cleanings (date, description, optional cost + provider) and keeps a
 * newest-first history. An optional next-service date schedules a reminder
 * server-side and drives a "next service due" badge on the most recent entry.
 */
import { useCallback, useEffect, useState } from "react";
import { Wrench, Plus, Trash2, Check, CalendarClock } from "lucide-react";
import { serviceRecordsAPI } from "../../services/api";
import type { ServiceRecordItem } from "../../types";
import { useI18n } from "../../i18n/i18n";
import { usePreferences } from "../../preferences/preferences";
import { getErrorMessage } from "../../utils/error";
import { formatMoney } from "../../utils/money";
import { useFeature, useFeatures } from "../../features/features";
import LockedFeatureNotice from "../common/LockedFeatureNotice";
import { useToast } from "../common/Toast";
import { Section, Button, Input, Textarea, Badge } from "../ui";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function MaintenanceSection({
  articleId,
}: {
  articleId: number;
}) {
  const { t, language } = useI18n();
  const { formatDate, currency } = usePreferences();
  const toast = useToast();
  const allowed = useFeature("maintenance");
  const { loaded: featuresLoaded } = useFeatures();
  const [records, setRecords] = useState<ServiceRecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [performedAt, setPerformedAt] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const [provider, setProvider] = useState("");
  const [nextDueAt, setNextDueAt] = useState("");
  const [intervalMonths, setIntervalMonths] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRecords(await serviceRecordsAPI.list(articleId));
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [articleId]);

  useEffect(() => {
    if (!allowed) return;
    void load();
  }, [load, allowed]);

  const create = async () => {
    if (!description.trim()) return;
    setCreating(true);
    try {
      await serviceRecordsAPI.create({
        articleId,
        performedAt: new Date(performedAt).toISOString(),
        description: description.trim(),
        cost: cost.trim() ? Number(cost) : null,
        provider: provider.trim() || null,
        nextDueAt: nextDueAt ? new Date(nextDueAt).toISOString() : null,
        intervalMonths: intervalMonths.trim() ? Number(intervalMonths) : null,
      });
      setDescription("");
      setCost("");
      setProvider("");
      setNextDueAt("");
      setIntervalMonths("");
      setPerformedAt(todayISO());
      setShowForm(false);
      await load();
      toast.show(t("service.logged"), { kind: "success" });
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setCreating(false);
    }
  };

  const remove = async (serviceId: number) => {
    setBusyId(serviceId);
    try {
      await serviceRecordsAPI.remove(serviceId);
      await load();
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  // The soonest upcoming next-service date across the log drives the badge.
  const upcoming = records
    .map((r) => r.nextDueAt)
    .filter(
      (d): d is string => d !== null && new Date(d).getTime() > Date.now()
    )
    .sort()[0];

  if (!featuresLoaded) return null;
  if (!allowed)
    return (
      <LockedFeatureNotice
        icon={<Wrench className="h-5 w-5" />}
        title={t("service.title")}
      />
    );

  return (
    <Section
      icon={<Wrench className="h-5 w-5" />}
      title={t("service.title")}
      className="mb-6"
      actions={
        <div className="flex items-center gap-2">
          {upcoming && (
            <Badge tone="info" icon={<CalendarClock className="h-3 w-3" />}>
              {t("service.nextDue")}: {formatDate(upcoming)}
            </Badge>
          )}
          {!showForm && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowForm(true)}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              {t("service.log")}
            </Button>
          )}
        </div>
      }
    >
      {showForm && (
        <div className="mb-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              type="date"
              value={performedAt}
              onChange={(e) => setPerformedAt(e.target.value)}
              aria-label={t("service.date")}
              title={t("service.date")}
            />
            <Input
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder={t("service.provider")}
              aria-label={t("service.provider")}
              maxLength={150}
            />
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder={t("service.cost")}
              aria-label={t("service.cost")}
            />
            <Input
              type="date"
              value={nextDueAt}
              onChange={(e) => setNextDueAt(e.target.value)}
              aria-label={t("service.nextDue")}
              title={t("service.nextDue")}
            />
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={120}
              step="1"
              value={intervalMonths}
              onChange={(e) => setIntervalMonths(e.target.value)}
              placeholder={t("service.intervalMonths")}
              aria-label={t("service.intervalMonths")}
              title={t("service.intervalHint")}
            />
          </div>
          <p className="text-xs ui-text-muted">{t("service.intervalHint")}</p>
          <div>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("service.description")}
              aria-label={t("service.description")}
              maxLength={300}
            />
            <p className="text-right text-xs ui-text-muted tabular-nums">
              {description.length} / 300
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={create}
              loading={creating}
              disabled={!description.trim()}
              leftIcon={<Check className="h-4 w-4" />}
            >
              {t("service.log")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowForm(false)}
              disabled={creating}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      )}

      {!loading && records.length === 0 && !showForm ? (
        <p className="text-sm ui-text-muted">{t("service.none")}</p>
      ) : (
        <ul className="divide-y ui-divider text-sm">
          {records.map((r) => (
            <li key={r.serviceId} className="flex gap-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium ui-title">
                    {formatDate(r.performedAt)}
                  </span>
                  {r.cost != null && (
                    <span className="ui-text-muted">
                      {formatMoney(Number(r.cost), currency, language)}
                    </span>
                  )}
                  {r.provider && (
                    <span className="truncate ui-text-muted" title={r.provider}>
                      · {r.provider}
                    </span>
                  )}
                </div>
                <p className="break-words">{r.description}</p>
                {r.intervalMonths != null && (
                  <Badge tone="neutral">
                    {t("service.intervalBadge").replace(
                      "{months}",
                      String(r.intervalMonths)
                    )}
                  </Badge>
                )}
                {r.nextDueAt && (
                  <p className="mt-0.5 inline-flex items-center gap-1 text-xs ui-text-muted">
                    <CalendarClock className="h-3 w-3" aria-hidden="true" />
                    {t("service.nextDue")}: {formatDate(r.nextDueAt)}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void remove(r.serviceId)}
                loading={busyId === r.serviceId}
                aria-label={t("common.delete")}
                className="shrink-0 text-danger"
                leftIcon={<Trash2 className="h-4 w-4" />}
              />
            </li>
          ))}
        </ul>
      )}

      {(() => {
        const total = records.reduce(
          (sum, r) => sum + (r.cost != null ? Number(r.cost) : 0),
          0
        );
        return total > 0 ? (
          <p className="mt-3 border-t ui-divider pt-2 text-right text-sm ui-text-muted">
            {t("service.totalSpent")}:{" "}
            <span className="font-semibold tabular-nums ui-title">
              {formatMoney(total, currency, language)}
            </span>
          </p>
        ) : null;
      })()}
    </Section>
  );
}
