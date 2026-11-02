// ATRG service worker — enables Add to Home Screen / app install.
// Network-first for everything: visitors always get the freshest site,
// cache is only a fallback when offline.
// SITE_TURNSTILE_2026_11_02 (staged): cache bumped to atrg-v4 and
// /turnstile.js added to the shell so no visitor can be served the
// pre-Turnstile script.js / atr-forms.js from an old cache.
const CACHE = "atrg-v4";
const CORE = [
  "/",
  "/index.html",
  "/styles.css",
  "/script.js",
  "/turnstile.js",
  "/manifest.webmanifest",
  "/images/icon-192.png",
  "/images/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
