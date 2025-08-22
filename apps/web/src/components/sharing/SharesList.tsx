import React, { useState, useEffect } from "react";
import { useI18n } from "../../i18n/i18n";
import { API_BASE_URL } from "../../services/api";

interface Share {
  inventoryShareId: number;
  permission: "READ" | "WRITE";
  active: boolean;
  createdAt: string;
  updatedAt: string;
  target: {
    userId: number;
    email: string;
  };
}

interface ShareInvite {
  shareInviteId: number;
  email: string;
  token: string;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  permission: "READ" | "WRITE";
  expiresAt: string;
  usedAt?: string;
  createdAt: string;
}

interface SharesListProps {
  onEdit?: (share: Share) => void;
  onRevoke?: (shareId: number) => void;
  onInviteRevoke?: (inviteId: number) => void;
  onAdd?: () => void;
  isLoading?: boolean;
}

const SharesList: React.FC<SharesListProps> = ({
  onEdit,
  onRevoke,
  onInviteRevoke,
  onAdd,
  isLoading = false,
}) => {
  const { t } = useI18n();
  const [shares, setShares] = useState<Share[]>([]);
  const [invites, setInvites] = useState<ShareInvite[]>([]);
  const [activeTab, setActiveTab] = useState<"shares" | "invites">("shares");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<
    "all" | "active" | "inactive"
  >("all");

  useEffect(() => {
    fetchShares();
    fetchInvites();
  }, []);

  const fetchShares = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/shares/owned`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setShares(data);
      }
    } catch (error) {
      console.error("Failed to fetch shares:", error);
    }
  };

  const fetchInvites = async () => {
    try {
      // The backend exposes invite routes under /api/shares/invites (create/accept),
      // but doesn't currently provide a "list invites" endpoint.
      // Keep the UI stable by showing none until list support is added.
      setInvites([]);
      return;

      // eslint-disable-next-line no-unreachable
      const response = await fetch(`${API_BASE_URL}/shares/invites`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setInvites(data);
      }
    } catch (error) {
      console.error("Failed to fetch invites:", error);
    }
  };

  const handleRevokeShare = async (shareId: number) => {
    if (window.confirm(t("shares.confirmRevoke"))) {
      if (onRevoke) {
        onRevoke(shareId);
      }

      try {
        const share = shares.find((s) => s.inventoryShareId === shareId);
        if (!share) return;
        const response = await fetch(
          `${API_BASE_URL}/shares/${share.target.userId}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          },
        );

        if (response.ok) {
          setShares(shares.filter((s) => s.inventoryShareId !== shareId));
        }
      } catch (error) {
        console.error("Failed to revoke share:", error);
      }
    }
  };

  const handleRevokeInvite = async (inviteId: number) => {
    // Backend doesn't expose invite revoke endpoint in this MVP.
    console.warn(t("shares.invite.revokeNotImplemented"), inviteId);
  };

  const getPermissionColor = (permission: string) => {
    return permission === "WRITE"
      ? "bg-red-100 text-red-800"
      : "bg-green-100 text-green-800";
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "PENDING":
        return "bg-yellow-100 text-yellow-800";
      case "ACCEPTED":
        return "bg-green-100 text-green-800";
      case "REVOKED":
        return "bg-red-100 text-red-800";
      case "EXPIRED":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const isInviteExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date();
  };

  const filteredShares = shares.filter((share) => {
    const matchesSearch = share.target.email
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesFilter =
      filterStatus === "all" ||
      (filterStatus === "active" && share.active) ||
      (filterStatus === "inactive" && !share.active);
    return matchesSearch && matchesFilter;
  });

  const filteredInvites = invites.filter((invite) => {
    const matchesSearch = invite.email
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesFilter =
      filterStatus === "all" ||
      (filterStatus === "active" && invite.status === "PENDING") ||
      (filterStatus === "inactive" && invite.status !== "PENDING");
    return matchesSearch && matchesFilter;
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">
          {t("shares.title")}
        </h2>
        {onAdd && (
          <button
            onClick={onAdd}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            {t("shares.add")}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("shares")}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === "shares"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {t("shares.tab.active")} ({shares.filter((s) => s.active).length})
          </button>
          <button
            onClick={() => setActiveTab("invites")}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === "invites"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {t("shares.tab.pending")} (
            {invites.filter((i) => i.status === "PENDING").length})
          </button>
        </nav>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder={`${t("shares.search.placeholder")} ${activeTab}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <select
          value={filterStatus}
          onChange={(e) =>
            setFilterStatus(e.target.value as typeof filterStatus)
          }
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="all">{t("shares.filter.all")}</option>
          <option value="active">{t("shares.filter.active")}</option>
          <option value="inactive">{t("shares.filter.inactive")}</option>
        </select>
      </div>

      {/* Content */}
      {activeTab === "shares" ? (
        <div className="space-y-4">
          {filteredShares.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-500 mb-4">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {t("shares.none.activeTitle")}
              </h3>
              <p className="text-gray-500">
                {searchTerm || filterStatus !== "all"
                  ? t("shares.none.filtered")
                  : t("shares.none.activeEmpty")}
              </p>
            </div>
          ) : (
            filteredShares.map((share) => (
              <div
                key={share.inventoryShareId}
                className="bg-white rounded-lg border border-gray-200 shadow-sm p-6"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {share.target.email}
                      </h3>
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${getPermissionColor(share.permission)}`}
                      >
                        {share.permission}
                      </span>
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          share.active
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {share.active
                          ? t("shares.status.active")
                          : t("shares.status.inactive")}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">
                      {t("shares.label.sharedOn")}{" "}
                      {new Date(share.createdAt).toLocaleDateString()}
                    </p>
                    {share.updatedAt !== share.createdAt && (
                      <p className="text-sm text-gray-500">
                        {t("shares.label.updatedOn")}{" "}
                        {new Date(share.updatedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  <div className="flex space-x-2">
                    {onEdit && share.active && (
                      <button
                        onClick={() => onEdit(share)}
                        className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                      >
                        {t("shares.action.edit")}
                      </button>
                    )}
                    {share.active && (
                      <button
                        onClick={() =>
                          handleRevokeShare(share.inventoryShareId)
                        }
                        className="px-3 py-1 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                      >
                        {t("shares.action.revoke")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredInvites.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-500 mb-4">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {t("shares.none.pendingTitle")}
              </h3>
              <p className="text-gray-500">
                {searchTerm || filterStatus !== "all"
                  ? t("shares.none.filtered")
                  : t("shares.none.pendingEmpty")}
              </p>
            </div>
          ) : (
            filteredInvites.map((invite) => {
              const isExpired = isInviteExpired(invite.expiresAt);
              const finalStatus =
                isExpired && invite.status === "PENDING"
                  ? "EXPIRED"
                  : invite.status;

              return (
                <div
                  key={invite.shareInviteId}
                  className="bg-white rounded-lg border border-gray-200 shadow-sm p-6"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {invite.email}
                        </h3>
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${getPermissionColor(invite.permission)}`}
                        >
                          {invite.permission}
                        </span>
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(finalStatus)}`}
                        >
                          {finalStatus}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 space-y-1">
                        <p>
                          {t("shares.label.sentOn")}{" "}
                          {new Date(invite.createdAt).toLocaleDateString()}
                        </p>
                        <p>
                          {t("shares.label.expiresOn")}{" "}
                          {new Date(invite.expiresAt).toLocaleDateString()}
                        </p>
                        {invite.usedAt && (
                          <p>
                            {t("shares.label.acceptedOn")}{" "}
                            {new Date(invite.usedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex space-x-2">
                      {invite.status === "PENDING" && !isExpired && (
                        <button
                          onClick={() =>
                            handleRevokeInvite(invite.shareInviteId)
                          }
                          className="px-3 py-1 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                        >
                          {t("shares.action.revoke")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default SharesList;
