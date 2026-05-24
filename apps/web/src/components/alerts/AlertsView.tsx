import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { useI18n, type TranslationKey } from "../../i18n/i18n";
import { alertsAPI } from "../../services/api";
import { getErrorMessage } from "../../utils/error";
import { ErrorBanner } from "../common/States";
import { useToast } from "../common/Toast";

type AlertStatus = "SCHEDULED" | "SENT" | "CANCELLED" | "FAILED";

type Alert = {
  alerteId: number;
  alerteNom: string;
  alerteDate: string;
  alerteDescription?: string | null;
  status: AlertStatus;
  kind?: "WARRANTY" | "CUSTOM";
  recurrenceMonths?: number | null;
  snoozedUntil?: string | null;
  sentAt?: string | null;
  failedAt?: string | null;
  errorMessage?: string | null;
  alerteGarantieId?: number | null;
  alerteArticleId?: number | null;
  garantie?: {
    garantieId: number;
    garantieNom: string;
  } | null;
  article?: {
    articleId: number;
    articleNom: string;
    articleModele: string;
  } | null;
};

function statusBadge(status: AlertStatus) {
  switch (status) {
    case "SCHEDULED":
      return "ui-badge-info";
    case "SENT":
      return "ui-badge-success";
    case "CANCELLED":
      return "ui-badge";
    case "FAILED":
      return "ui-badge-danger";
    default:
      return "ui-badge";
  }
}

