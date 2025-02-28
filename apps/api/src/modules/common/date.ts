export function addMonths(date: Date, months: number) {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // gestion fin de mois (ex: 31 jan + 1 mois -> 28/29 fév)
  if (d.getDate() < day) d.setDate(0);
  return d;
}
