// ATRG service worker — enables Add to Home Screen / app install.
// Network-first for everything: visitors always get the freshest site,
// cache is only a fallback when offline.
const CACHE = "atrg-v1";
const CORE = [
  "/",
  "/index.html",
  "/styles.css",
  "/script.js",
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
