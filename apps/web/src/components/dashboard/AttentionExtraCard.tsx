/**
 * Dashboard "loans & coverage" attention card. Surfaces two time-sensitive
 * signals from the paid lifecycle features: items currently out on loan that
 * are overdue, and insurance policies due to renew soon (or already lapsed).
 * Each sub-feed is gated on its own flag and the card self-hides when there's
 * nothing to show — so it never nags free users or entitled users with a clean
 * slate. Mirrors the self-contained BudgetCard pattern (no backend changes).
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { HandHelping, Umbrella, Wrench, ArrowRight } from "lucide-react";
import { loansAPI, insuranceAPI, serviceRecordsAPI } from "../../services/api";
import type {
  LoanItem,
  InsurancePolicyItem,
  ServiceDueItem,
} from "../../types";
import { useI18n } from "../../i18n/i18n";
import { usePreferences } from "../../preferences/preferences";
import { useFeature } from "../../features/features";
import { Section, Button, Badge } from "../ui";

const RENEWAL_WINDOW_DAYS = 30;
const VISIBLE_LIMIT = 6;

function isOverdue(loan: LoanItem): boolean {
  return loan.dueAt !== null && new Date(loan.dueAt).getTime() < Date.now();
}

function renewalDueSoon(policy: InsurancePolicyItem): boolean {
  if (!policy.renewalAt) return false;
  const days = (new Date(policy.renewalAt).getTime() - Date.now()) / 86_400_000;
  return days <= RENEWAL_WINDOW_DAYS;
}

export default function AttentionExtraCard() {
  const { t } = useI18n();
  const { formatDate } = usePreferences();
  const navigate = useNavigate();
  const canLoans = useFeature("loans");
  const canInsurance = useFeature("insurance");
  const canMaintenance = useFeature("maintenance");

  const [loans, setLoans] = useState<LoanItem[]>([]);
  const [policies, setPolicies] = useState<InsurancePolicyItem[]>([]);
  const [services, setServices] = useState<ServiceDueItem[]>([]);

  useEffect(() => {
    if (!canLoans) {
      setLoans([]);
      return;
    }
    let alive = true;
    loansAPI
      .list({ active: true })
      .then((items) => alive && setLoans(items.filter(isOverdue)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [canLoans]);

  useEffect(() => {
    if (!canInsurance) {
      setPolicies([]);
      return;
    }
    let alive = true;
    insuranceAPI
      .list()
      .then((items) => alive && setPolicies(items.filter(renewalDueSoon)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [canInsurance]);

  useEffect(() => {
    if (!canMaintenance) {
      setServices([]);
      return;
    }
    let alive = true;
    serviceRecordsAPI
      .listDue()
      .then((items) => alive && setServices(items))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [canMaintenance]);

  if (loans.length === 0 && policies.length === 0 && services.length === 0)
    return null;

  // Overdue loans first, then upcoming renewals, then services due — capped
  // together for the home screen.
  const loanRows = loans.slice(0, VISIBLE_LIMIT);
  const policyRows = policies.slice(0, VISIBLE_LIMIT - loanRows.length);
  const serviceRows = services.slice(
    0,
    VISIBLE_LIMIT - loanRows.length - policyRows.length
  );

  return (
    <Section
      icon={<HandHelping className="h-5 w-5" />}
      title={t("attentionExtra.title")}
      description={t("attentionExtra.subtitle")}
      className="mb-6"
    >
      <ul className="divide-y divide-line">
        {loanRows.map((l) => (
          <li
            key={`loan-${l.loanId}`}
            className="flex flex-wrap items-center gap-3 py-2"
          >
            <Badge tone="danger">
              <HandHelping className="h-3 w-3" />
              {t("loan.overdue")}
            </Badge>
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-sm font-medium ui-title"
                title={l.article.articleNom}
              >
                {l.article.articleNom}
              </p>
              <p
                className="truncate text-xs ui-text-muted"
                title={l.borrowerName}
              >
                {l.borrowerName}
                {l.dueAt && ` · ${t("loan.due")} ${formatDate(l.dueAt)}`}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/articles/${l.articleId}`)}
            >
              {t("notifications.viewArticle")}
            </Button>
          </li>
        ))}
        {policyRows.map((p) => {
          const lapsed =
            p.renewalAt !== null &&
            new Date(p.renewalAt).getTime() < Date.now();
          return (
            <li
              key={`policy-${p.policyId}`}
              className="flex flex-wrap items-center gap-3 py-2"
            >
              <Badge tone={lapsed ? "danger" : "warning"}>
                <Umbrella className="h-3 w-3" />
                {lapsed ? t("insurance.lapsed") : t("insurance.renewingSoon")}
              </Badge>
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-sm font-medium ui-title"
                  title={p.provider}
                >
                  {p.provider}
                </p>
                {p.renewalAt && (
                  <p className="truncate text-xs ui-text-muted">
                    {t("attentionExtra.renews")} {formatDate(p.renewalAt)}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                rightIcon={<ArrowRight className="h-4 w-4" />}
                onClick={() => navigate("/insurance")}
              >
                {t("attentionExtra.manage")}
              </Button>
            </li>
          );
        })}
        {serviceRows.map((s) => {
          const overdue = new Date(s.nextDueAt).getTime() < Date.now();
          return (
            <li
              key={`service-${s.serviceId}`}
              className="flex flex-wrap items-center gap-3 py-2"
            >
              <Badge tone={overdue ? "danger" : "warning"}>
                <Wrench className="h-3 w-3" />
                {t("attentionExtra.serviceDue")}
              </Badge>
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-sm font-medium ui-title"
                  title={s.article.articleNom}
                >
                  {s.article.articleNom}
                </p>
                <p className="truncate text-xs ui-text-muted">
                  {t("service.nextDue")} {formatDate(s.nextDueAt)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/articles/${s.articleId}`)}
              >
                {t("notifications.viewArticle")}
              </Button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
