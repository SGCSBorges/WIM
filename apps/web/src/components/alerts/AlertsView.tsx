/**
 * Alerts view — lists the user's warranty + custom alerts with filtering
 * (kind + status), snooze, and cancel. Status mirrors the API's `Alerte`
 * lifecycle (SCHEDULED → SENT/CANCELLED/FAILED). Creating a custom alert
 * launches its own form within the page.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Plus,
  RotateCw,
  ArrowUp,
  ArrowDown,
  Ban,
  Repeat,
} from "lucide-react";
import { useI18n, type TranslationKey } from "../../i18n/i18n";
import { usePreferences } from "../../preferences/preferences";
import { alertsAPI, articlesAPI } from "../../services/api";
import { getErrorMessage } from "../../utils/error";
import { ErrorBanner, EmptyState } from "../common/States";
import { Skeleton } from "../common/Skeleton";
import { useToast } from "../common/Toast";
import {
  PageHeader,
  Section,
  Button,
  Input,
  Textarea,
  Select,
  Badge,
  type BadgeTone,
} from "../ui";
import type { AlertItem as Alert, AlertStatus } from "@wim/types";

function statusTone(status: AlertStatus): BadgeTone {
  switch (status) {
    case "SCHEDULED":
      return "info";
    case "SENT":
      return "success";
    case "FAILED":
      return "danger";
    default:
      return "neutral";
  }
}

export default function AlertsView() {
  const { t } = useI18n();
  const { formatDateTime } = usePreferences();
  const toast = useToast();
  const [items, setItems] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | AlertStatus>("ALL");
  const [kindFilter, setKindFilter] = useState<"ALL" | "WARRANTY" | "CUSTOM">(
    "ALL"
  );
  const [sortBy, setSortBy] = useState<"date" | "status" | "name">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [customSnoozeId, setCustomSnoozeId] = useState<number | null>(null);
  const customSnoozeInputRef = useRef<HTMLInputElement | null>(null);

  // New-alert form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newRecurrence, setNewRecurrence] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newArticleId, setNewArticleId] = useState("");
  const [articleOptions, setArticleOptions] = useState<
    { articleId: number; articleNom: string }[]
  >([]);
  const [creating, setCreating] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setItems([]);
    setError(null);
    try {
      const data = await alertsAPI.getAll(
        statusFilter === "ALL" ? undefined : statusFilter,
        undefined,
        undefined,
        kindFilter === "ALL" ? undefined : kindFilter
      );
      setItems(data);
    } catch (e: unknown) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, kindFilter]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Focus the custom-snooze date input when it appears so keyboard users
  // can type a date without an extra click.
  useEffect(() => {
    if (customSnoozeId !== null) {
      setTimeout(() => customSnoozeInputRef.current?.focus(), 0);
    }
  }, [customSnoozeId]);

  // Lazily load the article list for the optional "link to item" picker the
  // first time the create form is opened (best-effort — the picker just stays
  // empty if it fails).
  useEffect(() => {
    if (!showCreate || articleOptions.length > 0) return;
    let alive = true;
    void articlesAPI
      .getAll({ limit: 200, sort: "articleNom", dir: "asc" })
      .then((res) => {
        if (alive)
          setArticleOptions(
            res.items.map((a) => ({
              articleId: a.articleId,
              articleNom: a.articleNom,
            }))
          );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [showCreate, articleOptions.length]);

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
        alerteDescription: newDescription.trim() || null,
        alerteArticleId: newArticleId ? Number(newArticleId) : null,
      });
      toast.show(t("alerts.create.success"), { kind: "success" });
      setNewName("");
      setNewDate("");
      setNewRecurrence("");
      setNewDescription("");
      setNewArticleId("");
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
      setCustomSnoozeId(null);
      await fetchAll();
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  const snoozeUntil = async (alerteId: number, isoDate: string) => {
    if (!isoDate) return;
    const target = new Date(isoDate);
    if (Number.isNaN(target.getTime())) return;
    const ms = target.getTime() - Date.now();
    const days = Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
    await snoozeAlert(alerteId, days);
  };

  // Optimistic cancel with a 5s undo window: drop the row immediately and
  // delay the API call so the user can recover from a misclick (same shape
  // as the ArticlesList delete pattern).
  const cancelAlert = (alerteId: number) => {
    const snapshot = items.find((a) => a.alerteId === alerteId);
    if (!snapshot) return;
    setItems((prev) => prev.filter((a) => a.alerteId !== alerteId));

    const timer = window.setTimeout(() => {
      void alertsAPI.cancel(alerteId).catch((e) => {
        setItems((prev) =>
          prev.some((a) => a.alerteId === alerteId) ? prev : [...prev, snapshot]
        );
        toast.show(getErrorMessage(e, t("common.errorOccurred")), {
          kind: "error",
        });
      });
    }, 5000);

    toast.show(t("alerts.cancel.success"), {
      kind: "success",
      action: {
        label: t("common.undo"),
        onClick: () => {
          window.clearTimeout(timer);
          setItems((prev) =>
            prev.some((a) => a.alerteId === alerteId)
              ? prev
              : [...prev, snapshot]
          );
        },
      },
    });
  };

  return (
    <div>
      <PageHeader
        icon={<Bell className="h-5 w-5" />}
        title={t("alerts.title")}
        subtitle={t("alerts.subtitle")}
        actions={
          <Button
            onClick={() => setShowCreate((v) => !v)}
            leftIcon={showCreate ? undefined : <Plus className="h-4 w-4" />}
            variant={showCreate ? "ghost" : "primary"}
          >
            {showCreate ? t("common.cancel") : t("alerts.create.button")}
          </Button>
        }
      />

      <div className="space-y-6">
        {showCreate && (
          <Section title={t("alerts.create.title")}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("alerts.create.namePlaceholder")}
                maxLength={100}
                aria-label={t("alerts.create.namePlaceholder")}
              />
              <Input
                type="datetime-local"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                aria-label={t("alerts.create.date")}
              />
              <Input
                type="number"
                inputMode="numeric"
                min="1"
                max="120"
                value={newRecurrence}
                onChange={(e) => setNewRecurrence(e.target.value)}
                placeholder={t("alerts.create.recurrencePlaceholder")}
                aria-label={t("alerts.recurrence")}
              />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <Textarea
                  rows={2}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder={t("alerts.create.descriptionPlaceholder")}
                  aria-label={t("alerts.create.descriptionPlaceholder")}
                  maxLength={255}
                />
                <p className="text-right text-xs ui-text-muted tabular-nums">
                  {newDescription.length} / 255
                </p>
              </div>
              <Select
                value={newArticleId}
                onChange={(e) => setNewArticleId(e.target.value)}
                aria-label={t("alerts.create.linkArticle")}
              >
                <option value="">{t("alerts.create.noArticle")}</option>
                {articleOptions.map((a) => (
                  <option key={a.articleId} value={a.articleId}>
                    {a.articleNom}
                  </option>
                ))}
              </Select>
            </div>
            <div className="mt-3">
              <Button
                onClick={createAlert}
                loading={creating}
                disabled={!newName.trim() || !newDate}
                leftIcon={<Plus className="h-4 w-4" />}
              >
                {t("alerts.create.submit")}
              </Button>
            </div>
          </Section>
        )}

        <Section
          title={t("alerts.all")}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(e.target.value as "date" | "status" | "name")
                }
                aria-label={t("alerts.sortBy")}
                className="w-auto"
              >
                <option value="date">{t("alerts.sort.date")}</option>
                <option value="name">{t("alerts.sort.name")}</option>
                <option value="status">{t("alerts.sort.status")}</option>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setSortDir((d) => (d === "asc" ? "desc" : "asc"))
                }
                aria-label={t("alerts.sortDirection")}
                leftIcon={
                  sortDir === "asc" ? (
                    <ArrowUp className="h-4 w-4" />
                  ) : (
                    <ArrowDown className="h-4 w-4" />
                  )
                }
              >
                {sortDir === "asc"
                  ? t("alerts.sort.asc")
                  : t("alerts.sort.desc")}
              </Button>
              <Select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as "ALL" | AlertStatus)
                }
                aria-label={t("alerts.filters.status")}
                className="w-auto"
              >
                <option value="ALL">{t("alerts.filters.all")}</option>
                <option value="SCHEDULED">
                  {t("alerts.status.scheduled")}
                </option>
                <option value="SENT">{t("alerts.status.sent")}</option>
                <option value="CANCELLED">
                  {t("alerts.status.cancelled")}
                </option>
                <option value="FAILED">{t("alerts.status.failed")}</option>
              </Select>
              <Select
                value={kindFilter}
                onChange={(e) =>
                  setKindFilter(e.target.value as "ALL" | "WARRANTY" | "CUSTOM")
                }
                aria-label={t("alerts.filters.kind")}
                className="w-auto"
              >
                <option value="ALL">{t("alerts.filters.allKinds")}</option>
                <option value="WARRANTY">{t("alerts.kind.warranty")}</option>
                <option value="CUSTOM">{t("alerts.kind.custom")}</option>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchAll}
                disabled={loading}
                aria-label={t("common.refresh")}
                leftIcon={<RotateCw className="h-4 w-4" />}
              />
            </div>
          }
        >
          {error && (
            <ErrorBanner
              message={error}
              onRetry={fetchAll}
              retryLabel={t("common.retry")}
              className="mb-4"
            />
          )}

          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={72} />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <EmptyState
              icon={<Bell className="h-6 w-6" />}
              title={t("alerts.none")}
            />
          ) : (
            <ul className="divide-y ui-divider">
              {sorted.map((a) => (
                <li key={a.alerteId} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-medium ui-title">{a.alerteNom}</div>
                      <div className="text-xs ui-text-muted">
                        {t("alerts.date")}: {formatDateTime(a.alerteDate)}
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
                              {a.garantie?.garantieNom ??
                                `#${a.alerteGarantieId}`}
                            </button>
                          )}

                          {(a.article || a.alerteArticleId) && (
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard(
                                  String(
                                    a.article?.articleId ?? a.alerteArticleId
                                  )
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
                        <div className="mt-1 inline-flex items-center gap-1 text-xs ui-text-muted">
                          <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
                          {t("alerts.recurrence.every").replace(
                            "{months}",
                            String(a.recurrenceMonths)
                          )}
                        </div>
                      ) : null}

                      {a.status === "FAILED" && a.errorMessage && (
                        <div
                          role="alert"
                          className="mt-2 text-xs ui-text-error"
                        >
                          {t("alerts.error")}: {a.errorMessage}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Badge tone={statusTone(a.status)}>
                        {t(
                          `alerts.status.${a.status.toLowerCase()}` as TranslationKey
                        )}
                      </Badge>

                      {a.status === "SCHEDULED" && (
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => snoozeAlert(a.alerteId, 1)}
                            disabled={busyId === a.alerteId}
                          >
                            {t("alerts.snooze.tomorrow")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => snoozeAlert(a.alerteId, 7)}
                            disabled={busyId === a.alerteId}
                          >
                            {t("alerts.snooze.7d")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => snoozeAlert(a.alerteId, 30)}
                            disabled={busyId === a.alerteId}
                          >
                            {t("alerts.snooze.30d")}
                          </Button>
                          {customSnoozeId === a.alerteId ? (
                            <Input
                              ref={customSnoozeInputRef}
                              type="date"
                              aria-label={t("alerts.snooze.customLabel")}
                              min={new Date(Date.now() + 86400_000)
                                .toISOString()
                                .slice(0, 10)}
                              onChange={(e) =>
                                void snoozeUntil(a.alerteId, e.target.value)
                              }
                              onBlur={() => setCustomSnoozeId(null)}
                              disabled={busyId === a.alerteId}
                              className="w-auto"
                            />
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCustomSnoozeId(a.alerteId)}
                              disabled={busyId === a.alerteId}
                            >
                              {t("alerts.snooze.custom")}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => cancelAlert(a.alerteId)}
                            disabled={busyId === a.alerteId}
                            className="text-danger"
                            leftIcon={<Ban className="h-4 w-4" />}
                          >
                            {t("alerts.cancel")}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <p className="mt-4 text-xs ui-text-muted">{t("alerts.note")}</p>
    </div>
  );
}
