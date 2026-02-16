/* Service Worker – offline-first for app shell (optimized & improved) */

const VERSION = 'v1.2.0'; // Fix: timetable.json network-first
const CACHE = `hgh-school-pwa-${VERSION}`;

// Assets für Offline-Funktionalität
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './data/timetable.json',
  './plan/stundenplan.pdf',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/logo-header.png',
  './icons/logo-lunido.svg',
  './icons/logo-lys.svg',
  './icons/logo-hgh-grid.svg'
];

/**
 * Loggt Meldungen in der Console (nur in Development)
 * @param {string} message - Log-Nachricht
 * @param {any} data - Optional: Zusätzliche Daten
 */
function log(message, data) {
  if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') {
    console.log(`[SW v${VERSION}] ${message}`, data || '');
  }
}

/**
 * Install Event - Cached Assets
 */
self.addEventListener('install', (event) => {
  log('Installing...');
  
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE);
        
        // Cache Assets einzeln für besseres Error-Handling
        const promises = ASSETS.map(async (asset) => {
          try {
            await cache.add(asset);
            log(`Cached: ${asset}`);
          } catch (err) {
            console.warn(`[SW] Failed to cache ${asset}:`, err);
            // Fortfahren trotz Fehler bei einzelnen Assets
          }
        });
        
        await Promise.allSettled(promises);
        
        // Skip waiting, um sofort zu aktivieren
        await self.skipWaiting();
        log('Installation complete, skipping waiting');
      } catch (err) {
        console.error('[SW] Installation failed:', err);
        throw err;
      }
    })()
  );
});

/**
 * Activate Event - Cleanup alter Caches
 */
self.addEventListener('activate', (event) => {
  log('Activating...');
  
  event.waitUntil(
    (async () => {
      try {
        // Lösche alte Caches
        const keys = await caches.keys();
        const deletePromises = keys
          .filter(k => k !== CACHE && k.startsWith('hgh-school-pwa-'))
          .map(k => {
            log(`Deleting old cache: ${k}`);
            return caches.delete(k);
          });
        
        await Promise.all(deletePromises);
        
        // Übernimm Kontrolle über alle Clients sofort
        await self.clients.claim();
        log('Activation complete, claimed clients');
      } catch (err) {
        console.error('[SW] Activation failed:', err);
      }
    })()
  );
});

/**
 * Fetch Event - Cache-Strategie
 */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Nur same-origin Requests behandeln
  if (url.origin !== self.location.origin) {
    return;
  }

  // Ignoriere chrome-extension:// und andere Protokolle
  if (!req.url.startsWith('http')) {
    return;
  }

  // Navigation: Network-first mit Cache-Fallback
  if (req.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(req));
    return;
  }

  // Stundenplan-Daten: Network-first (damit Updates sofort sichtbar sind)
  if (url.pathname.endsWith('/timetable.json')) {
    event.respondWith(handleTimetableRequest(req));
    return;
  }

  // Statische Assets: Cache-first mit Network-Fallback
  event.respondWith(handleAssetRequest(req));
});

/**
 * Behandelt Navigation-Requests (HTML-Seiten)
 * Strategie: Network-first mit Cache-Fallback
 * @param {Request} req - Request-Objekt
 * @returns {Promise<Response>} Response
 */
