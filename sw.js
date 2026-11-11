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
// QR_FIX_PASS_2_2026_11_05: bumped to atrg-v9 — account overlay retired
// for a page, flat portal-style drop-downs, card QR restored by the
// member's name, and the quick-glance header drop-down.
// CUSTOMER_INBOX_2026_11_05: bumped to atrg-v10 — the Messages inbox
// drop-down on the account page with the unread notification.
// ACCOUNT_FIX_PASS_3_2026_11_06: bumped to atrg-v11 — the header
// account button toggles (tap again to leave the account page), the
// duplicate Schedule a repair row and the card instruction note are
// removed, the voucher strip tap actually reveals the vouchers, the
// account human checks render when their view opens instead of at
// page load inside hidden views, and the footer gains the plain
// Cloudflare line.
// ACCOUNT_FIX_PASS_3_1_2026_11_06: bumped to atrg-v12 — the Messages
// panel's "Send us a message" button no longer dead-ends on an
// account with no repairs: the tap routes straight to Schedule a
// repair instead of only un-hiding a quiet note in place.
// ACCOUNT_FIX_PASS_3_2_2026_11_06: bumped to atrg-v13 — the owner's
// final shape for that button supersedes the v12 routing: it opens a
// composer right in the Messages panel for every customer (general
// messages land in the same public.messages store), and the header
// gains its own cart button with the quick-glance drop-down.
// DISCLAIMER_BRANDS_2026_11_06: bumped to atrg-v14 — the footer
// trademark disclaimer now names every brand used on the site
// (informational use only, no affiliation).
// ACCOUNT_FIX_PASS_3_3_2026_11_06: bumped to atrg-v15 — My Account
// gains its own Cart drop-down row directly before Account
// Settings (replacing the old plain Cart row in that slot), painted
// from the same cart state as the Shop glance and the drawer, and
// the header cart button and its glance pass 3.2 added are REMOVED
// (the owner's final ruling: no separate cart button in the header;
// the cart lives inside My Account). This pass also folds in
// CART_STORAGE_GUARD_2026_11_06: a non-object saved cart or points
// map now self-heals to empty instead of silently blocking adds.
// ACCOUNT_FIX_PASS_3_4_2026_11_06: bumped to atrg-v17 — shop
// tap-to-detail (cards open a product detail view; Add to cart
// lives there), the account page opens with every drop-down
// closed (Repairs no longer starts expanded), wizard estimates
// SUM the selected repairs under "Your estimated repair price",
// and the iPad Pro 12.9-inch wizard row carries its generation
// qualifier.
/* NAV_PUBLISH_MERGE_2026_11_06: nav set hand-merged onto the ATR One
   set (9dd096e); both parents claimed atrg-v18, so the merged cache
   is bumped to atrg-v19. Network-first fetch handler unchanged. */
/* ATRONE_POINTS_TIERS_2026_11_06: bumped to atrg-v18 — ATR One Free/Plus naming, tiered points rates, the centered Free plan block, and the Manage Membership row. */
// NAV_SEARCH_CLEANUP_2026_11_06: bumped to atrg-v18 — nav names
// lose their pill/bubble styling (Apple-style plain text links),
// the Shop name leaves the top nav and the slide-out menu (the
// Shop page itself stays, reachable by search, the footer, and
// the account links), and a site-wide search (pages, repairs &
// prices, shop items) lands in the header.
/* FOOTER_PUBLISH_MERGE_2026_11_06: bumped to atrg-v21 — nine-column footer (Account / For Business / For Organizations), Education / Healthcare / Government audience pages, refreshed Business page, About Leadership section, centered footer bottom strip. */
/* GIFT_CARDS_2026_11_06 (publish merge onto 63635d2): bumped to atrg-v26 — Rewards & Vouchers becomes Rewards & Gift Cards; e-gift cards live in the account (own-cards list, add-a-code claim, Square buy link slot). */
/* VOUCHER_TAP_FIX_2026_11_06: rides atrg-v26 — the voucher strip tap is open-only behind the shared __atrVoucherStripWired flag (no more double-toggle with the safety net), and voucher/gift cards in the panel answer taps with a show-at-the-visit state. */
/* MY_DEVICES_2026_11_06 (publish merge onto the gift-cards merge set): bumped to atrg-v27 — My Devices in the account. */
/* SEARCH_TWO_X_2026_11_06: bumped to atrg-v29 — the search overlay
   gains two X controls: the small in-field X clears (and exits on a
   second tap once empty); a bigger circled X at the far right end of
   the search row closes search outright. */
