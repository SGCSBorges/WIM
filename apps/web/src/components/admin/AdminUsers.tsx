import { useCallback, useEffect, useState } from "react";
import {
  adminAPI,
  articlesAPI,
  authAPI,
  statisticsAPI,
} from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";
import CreateUserModal from "./CreateUserModal";
import ResetPasswordModal from "./ResetPasswordModal";
import AuditLogTab from "./AuditLogTab";

type Role = "USER" | "POWER_USER" | "ADMIN";

type UserRow = {
  userId: number;
  email: string;
  role: "USER" | "POWER_USER" | "ADMIN";
  createdAt: string;
  updatedAt: string;
};

type InventoryArticle = {
  articleId: number;
  articleNom: string;
  articleModele: string;
  articleDescription?: string | null;
  garantie?: {
    garantieId: number;
    garantieNom: string;
    garantieIsValide: boolean;
  } | null;
};

type InventoryWarranty = {
  garantieId: number;
  garantieNom: string;
  garantieIsValide: boolean;
  article?: { articleNom: string; articleModele: string } | null;
};

type UserInventory = {
  userId: number;
  email: string;
  articlesOwned: InventoryArticle[];
  warrantiesOwned: InventoryWarranty[];
};

type AdminStatistics = {
  users: {
    total: number;
    byRole: {
      USER: number;
      POWER_USER: number;
      ADMIN: number;
    };
  };
  articles: {
    total: number;
  };
  warranties: {
    total: number;
    active: number;
    expired: number;
    withAttachment: number;
  };
  alerts: {
    total: number;
  };
  sharing: {
    totalSharedArticles: number;
  };
};

