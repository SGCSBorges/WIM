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
  AlarmClock,
  ChevronDown,
} from "lucide-react";
import { useI18n, type TranslationKey } from "../../i18n/i18n";
import { usePreferences } from "../../preferences/preferences";
import { alertsAPI, articlesAPI } from "../../services/api";
import { fetchAllPages } from "../../services/pagination";
import { getErrorMessage } from "../../utils/error";
import { ErrorBanner, EmptyState } from "../common/States";
import { Skeleton } from "../common/Skeleton";
import { useToast } from "../common/Toast";
import { useUndoableDelete } from "../../hooks/useUndoableDelete";
import {
  PageHeader,
  Section,
  Button,
  Input,
  Textarea,
  Select,
  Badge,
  Popover,
  buttonClasses,
  type BadgeTone,
} from "../ui";
import type { AlertItem as Alert, AlertStatus } from "@wim/types";
import { useLatestRequest } from "../../hooks/useLatestRequest";

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
  const undoableDelete = useUndoableDelete();
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

  const request = useLatestRequest();
  const fetchAll = useCallback(async () => {
    const fresh = request.begin();
    setLoading(true);
    setItems([]);
    setError(null);
    try {
      const data = await fetchAllPages<Alert>((page, limit) =>
        alertsAPI.getAll(
          statusFilter === "ALL" ? undefined : statusFilter,
          page,
          limit,
          kindFilter === "ALL" ? undefined : kindFilter
        )
      );
      if (!fresh()) return;
      setItems(data);
    } catch (e: unknown) {
      if (!fresh()) return;
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      if (fresh()) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, kindFilter, request]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Focus the custom-snooze date input when it appears so keyboard users
  // can type a date without an extra click.
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
  // delay the API call so the user can recover from a misclick.
  const cancelAlert = (alerteId: number) => {
    const snapshot = items.find((a) => a.alerteId === alerteId);
    if (!snapshot) return;
    const restore = () =>
      setItems((prev) =>
        prev.some((a) => a.alerteId === alerteId) ? prev : [...prev, snapshot]
      );
    undoableDelete({
      message: t("alerts.cancel.success"),
      kind: "success",
      remove: () =>
        setItems((prev) => prev.filter((a) => a.alerteId !== alerteId)),
      restore,
      commit: () => alertsAPI.cancel(alerteId),
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
                        <AlertRowActions
                          busy={busyId === a.alerteId}
                          onSnooze={(days) =>
                            void snoozeAlert(a.alerteId, days)
                          }
                          onSnoozeUntil={(iso) =>
                            void snoozeUntil(a.alerteId, iso)
                          }
                          onCancel={() => cancelAlert(a.alerteId)}
                        />
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

/**
 * Snooze / cancel controls for one SCHEDULED alert. The three presets and
 * the custom date sit behind a single "Snooze…" menu: as five side-by-side
 * buttons per row they pushed the whole list past the viewport on phones
 * (the only horizontal overflow left in the app), and on desktop they were
 * the loudest thing on the page for an action used once in a while.
 */
function AlertRowActions({
  busy,
  onSnooze,
  onSnoozeUntil,
  onCancel,
}: {
  busy: boolean;
  onSnooze: (days: number) => void;
  onSnoozeUntil: (isoDate: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [pickDate, setPickDate] = useState(false);
  // The panel focuses its first item on open; the date input appears later,
  // on "Custom…", so it needs its own hand-off (no autoFocus — a11y lint).
  const dateRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (pickDate) dateRef.current?.focus();
  }, [pickDate]);
  const item =
    "flex w-full items-center rounded-md px-3 py-2 text-left text-sm ui-btn-ghost disabled:opacity-50";
  const presets: Array<[number, Parameters<typeof t>[0]]> = [
    [1, "alerts.snooze.tomorrow"],
    [7, "alerts.snooze.7d"],
    [30, "alerts.snooze.30d"],
  ];
  return (
    <div className="flex items-center gap-1">
      <Popover
        ariaLabel={t("alerts.snooze.menu")}
        align="end"
        buttonClassName={buttonClasses({ variant: "outline", size: "sm" })}
        panelClassName="ui-card w-56 p-1 shadow-xl"
        onOpen={() => setPickDate(false)}
        button={() => (
          <>
            <AlarmClock className="h-4 w-4" aria-hidden="true" />
            {t("alerts.snooze.menu")}
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </>
        )}
      >
        {(close) => (
          <div className="flex flex-col">
            {presets.map(([days, key]) => (
              <button
                key={days}
                type="button"
                className={item}
                disabled={busy}
                onClick={() => {
                  onSnooze(days);
                  close();
                }}
              >
                {t(key)}
              </button>
            ))}
            {pickDate ? (
              <div className="px-2 py-1.5">
                <Input
                  ref={dateRef}
                  type="date"
                  aria-label={t("alerts.snooze.customLabel")}
                  min={new Date(Date.now() + 86400_000)
                    .toISOString()
                    .slice(0, 10)}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    onSnoozeUntil(e.target.value);
                    close();
                  }}
                  disabled={busy}
                />
              </div>
            ) : (
              <button
                type="button"
                className={item}
                disabled={busy}
                onClick={() => setPickDate(true)}
              >
                {t("alerts.snooze.custom")}
              </button>
            )}
          </div>
        )}
      </Popover>
      <Button
        variant="ghost"
        size="sm"
        onClick={onCancel}
        disabled={busy}
        className="text-danger"
        aria-label={t("alerts.cancel")}
        leftIcon={<Ban className="h-4 w-4" aria-hidden="true" />}
      >
        <span className="hidden sm:inline">{t("alerts.cancel")}</span>
      </Button>
    </div>
  );
}