export default function AlertsView() {
  const { t } = useI18n();
  const toast = useToast();
  const [items, setItems] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | AlertStatus>("ALL");
  const [sortBy, setSortBy] = useState<"date" | "status" | "name">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [busyId, setBusyId] = useState<number | null>(null);

  // New-alert form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newRecurrence, setNewRecurrence] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setItems([]);
    setError(null);
    try {
      const data = await alertsAPI.getAll(
        statusFilter === "ALL" ? undefined : statusFilter
      );
      setItems(data);
    } catch (e: unknown) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setLoading(false);
    }
    // t is intentionally excluded: translating the fallback error in the closure
    // is acceptable; excluding it prevents an unnecessary refetch on language change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const sorted = useMemo(() => {
    const arr = [...items];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "date") {
        cmp =
          new Date(a.alerteDate).getTime() - new Date(b.alerteDate).getTime();
      } else if (sortBy === "status") {
        cmp = a.status.localeCompare(b.status);
      } else {
        cmp = a.alerteNom.localeCompare(b.alerteNom);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [items, sortBy, sortDir]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show(t("alerts.copied"), { kind: "success" });
    } catch {
      // Clipboard can be blocked (insecure context / permissions). Tell the
      // user instead of failing silently.
      toast.show(t("alerts.copyFailed"), { kind: "error" });
    }
  };

  const createAlert = async () => {
    if (!newName.trim() || !newDate) return;
    setCreating(true);
    try {
      await alertsAPI.create({
        alerteNom: newName.trim(),
        alerteDate: new Date(newDate).toISOString(),
        recurrenceMonths: newRecurrence ? Number(newRecurrence) : null,
      });
      toast.show(t("alerts.create.success"), { kind: "success" });
      setNewName("");
      setNewDate("");
      setNewRecurrence("");
      setShowCreate(false);
      await fetchAll();
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setCreating(false);
    }
  };

  const snoozeAlert = async (alerteId: number, days: number) => {
    setBusyId(alerteId);
    try {
      await alertsAPI.snooze(alerteId, days);
      toast.show(t("alerts.snooze.success"), { kind: "success" });
      await fetchAll();
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  const cancelAlert = async (alerteId: number) => {
    setBusyId(alerteId);
    try {
      await alertsAPI.cancel(alerteId);
      toast.show(t("alerts.cancel.success"), { kind: "success" });
      await fetchAll();
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("alerts.title")}</h1>
          <p className="ui-text-muted">{t("alerts.subtitle")}</p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="ui-btn-primary px-4 py-2 rounded-md text-sm shrink-0"
        >
          {showCreate ? t("common.cancel") : t("alerts.create.button")}
        </button>
      </div>

      {showCreate && (
        <div className="ui-card rounded-lg p-4 space-y-3">
          <h2 className="font-semibold">{t("alerts.create.title")}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("alerts.create.namePlaceholder")}
              className="ui-input px-3 py-2 rounded-md"
              maxLength={100}
            />
            <input
              type="datetime-local"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="ui-input px-3 py-2 rounded-md"
              aria-label={t("alerts.create.date")}
            />
            <input
              type="number"
              min="1"
              max="120"
              value={newRecurrence}
              onChange={(e) => setNewRecurrence(e.target.value)}
              placeholder={t("alerts.create.recurrencePlaceholder")}
              className="ui-input px-3 py-2 rounded-md"
              aria-label={t("alerts.recurrence")}
            />
          </div>
          <button
            onClick={createAlert}
            disabled={creating || !newName.trim() || !newDate}
            className="ui-btn-primary px-4 py-2 rounded-md text-sm"
          >
            {creating ? t("common.loading") : t("alerts.create.submit")}
          </button>
        </div>
      )}

      <div className="ui-card rounded-lg">
        <div className="p-4 border-b ui-divider flex items-center justify-between gap-4">
          <h2 className="font-semibold">{t("alerts.all")}</h2>
          <div className="flex items-center gap-3">
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as "date" | "status" | "name")
              }
              className="ui-select px-2 py-1 rounded-md text-sm"
              title={t("alerts.sortBy")}
            >
              <option value="date">{t("alerts.sort.date")}</option>
              <option value="name">{t("alerts.sort.name")}</option>
              <option value="status">{t("alerts.sort.status")}</option>
            </select>

            <button
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="ui-btn-ghost px-2 py-1 rounded-md text-sm border ui-divider"
              title={t("alerts.sortDirection")}
            >
              {sortDir === "asc" ? t("alerts.sort.asc") : t("alerts.sort.desc")}
            </button>

            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "ALL" | AlertStatus)
              }
              className="ui-select px-2 py-1 rounded-md text-sm"
            >
              <option value="ALL">{t("alerts.filters.all")}</option>
              <option value="SCHEDULED">{t("alerts.status.scheduled")}</option>
              <option value="SENT">{t("alerts.status.sent")}</option>
              <option value="CANCELLED">{t("alerts.status.cancelled")}</option>
              <option value="FAILED">{t("alerts.status.failed")}</option>
            </select>

            {loading ? (
              <span className="text-xs ui-text-muted">
                {t("common.loading")}
              </span>
            ) : (
              <button
                onClick={fetchAll}
                className="text-sm ui-btn-ghost rounded px-2 py-1"
              >
                {t("common.refresh")}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="p-4">
            <ErrorBanner
              message={error}
              onRetry={fetchAll}
              retryLabel={t("common.retry")}
            />
          </div>
        )}

        <div className="divide-y">
          {!loading && sorted.length === 0 && (
            <div className="p-4 text-sm ui-text-muted">{t("alerts.none")}</div>
          )}

          {sorted.map((a) => (
            <div key={a.alerteId} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium">{a.alerteNom}</div>
                  <div className="text-xs ui-text-muted">
                    {t("alerts.date")}:{" "}
                    {format(parseISO(a.alerteDate), "dd MMM yyyy, HH:mm")}
                  </div>

                  {(a.garantie ||
                    a.article ||
                    a.alerteGarantieId ||
                    a.alerteArticleId) && (
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ui-text-muted">
                      {(a.garantie || a.alerteGarantieId) && (
                        <button
                          type="button"
                          onClick={() =>
                            copyToClipboard(
                              String(
                                a.garantie?.garantieId ?? a.alerteGarantieId
                              )
                            )
                          }
                          className="underline hover:opacity-90"
                          title={t("alerts.copyId")}
                        >
                          {t("alerts.warranty")}:{" "}
                          {a.garantie?.garantieNom ?? `#${a.alerteGarantieId}`}
                        </button>
                      )}

                      {(a.article || a.alerteArticleId) && (
                        <button
                          type="button"
                          onClick={() =>
                            copyToClipboard(
                              String(a.article?.articleId ?? a.alerteArticleId)
                            )
                          }
                          className="underline hover:opacity-90"
                          title={t("alerts.copyId")}
                        >
                          {t("alerts.article")}:{" "}
                          {a.article
                            ? `${a.article.articleNom} (${a.article.articleModele})`
                            : `#${a.alerteArticleId}`}
                        </button>
                      )}
                    </div>
                  )}

                  {a.recurrenceMonths ? (
                    <div className="mt-1 text-xs ui-text-muted">
                      🔁{" "}
                      {t("alerts.recurrence.every").replace(
                        "{months}",
                        String(a.recurrenceMonths)
                      )}
                    </div>
                  ) : null}

                  {a.status === "FAILED" && a.errorMessage && (
                    <div className="mt-2 text-xs ui-text-error">
                      {t("alerts.error")}: {a.errorMessage}
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge(
                      a.status
                    )}`}
                  >
                    {t(
                      `alerts.status.${a.status.toLowerCase()}` as TranslationKey
                    )}
                  </span>

                  {a.status === "SCHEDULED" && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => snoozeAlert(a.alerteId, 7)}
                        disabled={busyId === a.alerteId}
                        className="text-xs ui-btn-ghost border ui-divider rounded px-2 py-1"
                      >
                        {t("alerts.snooze.7d")}
                      </button>
                      <button
                        onClick={() => snoozeAlert(a.alerteId, 30)}
                        disabled={busyId === a.alerteId}
                        className="text-xs ui-btn-ghost border ui-divider rounded px-2 py-1"
                      >
                        {t("alerts.snooze.30d")}
                      </button>
                      <button
                        onClick={() => cancelAlert(a.alerteId)}
                        disabled={busyId === a.alerteId}
                        className="text-xs ui-action-danger px-2 py-1"
                      >
                        {t("alerts.cancel")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="text-xs ui-text-muted">{t("alerts.note")}</div>
    </div>
  );
}
