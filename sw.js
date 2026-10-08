/* Service Worker：只快取「網頁外殼」，MLB 資料一律走網路，不快取。
 * 外殼採「網路優先、離線才用快取」，所以更新網頁後重新開啟就是新版，不會卡在舊版。
 * 若要強制清掉舊快取，修改 VERSION 即可。 */
const VERSION = 'v60';
const CACHE = 'mlb-shell-' + VERSION;
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest',
  'logos/mlb-on-dark.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('mlb-shell-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // 跨網域（statsapi）不攔截
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('index.html')))
  );
});
