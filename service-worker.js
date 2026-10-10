const CACHE_NAME = "bennessism-station-v20";
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/station.css",
  "./css/admin.css",
  "./engine/catalog.js",
  "./engine/firebase.js",
  "./js/dial.js",
  "./js/radio.js",
  "./js/station.js",
  "./admin/",
  "./admin/index.html",
  "./admin/admin.js",
  "./manifest.webmanifest",
  "./icons/favicon-32x32.png",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || event.request.destination === "audio") return;

  const url = new URL(event.request.url);
  const isMusicIndex = url.origin === self.location.origin && url.pathname.endsWith("/music-index.json");

  if (isMusicIndex) {
    // Always check the published index on each visit; keep the last good copy offline.
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then((response) => {
          if (response.ok) {
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone())),
            );
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          throw new Error("Music index unavailable offline");
        }),
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)));
        }
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
