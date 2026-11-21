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

// v2: v1 kept every night's city catalogue, eight megabytes a night. The bump
// clears what v1 piled up; storeCatalogue below stops it piling up again.
const VERSION = 'v2';
// Filled in by the build (vite.config.js) with this build's own files.
const PRECACHE = [];
const SHELL = `shell-${VERSION}`;
const DATA = `data-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // The whole app, stored up front. One file failing must not stop the
      // worker installing — it will simply be fetched when first needed.
      const cache = await caches.open(SHELL);
      await Promise.all(PRECACHE.map((file) => cache.add(file).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== SHELL && key !== DATA).map((key) => caches.delete(key)),
      );
      // Hashed files from earlier builds are never asked for again.
      if (PRECACHE.length > 0) {
        const current = new Set(PRECACHE.map((file) => new URL(file, self.registration.scope).href));
        const shell = await caches.open(SHELL);
        const stored = await shell.keys();
        await Promise.all(
          stored
            .filter((request) => request.url.includes('/assets/') && !current.has(request.url))
            .map((request) => shell.delete(request)),
        );
      }
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

/**
 * Stores a city catalogue and drops every older version of the same file.
 *
 * Each night's catalogue has its own URL (?v=<generatedAt>), so storing it
 * never replaced anything: a phone opening the comparison daily kept every
 * night's copy, several megabytes each, for good. Only the newest is useful.
 */
async function storeCatalogue(cache, request, response) {
  await cache.put(request, response);
  const { pathname, search } = new URL(request.url);
  const stored = await cache.keys();
  await Promise.all(
    stored
      .filter((key) => {
        const url = new URL(key.url);
        return url.pathname === pathname && url.search !== search;
      })
      .map((key) => cache.delete(key)),
  );
}

/** Serve the stored copy at once, and quietly fetch a fresher one for later. */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok) storeCatalogue(cache, request, response.clone());
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

  // A city's prices and their history: both versioned per night by ?v=.
  if (url.pathname.includes('price-catalog-') || url.pathname.includes('price-history-')) {
    event.respondWith(staleWhileRevalidate(request, DATA));
    return;
  }

  if (/\.(?:js|css|woff2?|svg|png|ico)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, SHELL));
  }
});
