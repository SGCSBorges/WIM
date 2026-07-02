/**
 * Pure scheduler helpers for warranty reminders. No Prisma, no BullMQ —
 * just date math. Kept side-effect-free so the offset rule can be
 * unit-tested without hitting Redis (see `alert.scheduler.test.ts`).
 */
import { subDays, isBefore } from "date-fns";
import { WarrantyReminderKind, reminderKindForDays } from "./alert.types";

export type ReminderScheduleItem = {
  reminderKind: WarrantyReminderKind;
  executeAt: Date;
  days: number;
};

// The coded default: J-30 / J-7 / J-1 before the warranty end date.
export const DEFAULT_REMINDER_DAYS = [30, 7, 1] as const;

// Bounds for user-configured offsets. Enforced both here (defence-in-depth
// for values already in the DB) and by the profile-update Zod schema.
export const MAX_REMINDER_OFFSETS = 5;
export const MAX_REMINDER_DAY = 365;

/**
 * Parse a stored `User.warrantyReminderDays` CSV ("90,30,7") into a clean
 * offset list: integers within [1, 365], deduped, sorted descending, capped
 * at MAX_REMINDER_OFFSETS. Returns the default for null/empty/garbage input
 * so a corrupted preference can never silence reminders entirely.
 */
export function parseReminderDays(raw: string | null | undefined): number[] {
  if (!raw) return [...DEFAULT_REMINDER_DAYS];
  const days = [
    ...new Set(
      raw
        .split(",")
        .map((s) => Number.parseInt(s.trim(), 10))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= MAX_REMINDER_DAY)
    ),
  ];
  if (days.length === 0) return [...DEFAULT_REMINDER_DAYS];
  return days.sort((a, b) => b - a).slice(0, MAX_REMINDER_OFFSETS);
}

/**
 * Computes reminder dates (J-30 / J-7 / J-1 by default, or the caller's
 * custom day offsets) from a warranty end date.
 *
 * - All returned dates are real Date objects.
 * - Past dates are filtered out by default.
 */
export function computeWarrantyReminderSchedule(input: {
  garantieFin: Date;
  now?: Date;
  includePast?: boolean;
  offsets?: number[];
}): ReminderScheduleItem[] {
  const now = input.now ?? new Date();
  const includePast = input.includePast ?? false;
  const offsets = input.offsets ?? [...DEFAULT_REMINDER_DAYS];

  const items: ReminderScheduleItem[] = offsets.map((days) => ({
    reminderKind: reminderKindForDays(days),
    executeAt: subDays(input.garantieFin, days),
    days,
  }));

  if (includePast) return items;

  return items.filter((i) => !isBefore(i.executeAt, now));
}
