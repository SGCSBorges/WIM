import { useCallback, useEffect, useState } from "react";
import { adminAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";

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

const ACTIONS = [
  "",
  "CREATE",
  "UPDATE",
  "DELETE",
  "LOGIN",
  "LOGOUT",
  "ACCEPT",
  "FORCE_LOGOUT",
  "BILLING_CHECKOUT_STARTED",
  "BILLING_PORTAL_OPENED",
  "BILLING_CANCEL_REQUESTED",
];

export default function AuditLogTab() {
  const { t } = useI18n();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterUserId, setFilterUserId] = useState<string>("");
  const [filterAction, setFilterAction] = useState<string>("");

  const load = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const data = await adminAPI.listAuditLog({
          userId: filterUserId ? Number(filterUserId) : undefined,
          action: filterAction || undefined,
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
    [filterUserId, filterAction, nextCursor, t]
  );

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterUserId, filterAction]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor="al-user"
            className="block text-xs font-medium ui-text-muted mb-1"
          >
            {t("admin.auditLog.filterByUserId")}
          </label>
          <input
            id="al-user"
            type="number"
            value={filterUserId}
            onChange={(e) => setFilterUserId(e.target.value)}
            className="ui-input px-3 py-2 rounded-md w-32"
            placeholder="123"
          />
        </div>
        <div>
          <label
            htmlFor="al-action"
            className="block text-xs font-medium ui-text-muted mb-1"
          >
            {t("admin.auditLog.filterByAction")}
          </label>
          <select
            id="al-action"
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="ui-input px-3 py-2 rounded-md"
          >
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a || t("admin.auditLog.allActions")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="border ui-alert-error rounded-md p-3">
          <p className="text-sm ui-text-error">{error}</p>
        </div>
      )}

      <div className="ui-card rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="ui-panel">
              <tr className="text-left ui-text-muted">
                <th className="px-3 py-2 font-medium">
                  {t("admin.auditLog.col.when")}
                </th>
                <th className="px-3 py-2 font-medium">
                  {t("admin.auditLog.col.user")}
                </th>
                <th className="px-3 py-2 font-medium">
                  {t("admin.auditLog.col.action")}
                </th>
                <th className="px-3 py-2 font-medium">
                  {t("admin.auditLog.col.entity")}
                </th>
                <th className="px-3 py-2 font-medium">
                  {t("admin.auditLog.col.metadata")}
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t ui-divider align-top">
                  <td className="px-3 py-2 whitespace-nowrap text-xs">
                    {new Date(e.createdAt).toLocaleString()}
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
                    <pre className="text-[10px] whitespace-pre-wrap break-all max-w-xs">
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
        <div className="p-3 border-t ui-divider flex justify-between items-center">
          <span className="text-xs ui-text-muted">
            {t("admin.auditLog.shown")}: {entries.length}
          </span>
          <button
            onClick={() => load(false)}
            disabled={loading || nextCursor === null}
            className="text-sm px-3 py-1.5 ui-btn-ghost border ui-divider rounded disabled:opacity-50"
          >
            {loading
              ? t("common.loading")
              : nextCursor === null
                ? t("admin.auditLog.allLoaded")
                : t("admin.auditLog.loadMore")}
          </button>
        </div>
      </div>
    </div>
  );
}
