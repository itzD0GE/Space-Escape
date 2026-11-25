// Service worker: makes the game installable and playable offline.
// Game files are served from cache and refreshed in the background; API calls always go
// to the network. Bump CACHE when shipping a release so old files are dropped.
const CACHE = 'space-escape-2.1.0';
const CORE = [
  '404.shtml', 'manifest.webmanifest',
  'js/main.js', 'js/sim.js', 'js/render.js', 'js/audio.js', 'js/input.js', 'js/bot.js', 'js/replay.js', 'js/net.js', 'js/meta.js', 'js/ui.js', 'js/data.js', 'js/bosses.js', 'js/rng.js',
  'assets/player-ship-tier-1.png', 'assets/player-ship-tier-2.png', 'assets/player-ship-tier-3.png', 'assets/player-ship-tier-4.png', 'assets/player-ship-tier-5.png', 'assets/player-ship-tier-6.png',
  'assets/donut-matcha.png', 'assets/donut-cinnamon.png', 'assets/donut-vanilla.png', 'assets/donut-strawberry.png', 'assets/donut-blueberry.png',
  'assets/boba-tea-boss.svg', 'assets/boss-lilo.webp', 'assets/nebula-bg.jpg', 'assets/icon-192.png', 'assets/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(e.request);
    // no-cache: always revalidate with the server, whatever cache lifetime the host sets
    const fresh = fetch(e.request, { cache: 'no-cache' }).then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; }).catch(() => hit);
    return hit || fresh;
  }));
});
