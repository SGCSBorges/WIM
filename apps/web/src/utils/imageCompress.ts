/**
 * Client-side image downscaling + re-encoding before upload. A 12 MP phone
 * photo (often 4–8 MB) becomes a ~1600px-max JPEG of a few hundred KB, which
 * cuts upload time and storage cost (the ephemeral Render disk / R2 free
 * tier) and dodges the API's 10 MB reject. Runs entirely in the browser — the
 * photo is never sent anywhere to be compressed.
 *
 * Deliberately conservative:
 *   • Only raster photo types (jpeg / png / webp) are touched. SVG, GIF
 *     (animation), HEIC, and PDFs pass through untouched.
 *   • Small files pass through — no point re-encoding a 120 KB thumbnail.
 *   • The re-encoded blob is only used if it's actually smaller than the
 *     original; otherwise the original is kept.
 *   • Any failure (no canvas/toBlob, decode error) returns the original file,
 *     so compression can never block an upload.
 *
 * Output is JPEG, so transparency is flattened — acceptable for the inventory
 * photos / receipts / warranty proofs this is used for.
 */

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;
// Below this, a re-encode rarely helps and can even grow the file.
const MIN_BYTES_TO_COMPRESS = 300 * 1024;
const COMPRESSIBLE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

/** Pure gate: is this a raster photo big enough to be worth compressing? */
export function shouldAttemptCompression(file: File): boolean {
  return (
    COMPRESSIBLE_TYPES.has(file.type.toLowerCase()) &&
    file.size >= MIN_BYTES_TO_COMPRESS
  );
}

function swapExtension(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, "");
  return `${base || "photo"}.jpg`;
}

/**
 * Return a downscaled JPEG copy of `file`, or the original file when
 * compression isn't applicable or didn't help. Never throws.
 */
export async function compressImageFile(file: File): Promise<File> {
  if (!shouldAttemptCompression(file)) return file;
  if (
    typeof document === "undefined" ||
    typeof createImageBitmap !== "function"
  ) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    // Keep the original unless we genuinely shrank it.
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], swapExtension(file.name), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}
