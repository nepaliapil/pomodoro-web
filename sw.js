// Offline support. App files are fetched network-first, so an update shows up on the
// next load with no version bump needed; the cache is only the offline fallback.
const CACHE = 'pomodoro-v3';
const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'config.js', 'callback.html',
  'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // Hosts like GitHub Pages let browsers reuse files for 10 minutes, which can pair a new
    // index.html with an old styles.css. 'no-cache' makes the browser check with the server
    // each time (cheap: unchanged files come back as a tiny 304). Page loads can't take
    // options, so they're fetched as-is.
    event.respondWith(
      (req.mode === 'navigate' ? fetch(req) : fetch(req, { cache: 'no-cache' }))
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html')))
    );
  } else if (FONT_HOSTS.includes(url.hostname)) {
    // Fonts never change at a given URL: serve from cache, fill it on first use.
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }))
    );
  }
  // Everything else (Spotify, YouTube, Google APIs) goes straight to the network.
});

// Clicking a "timer finished" notification brings the app back to the front.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).origin === self.location.origin);
      return open ? open.focus() : self.clients.openWindow('./');
    })
  );
});
