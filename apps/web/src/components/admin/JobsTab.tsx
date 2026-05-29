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
    </div>
  );
}
