import React, { useEffect, useMemo, useState } from "react";
import { API_BASE_URL, authAPI, statisticsAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";

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

function headers() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    Authorization: token ? `Bearer ${token}` : "",
  };
}

export default function AdminUsers() {
  const { t } = useI18n();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [inventory, setInventory] = useState<UserInventory | null>(null);

  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"dashboard" | "users">(
    "dashboard",
  );
  const [statistics, setStatistics] = useState<AdminStatistics | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const role = useMemo(() => authAPI.getRole(), []);

  const getErrorMessage = async (res: Response, fallback: string) => {
    try {
      const data = await res.json();
      return data?.error || `${fallback} (${res.status})`;
    } catch {
      const text = await res.text().catch(() => "");
      const snippet = text ? `: ${text.slice(0, 200)}` : "";
      return `${fallback} (${res.status})${snippet}`;
    }
  };

  const fetchStatistics = async () => {
    setLoadingStats(true);
    setError(null);
    try {
      const data = await statisticsAPI.getAdmin();
      setStatistics(data);
    } catch (e: any) {
      setError(e.message || t("admin.error.fetchStatistics"));
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users`, {
        headers: headers(),
      });
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, "Failed to fetch users"));
      }
      const data = (await res.json()) as UserRow[];
      setUsers(data);
    } catch (e: any) {
      setError(e.message || t("admin.error.fetchUsers"));
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchInventory = async (userId: number) => {
    setLoadingInventory(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/admin/users/${userId}/inventory`,
        {
          headers: headers(),
        },
      );
      if (!res.ok) {
        throw new Error(
          await getErrorMessage(res, "Failed to fetch inventory"),
        );
      }
      const data = (await res.json()) as UserInventory;
      setInventory(data);
    } catch (e: any) {
      setError(e.message || t("admin.error.fetchInventory"));
    } finally {
      setLoadingInventory(false);
    }
  };

  const deleteUser = async (userId: number) => {
    if (!confirm(t("admin.confirmDeleteUser"))) {
      return;
    }
    setActionLoading(`user:${userId}`);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users/${userId}`, {
        method: "DELETE",
        headers: headers(),
      });
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, "Failed to delete user"));
      }
      // refresh
      if (selectedUser?.userId === userId) {
        setSelectedUser(null);
        setInventory(null);
      }
      await fetchUsers();
    } catch (e: any) {
      setError(e.message || t("admin.error.deleteUser"));
    } finally {
      setActionLoading(null);
    }
  };

  const deleteArticle = async (articleId: number) => {
    if (!confirm(t("admin.confirmDeleteArticle"))) return;
    setActionLoading(`article:${articleId}`);
    setError(null);
    try {
      // Admin can delete inventory items via normal endpoint (auth required)
      const res = await fetch(`${API_BASE_URL}/articles/${articleId}`, {
        method: "DELETE",
        headers: headers(),
      });
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, "Failed to delete article"));
      }
      if (selectedUser) {
        await fetchInventory(selectedUser.userId);
      }
    } catch (e: any) {
      setError(e.message || t("admin.error.deleteArticle"));
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchStatistics();
  }, []);

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
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === "dashboard"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {t("admin.dashboard")}
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === "users"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {t("admin.users")}
          </button>
        </nav>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
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
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">
                      {t("admin.totalUsers")}
                    </p>
                    <p className="text-3xl font-semibold text-gray-900">
                      {statistics.users.total}
                    </p>
                  </div>
                  <div className="p-3 rounded-full bg-blue-500 text-white text-2xl flex items-center justify-center w-12 h-12">
                    👥
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">
                      {t("admin.totalArticles")}
                    </p>
                    <p className="text-3xl font-semibold text-gray-900">
                      {statistics.articles.total}
                    </p>
                  </div>
                  <div className="p-3 rounded-full bg-green-500 text-white text-2xl flex items-center justify-center w-12 h-12">
                    📦
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">
                      {t("admin.activeWarranties")}
                    </p>
                    <p className="text-3xl font-semibold text-gray-900">
                      {statistics.warranties.active}
                    </p>
                  </div>
                  <div className="p-3 rounded-full bg-purple-500 text-white text-2xl flex items-center justify-center w-12 h-12">
                    🛡️
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">
                      {t("admin.sharedArticles")}
                    </p>
                    <p className="text-3xl font-semibold text-gray-900">
                      {statistics.sharing.totalSharedArticles}
                    </p>
                  </div>
                  <div className="p-3 rounded-full bg-orange-500 text-white text-2xl flex items-center justify-center w-12 h-12">
                    🤝
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-700">No statistics available</p>
            </div>
          )}
        </div>
      )}

      {activeTab === "users" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="ui-card rounded-lg">
            <div className="p-4 border-b ui-divider flex items-center justify-between">
              <h2 className="font-semibold">{t("admin.users")}</h2>
              {loadingUsers && (
                <span className="text-xs ui-text-muted">
                  {t("common.loading")}
                </span>
              )}
            </div>
            <div className="divide-y">
              {users.map((u) => (
                <div
                  key={u.userId}
                  className={`p-4 flex items-center justify-between ${
                    selectedUser?.userId === u.userId ? "ui-panel" : ""
                  }`}
                >
                  <button
                    onClick={() => {
                      setSelectedUser(u);
                      fetchInventory(u.userId);
                    }}
                    className="text-left flex-1 mr-4"
                  >
                    <div className="font-medium">{u.email}</div>
                    <div className="text-xs ui-text-muted">
                      {t("admin.roleLabel")}: {u.role}
                    </div>
                  </button>
                  <button
                    onClick={() => deleteUser(u.userId)}
                    className="text-red-600 hover:text-red-800 text-sm"
                    disabled={actionLoading === `user:${u.userId}`}
                  >
                    {actionLoading === `user:${u.userId}`
                      ? t("admin.deleting")
                      : t("admin.delete")}
                  </button>
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
                        className="ui-panel rounded p-3 flex items-start justify-between"
                      >
                        <div>
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
                        <button
                          onClick={() => deleteArticle(a.articleId)}
                          className="text-red-600 hover:text-red-800 text-sm"
                          disabled={actionLoading === `article:${a.articleId}`}
                        >
                          {actionLoading === `article:${a.articleId}`
                            ? t("admin.deleting")
                            : t("admin.delete")}
                        </button>
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
    </div>
  );
}
