import { subDays, isBefore } from "date-fns";
import { WarrantyReminderKind } from "./alert.types";

export type ReminderScheduleItem = {
  reminderKind: WarrantyReminderKind;
  executeAt: Date;
};

/**
 * Computes reminder dates J-30 / J-7 / J-1 from a warranty end date.
 *
 * - All returned dates are real Date objects.
 * - Past dates are filtered out by default.
 */
export function computeWarrantyReminderSchedule(input: {
  garantieFin: Date;
  now?: Date;
  includePast?: boolean;
}): ReminderScheduleItem[] {
  const now = input.now ?? new Date();
  const includePast = input.includePast ?? false;

  const items: ReminderScheduleItem[] = [
    { reminderKind: "J30", executeAt: subDays(input.garantieFin, 30) },
    { reminderKind: "J7", executeAt: subDays(input.garantieFin, 7) },
    { reminderKind: "J1", executeAt: subDays(input.garantieFin, 1) },
  ];

  if (includePast) return items;

  return items.filter((i) => !isBefore(i.executeAt, now) && i.executeAt > now);
}
