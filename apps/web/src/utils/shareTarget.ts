// Reads (and clears) the payload stashed by the service worker's share-target
// handler. Mirrors the cache keys in public/sw.js. Returns null when there's
// nothing to consume or the Cache API is unavailable.

const SHARE_CACHE = "wim-share-target";
const SHARE_META_KEY = "/__wim_share__";
const SHARE_PHOTO_KEY = "/__wim_share_photo__";

export type SharedDraft = {
  title?: string;
  text?: string;
  url?: string;
  photo?: File;
};

export async function consumeSharedDraft(): Promise<SharedDraft | null> {
  if (typeof caches === "undefined") return null;
  let cache: Cache;
  try {
    cache = await caches.open(SHARE_CACHE);
  } catch {
    return null;
  }

  const metaRes = await cache.match(SHARE_META_KEY);
  if (!metaRes) return null;

  const meta = (await metaRes.json().catch(() => ({}))) as {
    title?: string;
    text?: string;
    url?: string;
  };

  let photo: File | undefined;
  const photoRes = await cache.match(SHARE_PHOTO_KEY);
  if (photoRes) {
    const blob = await photoRes.blob();
    const name = photoRes.headers.get("X-Filename") || "shared-image";
    photo = new File([blob], name, {
      type: blob.type || "application/octet-stream",
    });
  }

  await cache.delete(SHARE_META_KEY);
  await cache.delete(SHARE_PHOTO_KEY);

  return { ...meta, photo };
}
