// ATRG service worker — enables Add to Home Screen / app install.
// Network-first for everything: visitors always get the freshest site,
// cache is only a fallback when offline.
// SITE_TURNSTILE_2026_11_02 (staged): cache bumped to atrg-v5 (check-in dropdowns) and kept at atrg-v5 for REPAIR_FLOW_UPDATE_2026_11_05 (shipped live in 6cf016a).
// ATRONE_QR_2026_11_05: bumped to atrg-v6 for the account card / member QR release, and
// /turnstile.js added to the shell so no visitor can be served the
// pre-Turnstile script.js / atr-forms.js from an old cache.
// FEE_SPLIT_2026_11_05: bumped to atrg-v7 for the $15 / $35 visit-fee split.
// QR_FIX_PASS_2026_11_05: bumped to atrg-v8 for the account drop-down,
// no-QR-at-rest card, tap-to-enlarge popup, and Scan In popup fixes.
const CACHE = "atrg-v8";
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
