// Format a monetary amount for display. Values may arrive as a Prisma Decimal
// string, a number, or null/undefined (no price set). `currency` is the user's
// ISO-4217 preference; `locale` is the active i18n language (Intl accepts the
// short form, e.g. "en"/"fr"/"pt").
export function formatMoney(
  value: number | string | null | undefined,
  currency = "USD",
  locale?: string
): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(n);
  } catch {
    // Bad currency code — fall back to USD so we never throw in render.
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
    }).format(n);
  }
}
