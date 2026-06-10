/**
 * Admin Jobs tab — live snapshot of the BullMQ queues + a collapsible
 * "Recent failures" panel. Polls /admin/jobs every 10 s while active;
 * Pause toggles the interval. Failed-cell styling is alert-red when
 * `failed > 0`. Click "Recent failures" to lazy-load the last N failed
 * jobs from `/admin/failed-jobs` (capped 50) with expandable stack traces.
 */
import { useCallback, useEffect, useState } from "react";
import { Pause, Play, ChevronDown, ChevronRight } from "lucide-react";
import { adminAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { usePreferences } from "../../preferences/preferences";
import { getErrorMessage } from "../../utils/error";
import { Button, Section, Badge } from "../ui";

type Counts = Record<string, number> | null;

type Snapshot = {
  alerts: Counts;
  maintenance: Counts;
  auditPruneNextRun: number | null;
};

type FailedJob = {
  queue: string;
  id: string | undefined;
  name: string;
  failedReason: string | undefined;
  stacktrace: string[];
  attemptsMade: number;
  maxAttempts: number | undefined;
  data: unknown;
  finishedOn: number | undefined;
};

const COUNT_FIELDS = [
  "waiting",
  "active",
  "delayed",
  "completed",
  "failed",
] as const;

export default function JobsTab() {
  const { t } = useI18n();
  const { formatDateTime } = usePreferences();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState<FailedJob[] | null>(null);
  const [showFailed, setShowFailed] = useState(false);
  const [failedError, setFailedError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadFailed = useCallback(async () => {
    try {
      const { items } = await adminAPI.getFailedJobs();
      setFailed(items);
      setFailedError(null);
    } catch (e) {
      setFailedError(getErrorMessage(e, t("admin.jobs.fetchError")));
    }
  }, [t]);

  const refresh = useCallback(async () => {
    try {
      const data = await adminAPI.getJobs();
      setSnap(data);
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e, t("admin.jobs.fetchError")));
    }
  }, [t]);

  useEffect(() => {
    void refresh();
    if (paused) return;
    const handle = setInterval(refresh, 10_000);
    return () => clearInterval(handle);
  }, [paused, refresh]);

  const renderQueue = (label: string, counts: Counts) => (
    <Section title={label}>
      {counts === null && (
        <Badge tone="warning" className="mb-2">
          {t("admin.jobs.unavailable")}
        </Badge>
      )}
      <dl className="grid grid-cols-5 gap-2 text-sm">
        {COUNT_FIELDS.map((field) => {
          const value = counts?.[field];
          const isAlert =
            field === "failed" && typeof value === "number" && value > 0;
          return (
            <div
              key={field}
              className={
                isAlert
                  ? "space-y-0.5 rounded-lg ui-alert-error px-1 py-2 text-center"
                  : "space-y-0.5 text-center"
              }
            >
              <dd className="text-lg font-semibold tabular-nums ui-title">
                {value ?? "—"}
              </dd>
              <dt className="text-xs ui-text-muted">
                {t(`admin.jobs.count.${field}`)}
              </dt>
            </div>
          );
        })}
      </dl>
    </Section>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm ui-text-muted">{t("admin.jobs.subtitle")}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPaused((p) => !p)}
          leftIcon={
            paused ? (
              <Play className="h-4 w-4" />
            ) : (
              <Pause className="h-4 w-4" />
            )
          }
        >
          {paused ? t("admin.jobs.resume") : t("admin.jobs.pause")}
        </Button>
      </div>

      {error && <p className="text-sm ui-text-error">{error}</p>}

      {renderQueue(t("admin.jobs.alertQueue"), snap?.alerts ?? null)}
      {renderQueue(t("admin.jobs.maintenanceQueue"), snap?.maintenance ?? null)}

      <p className="text-xs ui-text-muted">
        {t("admin.jobs.nextRun")}:{" "}
        {snap?.auditPruneNextRun ? formatDateTime(snap.auditPruneNextRun) : "—"}
      </p>

      <div className="ui-card space-y-2 p-4">
        <button
          type="button"
          onClick={() => {
            const next = !showFailed;
            setShowFailed(next);
            if (next && failed === null) void loadFailed();
          }}
          aria-expanded={showFailed}
          className="inline-flex items-center gap-2 rounded-lg border ui-divider px-3 py-1.5 text-sm font-medium ui-btn-ghost"
        >
          {showFailed ? (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          )}
          {t("admin.jobs.recentFailures")}
        </button>

        {showFailed && (
          <>
            {failedError && (
              <p className="text-sm ui-text-error">{failedError}</p>
            )}
            {failed === null && !failedError && (
              <p className="text-sm ui-text-muted">{t("common.loading")}</p>
            )}
            {failed && failed.length === 0 && (
              <p className="text-sm ui-text-muted">
                {t("admin.jobs.recentFailuresEmpty")}
              </p>
            )}
            {failed && failed.length > 0 && (
              <ul className="divide-y ui-divider">
                {failed.map((j) => {
                  const exhausted =
                    j.maxAttempts !== undefined &&
                    j.attemptsMade >= j.maxAttempts;
                  const rowKey = `${j.queue}:${j.id ?? j.finishedOn ?? j.name}`;
                  return (
                    <li
                      key={rowKey}
                      className={
                        exhausted
                          ? "my-1 rounded-lg ui-alert-error px-2 py-2"
                          : "py-2"
                      }
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono ui-text-muted">
                          {j.queue}
                        </span>
                        <span className="font-medium ui-title">{j.name}</span>
                        <span className="ui-text-muted">
                          {t("admin.jobs.attempt")
                            .replace("{n}", String(j.attemptsMade))
                            .replace("{max}", String(j.maxAttempts ?? "?"))}
                        </span>
                        {j.finishedOn && (
                          <span className="ui-text-muted">
                            {formatDateTime(j.finishedOn)}
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto"
                          aria-expanded={expandedId === rowKey}
                          onClick={() =>
                            setExpandedId((p) => (p === rowKey ? null : rowKey))
                          }
                        >
                          {expandedId === rowKey
                            ? t("admin.jobs.hideDetails")
                            : t("admin.jobs.viewDetails")}
                        </Button>
                      </div>
                      <p className="mt-1 break-words text-xs">
                        {j.failedReason ?? t("admin.jobs.noReason")}
                      </p>
                      {expandedId === rowKey && j.stacktrace.length > 0 && (
                        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-md ui-panel p-2 font-mono text-[10px]">
                          {j.stacktrace.join("\n")}
                        </pre>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
