/*
  service-worker.js
  -------------------
  Exists primarily so Chrome/Android will consider this site
  "installable" — that requires a registered service worker with a
  fetch handler, on top of the manifest. This is deliberately NOT a
  full offline-first caching layer:

  - Only same-origin app-shell files (this page's own HTML/CSS/logo)
    are ever cached. The CDN libraries (pdf-lib, pdf.js, jsPDF,
    html2canvas, Google Fonts) are left alone entirely — caching
    those risks serving a stale/mismatched library version, which
    would break the actual tools. Not worth the tradeoff for a site
    that's still actively changing.
  - Network-first, not cache-first: every request tries the network
    before falling back to the cache. That means a fresh deploy is
    never masked by an old cached copy — the cache only kicks in if
    the network genuinely fails (e.g. no connection).

  Bump CACHE_NAME whenever the app-shell file list changes, so the
  old cache gets cleaned up on the next activate.
*/

const CACHE_NAME = "uploadsure-shell-v1";

const APP_SHELL_FILES = [
  "/index.html",
  "/styles.css",
  "/manifest.json",
  "/assets/logo/logo.png",
  "/assets/logo/favicon-192.png",
  "/assets/logo/favicon-512.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_FILES).catch(() => {
      // If a file 404s during install, don't fail the whole install —
      // the service worker still registers, just with a smaller cache.
    }))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  // Only handle same-origin GET requests for app-shell-type files.
  // Everything else (CDN libraries, POSTs, cross-origin requests)
  // passes straight through to the network, untouched.
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isGet = event.request.method === "GET";
  if (!isSameOrigin || !isGet) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Refresh the cached copy in the background so the offline
        // fallback stays reasonably current.
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
