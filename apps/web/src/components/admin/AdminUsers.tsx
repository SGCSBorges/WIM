import React, { useEffect, useMemo, useState } from "react";
import { authAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";

const API_BASE_URL = "http://localhost:3000/api";

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

  const role = useMemo(() => authAPI.getRole(), []);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users`, {
        headers: headers(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed to fetch users (${res.status})`);
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
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.error || `Failed to fetch inventory (${res.status})`,
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
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed to delete user (${res.status})`);
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
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.error || `Failed to delete article (${res.status})`,
        );
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
          onClick={fetchUsers}
          className="ui-btn-ghost px-3 py-2 rounded border ui-divider"
          disabled={loadingUsers}
        >
          {t("common.refresh")}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

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
                            {t("admin.warrantyLabel")}: {a.garantie.garantieNom}{" "}
                            (
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
    </div>
  );
}
