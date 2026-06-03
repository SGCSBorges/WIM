/**
 * Classify a warranty's end date into a UI status used by the article list
 * badge, the article-detail header, the warranty list filter, and the
 * dashboard "Needs attention" panel. The 30-day window matches the API
 * filter (`warrantyStatus=expiringSoon`) and the J-30 reminder schedule,
 * so the UI and backend agree on what "soon" means.
 */
import type { BadgeTone } from "../components/ui";

export type WarrantyStatus = "active" | "expiringSoon" | "expired" | "none";

export interface WarrantyStatusInfo {
  status: WarrantyStatus;
  tone: BadgeTone;
  /** i18n key under `warrantyStatus.*` */
  labelKey: `warrantyStatus.${WarrantyStatus}`;
  /** Days from now to the end date (negative = past). Null when none. */
  daysLeft: number | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SOON_DAYS = 30;

export function warrantyStatusFor(
  end: string | Date | null | undefined,
  now: Date = new Date()
): WarrantyStatusInfo {
  if (!end) {
    return {
      status: "none",
      tone: "neutral",
      labelKey: "warrantyStatus.none",
      daysLeft: null,
    };
  }
  const fin = end instanceof Date ? end : new Date(end);
  if (Number.isNaN(fin.getTime())) {
    return {
      status: "none",
      tone: "neutral",
      labelKey: "warrantyStatus.none",
      daysLeft: null,
    };
  }
  const daysLeft = Math.ceil((fin.getTime() - now.getTime()) / MS_PER_DAY);
  if (daysLeft < 0) {
    return {
      status: "expired",
      tone: "danger",
      labelKey: "warrantyStatus.expired",
      daysLeft,
    };
  }
  if (daysLeft <= SOON_DAYS) {
    return {
      status: "expiringSoon",
      tone: "warning",
      labelKey: "warrantyStatus.expiringSoon",
      daysLeft,
    };
  }
  return {
    status: "active",
    tone: "success",
    labelKey: "warrantyStatus.active",
    daysLeft,
  };
}
