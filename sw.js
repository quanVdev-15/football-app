const CACHE = 'football-v5';
const STATIC = [
  '/',
  '/index.html',
  '/login.html',
  '/payment.html',
  '/css/style.css',
  '/js/firebase-config.js',
  '/js/utils.js',
  '/js/rsvp.js',
  '/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('firestore') || e.request.url.includes('firebase')) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }))
  );
});

// ── Timer alert notification ──────────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'TIMER_END') {
    self.registration.showNotification('⏰ Hết giờ! Đổi đội!', {
      body: event.data.body || 'Đội chờ vào sân ngay!',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      vibrate: [500, 200, 500, 200, 1000],
      requireInteraction: true,
      tag: 'timer-end',
      renotify: true,
    });
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window' }).then(list => {
    for (const client of list) {
      if (client.url.includes(self.location.origin) && 'focus' in client)
        return client.focus();
    }
    return clients.openWindow('/');
  }));
});
