/**
 * TopBar bell — surfaces overdue / due-soon warranty + custom alerts so the
 * app's whole reason to exist isn't buried on /alerts. Fetches once on mount
 * and on every route change (cheap; the endpoint caps at 20 rows). Opening
 * the popover clears the unseen badge via `POST /alerts/mark-seen` so the
 * count reflects "anything new since you last looked".
 */
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { useI18n } from "../../i18n/i18n";
import { usePreferences } from "../../preferences/preferences";
import { alertsAPI } from "../../services/api";
import { useToast } from "../common/Toast";
import { Badge, Popover, Button } from "../ui";
import type { AlertItem, AlertNotifications } from "../../types";

const SNOOZE_OPTIONS = [
  { key: "1d" as const, days: 1 },
  { key: "7d" as const, days: 7 },
  { key: "30d" as const, days: 30 },
];

function isOverdue(a: AlertItem): boolean {
  return new Date(a.alerteDate).getTime() < Date.now();
}

export default function NotificationBell() {
  const { t } = useI18n();
  const { formatDateTime } = usePreferences();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [data, setData] = useState<AlertNotifications | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await alertsAPI.notifications();
      setData(next);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  // Refresh on mount + every route change. No tight interval — the user
  // either visits a route or comes back via PWA resume, both of which
  // already cause a render.
  useEffect(() => {
    void refresh();
  }, [refresh, location.pathname]);

  const onOpen = () => {
    void alertsAPI.markSeen().catch(() => {});
    // Optimistically clear the badge so the user gets the visual ack
    // immediately even if the POST is in flight.
    setData((d) => (d ? { ...d, unseen: 0 } : d));
  };

  const snooze = async (id: number, days: number) => {
    setBusyId(id);
    try {
      await alertsAPI.snooze(id, days);
      setData((d) =>
        d ? { ...d, items: d.items.filter((a) => a.alerteId !== id) } : d
      );
    } catch {
      toast.show(t("notifications.snoozeError"), { kind: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const viewArticle = (item: AlertItem, close: () => void) => {
    if (item.article?.articleId) {
      navigate(`/articles/${item.article.articleId}`);
      close();
    }
  };

  // Hidden gracefully if the request failed (e.g. older API). Don't render
  // a broken icon to users on a deploy that's out of step with the client.
  if (failed) return null;

  const unseen = data?.unseen ?? 0;
  const items = data?.items ?? [];

  return (
    <Popover
      ariaLabel={t("notifications.title")}
      buttonClassName="relative inline-flex h-10 w-10 items-center justify-center rounded-lg ui-btn-ghost"
      onOpen={onOpen}
      panelClassName="ui-card w-[22rem] max-w-[calc(100vw-1rem)] overflow-hidden p-0 shadow-xl"
      button={() => (
        <>
          <Bell className="h-5 w-5" aria-hidden="true" />
          {unseen > 0 && (
            <span className="absolute right-1.5 top-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-primary-contrast">
              {unseen > 9 ? "9+" : unseen}
            </span>
          )}
        </>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <p className="text-sm font-semibold ui-title">
              {t("notifications.title")}
            </p>
            <button
              type="button"
              onClick={() => {
                navigate("/alerts");
                close();
              }}
              className="text-xs font-medium text-primary hover:underline"
            >
              {t("notifications.seeAll")}
            </button>
          </div>

          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm ui-text-muted">
              {t("notifications.empty")}
            </p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
              {items.map((item) => {
                const overdue = isOverdue(item);
                return (
                  <li
                    key={item.alerteId}
                    className={`space-y-1.5 p-3 text-sm ${
                      overdue ? "bg-surface-muted" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium ui-title">
                          {item.alerteNom}
                        </p>
                        {item.article && (
                          <p className="truncate text-xs ui-text-muted">
                            {item.article.articleNom}
                          </p>
                        )}
                      </div>
                      <Badge tone={overdue ? "danger" : "info"}>
                        {formatDateTime(item.alerteDate)}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-1">
                      {SNOOZE_OPTIONS.map((opt) => (
                        <Button
                          key={opt.key}
                          variant="ghost"
                          size="sm"
                          disabled={busyId === item.alerteId}
                          onClick={() => snooze(item.alerteId, opt.days)}
                        >
                          {t(`notifications.snooze.${opt.key}`)}
                        </Button>
                      ))}
                      {item.article && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="ml-auto"
                          onClick={() => viewArticle(item, close)}
                        >
                          {t("notifications.viewArticle")}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Popover>
  );
}
