/**
 * Profile → Security section.
 *
 * Two panels — both safe to render no-op if the backend is older than
 * round 3 (fetch failures hide the panel quietly):
 *
 *   • Active sessions — pulled from `/profile/me/sessions`. Each row shows
 *     the device label, IP, and "active N minutes ago", with a Revoke
 *     button per row plus a "Sign out other devices" action that keeps
 *     the current device alive. Revoking denylists the JWT via the
 *     existing token-denylist machinery, so the session dies on the next
 *     request from that device.
 *   • Recent sign-in activity — sourced from AuditLog via
 *     `/profile/me/login-history`. No new table; just a list of the last
 *     50 LOGIN/LOGOUT rows for the caller.
 *
 * The 2FA wizard for round-3-slice-C will plug in here too.
 */
import { useCallback, useEffect, useState } from "react";
import { Activity, LogOut, Monitor, ShieldCheck } from "lucide-react";
import { profileAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { usePreferences } from "../../preferences/preferences";
import { useToast } from "../common/Toast";
import { getErrorMessage } from "../../utils/error";
import { Section, Badge, Button } from "../ui";

interface LoginEvent {
  id: number;
  action: "LOGIN" | "LOGOUT";
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface SessionRow {
  id: number;
  jti: string;
  deviceLabel: string | null;
  ip: string | null;
  userAgent: string | null;
  lastActiveAt: string;
  createdAt: string;
}

export default function SecuritySection() {
  const { t } = useI18n();
  const { formatDateTime } = usePreferences();
  const toast = useToast();

  const [events, setEvents] = useState<LoginEvent[] | null>(null);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [currentJti, setCurrentJti] = useState<string | null>(null);
  const [sessionsFailed, setSessionsFailed] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const data = await profileAPI.getSessions();
      setSessions(data.items);
      setCurrentJti(data.currentJti);
    } catch {
      setSessionsFailed(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void profileAPI
      .getLoginHistory()
      .then((rows) => {
        if (!cancelled) setEvents(rows);
      })
      .catch(() => {
        if (!cancelled) setHistoryFailed(true);
      });
    void loadSessions();
    return () => {
      cancelled = true;
    };
  }, [loadSessions]);

  const revoke = async (id: number) => {
    setBusyId(id);
    try {
      await profileAPI.revokeSession(id);
      setSessions((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
      toast.show(t("security.sessions.revoked"), { kind: "success" });
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  const revokeOthers = async () => {
    setRevokingOthers(true);
    try {
      const { revoked } = await profileAPI.revokeOtherSessions();
      await loadSessions();
      toast.show(
        t("security.sessions.othersRevoked").replace(
          "{count}",
          String(revoked)
        ),
        { kind: "success" }
      );
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setRevokingOthers(false);
    }
  };

  return (
    <Section
      icon={<ShieldCheck className="h-5 w-5" />}
      title={t("security.title")}
      description={t("security.subtitle")}
    >
      <div className="space-y-6">
        {!sessionsFailed && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-medium ui-text-muted">
                <Monitor className="h-4 w-4" aria-hidden="true" />
                {t("security.sessions.title")}
              </p>
              {sessions && sessions.length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  loading={revokingOthers}
                  leftIcon={<LogOut className="h-4 w-4" />}
                  onClick={revokeOthers}
                >
                  {t("security.sessions.revokeOthers")}
                </Button>
              )}
            </div>
            {sessions === null && (
              <p className="text-sm ui-text-muted">{t("common.loading")}</p>
            )}
            {sessions && sessions.length === 0 && (
              <p className="text-sm ui-text-muted">
                {t("security.sessions.empty")}
              </p>
            )}
            {sessions && sessions.length > 0 && (
              <ul className="divide-y divide-line text-sm">
                {sessions.map((s) => {
                  const isCurrent = currentJti && s.jti === currentJti;
                  return (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center gap-2 py-2"
                    >
                      <span className="font-medium ui-title">
                        {s.deviceLabel ?? t("security.sessions.unknownDevice")}
                      </span>
                      {isCurrent && (
                        <Badge tone="success">
                          {t("security.sessions.thisDevice")}
                        </Badge>
                      )}
                      <span className="text-xs ui-text-muted">
                        {t("security.sessions.lastActive")}{" "}
                        {formatDateTime(s.lastActiveAt)}
                      </span>
                      {s.ip && (
                        <span className="font-mono text-xs ui-text-muted">
                          {s.ip}
                        </span>
                      )}
                      {!isCurrent && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto text-danger"
                          disabled={busyId === s.id}
                          onClick={() => revoke(s.id)}
                        >
                          {t("security.sessions.revoke")}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-medium ui-text-muted">
            <Activity className="h-4 w-4" aria-hidden="true" />
            {t("security.activity.title")}
          </p>
          {historyFailed && (
            <p className="text-sm ui-text-muted">
              {t("security.activity.empty")}
            </p>
          )}
          {!historyFailed && events === null && (
            <p className="text-sm ui-text-muted">{t("common.loading")}</p>
          )}
          {!historyFailed && events && events.length === 0 && (
            <p className="text-sm ui-text-muted">
              {t("security.activity.empty")}
            </p>
          )}
          {!historyFailed && events && events.length > 0 && (
            <ul className="divide-y divide-line text-sm">
              {events.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center gap-2 py-2"
                >
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
      </div>
    </Section>
  );
}
