const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/**
 * Straight-line current value: purchase price reduced by `rate` percent per
 * year of age since `basis`, floored at zero. Returns null when there's no
 * price or no depreciation rate (nothing meaningful to show).
 */
export function currentValue(
  purchasePrice: string | number | null | undefined,
  depreciationRate: string | number | null | undefined,
  basis: string | Date | null | undefined
): number | null {
  if (purchasePrice == null || depreciationRate == null) return null;
  const price = Number(purchasePrice);
  const rate = Number(depreciationRate);
  if (!Number.isFinite(price) || !Number.isFinite(rate)) return null;
  if (rate <= 0) return price;
  const basisDate = basis ? new Date(basis) : null;
  if (!basisDate || Number.isNaN(basisDate.getTime())) return price;
  const ageYears = (Date.now() - basisDate.getTime()) / MS_PER_YEAR;
  if (ageYears <= 0) return price;
  return Math.max(0, price * (1 - (rate / 100) * ageYears));
}
