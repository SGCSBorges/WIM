/**
 * Upgrade-to-Power-User prompt. A single app-level dialog any locked feature
 * can open via `useUpgrade().promptUpgrade()`, plus the shared Stripe-checkout
 * starter the dialog and the route-level `UpgradeTeaser` both reuse. Keeping
 * the checkout flow here (rather than duplicating App's `startUpgrade`) means
 * every "unlock" affordance routes through one place.
 */
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { Sparkles, Check, Loader2 } from "lucide-react";
import Modal from "../components/common/Modal";
import { Button } from "../components/ui";
import { useI18n } from "../i18n/i18n";
import { billingAPI } from "../services/api";
import { getErrorMessage } from "../utils/error";

type Plan = "monthly" | "yearly";

interface UpgradeContextValue {
  /** Open the upgrade dialog (e.g. from a locked button). */
  promptUpgrade: () => void;
  /** Start Stripe checkout directly (used by the dialog + the teaser page). */
  startCheckout: (plan: Plan) => Promise<void>;
  /** The plan whose checkout is in flight, or null. */
  busyPlan: Plan | null;
  /** Last checkout error, if any. */
  checkoutError: string | null;
}

const UpgradeContext = createContext<UpgradeContextValue>({
  promptUpgrade: () => {},
  startCheckout: async () => {},
  busyPlan: null,
  checkoutError: null,
});

const STRIPE_HOSTS = new Set(["checkout.stripe.com", "billing.stripe.com"]);
function isStripeUrl(url: string): boolean {
  try {
    return STRIPE_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** The benefits list shown in both the dialog and the teaser. */
export function UpgradeBenefits() {
  const { t } = useI18n();
  const keys = [
    "upgrade.benefit.reports",
    "upgrade.benefit.csv",
    "upgrade.benefit.calendar",
    "upgrade.benefit.sharing",
    "upgrade.benefit.messaging",
    "upgrade.benefit.power",
  ] as const;
  return (
    <ul className="space-y-2">
      {keys.map((k) => (
        <li key={k} className="flex items-start gap-2 text-sm ui-title">
          <Check
            className="mt-0.5 h-4 w-4 shrink-0 text-success"
            aria-hidden="true"
          />
          <span>{t(k)}</span>
        </li>
      ))}
    </ul>
  );
}

/** The two plan buttons + error region, shared by the dialog and the teaser. */
export function UpgradeActions({ stacked = false }: { stacked?: boolean }) {
  const { t } = useI18n();
  const { startCheckout, busyPlan, checkoutError } = useUpgrade();
  return (
    <div className="space-y-3">
      <div className={`flex gap-2 ${stacked ? "flex-col" : "flex-wrap"}`}>
        <Button
          variant="accent"
          fullWidth={stacked}
          loading={busyPlan === "monthly"}
          disabled={busyPlan !== null}
          onClick={() => void startCheckout("monthly")}
        >
          {t("home.upgrade.buyMonthly")}
        </Button>
        <Button
          variant="accent"
          fullWidth={stacked}
          loading={busyPlan === "yearly"}
          disabled={busyPlan !== null}
          onClick={() => void startCheckout("yearly")}
        >
          {t("home.upgrade.buyYearly")}
        </Button>
      </div>
      {checkoutError && (
        <p
          role="alert"
          className="rounded-lg border ui-alert-error px-3 py-2 text-sm ui-text-error"
        >
          {checkoutError}
        </p>
      )}
    </div>
  );
}

const TITLE_ID = "upgrade-dialog-title";

export function UpgradeProvider({ children }: { children: ReactNode }) {
  const { t, language } = useI18n();
  const [open, setOpen] = useState(false);
  const [busyPlan, setBusyPlan] = useState<Plan | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const promptUpgrade = useCallback(() => {
    setCheckoutError(null);
    setOpen(true);
  }, []);

  const startCheckout = useCallback(
    async (plan: Plan) => {
      setCheckoutError(null);
      setBusyPlan(plan);
      try {
        const { url } = await billingAPI.createPowerUserCheckoutSession(
          plan,
          language
        );
        // Full-page redirect to Stripe — only ever to a Stripe-owned host.
        if (isStripeUrl(url)) window.location.href = url;
        else setCheckoutError(t("billing.upgradeStartError"));
      } catch (e) {
        setCheckoutError(getErrorMessage(e, t("billing.upgradeStartError")));
      } finally {
        setBusyPlan(null);
      }
    },
    [language, t]
  );

  return (
    <UpgradeContext.Provider
      value={{ promptUpgrade, startCheckout, busyPlan, checkoutError }}
    >
      {children}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        titleId={TITLE_ID}
        panelClassName="ui-card w-full max-w-md space-y-4 p-6"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
            {busyPlan ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            )}
          </span>
          <div>
            <h2 id={TITLE_ID} className="text-lg font-semibold ui-title">
              {t("upgrade.title")}
            </h2>
            <p className="mt-1 text-sm ui-text-muted">
              {t("upgrade.subtitle")}
            </p>
          </div>
        </div>

        <UpgradeBenefits />
        <UpgradeActions />

        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            {t("upgrade.later")}
          </Button>
        </div>
      </Modal>
    </UpgradeContext.Provider>
  );
}

export function useUpgrade() {
  return useContext(UpgradeContext);
}
