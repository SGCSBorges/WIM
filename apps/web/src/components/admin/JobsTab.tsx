import { useCallback, useEffect, useState } from "react";
import { adminAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";

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

// Stable column order so a flickering counter doesn't reshuffle the row.
const COUNT_FIELDS = [
  "waiting",
  "active",
  "delayed",
  "completed",
  "failed",
] as const;

export default function JobsTab() {
  const { t, language } = useI18n();
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

  // Refetch on mount + every 10s unless paused. The polling is plain because
  // queue depth changes slowly; SSE/WebSocket would be overkill.
  useEffect(() => {
    void refresh();
    if (paused) return;
    const handle = setInterval(refresh, 10_000);
    return () => clearInterval(handle);
  }, [paused, refresh]);

  const renderQueue = (label: string, counts: Counts) => (
    <div className="ui-card rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">{label}</h3>
        {counts === null && (
          <span className="text-xs ui-badge-warning px-1.5 py-0.5 rounded">
            {t("admin.jobs.unavailable")}
          </span>
        )}
      </div>
      <dl className="grid grid-cols-5 gap-2 text-sm">
        {COUNT_FIELDS.map((field) => {
          const value = counts?.[field];
          // Failed > 0 deserves attention: render the cell with the warn
          // styling so an operator's eye lands on it during the routine scan.
          const isAlert =
            field === "failed" && typeof value === "number" && value > 0;
          return (
            <div
              key={field}
              className={
                isAlert
                  ? "space-y-0.5 text-center ui-alert-error rounded px-1 py-1"
                  : "space-y-0.5 text-center"
              }
            >
              <dd className="font-semibold tabular-nums">{value ?? "—"}</dd>
              <dt className="text-xs ui-text-muted">
                {t(`admin.jobs.count.${field}`)}
              </dt>
            </div>
          );
        })}
      </dl>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm ui-text-muted">{t("admin.jobs.subtitle")}</p>
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className="text-sm ui-btn-ghost border ui-divider rounded px-3 py-1"
        >
          {paused ? t("admin.jobs.resume") : t("admin.jobs.pause")}
        </button>
      </div>

      {error && <p className="text-sm ui-text-error">{error}</p>}

      {renderQueue(t("admin.jobs.alertQueue"), snap?.alerts ?? null)}
      {renderQueue(t("admin.jobs.maintenanceQueue"), snap?.maintenance ?? null)}

      <p className="text-xs ui-text-muted">
        {t("admin.jobs.nextRun")}:{" "}
        {snap?.auditPruneNextRun
          ? new Date(snap.auditPruneNextRun).toLocaleString(language)
          : "—"}
      </p>

      <div className="ui-card rounded-lg p-4 space-y-2">
        <button
          type="button"
          onClick={() => {
            const next = !showFailed;
            setShowFailed(next);
            if (next && failed === null) void loadFailed();
          }}
          aria-expanded={showFailed}
          className="text-sm font-medium ui-btn-ghost border ui-divider rounded px-3 py-1"
        >
          {showFailed
            ? `▾ ${t("admin.jobs.recentFailures")}`
            : `▸ ${t("admin.jobs.recentFailures")}`}
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
                          ? "py-2 ui-alert-error rounded px-2 my-1"
                          : "py-2"
                      }
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono ui-text-muted">
                          {j.queue}
                        </span>
                        <span className="font-medium">{j.name}</span>
                        <span className="ui-text-muted">
                          {t("admin.jobs.attempt")
                            .replace("{n}", String(j.attemptsMade))
                            .replace("{max}", String(j.maxAttempts ?? "?"))}
                        </span>
                        {j.finishedOn && (
                          <span className="ui-text-muted">
                            {new Date(j.finishedOn).toLocaleString(language)}
                          </span>
                        )}
                        <button
                          type="button"
                          className="ml-auto text-xs ui-btn-ghost border ui-divider rounded px-2"
                          onClick={() =>
                            setExpandedId((p) => (p === rowKey ? null : rowKey))
                          }
                          aria-expanded={expandedId === rowKey}
                        >
                          {expandedId === rowKey
                            ? t("admin.jobs.hideDetails")
                            : t("admin.jobs.viewDetails")}
                        </button>
                      </div>
                      <p className="text-xs mt-1 break-words">
                        {j.failedReason ?? t("admin.jobs.noReason")}
                      </p>
                      {expandedId === rowKey && j.stacktrace.length > 0 && (
                        <pre className="mt-1 text-[10px] font-mono whitespace-pre-wrap ui-panel rounded p-2 overflow-x-auto">
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
