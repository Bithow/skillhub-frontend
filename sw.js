// SkillHub Service Worker
// Bump version to force cache refresh on update
const CACHE_NAME = 'skillhub-v3';

// Pages that should NEVER be cached — always require network
const NETWORK_ONLY = [
  '/admin.html'
];

// Static assets safe to cache for offline use
const STATIC_ASSETS = [
  '/index.html',
  '/script.js',
  '/styles.css',
  '/logo.png',
  '/payment-config.js',
  '/manifest.json',
  '/chat.html',
  '/profile.html',
  '/course.html',
  '/create-course.html',
  '/payment.html',
  '/certificate.html',
  '/help.html',
  '/faq.html',
  '/terms.html',
  '/privacy.html',
  '/refund.html'
];

// Offline fallback page — shown when user is offline and page isn't cached
const OFFLINE_FALLBACK = '/index.html';

// Install — cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - API calls          → always network, never cache
// - admin.html         → always network (network-only), no offline fallback
// - everything else    → cache-first, fall back to network, then offline fallback
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Never cache API calls
  if (url.includes('onrender.com') || url.includes('/api/')) return;

  // Network-only for admin panel — never serve from cache
  const isNetworkOnly = NETWORK_ONLY.some((path) => url.includes(path));
  if (isNetworkOnly) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // If offline, return a clear message instead of a broken cached page
        return new Response(
          '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Admin Unavailable</title>' +
          '<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;' +
          'height:100vh;margin:0;background:#f1f5f9;flex-direction:column;gap:1rem;text-align:center;padding:2rem;}' +
          'h2{color:#1e3a8a;}p{color:#64748b;}a{color:#2563eb;font-weight:600;}</style></head>' +
          '<body><h2>&#128274; Admin Panel Unavailable Offline</h2>' +
          '<p>The admin panel requires an internet connection.<br>Please connect and try again.</p>' +
          '<a href="/index.html">&#8592; Go to SkillHub</a></body></html>',
          { headers: { 'Content-Type': 'text/html' } }
        );
      })
    );
    return;
  }

  // Cache-first for everything else
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        // Cache successful responses for static assets
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback
        return caches.match(OFFLINE_FALLBACK);
      });
    })
  );
});
