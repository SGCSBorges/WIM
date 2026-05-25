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

// Holds the payload from a PWA share-sheet POST until the SPA reads it.
// Kept separate from the versioned shell cache so activate() doesn't wipe it.
const SHARE_CACHE = "wim-share-target";
const SHARE_META_KEY = "/__wim_share__";
const SHARE_PHOTO_KEY = "/__wim_share_photo__";

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
            .filter((k) => k !== CACHE_VERSION && k !== SHARE_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Stash a share-sheet POST in the share cache, then redirect into the SPA's
// "new article" flow, which reads the stash on load. Errors degrade to a plain
// redirect so the user still lands somewhere sensible.
async function handleShareTarget(req) {
  try {
    const form = await req.formData();
    const meta = {
      title: String(form.get("title") || ""),
      text: String(form.get("text") || ""),
      url: String(form.get("url") || ""),
    };
    const cache = await caches.open(SHARE_CACHE);
    await cache.put(
      SHARE_META_KEY,
      new Response(JSON.stringify(meta), {
        headers: { "Content-Type": "application/json" },
      })
    );
    const photo = form.get("photo");
    if (photo && typeof photo !== "string" && photo.size > 0) {
      await cache.put(
        SHARE_PHOTO_KEY,
        new Response(photo, {
          headers: {
            "Content-Type": photo.type || "application/octet-stream",
            "X-Filename": photo.name || "shared-image",
          },
        })
      );
    } else {
      await cache.delete(SHARE_PHOTO_KEY);
    }
  } catch {
    // ignore — fall through to the redirect
  }
  return Response.redirect("/articles?shared=1", 303);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(handleShareTarget(req));
    return;
  }

  if (req.method !== "GET") return;
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

// Web Push: show the notification the API sent (warranty/maintenance reminder).
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "WIM reminder";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/" },
    })
  );
});

// Focus an existing window (or open one) at the notification's target URL.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((wins) => {
        for (const w of wins) {
          if ("focus" in w) {
            w.navigate(target).catch(() => undefined);
            return w.focus();
          }
        }
        return self.clients.openWindow(target);
      })
  );
});
