// Offline support: network-first for the app's own files, falling back to the cache.
// Bump VERSION when shipping changes that must replace cached files.
const VERSION = 'regfit-v7';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'js/app.js',
  'js/util.js',
  'js/store.js',
  'js/views/today.js',
  'js/views/clients.js',
  'js/views/client.js',
  'js/views/session.js',
  'js/views/library.js',
  'js/views/settings.js',
  'js/views/export.js',
  'js/pdf.js',
  'vendor/jspdf.umd.min.js',
  'fonts/Manrope-Medium.ttf',
  'fonts/Manrope-ExtraBold.ttf',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's HTTP cache so a new version never precaches stale files.
  e.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !isFont) return;
  // Own files: revalidate with the server every time (GitHub Pages lets browsers reuse files for
  // 10 minutes, which can mix old and new modules after a deploy). Cheap: unchanged files are a 304.
  const network = isFont ? fetch(req) : fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }));
  e.respondWith(
    network
      .then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html')))
  );
});