/* REPAIR_TIMELINE_2026_11_06: bumped to atrg-v30 — the repair
   detail in My Account gains the job timeline (stage states from
   the ticket's real status + its own part rows; no invented data). */
/* THREE_DOORS_2026_11_06: bumped to atrg-v31 — the home page
   gains three intent doors under the hero (Repair It / Set It Up /
   Teach Me) riding the shared booking-form entry wiring. */
/* REPAIR_OR_REPLACE_2026_11_06: bumped to atrg-v32 — the Repair
   or Replace helper page lands (same price book, customer-entered
   replacement cost, one printed rule of thumb; no invented values). */
/* SUPPORT_PACKAGES_2026_11_06: bumped to atrg-v33 — five ready-made
   one-on-one help packages land on the classes page (time quoted
   pure at $25/hr; the $15 visit fee stays a separate line). */
/* HELP_GUIDES_2026_11_06: bumped to atrg-v34 — six free customer
   help guides land on their own page (scams, full storage, Wi-Fi
   dead spots, printers, moving to a new phone, photo backups),
   each ending with the one-on-one offer; script.js and styles.css
   are unchanged. */
/* NAV_DEDUPE_2026_11_07: bumped to atrg-v35 — mobile menu deduped against the bottom bar (menu holds only What We Service, About, ATR One, Reviews). */
/* NAV_STORE_2026_11_07: bumped to atrg-v36 — Store added to the desktop nav and the mobile menu (it had no nav home and repeats no bottom-bar item). */
/* IMAGE_SLIM_2026_11_07: bumped to atrg-v38 — all site images recompressed (22.3 MB to 9.2 MB, same filenames/formats) so the new copies reach every visitor. */
/* BRAND_BUTTON_SHADE_2026_11_08: bumped to atrg-v39 — orange buttons darkened one shade to #C24A09 for readability (owner decision Nov 8, 2026); --brand itself unchanged. */
/* HOMEPAGE_SLIM_2026_11_08: bumped to atrg-v40 — homepage slimmed (repeated one-on-one pitches cut to the carousel + doors, Every device row removed, plain ATR One Free/Plus summary added). */
/* NAV_ONE_ON_ONE_2026_11_08: bumped to atrg-v41 — One-on-One added to desktop nav and mobile menu (after Store); footer Accessibility moved out of Legal into its own column. */
/* CABLING_DOOR_2026_11_08: bumped to atrg-v42 — the Internet Cabling page gets its one door: a service card at the end of the Networking page (it had zero inbound links). */
/* TEAM_OFF_SITE_2026_11_08: public Leadership staff listing removed from the website. */
/* SERVICES_SINGLE_DOOR_2026_11_09: bumped to atrg-v49 — Services single-door release (nav, Services flow, Prices folded in, holiday slide, icon set, tile icons). */
/* LEARNING_SYSTEM_2026_11_09: bumped to atrg-v50 — the site now learns from real completed jobs (service_stats): most-booked repairs rise in a model's booking grid and estimates gain a factual typical-price line. (atrg-v48 was the booking-form escape fix and atrg-v49 the Services single-door release; both published ahead of this one, so the learning layer lands on v50.) */
/* V82_2026_11_10: bumped to atrg-v85 — Virtual One-on-One (ATRG Connect guest page + ATRG Remote portal console), booking flow with Virtual path and Square first-hour pay step, login-speed pass (Turnstile fresh token at submit, passkey groundwork), header cart bag (mobile) + staff Portal gear restyle, account record match fix (find the guest by account first), app-version visibility (guest_app_versions), Google review links to our own g.page link, home feature rows alternate (desktop) and stack picture-first on phones. */
const CACHE = "atrg-v104";
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