async function handleNavigationRequest(req) {
  const cache = await caches.open(CACHE);
  
  try {
    // Versuche Network-Request (bevorzugt)
    const fresh = await fetch(req, { 
      cache: 'no-cache',
      // Timeout nach 5 Sekunden
      signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined
    });
    
    if (fresh.ok) {
      // Aktualisiere Cache mit frischer Version
      cache.put('./index.html', fresh.clone());
      log('Navigation: Fresh from network');
      return fresh;
    }
    
    // Fallback zu Cache bei nicht-OK Response
    throw new Error(`Network response not OK: ${fresh.status}`);
  } catch (err) {
    log('Navigation: Falling back to cache', err.message);
    
    // Fallback: Serviere gecachte index.html
    const cached = await cache.match('./index.html');
    
    if (cached) {
      return cached;
    }
    
    // Letzte Option: Offline-Nachricht
    return new Response(
      `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Offline – HGH Hildesheim</title>
  <style>
    body {
      font-family: system-ui, sans-serif;
      display: grid;
      place-items: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-align: center;
    }
    h1 { font-size: 2em; margin: 0 0 0.5em; }
    p { opacity: 0.9; }
  </style>
</head>
<body>
  <div>
    <h1>📡 Offline</h1>
    <p>Keine Internetverbindung verfügbar.</p>
    <p>Bitte prüfe deine Verbindung und versuche es erneut.</p>
  </div>
</body>
</html>`,
      { 
        status: 200, 
        headers: { 
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache'
        } 
      }
    );
  }
}

/**
 * Behandelt Stundenplan-Requests (timetable.json)
 * Strategie: Network-first mit Cache-Fallback (damit Updates sofort sichtbar sind)
 * @param {Request} req - Request-Objekt
 * @returns {Promise<Response>} Response
 */
async function handleTimetableRequest(req) {
  const cache = await caches.open(CACHE);

  try {
    const fresh = await fetch(req, {
      cache: 'no-cache',
      signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined
    });

    if (fresh && fresh.status === 200) {
      cache.put(req, fresh.clone());
      log('Timetable: Fresh from network');
      return fresh;
    }

    throw new Error(`Network response not OK: ${fresh.status}`);
  } catch (err) {
    log('Timetable: Falling back to cache', err.message);

    const cached = await cache.match(req);
    if (cached) {
      return cached;
    }

    return new Response('{}', {
      status: 504,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Behandelt Asset-Requests (CSS, JS, Bilder, etc.)
 * Strategie: Cache-first mit Network-Fallback
 * @param {Request} req - Request-Objekt
 * @returns {Promise<Response>} Response
 */
async function handleAssetRequest(req) {
  const cache = await caches.open(CACHE);
  
  // 1. Versuche Cache zuerst (schneller)
  const cached = await cache.match(req);
  if (cached) {
    log(`Asset from cache: ${req.url.split('/').pop()}`);
    
    // Update im Hintergrund (stale-while-revalidate)
    updateCacheInBackground(req, cache);
    
    return cached;
  }
  
  // 2. Falls nicht im Cache: Hole vom Netzwerk
  try {
    const fresh = await fetch(req, {
      cache: 'no-cache'
    });
    
    // Cache nur erfolgreiche Responses
    if (fresh && fresh.status === 200 && fresh.type === 'basic') {
      cache.put(req, fresh.clone());
      log(`Asset cached from network: ${req.url.split('/').pop()}`);
    }
    
    return fresh;
  } catch (err) {
    log(`Asset fetch failed: ${req.url.split('/').pop()}`, err.message);
    
    // Fallback: Leere Response mit Fehlercode
    return new Response('', { 
      status: 504,
      statusText: 'Gateway Timeout' 
    });
  }
}

/**
 * Aktualisiert Cache im Hintergrund (stale-while-revalidate)
 * @param {Request} req - Request-Objekt
 * @param {Cache} cache - Cache-Objekt
 */
async function updateCacheInBackground(req, cache) {
  try {
    const fresh = await fetch(req, { cache: 'no-cache' });
    
    if (fresh && fresh.status === 200 && fresh.type === 'basic') {
      await cache.put(req, fresh);
      log(`Background update: ${req.url.split('/').pop()}`);
    }
  } catch (err) {
    // Fehler ignorieren - alte Version bleibt im Cache
    log(`Background update failed: ${req.url.split('/').pop()}`);
  }
}

/**
 * Message Event - Kommunikation mit Client
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    log('Received SKIP_WAITING message');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: VERSION });
  }
});

log('Service Worker loaded');
