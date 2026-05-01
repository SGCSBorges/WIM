import React, { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { useI18n } from "../../i18n/i18n";
import { sharesAPI, ShareItem, ShareInviteItem } from "../../services/api";
import { getErrorMessage } from "../../utils/error";

interface SharesListProps {
  onEdit?: (share: ShareItem) => void;
  onRevoke?: (shareId: number) => void;
}

const SharesList: React.FC<SharesListProps> = ({ onEdit, onRevoke }) => {
  const { t } = useI18n();
  const [shares, setShares] = useState<ShareItem[]>([]);
  const [invites, setInvites] = useState<ShareInviteItem[]>([]);
  const [activeTab, setActiveTab] = useState<"shares" | "invites">("shares");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [confirmRevokeId, setConfirmRevokeId] = useState<number | null>(null);
  const [confirmRevokeInviteId, setConfirmRevokeInviteId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline invite form
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePermission, setInvitePermission] = useState<"READ" | "WRITE">("READ");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const fetchShares = useCallback(async () => {
    setError(null);
    try {
      const data = await sharesAPI.getOwned();
      setShares(data);
    } catch (e: unknown) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    }
  }, [t]);

  const fetchInvites = useCallback(async () => {
    try {
      const data = await sharesAPI.getSentInvites();
      setInvites(data);
    } catch (e: unknown) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    }
  }, [t]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchShares(), fetchInvites()]).finally(() => setLoading(false));
  }, [fetchShares, fetchInvites]);

  const handleRevokeShare = async (shareId: number) => {
    setConfirmRevokeId(null);
    const share = shares.find((s) => s.inventoryShareId === shareId);
    if (!share) return;
    if (onRevoke) onRevoke(shareId);
    setError(null);
    try {
      await sharesAPI.revoke(share.target.userId);
      setShares((prev) => prev.filter((s) => s.inventoryShareId !== shareId));
    } catch (e: unknown) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    }
  };

  const handleRevokeInvite = async (inviteId: number) => {
    setConfirmRevokeInviteId(null);
    setError(null);
    try {
      await sharesAPI.revokeInvite(inviteId);
      setInvites((prev) => prev.filter((i) => i.shareInviteId !== inviteId));
    } catch (e: unknown) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    if (!inviteEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail)) {
      setInviteError(t("shareForm.error.emailInvalid"));
      return;
    }
    setInviteBusy(true);
    try {
      const inv = await sharesAPI.createInvite({ email: inviteEmail.trim(), permission: invitePermission });
      setInvites((prev) => [inv, ...prev]);
      setInviteEmail("");
      setInvitePermission("READ");
      setShowInviteForm(false);
      setActiveTab("invites");
    } catch (e: unknown) {
      setInviteError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setInviteBusy(false);
    }
  };

  const getPermissionColor = (permission: string) =>
    permission === "WRITE" ? "ui-badge-danger" : "ui-badge-success";

  const getStatusColor = (status: string) => {
    switch (status) {
      case "PENDING":  return "ui-badge-warning";
      case "ACCEPTED": return "ui-badge-success";
      case "REVOKED":  return "ui-badge-danger";
      default:         return "ui-badge";
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

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 ui-card rounded animate-pulse w-48" />
        <div className="h-32 ui-card rounded animate-pulse" />
        <div className="h-24 ui-card rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold ui-title">{t("shares.title")}</h2>
        <button
          onClick={() => setShowInviteForm((v) => !v)}
          className="ui-btn-primary px-4 py-2 rounded-md"
        >
          {showInviteForm ? t("common.cancel") : t("shares.add")}
        </button>
      </div>

      {showInviteForm && (
        <form onSubmit={handleSendInvite} className="ui-card rounded-lg p-4 space-y-3">
          <h3 className="font-semibold ui-title">{t("shareForm.title")}</h3>
          {inviteError && (
            <p className="text-sm text-red-600">{inviteError}</p>
          )}
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder={t("shareForm.email.placeholder")}
              className="ui-input flex-1 px-3 py-2 rounded"
              disabled={inviteBusy}
            />
            <select
              value={invitePermission}
              onChange={(e) => {
              const val = e.target.value;
              if (val === "READ" || val === "WRITE") setInvitePermission(val);
            }}
              className="ui-select px-3 py-2 rounded"
              disabled={inviteBusy}
            >
              <option value="READ">{t("shareForm.permission.read")}</option>
              <option value="WRITE">{t("shareForm.permission.write")}</option>
            </select>
            <button
              type="submit"
              disabled={inviteBusy}
              className="ui-btn-primary px-4 py-2 rounded"
            >
              {inviteBusy ? t("common.loading") : t("shareForm.send")}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div role="alert" className="border ui-alert-error rounded-lg p-3">
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
                ? "ui-tab-active"
                : "border-transparent ui-text-muted hover:border-[var(--border)]"
            }`}
          >
            {t("shares.tab.active")} ({shares.filter((s) => s.active).length})
          </button>
          <button
            onClick={() => setActiveTab("invites")}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === "invites"
                ? "ui-tab-active"
                : "border-transparent ui-text-muted hover:border-[var(--border)]"
            }`}
          >
            {t("shares.tab.pending")} ({invites.filter((i) => i.status === "PENDING").length})
          </button>
        </nav>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col md:flex-row gap-4">
        <input
          type="text"
          placeholder={`${t("shares.search.placeholder")}…`}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="ui-input flex-1 px-3 py-2 rounded-md"
        />
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
                {searchTerm || filterStatus !== "all" ? t("shares.none.filtered") : t("shares.none.activeEmpty")}
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
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${share.active ? "ui-badge-success" : "ui-badge-danger"}`}>
                        {share.active ? t("shares.status.active") : t("shares.status.inactive")}
                      </span>
                    </div>
                    <p className="text-sm ui-text-muted">
                      {t("shares.label.sharedOn")} {format(parseISO(share.createdAt), "dd MMM yyyy")}
                    </p>
                  </div>
                  <div className="flex space-x-2 items-center">
                    {onEdit && share.active && (
                      <button
                        onClick={() => onEdit(share)}
                        className="px-3 py-1 text-sm ui-action-primary rounded"
                      >
                        {t("shares.action.edit")}
                      </button>
                    )}
                    {share.active && (
                      confirmRevokeId === share.inventoryShareId ? (
                        <>
                          <span className="text-xs text-red-700">{t("shares.confirmRevoke")}</span>
                          <button onClick={() => handleRevokeShare(share.inventoryShareId)} className="px-2 py-1 text-xs ui-btn-danger rounded">{t("common.yes")}</button>
                          <button onClick={() => setConfirmRevokeId(null)} className="px-2 py-1 text-xs ui-btn-ghost border ui-divider rounded">{t("common.no")}</button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmRevokeId(share.inventoryShareId)}
                          className="px-3 py-1 text-sm ui-action-danger rounded"
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
                {searchTerm || filterStatus !== "all" ? t("shares.none.filtered") : t("shares.none.pendingEmpty")}
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
                        <p>{t("shares.label.sentOn")} {format(parseISO(invite.createdAt), "dd MMM yyyy")}</p>
                        <p>{t("shares.label.expiresOn")} {format(parseISO(invite.expiresAt), "dd MMM yyyy")}</p>
                        {invite.usedAt && (
                          <p>{t("shares.label.acceptedOn")} {format(parseISO(invite.usedAt), "dd MMM yyyy")}</p>
                        )}
                      </div>
                    </div>
                    {invite.status === "PENDING" && !isExpired && (
                      <div className="flex items-center space-x-2">
                        {confirmRevokeInviteId === invite.shareInviteId ? (
                          <>
                            <span className="text-xs text-red-700">{t("shares.confirmRevoke")}</span>
                            <button onClick={() => handleRevokeInvite(invite.shareInviteId)} className="px-2 py-1 text-xs ui-btn-danger rounded">{t("common.yes")}</button>
                            <button onClick={() => setConfirmRevokeInviteId(null)} className="px-2 py-1 text-xs ui-btn-ghost border ui-divider rounded">{t("common.no")}</button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmRevokeInviteId(invite.shareInviteId)}
                            className="px-3 py-1 text-sm ui-action-danger rounded"
                          >
                            {t("shares.action.revoke")}
                          </button>
                        )}
                      </div>
                    )}
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
