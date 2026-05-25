// Client-side product lookup by UPC/EAN via Open Food Facts (free, no key).
// Kept on the client so we don't proxy untrusted barcodes through our API
// (avoids SSRF + spending our rate budget). Best-effort: any failure returns
// null and callers fall back to using the raw code.

export type ProductInfo = { name?: string; imageUrl?: string };

/** True when barcode→product lookup is enabled (opt-in via env). */
export function barcodeLookupEnabled(): boolean {
  return import.meta.env.VITE_FEATURE_BARCODE_LOOKUP === "1";
}

export async function lookupProduct(
  code: string,
  timeoutMs = 6000
): Promise<ProductInfo | null> {
  const trimmed = code.trim();
  // Open Food Facts barcodes are numeric (UPC/EAN). Skip anything else.
  if (!/^\d{6,14}$/.test(trimmed)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(
      trimmed
    )}?fields=product_name,image_url`;
    const res = await fetch(url, { signal: controller.signal });
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
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
