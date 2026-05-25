const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/**
 * Straight-line current value: purchase price reduced by `rate` percent per
 * year of age, floored at zero. A null/zero rate (or absent price) returns the
 * purchase value unchanged. `basis` is the date the item's age is measured
 * from (warranty purchase date when known, else the article's createdAt).
 */
export function currentValue(
  purchasePrice: number | null | undefined,
  depreciationRate: number | null | undefined,
  basis: Date,
  now: Date = new Date()
): number {
  const price = purchasePrice != null ? Number(purchasePrice) : 0;
  if (!price) return 0;
  const rate = depreciationRate != null ? Number(depreciationRate) : 0;
  if (rate <= 0) return price;
  const ageYears = (now.getTime() - basis.getTime()) / MS_PER_YEAR;
  if (ageYears <= 0) return price;
  const factor = Math.max(0, 1 - (rate / 100) * ageYears);
  return price * factor;
}
