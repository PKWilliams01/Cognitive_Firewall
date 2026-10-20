/* Cognitive Firewall service worker.
 *
 * Caches only the app shell (HTML, JS/CSS bundles, icons) so the app opens
 * instantly and works when installed. API responses are NEVER cached — the
 * firewall's lock state must always come live from the server.
 */
const VERSION = 'cf-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.json', '/logo192.png', '/logo512.png', '/favicon-32.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Only same-origin requests; the API lives on another host and is never cached.
  if (url.origin !== self.location.origin) return;

  // Page navigations: network first, fall back to the cached shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Fingerprinted build assets never change: cache first.
  if (url.pathname.startsWith('/static/')) {
    event.respondWith(
      caches.match(request).then((hit) =>
        hit || fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(request, copy));
          }
          return res;
        })
      )
    );
  }
});
