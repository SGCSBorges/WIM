// Locale-aware integer formatting for counts (article totals, warranty
// counts, pagination). Raw `{n}` renders "1234"; this gives "1,234" (en) or
// "1 234" (fr) so large counts read correctly per the active language.
export function formatCount(
  value: number | null | undefined,
  locale?: string
): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "0";
  try {
    return new Intl.NumberFormat(locale).format(value);
  } catch {
    return String(value);
  }
}
