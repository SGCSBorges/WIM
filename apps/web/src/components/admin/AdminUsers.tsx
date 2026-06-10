/**
 * Admin panel — four tabs (Dashboard / Users / Audit log / Jobs) wired up
 * as a WAI-ARIA tablist. The Users tab fetches once per activation and
 * supports inline role edit (with last-admin protection), reset password,
 * force-logout, delete user, and inventory inspection. ADMIN-only via the
 * route layer (`requireRole("ADMIN")`).
 */
import { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck,
  LayoutDashboard,
  Users as UsersIcon,
  ScrollText,
  Briefcase,
  RotateCw,
  KeyRound,
  LogOut,
  Trash2,
  Pencil,
  Search,
  Package,
  Activity,
  UserPlus,
  Check,
} from "lucide-react";
import {
  adminAPI,
  articlesAPI,
  authAPI,
  statisticsAPI,
} from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { useToast } from "../common/Toast";
import { getErrorMessage } from "../../utils/error";
import CreateUserModal from "./CreateUserModal";
import ResetPasswordModal from "./ResetPasswordModal";
import AuditLogTab from "./AuditLogTab";
import JobsTab from "./JobsTab";
import AdminDbBackup from "./AdminDbBackup";
import { DashboardStatsSkeleton } from "../common/Skeleton";
import {
  PageHeader,
  Section,
  Tabs,
  Button,
  Input,
  Select,
  Badge,
  Stat,
  type BadgeTone,
} from "../ui";

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
  const toast = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [inventory, setInventory] = useState<UserInventory | null>(null);

  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<
    "dashboard" | "users" | "auditLog" | "jobs"
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
  const [userSearch, setUserSearch] = useState("");
  const [userSort, setUserSort] = useState<"createdAt" | "email" | "role">(
    "createdAt"
  );
  const [userDir, setUserDir] = useState<"asc" | "desc">("desc");

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
      const data = await adminAPI.listUsers({
        q: userSearch.trim() || undefined,
        sort: userSort,
        dir: userDir,
      });
      setUsers(data);
    } catch (e: unknown) {
      setError(getErrorMessage(e, t("admin.error.fetchUsers")));
    } finally {
      setLoadingUsers(false);
    }
  }, [t, userSearch, userSort, userDir]);

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
      toast.show(t("admin.forceLogout.success"), { kind: "success" });
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

  // Debounce the users fetch so a typed search/sort change doesn't fire a
  // request per keystroke. Statistics is independent and fetched once.
  useEffect(() => {
    const handle = setTimeout(fetchUsers, 300);
    return () => clearTimeout(handle);
  }, [fetchUsers]);

  useEffect(() => {
    fetchStatistics();
  }, [fetchStatistics]);

  if (role !== "ADMIN") {
    return (
      <Section
        icon={<ShieldCheck className="h-5 w-5" />}
        title={t("admin.title")}
      >
        <p className="text-sm ui-text-muted">{t("admin.accessDenied")}</p>
      </Section>
    );
  }

  const roleTone = (r: Role): BadgeTone =>
    r === "ADMIN" ? "admin" : r === "POWER_USER" ? "power" : "neutral";

  return (
    <div>
      <PageHeader
        icon={<ShieldCheck className="h-5 w-5" />}
        title={t("admin.title")}
        subtitle={t("admin.subtitle")}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={activeTab === "users" ? fetchUsers : fetchStatistics}
            disabled={
              activeTab === "users"
                ? loadingUsers
                : activeTab === "dashboard"
                  ? loadingStats
                  : true
            }
            leftIcon={<RotateCw className="h-4 w-4" />}
          >
            {t("common.refresh")}
          </Button>
        }
      />

      <Tabs
        idPrefix="admin-tab"
        aria-label={t("admin.title")}
        value={activeTab}
        onChange={(id) =>
          setActiveTab(id as "dashboard" | "users" | "auditLog" | "jobs")
        }
        tabs={[
          {
            id: "dashboard",
            label: t("admin.dashboard"),
            icon: <LayoutDashboard className="h-4 w-4" />,
          },
          {
            id: "users",
            label: t("admin.users"),
            icon: <UsersIcon className="h-4 w-4" />,
          },
          {
            id: "auditLog",
            label: t("admin.auditLog"),
            icon: <ScrollText className="h-4 w-4" />,
          },
          {
            id: "jobs",
            label: t("admin.jobs"),
            icon: <Briefcase className="h-4 w-4" />,
          },
        ]}
        className="mb-6"
      />

      {error && (
        <div className="mb-4 rounded-xl border ui-alert-error p-3 text-sm ui-text-error">
          {error}
        </div>
      )}

      {activeTab === "dashboard" && (
        <div
          role="tabpanel"
          id="admin-tab-panel-dashboard"
          aria-labelledby="admin-tab-dashboard"
          className="space-y-6"
        >
          {loadingStats ? (
            <DashboardStatsSkeleton cards={4} />
          ) : statistics ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label={t("admin.totalUsers")}
                value={statistics.users.total}
                tone="primary"
                icon={<UsersIcon className="h-5 w-5" />}
              />
              <Stat
                label={t("admin.totalArticles")}
                value={statistics.articles.total}
                tone="success"
                icon={<Package className="h-5 w-5" />}
              />
              <Stat
                label={t("admin.activeWarranties")}
                value={statistics.warranties.active}
                tone="accent"
                icon={<ShieldCheck className="h-5 w-5" />}
              />
              <Stat
                label={t("admin.sharedArticles")}
                value={statistics.sharing.totalSharedArticles}
                tone="warning"
                icon={<Activity className="h-5 w-5" />}
              />
            </div>
          ) : (
            <div className="rounded-xl border ui-alert-warning p-4 text-sm ui-text-warn">
              {t("dashboard.noStats")}
            </div>
          )}
          <AdminDbBackup />
        </div>
      )}

      {activeTab === "users" && (
        <div
          role="tabpanel"
          id="admin-tab-panel-users"
          aria-labelledby="admin-tab-users"
          className="grid grid-cols-1 gap-6 lg:grid-cols-2"
        >
          {/* Users list */}
          <Section
            icon={<UsersIcon className="h-5 w-5" />}
            title={t("admin.users")}
            actions={
              <Button
                size="sm"
                onClick={() => setCreateOpen(true)}
                leftIcon={<UserPlus className="h-4 w-4" />}
              >
                {t("admin.createUser.button")}
              </Button>
            }
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[160px] flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder={t("admin.users.searchPlaceholder")}
                  aria-label={t("admin.users.searchPlaceholder")}
                  className="pl-9"
                />
              </div>
              <Select
                value={`${userSort}:${userDir}`}
                onChange={(e) => {
                  const [s, d] = e.target.value.split(":") as [
                    typeof userSort,
                    typeof userDir,
                  ];
                  setUserSort(s);
                  setUserDir(d);
                }}
                aria-label={t("admin.users.sortLabel")}
                className="w-auto"
              >
                <option value="createdAt:desc">
                  {t("admin.users.sort.newest")}
                </option>
                <option value="createdAt:asc">
                  {t("admin.users.sort.oldest")}
                </option>
                <option value="email:asc">
                  {t("admin.users.sort.emailAsc")}
                </option>
                <option value="email:desc">
                  {t("admin.users.sort.emailDesc")}
                </option>
                <option value="role:asc">
                  {t("admin.users.sort.roleAsc")}
                </option>
              </Select>
            </div>
            {loadingUsers && (
              <p className="mb-2 text-xs ui-text-muted">
                {t("common.loading")}
              </p>
            )}
            <ul className="divide-y ui-divider">
              {users.map((u) => (
                <li
                  key={u.userId}
                  className={`space-y-2 py-3 first:pt-0 last:pb-0 ${
                    selectedUser?.userId === u.userId
                      ? "-mx-2 rounded-lg bg-surface-muted px-2"
                      : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      onClick={() => {
                        setSelectedUser(u);
                        fetchInventory(u.userId);
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate font-medium ui-title">
                        {u.email}
                      </div>
                      <div className="text-xs ui-text-muted">
                        ID #{u.userId}
                      </div>
                    </button>

                    {/* Inline role editor */}
                    <div className="flex shrink-0 items-center gap-2">
                      {editingRoleUserId === u.userId ? (
                        <>
                          <Select
                            value={editingRoleValue}
                            onChange={(e) =>
                              setEditingRoleValue(e.target.value as Role)
                            }
                            className="w-auto text-xs"
                          >
                            <option value="USER">{t("admin.role.USER")}</option>
                            <option value="POWER_USER">
                              {t("admin.role.POWER_USER")}
                            </option>
                            <option value="ADMIN">
                              {t("admin.role.ADMIN")}
                            </option>
                          </Select>
                          <Button
                            size="sm"
                            onClick={() => saveRole(u)}
                            loading={actionLoading === `role:${u.userId}`}
                            leftIcon={<Check className="h-4 w-4" />}
                          >
                            {t("common.save")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={cancelEditRole}
                          >
                            {t("common.cancel")}
                          </Button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditRole(u)}
                          title={t("admin.editRole")}
                          className="inline-flex items-center gap-1 rounded-full"
                        >
                          <Badge tone={roleTone(u.role)}>{u.role}</Badge>
                          <Pencil
                            className="h-3 w-3 ui-text-muted"
                            aria-hidden="true"
                          />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Action row */}
                  <div className="flex flex-wrap items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setResetPwTarget(u)}
                      leftIcon={<KeyRound className="h-4 w-4" />}
                    >
                      {t("admin.resetPassword.button")}
                    </Button>

                    {confirmForceLogoutUserId === u.userId ? (
                      <span className="flex items-center gap-1">
                        <span className="text-xs ui-text-error">
                          {t("admin.confirmForceLogout")}
                        </span>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => forceLogout(u.userId)}
                          loading={actionLoading === `force-logout:${u.userId}`}
                        >
                          {t("common.yes")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmForceLogoutUserId(null)}
                        >
                          {t("common.no")}
                        </Button>
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmForceLogoutUserId(u.userId)}
                        disabled={actionLoading === `force-logout:${u.userId}`}
                        leftIcon={<LogOut className="h-4 w-4" />}
                      >
                        {t("admin.forceLogout")}
                      </Button>
                    )}

                    {confirmDeleteUserId === u.userId ? (
                      <span className="flex items-center gap-1">
                        <span className="text-xs ui-text-error">
                          {t("admin.confirmDeleteUser")}
                        </span>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => deleteUser(u.userId)}
                          loading={actionLoading === `user:${u.userId}`}
                        >
                          {t("common.yes")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDeleteUserId(null)}
                        >
                          {t("common.no")}
                        </Button>
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDeleteUserId(u.userId)}
                        disabled={actionLoading === `user:${u.userId}`}
                        className="text-danger"
                        leftIcon={<Trash2 className="h-4 w-4" />}
                      >
                        {t("admin.delete")}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
              {!loadingUsers && users.length === 0 && (
                <li className="py-4 text-sm ui-text-muted">
                  {t("admin.noUsers")}
                </li>
              )}
            </ul>
          </Section>

          {/* User inventory */}
          <Section
            icon={<Package className="h-5 w-5" />}
            title={t("admin.inventory")}
            description={selectedUser?.email}
          >
            {!selectedUser && (
              <p className="text-sm ui-text-muted">{t("admin.selectUser")}</p>
            )}

            {selectedUser && loadingInventory && (
              <p className="text-sm ui-text-muted">
                {t("admin.loadingInventory")}
              </p>
            )}

            {selectedUser && inventory && !loadingInventory && (
              <div className="space-y-6">
                <div>
                  <h3 className="mb-2 text-sm font-medium ui-text-muted">
                    {t("admin.articles")}
                  </h3>
                  <div className="space-y-2">
                    {inventory.articlesOwned?.map((a) => (
                      <div
                        key={a.articleId}
                        className="space-y-2 rounded-lg border ui-divider p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium ui-title">
                              {a.articleNom} — {a.articleModele}
                            </div>
                            <div className="text-xs ui-text-muted">
                              {a.articleDescription || t("admin.noDescription")}
                            </div>
                            {a.garantie && (
                              <div className="mt-1 text-xs ui-text-muted">
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
                            <div className="flex shrink-0 items-center gap-2">
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => deleteArticle(a.articleId)}
                                loading={
                                  actionLoading === `article:${a.articleId}`
                                }
                              >
                                {t("common.yes")}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirmDeleteArticleId(null)}
                              >
                                {t("common.no")}
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setConfirmDeleteArticleId(a.articleId)
                              }
                              disabled={
                                actionLoading === `article:${a.articleId}`
                              }
                              className="shrink-0 text-danger"
                              leftIcon={<Trash2 className="h-4 w-4" />}
                            >
                              {actionLoading === `article:${a.articleId}`
                                ? t("admin.deleting")
                                : t("admin.delete")}
                            </Button>
                          )}
                        </div>

                        {confirmDeleteArticleId === a.articleId && (
                          <p className="text-xs ui-text-error">
                            {t("admin.confirmDeleteArticle")}
                          </p>
                        )}
                      </div>
                    ))}
                    {inventory.articlesOwned?.length === 0 && (
                      <p className="text-sm ui-text-muted">
                        {t("admin.noArticles")}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-medium ui-text-muted">
                    {t("admin.warranties")}
                  </h3>
                  <div className="space-y-2">
                    {inventory.warrantiesOwned?.map((w) => (
                      <div
                        key={w.garantieId}
                        className="rounded-lg border ui-divider p-3"
                      >
                        <div className="font-medium ui-title">
                          {w.garantieNom}
                        </div>
                        <div className="text-xs ui-text-muted">
                          {t("admin.statusLabel")}:{" "}
                          {w.garantieIsValide
                            ? t("admin.status.valid")
                            : t("admin.status.expired")}
                        </div>
                        {w.article && (
                          <div className="mt-1 text-xs ui-text-muted">
                            {t("articles.title")}: {w.article.articleNom} —{" "}
                            {w.article.articleModele}
                          </div>
                        )}
                      </div>
                    ))}
                    {inventory.warrantiesOwned?.length === 0 && (
                      <p className="text-sm ui-text-muted">
                        {t("admin.noWarranties")}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </Section>
        </div>
      )}

      {activeTab === "auditLog" && (
        <div
          role="tabpanel"
          id="admin-tab-panel-auditLog"
          aria-labelledby="admin-tab-auditLog"
        >
          <AuditLogTab />
        </div>
      )}
      {activeTab === "jobs" && (
        <div
          role="tabpanel"
          id="admin-tab-panel-jobs"
          aria-labelledby="admin-tab-jobs"
        >
          <JobsTab />
        </div>
      )}

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
