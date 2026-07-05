/**
 * Map an article's physical condition grade to its badge tone + i18n label
 * key, used by the article-detail header, the form select, and the condition
 * filter. Mirrors the Prisma `ArticleCondition` enum / `ARTICLE_CONDITIONS`
 * in @wim/types — keep all three in lock-step. Optional (null = unspecified),
 * so callers render nothing when absent.
 */
import { ARTICLE_CONDITIONS, type ArticleCondition } from "@wim/types";
import type { BadgeTone } from "../components/ui";

export type { ArticleCondition };
export { ARTICLE_CONDITIONS };

export interface ArticleConditionInfo {
  tone: BadgeTone;
  /** i18n key under `articleCondition.*` */
  labelKey: `articleCondition.${ArticleCondition}`;
}

const INFO: Record<ArticleCondition, ArticleConditionInfo> = {
  NEW: { tone: "success", labelKey: "articleCondition.NEW" },
  EXCELLENT: { tone: "success", labelKey: "articleCondition.EXCELLENT" },
  GOOD: { tone: "info", labelKey: "articleCondition.GOOD" },
  FAIR: { tone: "warning", labelKey: "articleCondition.FAIR" },
  POOR: { tone: "danger", labelKey: "articleCondition.POOR" },
};

export function articleConditionInfo(
  condition: ArticleCondition | null | undefined
): ArticleConditionInfo | null {
  return condition ? (INFO[condition] ?? null) : null;
}
