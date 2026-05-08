// WIM service worker.
//
// Minimal on purpose: Chrome's PWA installability heuristic requires a
// service worker that registers a `fetch` handler. We don't actually want
// aggressive caching for an app that talks to a live API — stale data is
// worse than a brief offline screen — so the fetch handler is a pass-through
// to the network with a tiny offline fallback for the SPA shell.
//
// Bump CACHE_VERSION to force all installed clients to refresh the cached
// shell.
const CACHE_VERSION = "wim-v1";
const SHELL_URLS = ["/", "/index.html", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_VERSION)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Never intercept API calls — always go to the network so users see
  // current data and auth cookies aren't tripped up by a stale response.
  if (url.pathname.startsWith("/api/")) return;

  // Network-first for navigations so the SPA shell stays fresh; fall back
  // to the cached shell only when the network fails (offline).
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match("/index.html").then((r) => r || Response.error())
      )
    );
    return;
  }

  // For static assets (built by Vite with hashed names), cache-first is
  // safe — the hash changes when the file changes, so we never serve a
  // stale chunk under the same URL.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res.ok && res.type === "basic") {
              const copy = res.clone();
              caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
  }
});
