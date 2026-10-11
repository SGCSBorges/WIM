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

// Chart axis ticks: "120 k" (fr) / "120K" (en) instead of "120000", which
// the 40 px value axis clipped to "20000".
export function formatCompact(value: number, locale?: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return String(value);
  }
}

// One-line chart labels: long article names wrapped onto each other in the
// "most valuable items" axis. The full name stays in the tooltip.
export function shortLabel(text: string, max = 18): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
