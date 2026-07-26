/**
 * Insurance coverage block for the article-detail page. Lists the policies that
 * cover this item (with an unlink action) and lets the owner attach an existing
 * policy from a dropdown. Creating a new policy lives on the /insurance page —
 * this section only wires coverage to/from policies that already exist.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Umbrella, X, Plus } from "lucide-react";
import { insuranceAPI } from "../../services/api";
import type { InsurancePolicyItem } from "../../types";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";
import { useFeature, useFeatures } from "../../features/features";
import LockedFeatureNotice from "../common/LockedFeatureNotice";
import { useToast } from "../common/Toast";
import { Section, Button, Select, Badge } from "../ui";

export default function InsuranceSection({ articleId }: { articleId: number }) {
  const { t } = useI18n();
  const toast = useToast();
  const allowed = useFeature("insurance");
  const { loaded: featuresLoaded } = useFeatures();
  const [covering, setCovering] = useState<InsurancePolicyItem[]>([]);
  const [all, setAll] = useState<InsurancePolicyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Article → article navigation (bundle siblings) reuses this section, so a
  // slow response for the previous article must not overwrite the newer one.
  const requestSeqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    setLoading(true);
    try {
      const [mine, every] = await Promise.all([
        insuranceAPI.list({ articleId }),
        insuranceAPI.list(),
      ]);
      if (seq !== requestSeqRef.current) return;
      setCovering(mine);
      setAll(every);
      setFailed(false);
    } catch {
      // Older backend without the insurance endpoint — hide the section.
      if (seq !== requestSeqRef.current) return;
      setFailed(true);
    } finally {
      if (seq === requestSeqRef.current) setLoading(false);
    }
  }, [articleId]);

  useEffect(() => {
    if (allowed) void load();
  }, [load, allowed]);

  const coveringIds = new Set(covering.map((p) => p.policyId));
  const linkable = all.filter((p) => !coveringIds.has(p.policyId));

  const link = async () => {
    const policyId = Number(pick);
    if (!policyId) return;
    setBusy(true);
    try {
      await insuranceAPI.linkArticle(policyId, articleId);
      setPick("");
      await load();
      toast.show(t("insurance.linked"), { kind: "success" });
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (policyId: number) => {
    setBusy(true);
    try {
      await insuranceAPI.unlinkArticle(policyId, articleId);
      await load();
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  if (!featuresLoaded) return null;
  if (!allowed)
    return (
      <LockedFeatureNotice
        icon={<Umbrella className="h-5 w-5" />}
        title={t("insurance.coverage")}
      />
    );
  if (failed) return null;

  return (
    <Section
      icon={<Umbrella className="h-5 w-5" />}
      title={t("insurance.coverage")}
      className="mb-6"
    >
      {loading ? (
        <p className="text-sm ui-text-muted">{t("common.loading")}</p>
      ) : (
        <>
          {covering.length === 0 ? (
            <p className="text-sm ui-text-muted">{t("insurance.notCovered")}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {covering.map((p) => (
                <li key={p.policyId}>
                  <span className="inline-flex items-center gap-1 rounded-full border ui-divider px-2 py-1 text-sm">
                    <Umbrella
                      className="h-3 w-3 ui-text-muted"
                      aria-hidden="true"
                    />
                    <span className="truncate" title={p.provider}>
                      {p.provider}
                    </span>
                    <button
                      type="button"
                      onClick={() => void unlink(p.policyId)}
                      disabled={busy}
                      aria-label={`${t("insurance.unlink")} ${p.provider}`}
                      className="ui-text-muted hover:text-danger"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {linkable.length > 0 ? (
              <>
                <Select
                  value={pick}
                  onChange={(e) => setPick(e.target.value)}
                  aria-label={t("insurance.addCoverage")}
                  className="w-auto"
                >
                  <option value="">{t("insurance.addCoverage")}…</option>
                  {linkable.map((p) => (
                    <option key={p.policyId} value={p.policyId}>
                      {p.provider}
                    </option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  onClick={() => void link()}
                  disabled={!pick || busy}
                  leftIcon={<Plus className="h-4 w-4" />}
                >
                  {t("insurance.addCoverage")}
                </Button>
              </>
            ) : (
              all.length === 0 && (
                <Link
                  to="/insurance"
                  className="ui-action-primary text-sm hover:underline"
                >
                  <Badge tone="neutral">{t("insurance.createFirst")}</Badge>
                </Link>
              )
            )}
          </div>
        </>
      )}
    </Section>
  );
}
