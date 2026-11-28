/* 히로시마 여행: 데이터가 약할 때도 열리게 하는 저장소(서비스 워커).
   - 페이지(html): 인터넷 먼저, 안 되면 저장본
   - 지도 바탕(openfreemap): 저장본 먼저, 없으면 받아서 저장 (최대 약 6000개)
   - 라이브러리·아이콘·사진: 저장본 먼저, 뒤에서 새로 받아 둠
   - 구글 시트 공유, 날씨 예보는 저장하지 않음 */
const PAGES = 'hiro-pages-v1', ASSETS = 'hiro-assets-v1', TILES = 'hiro-tiles-v1', TILE_MAX = 6000;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(PAGES).then((c) => Promise.all(['./', './map.html', './print.html'].map((u) =>
    fetch(u, { cache: 'reload' }).then((r) => (r.ok ? c.put(u, r) : null)).catch(() => null)))));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('hiro-') && ![PAGES, ASSETS, TILES].includes(k)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

let tilePuts = 0;
async function trimTiles() {
  const c = await caches.open(TILES); const ks = await c.keys();
  if (ks.length > TILE_MAX) await Promise.all(ks.slice(0, ks.length - TILE_MAX).map((k) => c.delete(k)));
}

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.hostname === 'script.google.com' || u.hostname.endsWith('googleusercontent.com') || u.hostname.endsWith('open-meteo.com') || u.hostname.endsWith('routing.openstreetmap.de')) return;

  // 페이지: 인터넷 먼저
  if (r.mode === 'navigate' || (u.origin === location.origin && u.pathname.endsWith('.html'))) {
    e.respondWith(fetch(r).then((res) => {
      if (res.ok) { const cp = res.clone(); caches.open(PAGES).then((c) => c.put(u.pathname.endsWith('/') ? './' : r, cp)); }
      return res;
    }).catch(() => caches.match(r, { ignoreSearch: true }).then((m) => m || caches.match(u.pathname.endsWith('map.html') ? './map.html' : './'))));
    return;
  }
  // 지도 바탕: 저장본 먼저
  if (u.hostname.endsWith('openfreemap.org')) {
    e.respondWith(caches.open(TILES).then((c) => c.match(r).then((m) => m || fetch(r).then((res) => {
      if (res.ok) { c.put(r, res.clone()); if (++tilePuts % 200 === 0) trimTiles(); }
      return res;
    }))));
    return;
  }
  // 같은 사이트 파일·라이브러리·글꼴: 저장본 먼저 + 뒤에서 갱신
  if (u.origin === location.origin || /(^|\.)(jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(u.hostname)) {
    e.respondWith(caches.open(ASSETS).then((c) => c.match(r).then((m) => {
      const f = fetch(r).then((res) => { if (res.ok || res.type === 'opaque') c.put(r, res.clone()); return res; }).catch(() => m);
      return m || f;
    })));
  }
});
