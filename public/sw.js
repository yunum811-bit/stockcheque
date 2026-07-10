// Service Worker for Stock Cheque PWA
const CACHE_NAME = 'stockcheque-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Network first strategy - always get fresh data from server
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
