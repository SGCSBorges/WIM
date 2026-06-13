/**
 * First-run welcome on Home. Derives "what's left to do" from the cheap
 * `statisticsAPI.getBasic` counts so the checklist is always honest, even
 * after the user comes back the next day. Hidden once every step is done
 * or the user dismisses it (persisted in localStorage so the cue doesn't
 * nag them on every fresh visit).
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Circle, Sparkles, X } from "lucide-react";
import { statisticsAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import { Card, Button } from "../ui";

const DISMISS_KEY = "wim.onboarding.dismissed";

interface Step {
  id: string;
  label: string;
  done: boolean;
  goto: string;
}

export default function OnboardingChecklist() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [stats, setStats] = useState<{
    articles: number;
    warranties: number;
    alerts: number;
  } | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(
    () => localStorage.getItem(DISMISS_KEY) === "1"
  );

  useEffect(() => {
    if (dismissed) return;
    let cancelled = false;
    void statisticsAPI
      .getBasic()
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [dismissed]);

  if (dismissed || !stats) return null;

  const steps: Step[] = [
    {
      id: "article",
      label: t("onboarding.step.article"),
      done: stats.articles > 0,
      goto: "/articles?new=1",
    },
    {
      id: "warranty",
      label: t("onboarding.step.warranty"),
      done: stats.warranties > 0,
      goto: "/articles?new=1",
    },
    {
      id: "alert",
      label: t("onboarding.step.alert"),
      done: stats.alerts > 0,
      goto: "/alerts",
    },
  ];

  const remaining = steps.filter((s) => !s.done);
  if (remaining.length === 0) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <Card className="my-4 border border-line">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-primary bg-gradient-brand p-2 text-primary-contrast">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <p className="text-base font-semibold ui-title">
              {t("onboarding.title")}
            </p>
            <p className="text-sm ui-text-muted">{t("onboarding.subtitle")}</p>
          </div>
        </div>
        <button
          type="button"
          aria-label={t("common.dismiss")}
          onClick={dismiss}
          className="ui-text-muted hover:ui-title"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ul className="mt-4 space-y-1.5">
        {steps.map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-lg px-2 py-1 hover:bg-surface-muted"
          >
            <div className="flex items-center gap-2 text-sm">
              {s.done ? (
                <CheckCircle2
                  className="h-4 w-4 text-success"
                  aria-hidden="true"
                />
              ) : (
                <Circle className="h-4 w-4 ui-text-muted" aria-hidden="true" />
              )}
              <span
                className={s.done ? "ui-text-muted line-through" : "ui-title"}
              >
                <span className="sr-only">
                  {s.done
                    ? t("onboarding.status.done")
                    : t("onboarding.status.todo")}{" "}
                </span>
                {s.label}
              </span>
            </div>
            {!s.done && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(s.goto)}
              >
                {t("onboarding.go")}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
