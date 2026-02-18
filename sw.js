/* Service Worker – offline-first for app shell (v1.4.0, optimiert) */

const VERSION = 'v1.4.0';
const CACHE = `hgh-school-pwa-${VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './data/timetable.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/logo-header.png',
  './icons/logo-lunido.svg',
  './icons/logo-lys.svg',
  './icons/logo-hgh-grid.svg'
];

const isDev = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';
const log = isDev ? (msg, data) => console.log(`[SW ${VERSION}] ${msg}`, data || '') : () => {};

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Offline – HGH Hildesheim</title>
  <style>
    body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:20px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;text-align:center}
    h1{font-size:2em;margin:0 0 .5em}p{opacity:.9}
  </style>
</head>
<body>
  <div>
    <h1>Offline</h1>
    <p>Keine Internetverbindung verfügbar.</p>
    <p>Bitte prüfe deine Verbindung und versuche es erneut.</p>
  </div>
</body>
</html>`;

// --- Install ---
self.addEventListener('install', event => {
  log('Installing…');
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled(
        ASSETS.map(asset =>
          cache.add(asset).catch(err => console.warn(`[SW] Cache miss: ${asset}`, err))
        )
      )
    ).then(() => self.skipWaiting())
  );
});

// --- Activate ---
self.addEventListener('activate', event => {
  log('Activating…');
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE && k.startsWith('hgh-school-pwa-')).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// --- Fetch ---
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Nur same-origin und HTTP(S)
  if (url.origin !== self.location.origin || !request.url.startsWith('http')) return;

  event.respondWith(
    request.mode === 'navigate' ? handleNavigation(request) : handleAsset(request)
  );
});

async function handleNavigation(req) {
  const cache = await caches.open(CACHE);
  try {
    const opts = { cache: 'no-cache' };
    if (AbortSignal.timeout) opts.signal = AbortSignal.timeout(5000);
    const fresh = await fetch(req, opts);
    if (fresh.ok) {
      cache.put('./index.html', fresh.clone());
      return fresh;
    }
    throw new Error(fresh.status);
  } catch {
    const cached = await cache.match('./index.html');
    if (cached) return cached;
    return new Response(OFFLINE_HTML, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }
    });
  }
}

async function handleAsset(req) {
  const cache = await caches.open(CACHE);

  // Cache-first
  const cached = await cache.match(req);
  if (cached) {
    // Stale-while-revalidate im Hintergrund
    fetch(req, { cache: 'no-cache' })
      .then(r => r?.status === 200 && r.type === 'basic' && cache.put(req, r))
      .catch(() => {});
    return cached;
  }

  // Network-Fallback
  try {
    const fresh = await fetch(req, { cache: 'no-cache' });
    if (fresh?.status === 200 && fresh.type === 'basic') {
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch {
    return new Response('', { status: 504, statusText: 'Gateway Timeout' });
  }
}

// --- Messages ---
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'GET_VERSION') event.ports[0]?.postMessage({ version: VERSION });
});

log('Service Worker loaded');
