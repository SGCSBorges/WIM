/**
 * Audit log viewer — admin-only. Cursor-paginated, with optional filters:
 * user, action (sourced from `AUDIT_ACTIONS` in @wim/types), entity
 * (`AUDIT_ENTITIES`), and inclusive `createdAt` date range. The end date
 * stretches to 23:59:59.999Z so a single-day filter actually includes
 * that day's events.
 */
import { useCallback, useEffect, useState } from "react";
import { adminAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { usePreferences } from "../../preferences/preferences";
import { getErrorMessage } from "../../utils/error";
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from "@wim/types";
import { Field, Input, Select, Button } from "../ui";

type Entry = {
  id: number;
  userId: number | null;
  action: string;
  entity: string;
  entityId: number | null;
  method: string | null;
  path: string | null;
  status: number | null;
  metadata: unknown;
  createdAt: string;
  user: { email: string } | null;
};

const ACTIONS = ["", ...AUDIT_ACTIONS];
const ENTITIES = ["", ...AUDIT_ENTITIES];

export default function AuditLogTab() {
  const { t } = useI18n();
  const { formatDateTime } = usePreferences();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterUserId, setFilterUserId] = useState<string>("");
  const [filterAction, setFilterAction] = useState<string>("");
  const [filterEntity, setFilterEntity] = useState<string>("");
  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");

  const load = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const data = await adminAPI.listAuditLog({
          userId: filterUserId ? Number(filterUserId) : undefined,
          action: filterAction || undefined,
          entity: filterEntity || undefined,
          createdFrom: filterFrom || undefined,
          createdTo: filterTo ? `${filterTo}T23:59:59.999Z` : undefined,
          limit: 50,
          cursor: reset ? undefined : (nextCursor ?? undefined),
        });
        setEntries((prev) =>
          reset ? data.entries : [...prev, ...data.entries]
        );
        setNextCursor(data.nextCursor);
      } catch (e) {
        setError(getErrorMessage(e, t("admin.error.fetchAuditLog")));
      } finally {
        setLoading(false);
      }
    },
    [
      filterUserId,
      filterAction,
      filterEntity,
      filterFrom,
      filterTo,
      nextCursor,
      t,
    ]
  );

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterUserId, filterAction, filterEntity, filterFrom, filterTo]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label={t("admin.auditLog.filterByUserId")} htmlFor="al-user">
          <Input
            id="al-user"
            type="number"
            inputMode="numeric"
            value={filterUserId}
            onChange={(e) => setFilterUserId(e.target.value)}
            placeholder="123"
          />
        </Field>
        <Field label={t("admin.auditLog.filterByAction")} htmlFor="al-action">
          <Select
            id="al-action"
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
          >
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a || t("admin.auditLog.allActions")}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("admin.auditLog.filterByEntity")} htmlFor="al-entity">
          <Select
            id="al-entity"
            value={filterEntity}
            onChange={(e) => setFilterEntity(e.target.value)}
          >
            {ENTITIES.map((e) => (
              <option key={e} value={e}>
                {e || t("admin.auditLog.allEntities")}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("admin.auditLog.filterFrom")} htmlFor="al-from">
          <Input
            id="al-from"
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
          />
        </Field>
        <Field label={t("admin.auditLog.filterTo")} htmlFor="al-to">
          <Input
            id="al-to"
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
          />
        </Field>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border ui-alert-error p-3 text-sm ui-text-error"
        >
          {error}
        </div>
      )}

      <div className="ui-card overflow-hidden">
        {/* Mobile: stacked cards */}
        <ul className="divide-y ui-divider sm:hidden">
          {entries.map((e) => (
            <li key={`m-${e.id}`} className="space-y-1 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs">{e.action}</span>
                <span className="text-xs ui-text-muted">
                  {formatDateTime(e.createdAt)}
                </span>
              </div>
              <div className="text-xs ui-text-muted">
                {e.user?.email ?? (e.userId ? `#${e.userId}` : "—")}
                {" · "}
                <span className="font-mono">
                  {e.entity}
                  {e.entityId ? `#${e.entityId}` : ""}
                </span>
              </div>
              {e.metadata && Object.keys(e.metadata).length > 0 ? (
                <pre className="whitespace-pre-wrap break-all text-[10px]">
                  {JSON.stringify(e.metadata, null, 0)}
                </pre>
              ) : null}
            </li>
          ))}
          {entries.length === 0 && !loading && (
            <li className="p-4 text-center text-sm ui-text-muted">
              {t("admin.auditLog.empty")}
            </li>
          )}
        </ul>

        <div className="hidden overflow-x-auto sm:block">
          <table className="min-w-full text-sm">
            <thead className="ui-panel">
              <tr className="text-left ui-text-muted">
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("admin.auditLog.col.when")}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("admin.auditLog.col.user")}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("admin.auditLog.col.action")}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("admin.auditLog.col.entity")}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t("admin.auditLog.col.metadata")}
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t ui-divider align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-xs">
                    {formatDateTime(e.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    {e.user?.email ?? (
                      <span className="ui-text-muted">
                        {e.userId ? `#${e.userId}` : "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{e.action}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {e.entity}
                    {e.entityId ? `#${e.entityId}` : ""}
                  </td>
                  <td className="px-3 py-2">
                    <pre className="max-w-xs whitespace-pre-wrap break-all text-[10px]">
                      {e.metadata && Object.keys(e.metadata).length > 0
                        ? JSON.stringify(e.metadata, null, 0)
                        : "—"}
                    </pre>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-6 text-center ui-text-muted"
                  >
                    {t("admin.auditLog.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t ui-divider p-3">
          <span className="text-xs ui-text-muted">
            {t("admin.auditLog.shown")}: {entries.length}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => load(false)}
            disabled={loading || nextCursor === null}
            loading={loading}
          >
            {nextCursor === null
              ? t("admin.auditLog.allLoaded")
              : t("admin.auditLog.loadMore")}
          </Button>
        </div>
      </div>
    </div>
  );
}
