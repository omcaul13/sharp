// Offline support: network first (so updates show up right away), falling back to the cached copy when offline.
const CACHE = 'sharp-v1';
const FILES = ['./', 'index.html', 'style.css', 'manifest.json', 'icon.svg', 'js/core.js', 'js/faces.js', 'js/scene.js', 'js/content.js', 'js/bank.js', 'js/convo.js', 'js/witness.js', 'js/app.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
