/**
 * Map an article's lifecycle status to its badge tone + i18n label key, used
 * by the article list badge, the article-detail header, and the status filter.
 * The status set mirrors the Prisma `ArticleStatus` enum / `ARTICLE_STATUSES`
 * in @wim/types — keep all three in lock-step.
 *
 * ACTIVE is the resting state and renders no badge in dense lists (only the
 * non-default states are worth the visual weight); callers that always want a
 * badge can still read `articleStatusInfo("ACTIVE")`.
 */
import { ARTICLE_STATUSES, type ArticleStatus } from "@wim/types";
import type { BadgeTone } from "../components/ui";

export type { ArticleStatus };
export { ARTICLE_STATUSES };

export interface ArticleStatusInfo {
  tone: BadgeTone;
  /** i18n key under `articleStatus.*` */
  labelKey: `articleStatus.${ArticleStatus}`;
}

const INFO: Record<ArticleStatus, ArticleStatusInfo> = {
  ACTIVE: { tone: "success", labelKey: "articleStatus.ACTIVE" },
  IN_REPAIR: { tone: "warning", labelKey: "articleStatus.IN_REPAIR" },
  LOANED: { tone: "info", labelKey: "articleStatus.LOANED" },
  SOLD: { tone: "neutral", labelKey: "articleStatus.SOLD" },
  DISPOSED: { tone: "neutral", labelKey: "articleStatus.DISPOSED" },
  LOST: { tone: "danger", labelKey: "articleStatus.LOST" },
};

export function articleStatusInfo(
  status: ArticleStatus | null | undefined
): ArticleStatusInfo {
  return INFO[status ?? "ACTIVE"] ?? INFO.ACTIVE;
}

/** True for the default state — lets dense lists skip a redundant "Active" pill. */
export function isDefaultStatus(status: ArticleStatus | null | undefined) {
  return (status ?? "ACTIVE") === "ACTIVE";
}
