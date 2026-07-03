/**
 * Household panel on the Sharing page. A household is an auto-managed mesh
 * of WRITE inventory shares between all members — create one, invite Power
 * Users by email, accept an invite via the emailed token
 * (?householdToken=…), leave, or (as OWNER) remove members / revoke
 * pending invites.
 *
 * The GET/leave/remove paths stay open server-side, so a downgraded member
 * still sees their household and can wind it down; only create/invite/accept
 * need the `household` feature. When the flag is off and the user isn't in
 * a household, a LockedFeatureNotice stands in.
 */
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Check,
  Crown,
  Home,
  Loader2,
  LogOut,
  Plus,
  Send,
  Trash2,
  UserMinus,
} from "lucide-react";
import { householdAPI } from "../../services/api";
import type { HouseholdInfo } from "../../types";
import { useI18n } from "../../i18n/i18n";
import { useFeature, useFeatures } from "../../features/features";
import { getErrorMessage } from "../../utils/error";
import { useToast } from "../common/Toast";
import { Skeleton } from "../common/Skeleton";
import LockedFeatureNotice from "../common/LockedFeatureNotice";
import { Section, Button, Field, Input, Badge, ConfirmDialog } from "../ui";

export default function HouseholdSection() {
  const { t } = useI18n();
  const toast = useToast();
  const allowed = useFeature("household");
  const { loaded: featuresLoaded } = useFeatures();
  const [searchParams, setSearchParams] = useSearchParams();

  const [household, setHousehold] = useState<HouseholdInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createName, setCreateName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<number | null>(null);

  const inviteToken = searchParams.get("householdToken");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHousehold(await householdAPI.get());
    } catch (e) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const clearToken = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("householdToken");
    setSearchParams(next, { replace: true });
  };

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setBusy(null);
    }
  };

  const create = () =>
    run("create", async () => {
      if (!createName.trim()) throw new Error(t("household.nameRequired"));
      await householdAPI.create(createName.trim());
      setCreateName("");
      toast.show(t("household.created"), { kind: "success" });
    });

  const invite = () =>
    run("invite", async () => {
      if (!inviteEmail.trim()) throw new Error(t("household.emailRequired"));
      await householdAPI.invite(inviteEmail.trim());
      setInviteEmail("");
      toast.show(t("household.inviteSent"), { kind: "success" });
    });

  const accept = () =>
    run("accept", async () => {
      if (!inviteToken) return;
      await householdAPI.acceptInvite(inviteToken);
      clearToken();
      toast.show(t("household.joined"), { kind: "success" });
    });

  const leave = () =>
    run("leave", async () => {
      setShowLeaveConfirm(false);
      await householdAPI.leave();
      toast.show(t("household.left"), { kind: "success" });
    });

  const removeMember = () =>
    run("remove", async () => {
      const target = removeTarget;
      setRemoveTarget(null);
      if (target === null) return;
      await householdAPI.removeMember(target);
      toast.show(t("household.memberRemoved"), { kind: "success" });
    });

  if (!featuresLoaded || loading) {
    return (
      <Section icon={<Home className="h-5 w-5" />} title={t("household.title")}>
        <div className="space-y-2">
          <Skeleton height={40} />
          <Skeleton height={40} />
        </div>
      </Section>
    );
  }

  // No membership + no entitlement → teaser (membership overrides the lock
  // so a downgraded member can still leave).
  if (!allowed && !household) {
    return (
      <LockedFeatureNotice
        icon={<Home className="h-5 w-5" />}
        title={t("household.title")}
      />
    );
  }

  return (
    <Section
      icon={<Home className="h-5 w-5" />}
      title={t("household.title")}
      description={t("household.subtitle")}
    >
      {error && (
        <p role="alert" className="mb-3 text-sm ui-text-error">
          {error}
        </p>
      )}

      {inviteToken && allowed && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border ui-alert-success p-3">
          <p className="text-sm">{t("household.acceptPrompt")}</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={accept}
              loading={busy === "accept"}
              leftIcon={<Check className="h-4 w-4" />}
            >
              {t("household.acceptButton")}
            </Button>
            <Button size="sm" variant="ghost" onClick={clearToken}>
              {t("common.dismiss")}
            </Button>
          </div>
        </div>
      )}

      {!household ? (
        <div className="space-y-2">
          <p className="text-sm ui-text-muted">{t("household.none")}</p>
          <div className="flex flex-wrap items-end gap-2">
            <Field
              label={t("household.form.name")}
              htmlFor="household-name"
              className="max-w-xs flex-1"
            >
              <Input
                id="household-name"
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                maxLength={120}
                placeholder={t("household.form.namePlaceholder")}
              />
            </Field>
            <Button
              onClick={create}
              loading={busy === "create"}
              disabled={!createName.trim()}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              {t("household.form.create")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate font-medium ui-title" title={household.name}>
              {household.name}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLeaveConfirm(true)}
              leftIcon={<LogOut className="h-4 w-4" />}
            >
              {t("household.leave")}
            </Button>
          </div>

          <ul className="divide-y ui-divider">
            {household.members.map((m) => (
              <li
                key={m.userId}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm" title={m.email}>
                    {m.email}
                  </span>
                  {m.role === "OWNER" && (
                    <Badge tone="power" icon={<Crown className="h-3 w-3" />}>
                      {t("household.roleOwner")}
                    </Badge>
                  )}
                </div>
                {household.myRole === "OWNER" && m.role !== "OWNER" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRemoveTarget(m.userId)}
                    disabled={busy !== null}
                    aria-label={`${t("household.removeMember")} ${m.email}`}
                    className="text-danger"
                    leftIcon={<UserMinus className="h-4 w-4" />}
                  />
                )}
              </li>
            ))}
          </ul>

          {household.myRole === "OWNER" && allowed && (
            <div className="border-t ui-divider pt-3">
              <div className="flex flex-wrap items-end gap-2">
                <Field
                  label={t("household.inviteLabel")}
                  htmlFor="household-invite-email"
                  className="max-w-xs flex-1"
                >
                  <Input
                    id="household-invite-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder={t("household.invitePlaceholder")}
                  />
                </Field>
                <Button
                  onClick={invite}
                  loading={busy === "invite"}
                  disabled={!inviteEmail.trim()}
                  leftIcon={
                    busy === "invite" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )
                  }
                >
                  {t("household.inviteButton")}
                </Button>
              </div>

              {household.invites.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {household.invites.map((inv) => (
                    <li
                      key={inv.id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span
                        className="truncate ui-text-muted"
                        title={inv.email}
                      >
                        {t("household.invitePending")}: {inv.email}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          run("revoke", () => householdAPI.revokeInvite(inv.id))
                        }
                        disabled={busy !== null}
                        aria-label={`${t("common.delete")} ${inv.email}`}
                        leftIcon={<Trash2 className="h-4 w-4" />}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={showLeaveConfirm}
        tone="danger"
        title={t("household.leaveConfirmTitle")}
        message={t("household.leaveConfirmBody")}
        confirmLabel={t("household.leave")}
        cancelLabel={t("common.cancel")}
        onConfirm={leave}
        onCancel={() => setShowLeaveConfirm(false)}
      />
      <ConfirmDialog
        open={removeTarget !== null}
        tone="danger"
        title={t("household.removeConfirmTitle")}
        message={t("household.removeConfirmBody")}
        confirmLabel={t("household.removeMember")}
        cancelLabel={t("common.cancel")}
        onConfirm={removeMember}
        onCancel={() => setRemoveTarget(null)}
      />
    </Section>
  );
}
