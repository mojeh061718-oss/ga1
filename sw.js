/* Precache-everything, cache-first service worker. The cache name embeds the
 * deploy version (the workflow replaces __VERSION__ with the commit SHA), so
 * every deploy triggers a fresh install that re-downloads all assets. */
importScripts('./js/precache-list.js');

const CACHE = 'calm-pups-__VERSION__';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(
        self.PRECACHE_LIST.map((p) => new URL(p, self.registration.scope).href)
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((hit) => {
      if (hit) return hit;
      return fetch(event.request).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match(new URL('./index.html', self.registration.scope).href);
        }
        throw new Error('offline and uncached: ' + event.request.url);
      });
    })
  );
});
