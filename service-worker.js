// Online-only installed app: never cache code, playlists, or audio.
// Cache Storage cleanup does not touch localStorage, IndexedDB, or Firebase data.
const LEGACY_PREFIX = "bennessism-station-";
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(LEGACY_PREFIX)).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request, { cache: "no-store" }));
});
