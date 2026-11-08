/* Service Worker — BibleCast PWA */

const STATIC_CACHE = 'biblecast-static-v2';
const DYNAMIC_CACHE = 'biblecast-dynamic-v2';
const ALL_CACHES = [STATIC_CACHE, DYNAMIC_CACHE];

/* Ressources précachées au démarrage */
const PRECACHE_ASSETS = [
  '/',
  '/display',
  '/manifest.json',
  '/favicon.svg',
];

/* ── Install : précacher les ressources connues ── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll(PRECACHE_ASSETS).catch(() => {})
    )
  );
  self.skipWaiting();
});

/* ── Activate : nettoyer les anciens caches ── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => !ALL_CACHES.includes(k)).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* ── Fetch : stratégie mixte ── */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  /* ① Assets Vite (content-hash) : Cache First */
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            caches.open(STATIC_CACHE).then((c) => c.put(event.request, response.clone()));
          }
          return response;
        });
      })
    );
    return;
  }

  /* ② Bible JSON : Cache First (grand fichier statique) */
  if (url.pathname === '/bible-fr.json') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            caches.open(STATIC_CACHE).then((c) => c.put(event.request, response.clone()));
          }
          return response;
        });
      })
    );
    return;
  }

  /* ③ Navigation HTML : Network First → cache fallback */
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            caches.open(DYNAMIC_CACHE).then((c) => c.put(event.request, response.clone()));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then((c) => c || caches.match('/'))
        )
    );
    return;
  }

  /* ④ Reste : Stale-While-Revalidate */
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request).then((response) => {
        if (response.ok) {
          caches.open(DYNAMIC_CACHE).then((c) => c.put(event.request, response.clone()));
        }
        return response;
      });
      return cached || network;
    })
  );
});
