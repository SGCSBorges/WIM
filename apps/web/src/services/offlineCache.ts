/**
 * The service worker (public/sw.js) keeps a stale-while-revalidate copy of
 * GET /api/articles in the Cache API so the list opens offline. The Cache API
 * is keyed by URL, not by cookie, so without this the next account to sign in
 * on the same device would be handed the previous account's list first, and
 * offline it would never be replaced. Drop it whenever the session changes.
 *
 * `API_CACHE_NAME` must match `API_CACHE` in public/sw.js.
 */
export const API_CACHE_NAME = "wim-api-articles";

export async function clearApiCache(): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    await caches.delete(API_CACHE_NAME);
  } catch {
    // Storage may be blocked (private mode, disabled site data); a failed
    // delete must never break sign-in or sign-out.
  }
}
