// ─── Service worker Tessitura ────────────────────────────────────────────────
// Objectif : l'appli doit rester utilisable sans réseau une fois qu'elle a été
// chargée au moins une fois.
//
// Trois corrections par rapport à la version précédente :
//  1. REPLI DE NAVIGATION. Une route jamais visitée en ligne (/harmonie/cadences)
//     n'était dans aucun cache : `caches.match(request)` renvoyait undefined, et
//     `respondWith(undefined)` fait échouer la requête — page morte. Toute
//     navigation retombe désormais sur l'index.html en cache.
//  2. AUCUNE RÉPONSE VIDE. Chaque branche garantit une Response.
//  3. ASSETS HACHÉS EN CACHE D'ABORD. Vite produit /assets/<nom>-<hash>.js, dont
//     le contenu ne change jamais à URL constante : les servir depuis le cache
//     est à la fois plus sûr hors ligne et plus rapide en ligne.

const VERSION = 'v4';
const HTML_CACHE = `tessitura-html-${VERSION}`;
const ASSET_CACHE = `tessitura-assets-${VERSION}`;
const SAMPLES_CACHE = 'audio-samples-v2'; // volumineux et stables : non versionnés
const FONT_CACHE = 'tessitura-fonts-v1';  // idem : les polices ne changent jamais

const CACHES_ACTIFS = [HTML_CACHE, ASSET_CACHE, SAMPLES_CACHE, FONT_CACHE];

// Hôtes tiers dont les réponses DOIVENT être mises en cache pour que l'appli
// tienne hors ligne. Google Fonts est chargé en render-blocking dans index.html :
// sans cache, chaque démarrage sans réseau attend son échec.
const HOTES_POLICES = ['fonts.googleapis.com', 'fonts.gstatic.com'];

// Page de repli pour toute navigation hors ligne. Le rewrite Vercel renvoie
// index.html sur toutes les routes, donc « / » suffit à démarrer l'appli.
const FALLBACK = '/';

const PRECACHE = [
  FALLBACK,
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
  // Source de vérité des formules du module Rythme : sans elle, Rythme démarre
  // sur son catalogue par défaut au lieu du contenu réel.
  '/formules-rythme-template.csv',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(HTML_CACHE)
      // addAll échoue en bloc si UNE seule entrée manque : on tolère les absences
      // pour ne jamais empêcher l'installation du service worker.
      .then((cache) => Promise.all(
        PRECACHE.map((url) => cache.add(url).catch(() => {})),
      )),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !CACHES_ACTIFS.includes(k)).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

// ─── Précache complet des chunks ─────────────────────────────────────────────
// Déclenché par la page à CHAQUE visite (voir index.html), et non à l'install :
// le fichier sw.js ne changeant pas d'un déploiement à l'autre, `install` ne se
// rejouerait pas et les chunks d'un nouveau build ne seraient jamais précachés.
// Piloté par la page, le rattrapage a lieu dès la première visite en ligne
// suivant un déploiement.
async function precacherTout() {
  try {
    const res = await fetch('/sw-manifest.json', { cache: 'no-cache' });
    if (!res.ok) return;
    const fichiers = await res.json();
    const cache = await caches.open(ASSET_CACHE);
    const dejaEnCache = new Set(
      (await cache.keys()).map((r) => new URL(r.url).pathname),
    );
    const manquants = fichiers.filter((f) => !dejaEnCache.has(f));
    // Un par un plutôt qu'un `addAll` : celui-ci échoue en bloc si une seule
    // requête rate, ce qui laisserait le cache incomplet sans le signaler.
    await Promise.all(manquants.map((f) => cache.add(f).catch(() => {})));
  } catch (err) {
    // Hors ligne au moment du rattrapage : sans effet, on retentera à la
    // prochaine visite.
  }
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'PRECACHE') event.waitUntil(precacherTout());
});

// Cache d'abord, réseau en secours — pour les ressources immuables.
async function cacheDAbord(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    // Pas de réseau ET rien en cache : réponse explicite plutôt qu'undefined.
    return new Response('', { status: 504, statusText: 'Hors ligne' });
  }
}

// Cache d'abord, mais on rafraîchit en tâche de fond pour la prochaine fois.
async function cacheEtRevalide(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const reseau = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) return cached;
  const response = await reseau;
  return response ?? new Response('', { status: 504, statusText: 'Hors ligne' });
}

// Navigation : on privilégie le réseau (pour récupérer un déploiement récent),
// et on retombe sur le cache — URL exacte puis index.html.
async function navigation(request) {
  const cache = await caches.open(HTML_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(FALLBACK, response.clone());
    return response;
  } catch (err) {
    return (await cache.match(request))
      ?? (await cache.match(FALLBACK))
      ?? new Response(
        '<!doctype html><meta charset="utf-8"><title>Hors ligne</title>'
        + '<body style="font-family:system-ui;background:#030712;color:#f9fafb;'
        + 'display:flex;align-items:center;justify-content:center;height:100vh;'
        + 'margin:0;text-align:center"><p>Tessitura n’est pas encore disponible '
        + 'hors ligne.<br>Reconnecte-toi une fois pour l’installer.</p></body>',
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      );
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Échantillons audio distants (R2) : lourds et immuables.
  if (url.href.includes('r2.dev/samples/')) {
    event.respondWith(cacheDAbord(request, SAMPLES_CACHE));
    return;
  }

  // Polices Google : cache d'abord. Elles ne changent jamais à URL constante,
  // et sans elles le rendu hors ligne retombe sur les polices système.
  if (HOTES_POLICES.includes(url.hostname)) {
    event.respondWith(cacheDAbord(request, FONT_CACHE));
    return;
  }

  // Le reste du cross-origin (Firebase surtout) et les écritures passent en
  // direct : Firestore gère lui-même son hors-ligne via IndexedDB.
  if (request.method !== 'GET' || url.origin !== location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigation(request));
    return;
  }

  // Bundles Vite : nom haché → contenu immuable.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheDAbord(request, ASSET_CACHE));
    return;
  }

  // Images, polices, sons de test, CSV des formules…
  if (/\.(png|jpg|jpeg|svg|gif|webp|woff2?|ico|csv|wav|mp3|json)$/.test(url.pathname)) {
    event.respondWith(cacheEtRevalide(request, ASSET_CACHE));
    return;
  }

  event.respondWith(cacheEtRevalide(request, HTML_CACHE));
});
