/**
 * Owner-side /sharing page — issues new invites via an inline form, lists
 * pending + active per-user shares, and revokes any of them. Pending
 * invites can be re-sent; active shares can be deactivated (the
 * `ShareService.cleanupSharingForUser` helper flips `active: false`
 * atomically on role downgrade — see acl.ts).
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Users,
  Plus,
  Search,
  Send,
  Mail,
  Trash2,
  ShieldCheck,
} from "lucide-react";
import { useI18n } from "../../i18n/i18n";
import { usePreferences } from "../../preferences/preferences";
import { sharesAPI, ShareItem, ShareInviteItem } from "../../services/api";
import { getErrorMessage } from "../../utils/error";
import { isValidEmail } from "../../utils/validation";
import { EmptyState } from "../common/States";
import { Skeleton } from "../common/Skeleton";
import {
  PageHeader,
  Section,
  Tabs,
  Button,
  Input,
  Select,
  Badge,
  type BadgeTone,
} from "../ui";

interface SharesListProps {
  onEdit?: (share: ShareItem) => void;
  onRevoke?: (shareId: number) => void;
}

function permissionTone(p: string): BadgeTone {
  return p === "WRITE" ? "warning" : "success";
}

function statusTone(status: string): BadgeTone {
  switch (status) {
    case "PENDING":
      return "warning";
    case "ACCEPTED":
      return "success";
    case "REVOKED":
    case "EXPIRED":
      return "danger";
    default:
      return "neutral";
  }
}

const SharesList: React.FC<SharesListProps> = ({ onEdit, onRevoke }) => {
  const { t } = useI18n();
  const { formatDate } = usePreferences();
  const [shares, setShares] = useState<ShareItem[]>([]);
  const [invites, setInvites] = useState<ShareInviteItem[]>([]);
  const [activeTab, setActiveTab] = useState<"shares" | "invites">("shares");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [confirmRevokeId, setConfirmRevokeId] = useState<number | null>(null);
  const [confirmRevokeInviteId, setConfirmRevokeInviteId] = useState<
    number | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline invite form
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePermission, setInvitePermission] = useState<"READ" | "WRITE">(
    "READ"
  );
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
    setError(null);
    try {
      const data = await sharesAPI.getSentInvites();
      setInvites(data);
    } catch (e: unknown) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    }
  }, [t]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchShares(), fetchInvites()]).finally(() =>
      setLoading(false)
    );
  }, [fetchShares, fetchInvites]);

  const handleRevokeShare = async (shareId: number) => {
    setConfirmRevokeId(null);
    const share = shares.find((s) => s.inventoryShareId === shareId);
    if (!share) return;
    setError(null);
    try {
      await sharesAPI.revoke(share.target.userId);
      setShares((prev) => prev.filter((s) => s.inventoryShareId !== shareId));
      if (onRevoke) onRevoke(shareId);
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
    if (!isValidEmail(inviteEmail)) {
      setInviteError(t("shareForm.error.emailInvalid"));
      return;
    }
    setInviteBusy(true);
    try {
      const inv = await sharesAPI.createInvite({
        email: inviteEmail.trim(),
        permission: invitePermission,
      });
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

  const isInviteExpired = (expiresAt: string) =>
    new Date(expiresAt) < new Date();

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

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton height={48} width="45%" />
        <Skeleton height={120} />
        <Skeleton height={96} />
      </div>
    );
  }

  const activeCount = shares.filter((s) => s.active).length;
  const pendingCount = invites.filter((i) => i.status === "PENDING").length;

  return (
    <div>
      <PageHeader
        icon={<Users className="h-5 w-5" />}
        title={t("shares.title")}
        actions={
          <Button
            onClick={() => setShowInviteForm((v) => !v)}
            leftIcon={showInviteForm ? undefined : <Plus className="h-4 w-4" />}
            variant={showInviteForm ? "ghost" : "primary"}
          >
            {showInviteForm ? t("common.cancel") : t("shares.add")}
          </Button>
        }
      />

      <div className="space-y-6">
        {showInviteForm && (
          <Section
            icon={<Send className="h-5 w-5" />}
            title={t("shareForm.title")}
            description={t("shareForm.email.note")}
          >
            <form onSubmit={handleSendInvite} className="space-y-3">
              {inviteError && (
                <p role="alert" className="text-sm ui-text-error">
                  {inviteError}
                </p>
              )}
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  type="email"
                  required
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder={t("shareForm.email.placeholder")}
                  aria-label={t("shareForm.email.placeholder")}
                  disabled={inviteBusy}
                  autoComplete="email"
                  className="flex-1"
                />
                <div className="flex flex-col gap-1">
                  <Select
                    value={invitePermission}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "READ" || val === "WRITE")
                        setInvitePermission(val);
                    }}
                    aria-label={t("shareForm.permission")}
                    disabled={inviteBusy}
                    className="w-auto"
                  >
                    <option value="READ">
                      {t("shareForm.permission.read")}
                    </option>
                    <option value="WRITE">
                      {t("shareForm.permission.write")}
                    </option>
                  </Select>
                  <p className="text-xs ui-text-muted">
                    {t(
                      invitePermission === "READ"
                        ? "shareForm.permission.read.help"
                        : "shareForm.permission.write.help"
                    )}
                  </p>
                </div>
                <Button
                  type="submit"
                  loading={inviteBusy}
                  leftIcon={<Send className="h-4 w-4" />}
                >
                  {t("shareForm.send")}
                </Button>
              </div>
            </form>
          </Section>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-xl border ui-alert-error p-3 text-sm ui-text-error"
          >
            {error}
          </div>
        )}

        {/* Tabs */}
        <Tabs
          aria-label={t("shares.title")}
          idPrefix="shares-tab"
          value={activeTab}
          onChange={(id) => {
            setActiveTab(id as "shares" | "invites");
            setConfirmRevokeId(null);
            setConfirmRevokeInviteId(null);
          }}
          tabs={[
            {
              id: "shares",
              label: `${t("shares.tab.active")} (${activeCount})`,
              icon: <ShieldCheck className="h-4 w-4" />,
            },
            {
              id: "invites",
              label: `${t("shares.tab.pending")} (${pendingCount})`,
              icon: <Mail className="h-4 w-4" />,
            },
          ]}
        />

        {/* Search and Filter */}
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <Input
              type="text"
              placeholder={`${t("shares.search.placeholder")}…`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label={t("shares.search.placeholder")}
              className="pl-9"
            />
          </div>
          <Select
            value={filterStatus}
            onChange={(e) =>
              setFilterStatus(e.target.value as typeof filterStatus)
            }
            aria-label={t("shares.filter.all")}
            className="w-auto"
          >
            <option value="all">{t("shares.filter.all")}</option>
            <option value="active">{t("shares.filter.active")}</option>
            <option value="inactive">{t("shares.filter.inactive")}</option>
          </Select>
        </div>

        {/* Content */}
        <div
          role="tabpanel"
          id={`shares-tab-panel-${activeTab}`}
          aria-labelledby={`shares-tab-${activeTab}`}
        >
          {activeTab === "shares" ? (
            filteredShares.length === 0 ? (
              <EmptyState
                icon={<Users className="h-6 w-6" />}
                title={t("shares.none.activeTitle")}
                description={
                  searchTerm || filterStatus !== "all"
                    ? t("shares.none.filtered")
                    : t("shares.none.activeEmpty")
                }
              />
            ) : (
              <ul className="space-y-3">
                {filteredShares.map((share) => (
                  <li
                    key={share.inventoryShareId}
                    className="ui-card flex flex-wrap items-start justify-between gap-3 p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-semibold ui-title">
                          {share.target.email}
                        </h3>
                        <Badge tone={permissionTone(share.permission)}>
                          {share.permission}
                        </Badge>
                        <Badge tone={share.active ? "success" : "danger"}>
                          {share.active
                            ? t("shares.status.active")
                            : t("shares.status.inactive")}
                        </Badge>
                      </div>
                      <p className="text-xs ui-text-muted">
                        {t("shares.label.sharedOn")}{" "}
                        {formatDate(share.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {onEdit && share.active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEdit(share)}
                        >
                          {t("shares.action.edit")}
                        </Button>
                      )}
                      {share.active &&
                        (confirmRevokeId === share.inventoryShareId ? (
                          <>
                            <span className="text-xs ui-text-error">
                              {t("shares.confirmRevoke")}
                            </span>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() =>
                                handleRevokeShare(share.inventoryShareId)
                              }
                            >
                              {t("common.yes")}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmRevokeId(null)}
                            >
                              {t("common.no")}
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setConfirmRevokeId(share.inventoryShareId)
                            }
                            className="text-danger"
                            leftIcon={<Trash2 className="h-4 w-4" />}
                          >
                            {t("shares.action.revoke")}
                          </Button>
                        ))}
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : filteredInvites.length === 0 ? (
            <EmptyState
              icon={<Mail className="h-6 w-6" />}
              title={t("shares.none.pendingTitle")}
              description={
                searchTerm || filterStatus !== "all"
                  ? t("shares.none.filtered")
                  : t("shares.none.pendingEmpty")
              }
            />
          ) : (
            <ul className="space-y-3">
              {filteredInvites.map((invite) => {
                const isExpired = isInviteExpired(invite.expiresAt);
                const finalStatus =
                  isExpired && invite.status === "PENDING"
                    ? "EXPIRED"
                    : invite.status;
                return (
                  <li
                    key={invite.shareInviteId}
                    className="ui-card flex flex-wrap items-start justify-between gap-3 p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-semibold ui-title">
                          {invite.email}
                        </h3>
                        <Badge tone={permissionTone(invite.permission)}>
                          {invite.permission}
                        </Badge>
                        <Badge tone={statusTone(finalStatus)}>
                          {finalStatus}
                        </Badge>
                      </div>
                      <div className="space-y-0.5 text-xs ui-text-muted">
                        <p>
                          {t("shares.label.sentOn")}{" "}
                          {formatDate(invite.createdAt)}
                        </p>
                        <p>
                          {t("shares.label.expiresOn")}{" "}
                          {formatDate(invite.expiresAt)}
                        </p>
                        {invite.usedAt && (
                          <p>
                            {t("shares.label.acceptedOn")}{" "}
                            {formatDate(invite.usedAt)}
                          </p>
                        )}
                      </div>
                    </div>
                    {invite.status === "PENDING" && !isExpired && (
                      <div className="flex shrink-0 items-center gap-2">
                        {confirmRevokeInviteId === invite.shareInviteId ? (
                          <>
                            <span className="text-xs ui-text-error">
                              {t("shares.confirmRevoke")}
                            </span>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() =>
                                handleRevokeInvite(invite.shareInviteId)
                              }
                            >
                              {t("common.yes")}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmRevokeInviteId(null)}
                            >
                              {t("common.no")}
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setConfirmRevokeInviteId(invite.shareInviteId)
                            }
                            className="text-danger"
                            leftIcon={<Trash2 className="h-4 w-4" />}
                          >
                            {t("shares.action.revoke")}
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default SharesList;
