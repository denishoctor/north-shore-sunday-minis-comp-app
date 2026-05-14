/**
 * North Shore Minis Sunday Rugby — service worker.
 *
 * Strategy:
 *   - HTML navigations         → network-first with cache fallback
 *     (so a fresh deploy lands without a manual SHELL_CACHE bump; cache
 *     only wins when the user is offline)
 *   - other same-origin assets → stale-while-revalidate
 *     (instant render from cache, refreshed in the background — keeps
 *     render.mjs / config.js / manifest / icons updates one reload away)
 *   - cross-origin CDN images  → network-first with cache fallback
 *
 * Bumping SHELL_CACHE / DATA_CACHE versions still helps when an asset is
 * removed or renamed entirely. The activate handler deletes any cache that
 * doesn't match the current pair.
 */

const SHELL_CACHE = 'nsm-sunday-shell-v8';
const DATA_CACHE  = 'nsm-sunday-data-v8';

const SHELL_FILES = [
  './',
  'index.html',
  'venues.html',
  'clubs.html',
  'render.mjs',
  'config.js',
  'manifest.webmanifest',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-512-maskable.png',
  'assets/apple-touch-icon-180.png',
  'assets/sunday-minis-logo-w-bg.png',
  'favicon.svg',
];

const DATA_PATHS = ['fixtures.json', 'lineups.json'];

self.addEventListener('install', (event) => {
  // Don't fail install if a single non-critical asset is missing on first
  // deploy (icons + logo are committed before the python icon-gen runs).
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      Promise.all(SHELL_FILES.map((f) =>
        cache.add(f).catch((err) => console.warn(`sw install: skipped ${f}: ${err.message}`))
      ))
    ).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((n) => n !== SHELL_CACHE && n !== DATA_CACHE).map((n) => caches.delete(n)),
    )).then(() => self.clients.claim()),
  );
});

function isDataRequest(url) {
  if (url.origin !== self.location.origin) return false;
  return DATA_PATHS.some((p) => url.pathname.endsWith('/' + p))
      || url.pathname.endsWith('.ics');
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => cached);
  return cached || network;
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(request) || await cache.match('index.html') || await cache.match('./');
    if (cached) return cached;
    return new Response(OFFLINE_HTML, {
      status: 503,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }
}

const OFFLINE_HTML = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline — North Shore Minis Sunday Rugby</title>
<style>
  :root { color-scheme: light; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         background: #0a2059; color: #f7f5ef; margin: 0;
         min-height: 100vh; display: grid; place-items: center; padding: 24px; }
  .card { max-width: 32rem; text-align: center; }
  h1 { margin: 0 0 12px; font-size: 1.5rem; }
  p  { margin: 8px 0; opacity: .85; line-height: 1.4; }
  button { margin-top: 18px; padding: 10px 18px; border-radius: 999px;
           border: 1px solid #f7f5ef; background: transparent; color: inherit;
           font: inherit; cursor: pointer; }
</style>
<div class="card">
  <h1>Offline</h1>
  <p>You're not connected, and we haven't cached this page yet.</p>
  <p>If you've visited the site before, try opening the home page — the calendar and your subscribed team's fixtures will still be available.</p>
  <button type="button" onclick="location.reload()">Try again</button>
</div>
`;

async function networkFirstCrossOrigin(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    // CDN crests etc. — keep the page resilient when offline.
    event.respondWith(networkFirstCrossOrigin(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isDataRequest(url)) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
});
