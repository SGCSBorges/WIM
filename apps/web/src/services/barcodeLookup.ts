// Client-side product lookup by UPC/EAN. Kept on the client so we don't
// proxy untrusted barcodes through our API (avoids SSRF + spending our rate
// budget). Best-effort: any failure returns null and callers fall back to
// using the raw code.
//
// Providers (both keyless + CORS-friendly, same Open *Facts API shape):
//   1. Open Products Facts — general goods (electronics, tools, household),
//      the right database for a home-inventory app.
//   2. Open Food Facts — fallback; groceries and consumables.

export type ProductInfo = { name?: string; imageUrl?: string };

/** True when barcode→product lookup is enabled (opt-in via env). */
export function barcodeLookupEnabled(): boolean {
  return import.meta.env.VITE_FEATURE_BARCODE_LOOKUP === "1";
}

const PROVIDERS = [
  "https://world.openproductsfacts.org",
  "https://world.openfoodfacts.org",
] as const;

async function queryProvider(
  base: string,
  code: string,
  signal: AbortSignal
): Promise<ProductInfo | null> {
  const url = `${base}/api/v2/product/${encodeURIComponent(
    code
  )}?fields=product_name,image_url`;
  const res = await fetch(url, { signal });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    status?: number;
    product?: { product_name?: string; image_url?: string };
  };
  if (data.status !== 1 || !data.product) return null;
  const name = data.product.product_name?.trim() || undefined;
  const rawImage = data.product.image_url?.trim();
  const imageUrl =
    rawImage && /^https:\/\//i.test(rawImage) ? rawImage : undefined;
  if (!name && !imageUrl) return null;
  return { name, imageUrl };
}

export async function lookupProduct(
  code: string,
  timeoutMs = 6000
): Promise<ProductInfo | null> {
  const trimmed = code.trim();
  // Open *Facts barcodes are numeric (UPC/EAN). Skip anything else.
  if (!/^\d{6,14}$/.test(trimmed)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (const base of PROVIDERS) {
      try {
        const hit = await queryProvider(base, trimmed, controller.signal);
        if (hit) return hit;
      } catch (err) {
        // Timeout aborts every remaining provider; a single provider's
        // network error just falls through to the next one.
        if (err instanceof DOMException && err.name === "AbortError")
          return null;
      }
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
