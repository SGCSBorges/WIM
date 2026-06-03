/**
 * Profile → Security section. Currently lists the user's last 50 sign-in /
 * sign-out events (sourced from AuditLog via `/api/profile/me/login-history`).
 * This file is the placeholder that the round-3 device-management and TOTP
 * slices will hang off — so the section header is stable across rounds.
 */
import { useEffect, useState } from "react";
import { Activity, ShieldCheck } from "lucide-react";
import { profileAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { usePreferences } from "../../preferences/preferences";
import { Section, Badge } from "../ui";

interface LoginEvent {
  id: number;
  action: "LOGIN" | "LOGOUT";
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export default function SecuritySection() {
  const { t } = useI18n();
  const { formatDateTime } = usePreferences();
  const [events, setEvents] = useState<LoginEvent[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void profileAPI
      .getLoginHistory()
      .then((rows) => {
        if (!cancelled) setEvents(rows);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Section
      icon={<ShieldCheck className="h-5 w-5" />}
      title={t("security.title")}
      description={t("security.subtitle")}
    >
      <div className="space-y-3">
        <p className="flex items-center gap-1.5 text-sm font-medium ui-text-muted">
          <Activity className="h-4 w-4" aria-hidden="true" />
          {t("security.activity.title")}
        </p>
        {failed && (
          <p className="text-sm ui-text-muted">
            {t("security.activity.empty")}
          </p>
        )}
        {!failed && events === null && (
          <p className="text-sm ui-text-muted">{t("common.loading")}</p>
        )}
        {!failed && events && events.length === 0 && (
          <p className="text-sm ui-text-muted">
            {t("security.activity.empty")}
          </p>
        )}
        {!failed && events && events.length > 0 && (
          <ul className="divide-y divide-line text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 py-2">
                <Badge tone={e.action === "LOGIN" ? "success" : "neutral"}>
                  {t(`security.activity.action.${e.action}`)}
                </Badge>
                <span className="ui-text-muted">
                  {formatDateTime(e.createdAt)}
                </span>
                {e.ip && (
                  <span className="font-mono text-xs ui-text-muted">
                    {e.ip}
                  </span>
                )}
                {e.userAgent && (
                  <span className="ml-auto truncate text-xs ui-text-muted">
                    {e.userAgent}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}
