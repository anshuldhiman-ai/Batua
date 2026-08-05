// Bump this version whenever you change the app's JS/CSS — the browser only
// clears the old cache when CACHE_NAME changes.
const CACHE_NAME = "batua-static-cache-v3";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.ico",
  "/app-icon-light-192.png",
  "/app-icon-dark-192.png",
];

// Install Event
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[Service Worker] Caching static shell");
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("[Service Worker] Clearing old cache", key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event
self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  // Bypass caching for API endpoints, hot reloader websocket, and non-GET requests
  if (
    requestUrl.pathname.startsWith("/api") ||
    requestUrl.pathname.startsWith("/@vite") ||
    event.request.method !== "GET"
  ) {
    return;
  }

  // HTML navigation: NETWORK-FIRST. index.html changes on every rebuild, and
  // caching it cache-first served users a stale app shell indefinitely. Always
  // fetch the latest shell, only falling back to the cached copy when offline.
  if (event.request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (!response || !response.ok) throw new Error("bad html response");
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", copy));
          return response;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Static assets (hashed JS/CSS/images): cache-first — these are immutable,
  // so a stale match is never a problem and offline use keeps working.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== "basic") {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        })
        .catch(() => {
          // Offline fallback for html document requests
          if (event.request.headers.get("accept")?.includes("text/html")) {
            return caches.match("/index.html");
          }
        });
    })
  );
});
