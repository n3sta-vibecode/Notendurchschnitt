// ─── Notenrechner Service Worker ─────────────────────────────────────────────
const CACHE_NAME = 'notenrechner-v1';

// Alle Assets die gecacht werden sollen
const ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192x192.jpeg',
  './icon-512x512.jpeg'
];

// ─── Install: Assets in den Cache laden ───────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Cache install error:', err))
  );
});

// ─── Activate: Alte Caches löschen ────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim())
  );
});

// ─── Fetch: Network-first mit Cache-Fallback ──────────────────────────────────
self.addEventListener('fetch', event => {
  // Nur GET-Requests abfangen
  if (event.request.method !== 'GET') return;

  // Externe Requests (CDN etc.) durchlassen
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin ||
                       event.request.url.startsWith('blob:');

  if (!isSameOrigin) {
    // CDN-Ressourcen (z.B. jsPDF): Network-first, kein Cache-Fallback
    event.respondWith(fetch(event.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // Eigene Ressourcen: Network-first, Cache als Fallback
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Gültige Antwort in den Cache schreiben
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put(event.request, responseClone))
            .catch(() => {});
        }
        return response;
      })
      .catch(() => {
        // Offline: aus dem Cache bedienen
        return caches.match(event.request)
          .then(cached => {
            if (cached) return cached;
            // Fallback für HTML-Anfragen → index.html
            if (event.request.headers.get('accept')?.includes('text/html')) {
              return caches.match('./index.html');
            }
            return new Response('Offline – Ressource nicht verfügbar', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
          });
      })
  );
});

// ─── Message: Cache manuell leeren (optional) ─────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0]?.postMessage({ success: true });
    });
  }
});
