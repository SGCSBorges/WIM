/**
 * S3-compatible object storage for attachment files (Cloudflare R2, AWS S3,
 * MinIO…). Render's free-tier disk is EPHEMERAL — every deploy wipes
 * `uploads/` — so production should set the four S3_* vars and let uploads
 * live in a bucket. Everything is env-gated: with the vars unset the app
 * keeps the original local-disk behavior, byte for byte.
 *
 *   S3_ENDPOINT           e.g. https://<account>.r2.cloudflarestorage.com
 *   S3_BUCKET             bucket name
 *   S3_ACCESS_KEY_ID      access key
 *   S3_SECRET_ACCESS_KEY  secret key
 *   S3_REGION             optional (default "auto" — what R2 expects)
 *
 * Objects are keyed by the multer-generated stored filename (already
 * random), so the public URL shape (`/uploads/<name>`) and the share-aware
 * ACL in app.ts don't change — the API keeps streaming the bytes itself
 * rather than handing out presigned URLs, which would bypass the ACL.
 */
import fs from "fs";
import type { Readable } from "stream";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { logger } from "../config/logger";

const ENDPOINT = process.env.S3_ENDPOINT ?? "";
const BUCKET = process.env.S3_BUCKET ?? "";
const ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID ?? "";
const SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY ?? "";
const REGION = process.env.S3_REGION ?? "auto";

const enabled = Boolean(
  ENDPOINT && BUCKET && ACCESS_KEY_ID && SECRET_ACCESS_KEY
);

let _client: S3Client | null = null;
function client(): S3Client {
  if (!_client) {
    _client = new S3Client({
      endpoint: ENDPOINT,
      region: REGION,
      // R2 (and MinIO) work with path-style; virtual-host style breaks on
      // custom endpoints with dots in bucket names.
      forcePathStyle: true,
      credentials: {
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY,
      },
    });
  }
  return _client;
}

export function storageEnabled(): boolean {
  return enabled;
}

/** Upload a local file to the bucket under `key`. Throws on failure — the
 *  upload route treats a failed store as a failed upload (no dangling DB
 *  row pointing at bytes that only exist on the ephemeral disk). */
export async function putObjectFromFile(
  key: string,
  filePath: string,
  contentType: string
): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
      ContentLength: (await fs.promises.stat(filePath)).size,
    })
  );
}

/** Stream an object for the authenticated `/uploads/:name` route. Returns
 *  null when the object doesn't exist. */
export async function getObjectStream(
  key: string
): Promise<{ body: Readable; contentLength?: number } | null> {
  try {
    const out = await client().send(
      new GetObjectCommand({ Bucket: BUCKET, Key: key })
    );
    if (!out.Body) return null;
    return {
      body: out.Body as Readable,
      contentLength: out.ContentLength,
    };
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === "NoSuchKey" || name === "NotFound") return null;
    throw err;
  }
}

/** Buffer an object fully (claim-PDF image embedding). Null when missing. */
export async function getObjectBuffer(key: string): Promise<Buffer | null> {
  const obj = await getObjectStream(key);
  if (!obj) return null;
  const chunks: Buffer[] = [];
  for await (const chunk of obj.body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Best-effort delete — cleanup mirrors the local unlink semantics (a
 *  missing object never blocks a DB delete). */
export async function deleteObject(key: string): Promise<void> {
  try {
    await client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (err) {
    logger.warn({ err, key }, "[storage] delete failed");
  }
}
