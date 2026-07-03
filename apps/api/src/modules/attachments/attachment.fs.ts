/**
 * Storage helpers for attachment files. `unlinkAttachmentFiles` is the
 * canonical cleanup — best-effort (logs and continues on ENOENT) so a
 * missing file never blocks a DB delete. Used by single + bulk delete,
 * article hard-remove, and the maintenance trash purge.
 *
 * All helpers are storage-aware: when the S3_* env vars are set (see
 * libs/object-storage.ts) the bytes live in a bucket keyed by the stored
 * filename; otherwise they live under the local `uploads/` directory.
 */
import fs from "fs";
import path from "path";
import { logger } from "../../config/logger";
import {
  storageEnabled,
  deleteObject,
  getObjectBuffer,
} from "../../libs/object-storage";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

/**
 * Extract the stored object name from an attachment URL, or null for remote
 * / malformed URLs. Same traversal guard as `resolveUploadPath`, minus the
 * disk specifics — this is the S3 object key.
 */
export function storedNameFromUrl(
  fileUrl: string | null | undefined
): string | null {
  const abs = resolveUploadPath(fileUrl);
  if (!abs) return null;
  return path.basename(abs);
}

/**
 * Read an uploaded file's bytes regardless of backend — bucket when object
 * storage is configured, local disk otherwise. Returns null for remote
 * URLs, traversal attempts, or missing files. Used by the claim-PDF image
 * embeds (PDFKit accepts Buffers directly).
 */
export async function readUploadBytes(
  fileUrl: string | null | undefined
): Promise<Buffer | null> {
  const storedName = storedNameFromUrl(fileUrl);
  if (!storedName) return null;
  try {
    if (storageEnabled()) return await getObjectBuffer(storedName);
    return await fs.promises.readFile(path.resolve(UPLOAD_DIR, storedName));
  } catch {
    return null;
  }
}

/**
 * Resolve a stored attachment URL to its on-disk path inside `uploads/`, or
 * return null if the URL points outside the uploads directory (or is a remote
 * URL). The path-traversal guard mirrors what the DELETE attachment route
 * does — extracted here so the article-delete cascade can reuse it.
 */
export function resolveUploadPath(
  fileUrl: string | null | undefined
): string | null {
  if (!fileUrl) return null;
  let url: URL;
  try {
    url = new URL(fileUrl);
  } catch {
    return null;
  }
  const pathname = decodeURIComponent(url.pathname);
  if (!pathname.startsWith("/uploads/")) return null;
  const storedName = pathname.replace("/uploads/", "");
  const fullPath = path.resolve(UPLOAD_DIR, storedName);
  if (!fullPath.startsWith(UPLOAD_DIR + path.sep)) return null;
  return fullPath;
}

/**
 * Best-effort unlink for an attachment's primary file and (when present) its
 * generated thumbnail. Logs and swallows missing-file / permission errors so
 * a single bad file can't block the cascade.
 */
export async function unlinkAttachmentFiles(attachment: {
  fileUrl?: string | null;
  thumbUrl?: string | null;
}): Promise<void> {
  for (const url of [attachment.fileUrl, attachment.thumbUrl]) {
    const abs = resolveUploadPath(url);
    if (!abs) continue;
    if (storageEnabled()) {
      await deleteObject(path.basename(abs));
      continue;
    }
    try {
      await fs.promises.unlink(abs);
    } catch (err) {
      // ENOENT is the usual case (already deleted); log others.
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        logger.warn({ err, path: abs }, "[attachment] unlink failed");
      }
    }
  }
}