export default function AdminUsers() {
  const { t } = useI18n();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [inventory, setInventory] = useState<UserInventory | null>(null);

  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<
    "dashboard" | "users" | "auditLog"
  >("dashboard");
  const [statistics, setStatistics] = useState<AdminStatistics | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<number | null>(
    null
  );
  const [confirmDeleteArticleId, setConfirmDeleteArticleId] = useState<
    number | null
  >(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [resetPwTarget, setResetPwTarget] = useState<UserRow | null>(null);
  const [confirmForceLogoutUserId, setConfirmForceLogoutUserId] = useState<
    number | null
  >(null);
  const [editingRoleUserId, setEditingRoleUserId] = useState<number | null>(
    null
  );
  const [editingRoleValue, setEditingRoleValue] = useState<Role>("USER");

  const role = authAPI.getRole();

  const fetchStatistics = useCallback(async () => {
    setLoadingStats(true);
    setError(null);
    try {
      const data = await statisticsAPI.getAdmin();
      setStatistics(data);
    } catch (e: unknown) {
      setError(getErrorMessage(e, t("admin.error.fetchStatistics")));
    } finally {
      setLoadingStats(false);
    }
  }, [t]);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    setError(null);
    try {
      const data = await adminAPI.listUsers();
      setUsers(data);
    } catch (e: unknown) {
      setError(getErrorMessage(e, t("admin.error.fetchUsers")));
    } finally {
      setLoadingUsers(false);
    }
  }, [t]);

  const fetchInventory = async (userId: number) => {
    setLoadingInventory(true);
    setError(null);
    try {
      const data = await adminAPI.getUserInventory(userId);
      setInventory(data);
    } catch (e: unknown) {
      setError(getErrorMessage(e, t("admin.error.fetchInventory")));
    } finally {
      setLoadingInventory(false);
    }
  };

  const deleteUser = async (userId: number) => {
    setConfirmDeleteUserId(null);
    setActionLoading(`user:${userId}`);
    setError(null);
    try {
      await adminAPI.deleteUser(userId);
      if (selectedUser?.userId === userId) {
        setSelectedUser(null);
        setInventory(null);
      }
      await fetchUsers();
    } catch (e: unknown) {
      setError(getErrorMessage(e, t("admin.error.deleteUser")));
    } finally {
      setActionLoading(null);
    }
  };

  const startEditRole = (u: UserRow) => {
    setEditingRoleUserId(u.userId);
    setEditingRoleValue(u.role);
  };

  const cancelEditRole = () => {
    setEditingRoleUserId(null);
  };

  const saveRole = async (u: UserRow) => {
    if (editingRoleValue === u.role) {
      setEditingRoleUserId(null);
      return;
    }
    setActionLoading(`role:${u.userId}`);
    setError(null);
    try {
      await adminAPI.updateUser(u.userId, { role: editingRoleValue });
      setEditingRoleUserId(null);
      await fetchUsers();
    } catch (e) {
      setError(getErrorMessage(e, t("admin.error.updateUser")));
    } finally {
      setActionLoading(null);
    }
  };

  const forceLogout = async (userId: number) => {
    setConfirmForceLogoutUserId(null);
    setActionLoading(`force-logout:${userId}`);
    setError(null);
    try {
      await adminAPI.forceLogout(userId);
    } catch (e) {
      setError(getErrorMessage(e, t("admin.error.forceLogout")));
    } finally {
      setActionLoading(null);
    }
  };

  const deleteArticle = async (articleId: number) => {
    setConfirmDeleteArticleId(null);
    setActionLoading(`article:${articleId}`);
    setError(null);
    try {
      await articlesAPI.delete(articleId);
      if (selectedUser) {
        await fetchInventory(selectedUser.userId);
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e, t("admin.error.deleteArticle")));
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchStatistics();
  }, [fetchUsers, fetchStatistics]);

  if (role !== "ADMIN") {
    return (
      <div className="ui-card rounded-lg p-6">
        <h1 className="text-xl font-semibold mb-2">{t("admin.title")}</h1>
        <p className="text-sm ui-text-muted">{t("admin.accessDenied")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("admin.title")}</h1>
          <p className="ui-text-muted">{t("admin.subtitle")}</p>
        </div>
        <button
          onClick={activeTab === "users" ? fetchUsers : fetchStatistics}
          className="ui-btn-ghost px-3 py-2 rounded border ui-divider"
          disabled={activeTab === "users" ? loadingUsers : loadingStats}
        >
          {t("common.refresh")}
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b ui-divider">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === "dashboard"
                ? "ui-tab-active"
                : "border-transparent ui-text-muted hover:border-[var(--border)]"
            }`}
          >
            {t("admin.dashboard")}
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === "users"
                ? "ui-tab-active"
                : "border-transparent ui-text-muted hover:border-[var(--border)]"
            }`}
          >
            {t("admin.users")}
          </button>
          <button
            onClick={() => setActiveTab("auditLog")}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === "auditLog"
                ? "ui-tab-active"
                : "border-transparent ui-text-muted hover:border-[var(--border)]"
            }`}
          >
            {t("admin.auditLog")}
          </button>
        </nav>
      </div>

      {error && (
        <div className="border ui-alert-error rounded-lg p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {activeTab === "dashboard" && (
        <div>
          {loadingStats ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : statistics ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="ui-card rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium ui-text-muted">
                      {t("admin.totalUsers")}
                    </p>
                    <p className="text-3xl font-semibold">
                      {statistics.users.total}
                    </p>
                  </div>
                  <div className="p-3 rounded-full ui-icon-primary text-2xl flex items-center justify-center w-12 h-12">
                    👥
                  </div>
                </div>
              </div>

              <div className="ui-card rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium ui-text-muted">
                      {t("admin.totalArticles")}
                    </p>
                    <p className="text-3xl font-semibold">
                      {statistics.articles.total}
                    </p>
                  </div>
                  <div className="p-3 rounded-full ui-icon-success text-2xl flex items-center justify-center w-12 h-12">
                    📦
                  </div>
                </div>
              </div>

              <div className="ui-card rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium ui-text-muted">
                      {t("admin.activeWarranties")}
                    </p>
                    <p className="text-3xl font-semibold">
                      {statistics.warranties.active}
                    </p>
                  </div>
                  <div className="p-3 rounded-full ui-icon-purple text-2xl flex items-center justify-center w-12 h-12">
                    🛡️
                  </div>
                </div>
              </div>

              <div className="ui-card rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium ui-text-muted">
                      {t("admin.sharedArticles")}
                    </p>
                    <p className="text-3xl font-semibold">
                      {statistics.sharing.totalSharedArticles}
                    </p>
                  </div>
                  <div className="p-3 rounded-full ui-icon-warning text-2xl flex items-center justify-center w-12 h-12">
                    🤝
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="border ui-alert-warning rounded-lg p-4">
              <p className="text-sm text-yellow-700">
                {t("dashboard.noStats")}
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === "users" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="ui-card rounded-lg">
            <div className="p-4 border-b ui-divider flex items-center justify-between gap-2">
              <h2 className="font-semibold">{t("admin.users")}</h2>
              <div className="flex items-center gap-2">
                {loadingUsers && (
                  <span className="text-xs ui-text-muted">
                    {t("common.loading")}
                  </span>
                )}
                <button
                  onClick={() => setCreateOpen(true)}
                  className="text-sm px-3 py-1.5 ui-btn-primary rounded"
                >
                  + {t("admin.createUser.button")}
                </button>
              </div>
            </div>
            <div className="divide-y">
              {users.map((u) => (
                <div
                  key={u.userId}
                  className={`p-4 space-y-2 ${
                    selectedUser?.userId === u.userId ? "ui-panel" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      onClick={() => {
                        setSelectedUser(u);
                        fetchInventory(u.userId);
                      }}
                      className="text-left flex-1 min-w-0"
                    >
                      <div className="font-medium truncate">{u.email}</div>
                      <div className="text-xs ui-text-muted">
                        ID #{u.userId}
                      </div>
                    </button>

                    {/* Inline role editor */}
                    <div className="flex items-center gap-2 shrink-0">
                      {editingRoleUserId === u.userId ? (
                        <>
                          <select
                            value={editingRoleValue}
                            onChange={(e) =>
                              setEditingRoleValue(e.target.value as Role)
                            }
                            className="ui-input text-xs px-2 py-1 rounded"
                          >
                            <option value="USER">USER</option>
                            <option value="POWER_USER">POWER_USER</option>
                            <option value="ADMIN">ADMIN</option>
                          </select>
                          <button
                            onClick={() => saveRole(u)}
                            className="text-xs px-2 py-1 ui-btn-primary rounded"
                            disabled={actionLoading === `role:${u.userId}`}
                          >
                            {t("common.save")}
                          </button>
                          <button
                            onClick={cancelEditRole}
                            className="text-xs px-2 py-1 ui-btn-ghost border ui-divider rounded"
                          >
                            {t("common.cancel")}
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => startEditRole(u)}
                          className="text-xs px-2 py-1 ui-btn-ghost border ui-divider rounded"
                          title={t("admin.editRole")}
                        >
                          {u.role} ✎
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Action row: reset pw / force logout / delete */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setResetPwTarget(u)}
                      className="text-xs px-2 py-1 ui-btn-ghost border ui-divider rounded"
                    >
                      🔑 {t("admin.resetPassword.button")}
                    </button>

                    {confirmForceLogoutUserId === u.userId ? (
                      <span className="flex items-center gap-1">
                        <span className="text-xs text-red-700">
                          {t("admin.confirmForceLogout")}
                        </span>
                        <button
                          onClick={() => forceLogout(u.userId)}
                          className="text-xs px-2 py-1 ui-btn-danger rounded"
                          disabled={
                            actionLoading === `force-logout:${u.userId}`
                          }
                        >
                          {t("common.yes")}
                        </button>
                        <button
                          onClick={() => setConfirmForceLogoutUserId(null)}
                          className="text-xs px-2 py-1 ui-btn-ghost border ui-divider rounded"
                        >
                          {t("common.no")}
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmForceLogoutUserId(u.userId)}
                        className="text-xs px-2 py-1 ui-btn-ghost border ui-divider rounded"
                        disabled={actionLoading === `force-logout:${u.userId}`}
                      >
                        🚪 {t("admin.forceLogout")}
                      </button>
                    )}

                    {confirmDeleteUserId === u.userId ? (
                      <span className="flex items-center gap-1">
                        <span className="text-xs text-red-700">
                          {t("admin.confirmDeleteUser")}
                        </span>
                        <button
                          onClick={() => deleteUser(u.userId)}
                          className="text-xs px-2 py-1 ui-btn-danger rounded"
                          disabled={actionLoading === `user:${u.userId}`}
                        >
                          {t("common.yes")}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteUserId(null)}
                          className="text-xs px-2 py-1 ui-btn-ghost border ui-divider rounded"
                        >
                          {t("common.no")}
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteUserId(u.userId)}
                        className="ui-action-danger text-xs"
                        disabled={actionLoading === `user:${u.userId}`}
                      >
                        🗑 {t("admin.delete")}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {!loadingUsers && users.length === 0 && (
                <div className="p-4 text-sm ui-text-muted">
                  {t("admin.noUsers")}
                </div>
              )}
            </div>
          </div>

          <div className="ui-card rounded-lg">
            <div className="p-4 border-b ui-divider">
              <h2 className="font-semibold">{t("admin.inventory")}</h2>
              {selectedUser && (
                <p className="text-xs ui-text-muted">{selectedUser.email}</p>
              )}
            </div>

            {!selectedUser && (
              <div className="p-4 text-sm ui-text-muted">
                {t("admin.selectUser")}
              </div>
            )}

            {selectedUser && loadingInventory && (
              <div className="p-4 text-sm ui-text-muted">
                {t("admin.loadingInventory")}
              </div>
            )}

            {selectedUser && inventory && !loadingInventory && (
              <div className="p-4 space-y-6">
                <div>
                  <h3 className="font-medium mb-2">{t("admin.articles")}</h3>
                  <div className="space-y-2">
                    {inventory.articlesOwned?.map((a) => (
                      <div
                        key={a.articleId}
                        className="ui-panel rounded p-3 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium">
                              {a.articleNom} — {a.articleModele}
                            </div>
                            <div className="text-xs ui-text-muted">
                              {a.articleDescription || t("admin.noDescription")}
                            </div>
                            {a.garantie && (
                              <div className="text-xs ui-text-muted mt-1">
                                {t("admin.warrantyLabel")}:{" "}
                                {a.garantie.garantieNom} (
                                {a.garantie.garantieIsValide
                                  ? t("admin.status.valid")
                                  : t("admin.status.expired")}
                                )
                              </div>
                            )}
                          </div>

                          {confirmDeleteArticleId === a.articleId ? (
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => deleteArticle(a.articleId)}
                                className="text-xs px-2 py-1 ui-btn-danger rounded"
                                disabled={
                                  actionLoading === `article:${a.articleId}`
                                }
                              >
                                {t("common.yes")}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteArticleId(null)}
                                className="text-xs px-2 py-1 ui-btn-ghost border ui-divider rounded"
                              >
                                {t("common.no")}
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() =>
                                setConfirmDeleteArticleId(a.articleId)
                              }
                              className="ui-action-danger text-sm shrink-0"
                              disabled={
                                actionLoading === `article:${a.articleId}`
                              }
                            >
                              {actionLoading === `article:${a.articleId}`
                                ? t("admin.deleting")
                                : t("admin.delete")}
                            </button>
                          )}
                        </div>

                        {confirmDeleteArticleId === a.articleId && (
                          <p className="text-xs text-red-700">
                            {t("admin.confirmDeleteArticle")}
                          </p>
                        )}
                      </div>
                    ))}
                    {inventory.articlesOwned?.length === 0 && (
                      <div className="text-sm ui-text-muted">
                        {t("admin.noArticles")}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="font-medium mb-2">{t("admin.warranties")}</h3>
                  <div className="space-y-2">
                    {inventory.warrantiesOwned?.map((w) => (
                      <div key={w.garantieId} className="ui-panel rounded p-3">
                        <div className="font-medium">{w.garantieNom}</div>
                        <div className="text-xs ui-text-muted">
                          {t("admin.statusLabel")}:{" "}
                          {w.garantieIsValide
                            ? t("admin.status.valid")
                            : t("admin.status.expired")}
                        </div>
                        {w.article && (
                          <div className="text-xs ui-text-muted mt-1">
                            {t("articles.title")}: {w.article.articleNom} —{" "}
                            {w.article.articleModele}
                          </div>
                        )}
                      </div>
                    ))}
                    {inventory.warrantiesOwned?.length === 0 && (
                      <div className="text-sm ui-text-muted">
                        {t("admin.noWarranties")}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "auditLog" && <AuditLogTab />}

      {createOpen && (
        <CreateUserModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            fetchUsers();
            fetchStatistics();
          }}
        />
      )}

      {resetPwTarget && (
        <ResetPasswordModal
          userId={resetPwTarget.userId}
          email={resetPwTarget.email}
          onClose={() => setResetPwTarget(null)}
          onDone={() => undefined}
        />
      )}
    </div>
  );
}
