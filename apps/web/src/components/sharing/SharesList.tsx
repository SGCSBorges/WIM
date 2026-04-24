import React, { useState, useEffect } from "react";
import { useI18n } from "../../i18n/i18n";
import { sharesAPI } from "../../services/api";

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
  onAdd,
  isLoading = false,
}) => {
  const { t } = useI18n();
  const [shares, setShares] = useState<Share[]>([]);
  const [invites] = useState<ShareInvite[]>([]);
  const [activeTab, setActiveTab] = useState<"shares" | "invites">("shares");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [confirmRevokeId, setConfirmRevokeId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchShares();
  }, []);

  const fetchShares = async () => {
    setError(null);
    try {
      const data = await sharesAPI.getOwned();
      setShares(data as Share[]);
    } catch (e: any) {
      setError(e?.message || t("common.errorOccurred"));
    }
  };

  const handleRevokeShare = async (shareId: number) => {
    setConfirmRevokeId(null);
    const share = shares.find((s) => s.inventoryShareId === shareId);
    if (!share) return;
    if (onRevoke) onRevoke(shareId);
    setError(null);
    try {
      await sharesAPI.revoke(share.target.userId);
      setShares(shares.filter((s) => s.inventoryShareId !== shareId));
    } catch (e: any) {
      setError(e?.message || t("common.errorOccurred"));
    }
  };

  const getPermissionColor = (permission: string) =>
    permission === "WRITE" ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800";

  const getStatusColor = (status: string) => {
    switch (status) {
      case "PENDING":   return "bg-yellow-100 text-yellow-800";
      case "ACCEPTED":  return "bg-green-100 text-green-800";
      case "REVOKED":   return "bg-red-100 text-red-800";
      case "EXPIRED":   return "bg-gray-100 text-gray-800";
      default:          return "bg-gray-100 text-gray-800";
    }
  };

  const isInviteExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

  const filteredShares = shares.filter((share) => {
    const matchesSearch = share.target.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter =
      filterStatus === "all" ||
      (filterStatus === "active" && share.active) ||
      (filterStatus === "inactive" && !share.active);
    return matchesSearch && matchesFilter;
  });

  const filteredInvites = invites.filter((invite) => {
    const matchesSearch = invite.email.toLowerCase().includes(searchTerm.toLowerCase());
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
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold ui-title">{t("shares.title")}</h2>
        {onAdd && (
          <button
            onClick={onAdd}
            className="ui-btn-primary px-4 py-2 rounded-md transition-colors"
          >
            {t("shares.add")}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b ui-divider">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("shares")}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === "shares"
                ? "border-blue-500 text-blue-600"
                : "border-transparent ui-text-muted hover:border-gray-300"
            }`}
          >
            {t("shares.tab.active")} ({shares.filter((s) => s.active).length})
          </button>
          <button
            onClick={() => setActiveTab("invites")}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === "invites"
                ? "border-blue-500 text-blue-600"
                : "border-transparent ui-text-muted hover:border-gray-300"
            }`}
          >
            {t("shares.tab.pending")} ({invites.filter((i) => i.status === "PENDING").length})
          </button>
        </nav>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder={`${t("shares.search.placeholder")}…`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="ui-input w-full px-3 py-2 rounded-md"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
          className="ui-select px-3 py-2 rounded-md"
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
              <div className="ui-text-muted mb-4">
                <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium mb-2">{t("shares.none.activeTitle")}</h3>
              <p className="ui-text-muted">
                {searchTerm || filterStatus !== "all"
                  ? t("shares.none.filtered")
                  : t("shares.none.activeEmpty")}
              </p>
            </div>
          ) : (
            filteredShares.map((share) => (
              <div key={share.inventoryShareId} className="ui-card rounded-lg p-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-semibold">{share.target.email}</h3>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPermissionColor(share.permission)}`}>
                        {share.permission}
                      </span>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${share.active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                        {share.active ? t("shares.status.active") : t("shares.status.inactive")}
                      </span>
                    </div>
                    <p className="text-sm ui-text-muted">
                      {t("shares.label.sharedOn")} {new Date(share.createdAt).toLocaleDateString()}
                    </p>
                    {share.updatedAt !== share.createdAt && (
                      <p className="text-sm ui-text-muted">
                        {t("shares.label.updatedOn")} {new Date(share.updatedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  <div className="flex space-x-2 items-center">
                    {onEdit && share.active && (
                      <button
                        onClick={() => onEdit(share)}
                        className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                      >
                        {t("shares.action.edit")}
                      </button>
                    )}
                    {share.active && (
                      confirmRevokeId === share.inventoryShareId ? (
                        <>
                          <span className="text-xs text-red-700">{t("shares.confirmRevoke")}</span>
                          <button
                            onClick={() => handleRevokeShare(share.inventoryShareId)}
                            className="px-2 py-1 text-xs bg-red-600 text-white rounded"
                          >
                            {t("common.yes")}
                          </button>
                          <button
                            onClick={() => setConfirmRevokeId(null)}
                            className="px-2 py-1 text-xs ui-btn-ghost border ui-divider rounded"
                          >
                            {t("common.no")}
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmRevokeId(share.inventoryShareId)}
                          className="px-3 py-1 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                        >
                          {t("shares.action.revoke")}
                        </button>
                      )
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
              <div className="ui-text-muted mb-4">
                <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium mb-2">{t("shares.none.pendingTitle")}</h3>
              <p className="ui-text-muted">
                {searchTerm || filterStatus !== "all"
                  ? t("shares.none.filtered")
                  : t("shares.none.pendingEmpty")}
              </p>
            </div>
          ) : (
            filteredInvites.map((invite) => {
              const isExpired = isInviteExpired(invite.expiresAt);
              const finalStatus = isExpired && invite.status === "PENDING" ? "EXPIRED" : invite.status;
              return (
                <div key={invite.shareInviteId} className="ui-card rounded-lg p-6">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-semibold">{invite.email}</h3>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPermissionColor(invite.permission)}`}>
                          {invite.permission}
                        </span>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(finalStatus)}`}>
                          {finalStatus}
                        </span>
                      </div>
                      <div className="text-sm ui-text-muted space-y-1">
                        <p>{t("shares.label.sentOn")} {new Date(invite.createdAt).toLocaleDateString()}</p>
                        <p>{t("shares.label.expiresOn")} {new Date(invite.expiresAt).toLocaleDateString()}</p>
                        {invite.usedAt && (
                          <p>{t("shares.label.acceptedOn")} {new Date(invite.usedAt).toLocaleDateString()}</p>
                        )}
                      </div>
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
