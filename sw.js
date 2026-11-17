// Offline support. Network first, skipping the HTTP cache so an update arrives in one piece;
// if the network is slow (3 s) or gone, use the last copy that worked.
const CACHE = 'sharp-v1';
const FILES = ['./', 'index.html', 'style.css', 'manifest.json', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png',
  'js/core.js', 'js/faces.js', 'js/scene.js', 'js/content.js', 'js/bank.js', 'js/convo.js', 'js/witness.js', 'js/app.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  const cached = () => caches.match(e.request, { ignoreSearch: true });
  const net = fetch(e.request, { cache: 'no-cache' }).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  });
  const slow = new Promise((r) => setTimeout(r, 3000)).then(cached).then((hit) => hit || net);
  e.respondWith(Promise.race([net, slow]).catch(() => cached()));
});
