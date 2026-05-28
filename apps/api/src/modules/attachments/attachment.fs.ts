import fs from "fs";
import path from "path";
import { logger } from "../../config/logger";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

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
