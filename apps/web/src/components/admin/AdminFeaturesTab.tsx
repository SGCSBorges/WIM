/**
 * Admin → Features tab. Lets admins control which role is required for each
 * feature, and create time-bounded access grants so USER-role accounts can
 * temporarily access POWER_USER-gated features.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Shield, Plus, Trash2, RotateCw, Check } from "lucide-react";
import {
  adminFeaturesAPI,
  type AdminFeatureFlag,
  type AdminFeatureTempGrant,
  type FeatureKey,
  type RoleName,
} from "../../services/api";
import { useFeatures } from "../../features/features";
import { useI18n } from "../../i18n/i18n";
import { useToast } from "../common/Toast";
import { getErrorMessage } from "../../utils/error";
import { Section, Button, Select, Badge } from "../ui";
import { Skeleton } from "../common/Skeleton";

const ROLE_OPTIONS: { value: RoleName; label: string }[] = [
  { value: "USER", label: "Everyone (USER+)" },
  { value: "POWER_USER", label: "Power User+" },
  { value: "ADMIN", label: "Admin only" },
];

function roleBadgeTone(role: RoleName): "default" | "warning" | "danger" {
  if (role === "ADMIN") return "danger";
  if (role === "POWER_USER") return "warning";
  return "default";
}

export default function AdminFeaturesTab() {
  const { t } = useI18n();
  const toast = useToast();
  const { refresh: refreshFeatures } = useFeatures();

  const [flags, setFlags] = useState<AdminFeatureFlag[]>([]);
  const [grants, setGrants] = useState<AdminFeatureTempGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showGrantForm, setShowGrantForm] = useState(false);
  const [grantFeature, setGrantFeature] = useState<FeatureKey>("sharing");
  const [grantExpiry, setGrantExpiry] = useState("");
  const [grantNote, setGrantNote] = useState("");
  const [creatingGrant, setCreatingGrant] = useState(false);

  const grantFeatureId = useId();
  const grantExpiryId = useId();
  const grantNoteId = useId();
  const grantFormRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFeaturesAPI.getAll();
      setFlags(data.flags);
      setGrants(data.grants);
    } catch (e) {
      toast.show(getErrorMessage(e, t("admin.features.loadError")), {
        kind: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (showGrantForm) {
      setTimeout(
        () =>
          grantFormRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
          }),
        50
      );
    }
  }, [showGrantForm]);

  const handleFlagChange = async (key: FeatureKey, requiredRole: RoleName) => {
    setSavingKey(key);
    try {
      await adminFeaturesAPI.setFlag(key, requiredRole);
      setFlags((prev) =>
        prev.map((f) => (f.featureKey === key ? { ...f, requiredRole } : f))
      );
      setSavedKey(key);
      setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 2000);
      await refreshFeatures();
    } catch (e) {
      toast.show(getErrorMessage(e, t("admin.features.saveError")), {
        kind: "error",
      });
    } finally {
      setSavingKey(null);
    }
  };

  const handleDeleteGrant = async (id: number) => {
    setDeletingId(id);
    try {
      await adminFeaturesAPI.deleteGrant(id);
      setGrants((prev) => prev.filter((g) => g.id !== id));
      await refreshFeatures();
      toast.show(t("admin.features.grants.deleted"), { kind: "success" });
    } catch (e) {
      toast.show(getErrorMessage(e, t("admin.features.grants.deleteError")), {
        kind: "error",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreateGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantExpiry) return;
    setCreatingGrant(true);
    try {
      const grant = await adminFeaturesAPI.createGrant({
        featureKey: grantFeature,
        expiresAt: new Date(grantExpiry).toISOString(),
        note: grantNote.trim() || undefined,
      });
      setGrants((prev) => [...prev, grant]);
      await refreshFeatures();
      toast.show(t("admin.features.grants.created"), { kind: "success" });
      setShowGrantForm(false);
      setGrantNote("");
      setGrantExpiry("");
    } catch (e) {
      toast.show(getErrorMessage(e, t("admin.features.grants.createError")), {
        kind: "error",
      });
    } finally {
      setCreatingGrant(false);
    }
  };

  if (loading) {
    return (
      <Section title={t("admin.features.title")}>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      </Section>
    );
  }

  // Only show POWER_USER-gated features in the temp grants form (granting
  // USER access to already-USER features is pointless, ADMIN-only features
  // stay admin-only regardless of grants).
  const grantableFeatures = flags.filter(
    (f) => f.requiredRole === "POWER_USER"
  );

  return (
    <div className="space-y-6">
      <Section title={t("admin.features.title")}>
        <p className="mb-4 text-sm ui-text-muted">
          {t("admin.features.description")}
        </p>
        <div className="divide-y ui-divider">
          {flags.map((flag) => (
            <div
              key={flag.featureKey}
              className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium ui-title text-sm">
                    {t(`features.${flag.featureKey}`)}
                  </span>
                  {flag.requiredRole !== flag.defaultRole && (
                    <Badge tone="warning" size="sm">
                      {t("admin.features.modified")}
                    </Badge>
                  )}
                </div>
                <p className="text-xs ui-text-muted">
                  {t("admin.features.defaultLabel")}:{" "}
                  <Badge tone={roleBadgeTone(flag.defaultRole)} size="sm">
                    {flag.defaultRole}
                  </Badge>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Select
                  value={flag.requiredRole}
                  onChange={(e) =>
                    handleFlagChange(
                      flag.featureKey,
                      e.target.value as RoleName
                    )
                  }
                  disabled={savingKey === flag.featureKey}
                  aria-label={`${t("admin.features.requiredRole")} — ${t(`features.${flag.featureKey}`)}`}
                  className="w-44"
                >
                  {ROLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                {savedKey === flag.featureKey ? (
                  <Check className="h-4 w-4 text-success" aria-hidden="true" />
                ) : savingKey === flag.featureKey ? (
                  <RotateCw
                    className="h-4 w-4 animate-spin ui-text-muted"
                    aria-hidden="true"
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title={t("admin.features.grants.title")}
        headerRight={
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setShowGrantForm((v) => !v)}
          >
            {t("admin.features.grants.add")}
          </Button>
        }
      >
        <p className="mb-4 text-sm ui-text-muted">
          {t("admin.features.grants.description")}
        </p>

        {showGrantForm && (
          <div
            ref={grantFormRef}
            className="mb-4 rounded-lg border ui-divider bg-surface-muted p-4"
          >
            <form onSubmit={handleCreateGrant} className="space-y-3">
              <div>
                <label
                  htmlFor={grantFeatureId}
                  className="mb-1 block text-sm font-medium ui-title"
                >
                  {t("admin.features.grants.feature")}
                </label>
                <Select
                  id={grantFeatureId}
                  value={grantFeature}
                  onChange={(e) =>
                    setGrantFeature(e.target.value as FeatureKey)
                  }
                >
                  {grantableFeatures.length === 0 ? (
                    <option disabled value="">
                      {t("admin.features.grants.noGatable")}
                    </option>
                  ) : (
                    grantableFeatures.map((f) => (
                      <option key={f.featureKey} value={f.featureKey}>
                        {t(`features.${f.featureKey}`)}
                      </option>
                    ))
                  )}
                </Select>
              </div>
              <div>
                <label
                  htmlFor={grantExpiryId}
                  className="mb-1 block text-sm font-medium ui-title"
                >
                  {t("admin.features.grants.expiresAt")} *
                </label>
                <input
                  id={grantExpiryId}
                  type="datetime-local"
                  required
                  value={grantExpiry}
                  onChange={(e) => setGrantExpiry(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  className="block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm ui-title focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label
                  htmlFor={grantNoteId}
                  className="mb-1 block text-sm font-medium ui-title"
                >
                  {t("admin.features.grants.note")}
                </label>
                <input
                  id={grantNoteId}
                  type="text"
                  value={grantNote}
                  onChange={(e) => setGrantNote(e.target.value)}
                  maxLength={255}
                  placeholder={t("admin.features.grants.notePlaceholder")}
                  className="block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm ui-title placeholder:ui-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowGrantForm(false)}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={creatingGrant}
                  disabled={grantableFeatures.length === 0}
                >
                  {t("admin.features.grants.create")}
                </Button>
              </div>
            </form>
          </div>
        )}

        {grants.length === 0 ? (
          <p className="text-sm ui-text-muted">
            {t("admin.features.grants.empty")}
          </p>
        ) : (
          <div className="divide-y ui-divider">
            {grants.map((grant) => (
              <div
                key={grant.id}
                className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Shield
                      className="h-3.5 w-3.5 ui-text-muted"
                      aria-hidden="true"
                    />
                    <span className="font-medium ui-title text-sm">
                      {t(`features.${grant.featureKey}`)}
                    </span>
                  </div>
                  <p className="text-xs ui-text-muted">
                    {t("admin.features.grants.expiresAt")}:{" "}
                    {new Date(grant.expiresAt).toLocaleString()}
                    {grant.note && (
                      <span className="ml-2 italic">— {grant.note}</span>
                    )}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteGrant(grant.id)}
                  loading={deletingId === grant.id}
                  className="shrink-0 text-danger"
                  leftIcon={<Trash2 className="h-4 w-4" />}
                  aria-label={t("admin.features.grants.deleteLabel", {
                    feature: t(`features.${grant.featureKey}`),
                  })}
                >
                  {t("common.delete")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
