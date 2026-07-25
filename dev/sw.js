/* Offline worker for Rescue HQ 3.0.
 *
 * 2.0 shipped without one deliberately ("dev builds should always be fresh"),
 * which quietly broke the thing this app exists for: a meltdown in a car with
 * no signal. Worse, the v1 worker at ../ has scope over this directory, so an
 * offline navigation here was answered with v1's index.html — whose relative
 * asset paths then resolved under dev/ and 404'd. The child got a white page.
 *
 * Registering a worker at this scope takes those navigations back: a more
 * specific scope wins, so /dev/ pages are served from this cache and never
 * from v1's.
 *
 * The cache name embeds the deploy version (the workflow replaces __VERSION__
 * with the commit SHA), so each deploy installs fresh and drops the old cache.
 */
importScripts('./js/precache-list.js');

const CACHE = 'rescue-hq-3-__VERSION__';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(
        self.PRECACHE_LIST.map((p) => {
          const url = new URL(p, self.registration.scope).href;
          // cache: 'reload' bypasses the HTTP cache so a new version can never
          // be stitched together from stale files — the failure mode where new
          // HTML meets old JS and one renamed ID silently kills a feature.
          // Per-file tolerance means one missing asset can't abort the update.
          return fetch(new Request(url, { cache: 'reload' }))
            .then((r) => (r.ok ? cache.put(url, r) : null))
            .catch(() => null);
        })
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
  const req = event.request;
  if (req.method !== 'GET') return;

  // The mailbox relay must never be served from cache — a cached mailbox would
  // look like the family's letters vanished, and a cached 'monitor' basket
  // would resurrect marks the parent already cleared.
  if (req.url.indexOf('getpantry.cloud') !== -1) return;

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).catch(() => {
        if (req.mode === 'navigate') {
          return caches.match(new URL('./index.html', self.registration.scope).href);
        }
        throw new Error('offline and uncached: ' + req.url);
      });
    })
  );
});
