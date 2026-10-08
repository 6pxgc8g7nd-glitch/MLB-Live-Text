/* Service Worker：只快取「網頁外殼」，MLB 資料一律走網路，不快取。
 * 外殼採「網路優先、離線才用快取」，所以更新網頁後重新開啟就是新版，不會卡在舊版。
 * 若要強制清掉舊快取，修改 VERSION 即可。 */
const VERSION = 'v84';
const CACHE = 'mlb-shell-' + VERSION;
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'mock.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'logos/108.svg',
  'logos/109.svg',
  'logos/110.svg',
  'logos/111.svg',
  'logos/112.svg',
  'logos/113.svg',
  'logos/114.svg',
  'logos/115.svg',
  'logos/116.svg',
  'logos/117.svg',
  'logos/118.svg',
  'logos/119.svg',
  'logos/120.svg',
  'logos/121.svg',
  'logos/133.svg',
  'logos/134.svg',
  'logos/135.svg',
  'logos/136.svg',
  'logos/137.svg',
  'logos/138.svg',
  'logos/139.svg',
  'logos/140.svg',
  'logos/141.svg',
  'logos/142.svg',
  'logos/143.svg',
  'logos/144.svg',
  'logos/145.svg',
  'logos/146.svg',
  'logos/147.svg',
  'logos/158.svg',
  'logos/league-103.svg',
  'logos/league-104.svg',
  'logos/mlb-on-dark.svg'];

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
  // 隊徽、圖示幾乎不會變：快取優先，不再每次重新驗證
  if (/\/(logos|icons)\//.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
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
