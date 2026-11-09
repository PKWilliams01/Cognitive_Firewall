/* Cognitive Firewall service worker.
 *
 * Caches only the app shell (HTML, JS/CSS bundles, icons) so the app opens
 * instantly and works when installed. API responses are NEVER cached — the
 * firewall's lock state must always come live from the server.
 */
const VERSION = 'cf-shell-v2';
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

// ---- Push alerts (tilt warnings, Hard Lock, reopen) ----
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || 'Cognitive Firewall';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/logo192.png',
      badge: '/favicon-32.png',
      tag: data.tag || 'cf',
      renotify: true,
      // Lock alerts stay on screen until dismissed.
      requireInteraction: data.tag === 'cf-lock',
      data: { url: data.url || '/' },
    })
  );
});

// Focus an open tab if there is one; otherwise open the app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((tabs) => {
      const tab = tabs.find((t) => new URL(t.url).origin === self.location.origin);
      if (tab) return tab.focus().then((t) => (t && 'navigate' in t ? t.navigate(target) : t));
      return self.clients.openWindow(target);
    })
  );
});
