/**
 * In-app agenda — a single chronological list of what needs attention:
 * warranty expirations, maintenance due, loan returns, insurance renewals,
 * and scheduled custom alerts, aggregated server-side (GET /calendar/agenda).
 * Rows are grouped into Overdue / This week / This month / Later buckets, and
 * each event that hangs off an article links straight to it.
 */
import { useEffect, useState } from "react";
import {
  CalendarClock,
  ShieldCheck,
  Wrench,
  HandHelping,
  Umbrella,
  Bell,
} from "lucide-react";
import { Link } from "react-router";
import { calendarAPI } from "../../services/api";
import type { AgendaEvent } from "@wim/types";
import { useI18n } from "../../i18n/i18n";
import { usePreferences } from "../../preferences/preferences";
import { getErrorMessage } from "../../utils/error";
import { PageHeader, Badge } from "../ui";
import { Skeleton } from "../common/Skeleton";
import { ErrorBanner, EmptyState } from "../common/States";
import type { BadgeTone } from "../ui";

const KIND_ICON: Record<AgendaEvent["kind"], React.ReactNode> = {
  warranty: <ShieldCheck className="h-4 w-4" aria-hidden="true" />,
  maintenance: <Wrench className="h-4 w-4" aria-hidden="true" />,
  loan: <HandHelping className="h-4 w-4" aria-hidden="true" />,
  insurance: <Umbrella className="h-4 w-4" aria-hidden="true" />,
  alert: <Bell className="h-4 w-4" aria-hidden="true" />,
};

type Bucket = "overdue" | "week" | "month" | "later";

function bucketFor(dateIso: string, now: number): Bucket {
  const t = new Date(dateIso).getTime();
  if (t < now) return "overdue";
  const days = (t - now) / 86_400_000;
  if (days <= 7) return "week";
  if (days <= 31) return "month";
  return "later";
}

const BUCKET_ORDER: Bucket[] = ["overdue", "week", "month", "later"];
const BUCKET_TONE: Record<Bucket, BadgeTone> = {
  overdue: "danger",
  week: "warning",
  month: "info",
  later: "neutral",
};

export default function AgendaView() {
  const { t } = useI18n();
  const { formatDate } = usePreferences();
  const [events, setEvents] = useState<AgendaEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void calendarAPI
      .agenda()
      .then((r) => {
        if (!cancelled) setEvents(r.events);
      })
      .catch((e) => {
        if (!cancelled) setError(getErrorMessage(e, t("common.errorOccurred")));
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const now = Date.now();
  const grouped: Record<Bucket, AgendaEvent[]> = {
    overdue: [],
    week: [],
    month: [],
    later: [],
  };
  for (const e of events ?? []) grouped[bucketFor(e.date, now)].push(e);

  return (
    <div>
      <PageHeader
        icon={<CalendarClock className="h-5 w-5" />}
        title={t("agenda.title")}
        subtitle={t("agenda.subtitle")}
      />

      {error && <ErrorBanner message={error} />}

      {!error && events === null && (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={52} />
          ))}
        </div>
      )}

      {!error && events && events.length === 0 && (
        <EmptyState
          icon={<CalendarClock className="h-6 w-6" />}
          title={t("agenda.empty.title")}
          description={t("agenda.empty.body")}
        />
      )}

      {!error && events && events.length > 0 && (
        <div className="space-y-6">
          {BUCKET_ORDER.filter((b) => grouped[b].length > 0).map((b) => (
            <section key={b}>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-sm font-semibold ui-title">
                  {t(`agenda.bucket.${b}`)}
                </h2>
                <Badge tone={BUCKET_TONE[b]}>{grouped[b].length}</Badge>
              </div>
              <ul className="divide-y divide-line ui-card overflow-hidden rounded-lg">
                {grouped[b].map((e, i) => {
                  const row = (
                    <div className="flex items-center gap-3 p-3">
                      <span className="ui-text-muted">{KIND_ICON[e.kind]}</span>
                      <span className="min-w-0 flex-1">
                        <span
                          className="block truncate text-sm font-medium ui-title"
                          title={e.title}
                        >
                          {e.title}
                        </span>
                        <span className="text-xs ui-text-muted">
                          {t(`agenda.kind.${e.kind}`)}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs ui-text-muted tabular-nums">
                        {formatDate(new Date(e.date))}
                      </span>
                    </div>
                  );
                  return (
                    <li key={`${e.kind}-${e.date}-${i}`}>
                      {e.articleId != null ? (
                        <Link
                          to={`/articles/${e.articleId}`}
                          className="block hover:bg-surface-muted"
                        >
                          {row}
                        </Link>
                      ) : (
                        row
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
