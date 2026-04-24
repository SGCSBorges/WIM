/**
 * Adds `months` to `date`, clamping to the last valid day of the target month.
 * e.g. Jan 31 + 1 month → Feb 28/29 (not March 2/3).
 * Does not mutate the original date.
 */
export function addMonths(date: Date, months: number) {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // gestion fin de mois (ex: 31 jan + 1 mois -> 28/29 fév)
  if (d.getDate() < day) d.setDate(0);
  return d;
}
