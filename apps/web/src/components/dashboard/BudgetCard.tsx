/**
 * Budget vs spend card for the dashboard. Shows the current calendar month's
 * and year's spend against the user's configured budgets, with a progress bar
 * and an over-budget warning. Self-hides when no budget is set (or the endpoint
 * errors), so it never nags users who haven't opted in. Budgets are configured
 * in Profile → Budget.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Wallet, AlertTriangle } from "lucide-react";
import { statisticsAPI } from "../../services/api";
import type { BudgetStatus } from "../../types";
import { useI18n } from "../../i18n/i18n";
import { useFeature } from "../../features/features";
import { formatMoney } from "../../utils/money";
import { Section, Badge } from "../ui";

function BudgetRow({
  label,
  spend,
  budget,
  currency,
  language,
  overLabel,
}: {
  label: string;
  spend: number;
  budget: number;
  currency: string;
  language: string;
  overLabel: string;
}) {
  const pct = budget > 0 ? Math.min(100, (spend / budget) * 100) : 0;
  const over = spend > budget;
  const money = (n: number) => formatMoney(n, currency, language);
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2 font-medium ui-title">
          {label}
          {over && (
            <Badge tone="danger" icon={<AlertTriangle className="h-3 w-3" />}>
              {overLabel}
            </Badge>
          )}
        </span>
        <span className="tabular-nums ui-text-muted">
          {money(spend)} / {money(budget)}
        </span>
      </div>
      <div
        className="mt-1 h-2 overflow-hidden rounded-full bg-surface-muted"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={`h-full rounded-full ${over ? "bg-danger" : "bg-primary"}`}
          style={{ width: `${over ? 100 : pct}%` }}
        />
      </div>
    </div>
  );
}

export default function BudgetCard() {
  const { t, language } = useI18n();
  const allowed = useFeature("budget");
  const [status, setStatus] = useState<BudgetStatus | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    statisticsAPI
      .getBudget()
      .then((s) => alive && setStatus(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [allowed]);

  // Self-hide until loaded and only when at least one budget is set.
  if (!status || (status.monthlyBudget == null && status.annualBudget == null))
    return null;

  return (
    <Section
      icon={<Wallet className="h-5 w-5" />}
      title={t("budget.title")}
      className="mt-6"
      actions={
        <Link
          to="/profile"
          className="ui-action-primary text-xs hover:underline"
        >
          {t("budget.edit")}
        </Link>
      }
    >
      <div className="space-y-4">
        {status.monthlyBudget != null && (
          <BudgetRow
            label={t("budget.thisMonth")}
            spend={status.monthlySpend}
            budget={status.monthlyBudget}
            currency={status.currency}
            language={language}
            overLabel={t("budget.overBudget")}
          />
        )}
        {status.annualBudget != null && (
          <BudgetRow
            label={t("budget.thisYear")}
            spend={status.annualSpend}
            budget={status.annualBudget}
            currency={status.currency}
            language={language}
            overLabel={t("budget.overBudget")}
          />
        )}
      </div>
    </Section>
  );
}
