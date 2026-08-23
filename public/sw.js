/* Service worker, written by hand — no build step, no library.
 *
 * Three kinds of request, three strategies, chosen by what goes wrong if the
 * answer is stale:
 *
 *   navigation      network first. A stale document would pin the app to an
 *                   old build forever, because it references old asset names.
 *   hashed assets   cache first. Vite puts a content hash in the filename, so
 *                   a given URL can never change meaning. Safe to keep.
 *   price index     network first. Prices are the point; a day-old index is
 *                   worse than a short wait.
 *   city catalogue  cache first, refreshed in the background. Several
 *                   megabytes, and the index above already tells us when a
 *                   newer one exists.
 *
 * Anything not matched is left entirely alone.
 */

const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const DATA = `data-${VERSION}`;

self.addEventListener('install', (event) => {
  // Nothing is precached: the asset names are hashed at build time and are not
  // knowable here. The first visit populates the caches as it goes.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== SHELL && key !== DATA).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Network, falling back to whatever was stored last. */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

/** Cache, falling back to the network and storing what comes back. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

/** Serve the stored copy at once, and quietly fetch a fresher one for later. */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    // Offline is an expected state here, not a fault: the cached copy stands.
    .catch(() => cached);

  return cached ?? network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL));
    return;
  }

  if (url.pathname.endsWith('price-catalog-index.json')) {
    event.respondWith(networkFirst(request, DATA));
    return;
  }

  if (url.pathname.includes('price-catalog-')) {
    event.respondWith(staleWhileRevalidate(request, DATA));
    return;
  }

  if (/\.(?:js|css|woff2?|svg|png|ico)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, SHELL));
  }
});
