const CACHE_NAME = 'tessitura-v1';
const ASSET_CACHE = 'tessitura-assets-v1';
const SAMPLES_CACHE = 'audio-samples-v2';

const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

// Install — precache essentials
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== ASSET_CACHE && k !== SAMPLES_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // R2 audio samples — cache first
  if (url.href.includes('r2.dev/samples/')) {
    event.respondWith(
      caches.open(SAMPLES_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  // Skip non-GET and cross-origin (Firebase, Google Fonts, etc.)
  if (request.method !== 'GET' || url.origin !== location.origin) return;

  const isAsset =
    /\.(png|jpg|jpeg|svg|gif|webp|woff2?|ico)$/.test(url.pathname);

  if (isAsset) {
    // Cache first for static assets
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
  } else {
    // Network first for HTML/JS/CSS
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
  }
});
