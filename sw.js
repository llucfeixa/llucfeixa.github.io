// Mi Cineteca — service worker
// Strategy: network-first for the app shell (HTML/CSS/JS) so users always get
// the latest code when online, falling back to cache when offline. Firebase
// and TMDB requests are never intercepted — they always go straight to the
// network, since caching auth/API responses could show stale or wrong data.
//
// Bump CACHE_NAME whenever you want to force clients to drop old cached files.
const CACHE_NAME = 'cineteca-shell-v1';

const APP_SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/utils.js',
  './js/firebase-config.js',
  './js/api.js',
  './js/state.js',
  './js/render.js',
  './js/scroll.js',
  './js/discover.js',
  './js/calendar.js',
  './js/stats.js',
  './js/modal.js',
  './js/edit.js',
  './js/social.js',
  './js/main.js',
  './js/storage.js',
  './js/logic.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(err => console.warn('SW precache failed (non-fatal):', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET requests on our own origin. Everything else (Firebase,
  // TMDB, Google fonts, auth popups, etc.) passes straight through untouched.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(res => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
        return res;
      })
      .catch(() =>
        caches.match(req).then(cached => cached || caches.match('./index.html'))
      )
  );
});
