// Avayble service worker.
//
// Strategy is deliberately conservative for a booking app: we cache the
// app shell + hashed static assets aggressively (CRA's `build/static/*`
// gets a content hash in the filename, so cache-first never serves
// stale code), but never touch /api/* — slot availability and package
// credit reservation MUST be live, and serving cached responses there
// would risk double-bookings or silent credit overruns.
//
// Bumping CACHE_VERSION evicts every old cache on activate. Do this if
// you change cached-resource semantics (rare — the precache strategy
// is content-addressed via filename hashes already).
//
// v2: existing v1 installs cached `/` from a server bug that returned
// the unbuilt CRA template (no script tag → blank screen on PWA
// launch). Bumping the version forces those caches to evict on next
// activate so the freshly-served build/index.html replaces the
// broken cached copy.
const CACHE_VERSION = 'avayble-v2';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;

// Files we want available for offline app-shell loading. Hashed assets
// are picked up at runtime via the fetch handler — listing them here
// would break with every build.
const APP_SHELL = ['/', '/manifest.json', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  // Don't auto-activate — we want the React layer to surface a
  // "new version" prompt and let the user decide when to reload.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Listen for the React layer's "I'm ready, take over" signal.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GETs.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache or serve cached responses for the API. Booking flows
  // (slot availability, package reservation, payment intents) need
  // live data — stale responses here are dangerous, not just annoying.
  if (url.pathname.startsWith('/api/')) return;

  // Same-origin only beyond this point. Cross-origin (Google Maps,
  // Stripe Elements, fonts CDN) goes through default browser handling.
  if (url.origin !== self.location.origin) return;

  // Navigation requests (the user typed a URL or refreshed): network-
  // first, fall back to cached app shell. Lets the app boot offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          // Stash latest navigation response so subsequent offline
          // navigations get a fresh-ish shell.
          const cache = await caches.open(APP_SHELL_CACHE);
          cache.put('/', fresh.clone()).catch(() => {});
          return fresh;
        } catch (err) {
          const cache = await caches.open(APP_SHELL_CACHE);
          const cached = await cache.match('/');
          return cached || new Response('Offline', { status: 503 });
        }
      })()
    );
    return;
  }

  // Hashed static assets (CRA emits `/static/...` with a content hash
  // in the filename, so they're effectively immutable): cache-first.
  if (url.pathname.startsWith('/static/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        const fresh = await fetch(request);
        if (fresh && fresh.status === 200) cache.put(request, fresh.clone()).catch(() => {});
        return fresh;
      })()
    );
    return;
  }

  // Everything else (icons, manifest, occasional images): stale-while-
  // revalidate. Cheap to serve stale, refreshes in the background.
  event.respondWith(
    (async () => {
      const cache = await caches.open(APP_SHELL_CACHE);
      const cached = await cache.match(request);
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response && response.status === 200) cache.put(request, response.clone()).catch(() => {});
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })()
  );
});
