/**
 * Magic-byte (file signature) checks for the small set of MIME types we
 * accept on upload. The Multer fileFilter trusts the Content-Type the client
 * supplied; this is the second line of defense that opens the file we just
 * stored on disk and verifies its first bytes match the declared type.
 *
 * Keeping the table inline avoids a new runtime dep (`file-type` etc.) for
 * five formats we control entirely.
 */

import fs from "fs";

export type AllowedMime =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "application/pdf";

/** Number of bytes that need to match for a positive signature hit. */
const HEADER_BYTES = 16;

interface Signature {
  /** Exact-match prefix. `null` is a wildcard (used for WEBP file size). */
  prefix: Array<number | null>;
}

const SIGNATURES: Record<AllowedMime, Signature[]> = {
  "image/jpeg": [{ prefix: [0xff, 0xd8, 0xff] }],
  "image/png": [
    { prefix: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  ],
  "image/gif": [
    // GIF87a
    { prefix: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] },
    // GIF89a
    { prefix: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] },
  ],
  "image/webp": [
    {
      // "RIFF" .... "WEBP" — bytes 4..7 hold the file size and vary.
      prefix: [
        0x52,
        0x49,
        0x46,
        0x46,
        null,
        null,
        null,
        null,
        0x57,
        0x45,
        0x42,
        0x50,
      ],
    },
  ],
  "application/pdf": [
    // "%PDF-"
    { prefix: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  ],
};

export function matchesSignature(buf: Buffer, mime: AllowedMime): boolean {
  const candidates = SIGNATURES[mime];
  return candidates.some(({ prefix }) => {
    if (buf.length < prefix.length) return false;
    for (let i = 0; i < prefix.length; i++) {
      const expected = prefix[i];
      if (expected !== null && buf[i] !== expected) return false;
    }
    return true;
  });
}

/**
 * Open `filePath`, read the first {@link HEADER_BYTES} bytes, and verify the
 * signature matches `declaredMime`. Resolves to `true` on match.
 */
export async function verifyFileSignature(
  filePath: string,
  declaredMime: string
): Promise<boolean> {
  if (!(declaredMime in SIGNATURES)) return false;
  const fh = await fs.promises.open(filePath, "r");
  try {
    const { buffer, bytesRead } = await fh.read(
      Buffer.alloc(HEADER_BYTES),
      0,
      HEADER_BYTES,
      0
    );
    return matchesSignature(buffer.subarray(0, bytesRead), declaredMime as AllowedMime);
  } finally {
    await fh.close();
  }
}
