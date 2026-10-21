/*
 * 0x Sneaky Alpha service worker. Licensed under GPL-3.0.
 * Caches only this app's own files so the shell opens offline. It never touches
 * cross-origin requests, so provider calls (and the API keys in them) bypass it.
 */
const VERSION = '__VERSION__';
const CACHE = '0x-sneaky-alpha-shell-' + VERSION;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('0x-sneaky-alpha-shell-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html', { ignoreVary: true }).then((hit) => hit || fetch(req)),
    );
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit || fetch(req)),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'version') event.source && event.source.postMessage({ version: VERSION });
});
