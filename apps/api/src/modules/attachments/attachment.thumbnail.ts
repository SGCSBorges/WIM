import path from "path";
import sharp from "sharp";
import { logger } from "../../config/logger";

const THUMB_MAX = 400;

/**
 * Generate a downscaled WebP preview next to an uploaded image and return its
 * public URL. Best-effort: returns null for non-images or when resizing fails,
 * so callers fall back to the original file. `storedName` is the on-disk
 * filename (already randomized); the thumb is written as `<name>-thumb.webp`.
 */
export async function makeImageThumbnail(opts: {
  sourcePath: string;
  uploadDir: string;
  storedName: string;
  mimeType: string;
  baseUrl: string;
}): Promise<string | null> {
  if (!opts.mimeType.startsWith("image/")) return null;
  const thumbName = `${path.parse(opts.storedName).name}-thumb.webp`;
  const thumbPath = path.join(opts.uploadDir, thumbName);
  try {
    await sharp(opts.sourcePath)
      .rotate()
      .resize(THUMB_MAX, THUMB_MAX, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toFile(thumbPath);
    return `${opts.baseUrl}/uploads/${encodeURIComponent(thumbName)}`;
  } catch (err) {
    logger.warn(
      { err, filePath: opts.sourcePath },
      "[attachment] thumbnail generation failed"
    );
    return null;
  }
}

/** The on-disk thumbnail filename for a given stored upload name. */
export function thumbnailName(storedName: string): string {
  return `${path.parse(storedName).name}-thumb.webp`;
}
