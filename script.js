/* ==========================================================================
   AUSTIN'S TECH REPAIR GROUP — SITE SCRIPT
   Router + repair wizard + lead capture.
   SITE_AUDIT_FIXES_2026_10_30: wizard step 4 is now the full intake
   form (one form, one insert path — see atr-forms.js).
   ========================================================================== */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {

    /* ---------------- Page router ---------------- */
    var pages = document.querySelectorAll('.page');
    var navLinks = document.querySelectorAll('[data-page]');

    function switchPage(targetId) {
      var cleanId = String(targetId || '').replace('#', '');
      var found = false;
      pages.forEach(function (page) {
        if (page.id === cleanId) { page.classList.add('active'); found = true; }
        else { page.classList.remove('active'); }
      });
      if (!found && pages.length > 0) {
        document.getElementById('home').classList.add('active');
        cleanId = 'home';
      }
      navLinks.forEach(function (link) {
        link.classList.toggle('active', link.getAttribute('data-page') === cleanId);
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    document.body.addEventListener('click', function (e) {
      var target = e.target.closest('[data-page]');
      if (target) {
        var href = target.getAttribute('href');
        if (href && href.charAt(0) === '#') {
          e.preventDefault();
          if (window.location.hash !== href) { window.location.hash = href; }
          switchPage(href);
          var guideId = target.getAttribute('data-guide');
          if (guideId) { setTimeout(function () { var el = document.getElementById(guideId); if (el) el.scrollIntoView({ behavior: 'auto', block: 'start' }); }, 800); }
          var mobileMenu = document.getElementById('mobile-menu');
          if (mobileMenu) mobileMenu.setAttribute('aria-hidden', 'true');
        }
      }
    });

    if (window.location.hash) { switchPage(window.location.hash); }
    window.addEventListener('hashchange', function () {
      if (window.location.hash) { switchPage(window.location.hash); }
    });

    /* ---------------- Mobile menu ---------------- */
    var bottomMenuToggle = document.getElementById('bottom-menu-toggle');
    var mobileMenu = document.getElementById('mobile-menu');
    var menuClose = document.getElementById('menu-close');
    if (bottomMenuToggle && mobileMenu) {
      bottomMenuToggle.addEventListener('click', function () { mobileMenu.setAttribute('aria-hidden', 'false'); });
    }
    if (menuClose && mobileMenu) {
      menuClose.addEventListener('click', function () { mobileMenu.setAttribute('aria-hidden', 'true'); });
    }

    /* ---------------- Repair wizard ---------------- */
    var repairState = { device: '', brand: '', issue: '', priceRange: '$50 \u2013 $150' };

    var deviceData = {
      'Phone': {
        brands: ['Apple iPhone', 'Samsung Galaxy', 'Google Pixel', 'Other'],
        issues: [
          { name: 'Screen replacement', price: '$89 \u2013 $450' },
          { name: 'Battery replacement', price: '$69 \u2013 $119' },
          { name: 'Charging port repair', price: '$79 \u2013 $129' },
          { name: 'Camera / speaker fix', price: '$79 \u2013 $150' },
          { name: 'Water damage / diagnostic', price: '$49 \u2013 $120' }
        ]
      },
      'Tablet': {
        brands: ['Apple iPad', 'Samsung Galaxy Tab', 'Microsoft Surface', 'Other'],
        issues: [
          { name: 'Screen / digitizer repair', price: '$119 \u2013 $299' },
          { name: 'Battery service', price: '$89 \u2013 $159' },
          { name: 'Charging port repair', price: '$99 \u2013 $149' },
          { name: 'Diagnostic / software', price: '$50 \u2013 $100' }
        ]
      },
      'Computer': {
        brands: ['Apple Mac', 'Dell', 'HP', 'Lenovo', 'Custom PC'],
        issues: [
          { name: 'Laptop screen replacement', price: '$149 \u2013 $320' },
          { name: 'SSD upgrade & OS install', price: '$120 \u2013 $250' },
          { name: 'Virus cleanup & tuneup', price: '$79 \u2013 $130' },
          { name: 'Power / DC jack repair', price: '$110 \u2013 $220' }
        ]
      },
      'Game Console': {
        brands: ['Sony PlayStation', 'Microsoft Xbox', 'Nintendo Switch'],
        issues: [
          { name: 'HDMI port repair', price: '$130 \u2013 $180' },
          { name: 'Overheating / power fault', price: '$90 \u2013 $160' },
          { name: 'Disc drive / storage fix', price: '$80 \u2013 $150' }
        ]
      },
      'Smart Watch': {
        brands: ['Apple Watch', 'Samsung Galaxy Watch', 'Other'],
        issues: [
          { name: 'Screen replacement', price: '$99 \u2013 $199' },
          { name: 'Battery replacement', price: '$79 \u2013 $120' }
        ]
      },
      'Business / Other': {
        brands: ['Office / Network', 'POS system', 'Printer / peripheral', 'Other device'],
        issues: [
          { name: 'On-site diagnostic & support', price: '$95/hr + house call' },
          { name: 'Setup / install / cabling', price: 'Custom quote' }
        ]
      }
    };

    var repairCard = document.querySelector('.repair-card');
    if (repairCard) {
      document.querySelectorAll('[data-device]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          repairState.device = btn.getAttribute('data-device');
          repairState.brand = '';
          repairState.issue = '';
          document.querySelectorAll('[data-device]').forEach(function (b) { b.classList.remove('selected'); });
          btn.classList.add('selected');
          populateBrandsAndIssues(repairState.device);
          goToRepairStep(2);
        });
      });

      document.querySelectorAll('.repair-card [data-back]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          goToRepairStep(parseInt(btn.getAttribute('data-back'), 10));
        });
      });

      var contBtn = document.querySelector('[data-action="continue-contact"]');
      if (contBtn) {
        contBtn.addEventListener('click', function () { goToRepairStep(4); });
      }

      /* Lead source: the "How did you hear about us?" dropdown choice, plus
         automatic signals (external referrer hostname, utm_source param).
         Exposed on window so the account ticket insert reuses the same value.
         Format: "google-search", "yelp | ref: yelp.com", "flyer | utm: fb". */
      window.atrLeadSource = function () {
        var parts = [];
        var sel = document.getElementById('leadSourceIntake') || document.getElementById('leadSource');
        var choice = sel ? String(sel.value || '').trim() : '';
        if (choice) parts.push(choice);
        var refHost = '';
        try {
          if (document.referrer) refHost = new URL(document.referrer).hostname.replace(/^www\./, '');
        } catch (err) { refHost = ''; }
        if (refHost && refHost !== window.location.hostname) parts.push('ref: ' + refHost);
        var utm = '';
        try { utm = new URLSearchParams(window.location.search).get('utm_source') || ''; } catch (err) { utm = ''; }
        if (utm) parts.push('utm: ' + String(utm).trim());
        return parts.join(' | ');
      };

    }

    function populateBrandsAndIssues(deviceKey) {
      var data = deviceData[deviceKey] || { brands: ['Standard'], issues: [{ name: 'General repair', price: '$50 \u2013 $150' }] };
      var makeGrid = document.getElementById('make-grid');
      var issueList = document.getElementById('issue-list');

      if (makeGrid) {
        makeGrid.innerHTML = '';
        data.brands.forEach(function (brand) {
          var bBtn = document.createElement('button');
          bBtn.type = 'button';
          bBtn.className = 'option-btn';
          bBtn.style.padding = '0.85rem 0.5rem';
          bBtn.innerHTML = '<span>' + escapeHtml(brand) + '</span>';
          bBtn.addEventListener('click', function () {
            makeGrid.querySelectorAll('.option-btn').forEach(function (b) { b.classList.remove('selected'); });
            bBtn.classList.add('selected');
            repairState.brand = brand;
          });
          makeGrid.appendChild(bBtn);
        });
      }

      if (issueList) {
        issueList.innerHTML = '';
        var grid = document.createElement('div');
        grid.className = 'option-grid';
        data.issues.forEach(function (issue) {
          var iBtn = document.createElement('button');
          iBtn.type = 'button';
          iBtn.className = 'option-btn';
          iBtn.style.alignItems = 'flex-start';
          iBtn.style.textAlign = 'left';
          iBtn.innerHTML = '<strong>' + escapeHtml(issue.name) + '</strong><span style="font-size:0.78rem; color: var(--brand-deep); font-weight:800;">' + escapeHtml(issue.price) + '</span>';
          iBtn.addEventListener('click', function () {
            grid.querySelectorAll('.option-btn').forEach(function (b) { b.classList.remove('selected'); });
            iBtn.classList.add('selected');
            repairState.issue = issue.name;
            repairState.priceRange = issue.price;
            document.getElementById('estimate-price').textContent = issue.price;
            document.getElementById('estimate-summary').innerHTML =
              '<span class="pill"><i class="fas fa-mobile-screen"></i> ' + escapeHtml(repairState.device) + '</span>' +
              '<span class="pill"><i class="fas fa-tag"></i> ' + escapeHtml(repairState.brand || 'Any brand') + '</span>' +
              '<span class="pill"><i class="fas fa-wrench"></i> ' + escapeHtml(repairState.issue) + '</span>';
            goToRepairStep(3);
          });
          grid.appendChild(iBtn);
        });
        issueList.appendChild(grid);
      }
    }

    /* SITE_AUDIT_FIXES_2026_10_30: the guided selections (steps 1-3)
       carry into the intake form at step 4. Fields the customer has
       already filled are never overwritten, and the exact guided issue
       + estimate are exposed on window.atrGuidedSelection so the
       intake submit (atr-forms.js) merges them into the one ticket. */
    var REPAIR_NEEDED_MAP = {
      'Screen replacement': 'Screen replacement',
      'Battery replacement': 'Battery replacement',
      'Charging port repair': 'Charging port repair',
      'Camera / speaker fix': 'Camera / speaker fix',
      'Water damage / diagnostic': 'Water damage / diagnostic',
      'Laptop screen replacement': 'Laptop screen replacement',
      'SSD upgrade & OS install': 'SSD upgrade & OS install',
      'Virus cleanup & tuneup': 'Virus cleanup & tuneup',
      'HDMI port repair': 'HDMI port repair',
      'Overheating / power fault': 'Overheating / power fault',
      'Screen / digitizer repair': 'Screen replacement',
      'Battery service': 'Battery replacement',
      'Power / DC jack repair': 'Charging port repair'
    };
    function prefillIntakeFromGuided() {
      window.atrGuidedSelection = {
        device: repairState.device || '',
        brand: repairState.brand || '',
        issue: repairState.issue || '',
        priceRange: repairState.priceRange || ''
      };
      var g = window.atrGuidedSelection;
      var typeSel = document.getElementById('sr-device-type');
      if (typeSel && !typeSel.value && g.device) typeSel.value = g.device;
      var info = document.getElementById('sr-device-info');
      if (info && !info.value && g.brand) info.value = g.brand;
      var needSel = document.getElementById('sr-repair-needed');
      if (needSel && !needSel.value && REPAIR_NEEDED_MAP[g.issue]) needSel.value = REPAIR_NEEDED_MAP[g.issue];
      var recap = document.getElementById('estimate-recap');
      if (recap && g.issue) {
        recap.hidden = false;
        recap.innerHTML =
          '<span class="pill"><i class="fas fa-mobile-screen"></i> ' + escapeHtml(g.device) + '</span>' +
          '<span class="pill"><i class="fas fa-tag"></i> ' + escapeHtml(g.brand || 'Any brand') + '</span>' +
          '<span class="pill"><i class="fas fa-wrench"></i> ' + escapeHtml(g.issue) + '</span>' +
          '<span class="pill"><i class="fas fa-dollar-sign"></i> Est. ' + escapeHtml(g.priceRange) + '</span>';
      }
    }

    function goToRepairStep(stepNum) {
      var ids = { 1: 'step-device', 2: 'step-issue', 3: 'step-estimate', 4: 'step-contact' };
      document.querySelectorAll('.repair-step').forEach(function (s) { s.classList.remove('active'); });
      var stepEl = document.getElementById(ids[stepNum]);
      if (stepEl) stepEl.classList.add('active');
      document.querySelectorAll('.progress-step').forEach(function (p) {
        var n = parseInt(p.getAttribute('data-step'), 10);
        p.classList.toggle('active', n === stepNum);
        p.classList.toggle('done', n < stepNum);
      });
      var card = document.querySelector('.repair-card');
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (stepNum === 4) prefillIntakeFromGuided();
    }

    function escapeHtml(str) {
      return String(str).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
  });
})();

/* ==================== THEME TOGGLE & COOKIE CONSENT ==================== */
(function () {
  document.addEventListener('DOMContentLoaded', function () {

    // ---- Dark/Light mode ----
    var root = document.documentElement;
    var toggle = document.getElementById('theme-toggle');
    var icon = document.getElementById('theme-icon');

    function setTheme(theme) {
      root.setAttribute('data-theme', theme);
      if (icon) {
        icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
      }
    }
    function applyTheme(theme) {
      setTheme(theme);
      try { localStorage.setItem('atr-theme', theme); } catch (e) {}
    }

    // Saved choice wins. Otherwise follow the device's own dark/light
    // setting — and keep following it live until the visitor picks manually.
    var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    function systemTheme() { return mq && mq.matches ? 'dark' : 'light'; }
    var saved = null;
    try { saved = localStorage.getItem('atr-theme'); } catch (e) {}
    if (saved === 'dark' || saved === 'light') {
      setTheme(saved);
    } else {
      setTheme(systemTheme());
    }
    if (mq && mq.addEventListener) {
      mq.addEventListener('change', function () {
        var s2 = null;
        try { s2 = localStorage.getItem('atr-theme'); } catch (e) {}
        if (s2 !== 'dark' && s2 !== 'light') setTheme(systemTheme());
      });
    }

    if (toggle) {
      toggle.addEventListener('click', function () {
        var current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        applyTheme(current === 'dark' ? 'light' : 'dark');
      });
    }

    // ---- Cookie consent ----
    var banner = document.getElementById('cookie-banner');
    var prefs = document.getElementById('cookie-prefs');
    var acceptBtn = document.getElementById('cookie-accept');
    var rejectBtn = document.getElementById('cookie-reject');
    var customizeBtn = document.getElementById('cookie-customize');
    var functionalBox = document.getElementById('cookie-pref-functional');
    var analyticsBox = document.getElementById('cookie-pref-analytics');

    function getConsent() {
      try {
        var raw = localStorage.getItem('atr-cookie-consent');
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    }

    function saveConsent(consent) {
      try {
        localStorage.setItem('atr-cookie-consent', JSON.stringify(consent));
      } catch (e) {}
      if (banner) banner.hidden = true;
      if (consent && consent.analytics) loadAnalytics();
    }

    // Google Analytics, loaded ONLY when the visitor allows Analytics.
    // No ads, no other tracker. Measurement ID G-HHV6TS3M5J.
    function loadAnalytics() {
      if (window.__atrGaLoaded) return;
      window.__atrGaLoaded = true;
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', 'G-HHV6TS3M5J');
      var s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=G-HHV6TS3M5J';
      document.head.appendChild(s);
    }

    // Show banner only if no consent recorded; honor a past Analytics yes
    var storedConsent = getConsent();
    if (banner && !storedConsent) {
      banner.hidden = false;
    }
    if (storedConsent && storedConsent.analytics) loadAnalytics();

    if (customizeBtn && prefs) {
      customizeBtn.addEventListener('click', function () {
        var isHidden = prefs.hidden;
        prefs.hidden = !isHidden;
        customizeBtn.textContent = isHidden ? 'Save Choices' : 'Customize';
        if (!isHidden) {
          // Save the customized choices
          saveConsent({
            essential: true,
            functional: !!(functionalBox && functionalBox.checked),
            analytics: !!(analyticsBox && analyticsBox.checked),
            at: new Date().toISOString()
          });
        }
      });
    }

    if (acceptBtn) {
      acceptBtn.addEventListener('click', function () {
        saveConsent({ essential: true, functional: true, analytics: true, at: new Date().toISOString() });
      });
    }

    if (rejectBtn) {
      rejectBtn.addEventListener('click', function () {
        saveConsent({ essential: true, functional: false, analytics: false, at: new Date().toISOString() });
      });
    }
  });
})();

/* ==================== ATR SHOP: PRODUCTS & CART ==================== */
(function () {
  document.addEventListener('DOMContentLoaded', function () {

    var PRODUCTS = [
      { id: 'glass-iphone', name: 'Tempered Glass Screen Protector — iPhone', cat: 'Screen Protectors', price: 14.99 },
      { id: 'glass-samsung', name: 'Tempered Glass Screen Protector — Samsung Galaxy', cat: 'Screen Protectors', price: 14.99 },
      { id: 'glass-privacy', name: 'Privacy Tempered Glass Screen Protector — iPhone', cat: 'Screen Protectors', price: 19.99 },
      { id: 'case-clear-iphone', name: 'Clear TPU Case — iPhone', cat: 'Phone Cases', price: 14.99 },
      { id: 'case-rugged-iphone', name: 'Shockproof Rugged Case — iPhone', cat: 'Phone Cases', price: 24.99 },
      { id: 'case-clear-samsung', name: 'Clear TPU Case — Samsung Galaxy', cat: 'Phone Cases', price: 14.99 },
      { id: 'cable-lightning-usbc', name: 'Lightning to USB-C Charging Cable 1.2m', cat: 'Charging Cables', price: 14.99 },
      { id: 'cable-lightning-usba', name: 'Lightning to USB-A Charging Cable 1.2m', cat: 'Charging Cables', price: 12.99 },
      { id: 'cable-usbc-usbc', name: 'USB-C to USB-C 60W Fast-Charge Cable 1m', cat: 'Charging Cables', price: 12.99 },
      { id: 'wall-dual-20w', name: '20W Dual-Port Wall Charger (USB-C + USB-A)', cat: 'Wall Chargers', price: 19.99 },
      { id: 'wall-pd-20w', name: '20W USB-C Fast Wall Charger', cat: 'Wall Chargers', price: 17.99 },
      { id: 'car-dual-usb', name: 'Dual USB Car Charger (Fast Charge)', cat: 'Car Chargers', price: 14.99 },
      { id: 'mag-pad-15w', name: 'Magnetic Wireless Charging Pad 15W', cat: 'Wireless Chargers', price: 29.99 },
      { id: 'station-3in1', name: '3-in-1 Wireless Charging Station', cat: 'Wireless Chargers', price: 44.99 }
    ];

    var grid = document.getElementById('product-grid');
    var cartCount = document.getElementById('cart-count');
    var cartItems = document.getElementById('cart-items');
    var cartTotal = document.getElementById('cart-total');
    var drawer = document.getElementById('cart-drawer');
    var overlay = document.getElementById('cart-overlay');

    function money(n) { return '$' + n.toFixed(2); }

    function getCart() {
      var cart;
      try { cart = JSON.parse(localStorage.getItem('atr-cart') || '{}'); }
      catch (e) { return {}; }
      // Prune entries the current catalog no longer sells (e.g. left in
      // storage from an older catalog): they inflate the cart count, hide
      // from the drawer, and make checkout fail on an unknown item.
      var changed = false;
      Object.keys(cart).forEach(function (k) {
        var known = PRODUCTS.some(function (p) { return p.id === k; });
        if (!known || !(cart[k] > 0)) { delete cart[k]; changed = true; }
      });
      if (changed) { try { localStorage.setItem('atr-cart', JSON.stringify(cart)); } catch (e) {} }
      return cart;
    }
    function saveCart(cart) {
      try { localStorage.setItem('atr-cart', JSON.stringify(cart)); } catch (e) {}
      renderCart();
    }

    function renderProducts(filter) {
      if (!grid) return;
      grid.innerHTML = '';
      PRODUCTS.filter(function (p) {
        return !filter || filter === 'all' || p.cat === filter;
      }).forEach(function (p) {
        var card = document.createElement('article');
        card.className = 'product-card';
        card.innerHTML =
          '<div class="product-media"><img src="images/products/' + p.id + '.jpg" alt="' + p.name + '" loading="lazy"></div>' +
          '<div class="product-body">' +
            '<span class="product-cat">' + p.cat + '</span>' +
            '<h3 class="product-name">' + p.name + '</h3>' +
            '<div class="product-foot">' +
              '<span class="product-price">' + money(p.price) + '</span>' +
              '<button class="add-btn" data-id="' + p.id + '"><i class="fas fa-plus"></i> Add</button>' +
            '</div>' +
          '</div>';
        grid.appendChild(card);
      });
      grid.querySelectorAll('.add-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var cart = getCart();
          var id = btn.getAttribute('data-id');
          cart[id] = (cart[id] || 0) + 1;
          saveCart(cart);
          btn.classList.add('added');
          btn.innerHTML = '<i class="fas fa-check"></i> Added';
          setTimeout(function () {
            btn.classList.remove('added');
            btn.innerHTML = '<i class="fas fa-plus"></i> Add';
          }, 900);
        });
      });
    }

    function cartQty() {
      var cart = getCart();
      return Object.keys(cart).reduce(function (s, k) { return s + cart[k]; }, 0);
    }

    function cartSum() {
      var cart = getCart();
      return Object.keys(cart).reduce(function (s, k) {
        var p = PRODUCTS.find(function (x) { return x.id === k; });
        return s + (p ? p.price * cart[k] : 0);
      }, 0);
    }

    function renderCart() {
      var cart = getCart();
      var ids = Object.keys(cart);
      if (cartCount) cartCount.textContent = cartQty();
      if (cartTotal) cartTotal.textContent = money(cartSum());
      if (!cartItems) return;
      if (!ids.length) {
        cartItems.innerHTML = '<p class="cart-empty">Your cart is empty.<br>Add some accessories to get started.</p>';
        return;
      }
      cartItems.innerHTML = '';
      ids.forEach(function (id) {
        var p = PRODUCTS.find(function (x) { return x.id === id; });
        if (!p) return;
        var div = document.createElement('div');
        div.className = 'cart-item';
        div.innerHTML =
          '<div class="cart-item-info">' +
            '<div class="cart-item-name">' + p.name + '</div>' +
            '<div class="cart-item-price">' + money(p.price) + ' each</div>' +
          '</div>' +
          '<div class="cart-qty">' +
            '<button class="qty-btn" data-act="dec" data-id="' + id + '">&minus;</button>' +
            '<span class="qty-num">' + cart[id] + '</span>' +
            '<button class="qty-btn" data-act="inc" data-id="' + id + '">+</button>' +
          '</div>' +
          '<button class="cart-remove" data-id="' + id + '" aria-label="Remove"><i class="fas fa-trash"></i></button>';
        cartItems.appendChild(div);
      });
      cartItems.querySelectorAll('.qty-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var c = getCart();
          var id = btn.getAttribute('data-id');
          if (btn.getAttribute('data-act') === 'inc') c[id]++;
          else { c[id]--; if (c[id] <= 0) delete c[id]; }
          saveCart(c);
        });
      });
      cartItems.querySelectorAll('.cart-remove').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var c = getCart();
          delete c[btn.getAttribute('data-id')];
          saveCart(c);
        });
      });
    }

    function openCart() {
      if (drawer) drawer.hidden = false;
      if (overlay) overlay.hidden = false;
      document.body.style.overflow = 'hidden';
    }
    function closeCart() {
      if (drawer) drawer.hidden = true;
      if (overlay) overlay.hidden = true;
      document.body.style.overflow = '';
    }

    var openBtn = document.getElementById('cart-open-btn');
    var closeBtn = document.getElementById('cart-close');
    if (openBtn) openBtn.addEventListener('click', openCart);
    if (closeBtn) closeBtn.addEventListener('click', closeCart);
    if (overlay) overlay.addEventListener('click', closeCart);

    var clearBtn = document.getElementById('cart-clear');
    if (clearBtn) clearBtn.addEventListener('click', function () { saveCart({}); });

    var filters = document.getElementById('shop-filters');
    if (filters) {
      filters.querySelectorAll('.filter-chip').forEach(function (chip) {
        chip.addEventListener('click', function () {
          filters.querySelectorAll('.filter-chip').forEach(function (c) { c.classList.remove('active'); });
          chip.classList.add('active');
          renderProducts(chip.getAttribute('data-filter'));
        });
      });
    }

    // Checkout: real payment via the Square checkout function (prices are
    // set server-side; the browser only sends product ids + quantities).
    var SQ_CHECKOUT_URL = 'https://lyujxpuicarblpkdzuuc.supabase.co/functions/v1/square-checkout';
    var SQ_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5dWp4cHVpY2FyYmxwa2R6dXVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNjAxMjQsImV4cCI6MjEwNzczNjEyNH0.io4qD7pw878Xx97yoS6xzclO33aa4QYKENpwIyZ06xg';
    var checkoutBtn = document.getElementById('cart-checkout');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', function () {
        var cart = getCart();
        var items = Object.keys(cart).map(function (id) {
          return { id: id, qty: cart[id] };
        }).filter(function (x) { return x.qty > 0 && PRODUCTS.some(function (p) { return p.id === x.id; }); });
        if (!items.length) return;
        var original = checkoutBtn.innerHTML;
        checkoutBtn.disabled = true;
        checkoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Taking you to secure checkout&hellip;';
        fetch(SQ_CHECKOUT_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + SQ_ANON_KEY,
            'apikey': SQ_ANON_KEY
          },
          body: JSON.stringify({ items: items })
        }).then(function (r) { return r.json(); }).then(function (d) {
          if (d && d.url) { window.location.href = d.url; return; }
          throw new Error('no checkout url');
        }).catch(function () {
          checkoutBtn.disabled = false;
          checkoutBtn.innerHTML = original;
          alert('Checkout hit a snag — please try again, or text us at (937) 280-6243 and we will take your order.');
        });
      });
    }

    renderProducts('all');
    renderCart();
  });
})();

/* ==================== PRICE LOOKUP TOOL ==================== */
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    // Flat-rate pricing from ATRG Master Repair List
    var PRICES = {
      'iphone':           { screen: 89, battery: 68, backglass: 49, chargeport: 59, label: 'iPhone' },
      'ipad':             { screen: 99, battery: 79, backglass: 99, chargeport: 89, label: 'iPad' },
      'watch':            { screen: 119, battery: 49, backglass: 119, chargeport: 89, label: 'Apple Watch' },
      'samsung-budget':   { screen: 67, battery: 39, backglass: 45, chargeport: 49, label: 'Samsung Galaxy (A / M / F series)' },
      'samsung-mid':      { screen: 176, battery: 67, backglass: 49, chargeport: 59, label: 'Samsung Galaxy (S series)' },
      'samsung-premium':  { screen: 349, battery: 59, backglass: 59, chargeport: 69, label: 'Samsung Galaxy (Fold / Flip)' },
      'pixel':            { screen: 100, battery: 39, backglass: 49, chargeport: 59, label: 'Google Pixel' },
      'motorola':         { screen: 69, battery: 39, backglass: 45, chargeport: 49, label: 'Motorola' }
    };
    var REPAIR_LABELS = {
      screen: 'Screen Replacement',
      battery: 'Battery Replacement',
      backglass: 'Back Glass Replacement',
      chargeport: 'Charging Port Repair'
    };

    var brandSel = document.getElementById('pl-brand');
    var repairSel = document.getElementById('pl-repair');
    var result = document.getElementById('pl-result');
    var amount = document.getElementById('pl-amount');
    var note = document.getElementById('pl-note');
    var bookBtn = document.getElementById('pl-book');

    if (!brandSel || !repairSel) return;

    brandSel.addEventListener('change', function () {
      repairSel.disabled = !brandSel.value;
      if (!brandSel.value) {
        repairSel.value = '';
        if (result) { result.hidden = true; result.classList.remove('show'); }
      }
      updateQuote();
    });

    repairSel.addEventListener('change', updateQuote);

    function updateQuote() {
      var brand = brandSel.value;
      var repair = repairSel.value;
      if (!brand || !repair || !PRICES[brand]) {
        if (result) { result.hidden = true; result.classList.remove('show'); }
        return;
      }
      var price = PRICES[brand][repair];
      if (amount) amount.textContent = 'From $' + price;
      if (note) note.textContent = REPAIR_LABELS[repair] + ' for ' + PRICES[brand].label + ' — starting price, parts and labor included. Your final flat price is confirmed for your exact model before booking. A separate $35 house-call fee applies to the visit — due at booking, non-refundable, and it covers travel and a full diagnosis.';
      if (result) { result.hidden = false; result.classList.add('show'); }
      // Store the quote for the repair form
      try {
        sessionStorage.setItem('atr-quote', JSON.stringify({
          device: PRICES[brand].label,
          repair: REPAIR_LABELS[repair],
          price: price
        }));
      } catch (e) {}
    }

    // If user clicks "Book This Repair", the repair page can pick up the quote
    if (bookBtn) {
      bookBtn.addEventListener('click', function () {
        // The data-page handler will navigate; quote is in sessionStorage
      });
    }
  });
})();

/* ==================== ATR CUSTOMER ACCOUNTS & REWARDS ==================== */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://lyujxpuicarblpkdzuuc.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5dWp4cHVpY2FyYmxwa2R6dXVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNjAxMjQsImV4cCI6MjEwNzczNjEyNH0.io4qD7pw878Xx97yoS6xzclO33aa4QYKENpwIyZ06xg';
  var SESSION_KEY = 'atr-account';

  document.addEventListener('DOMContentLoaded', function () {

    var overlay = document.getElementById('acct-overlay');
    var modal = document.getElementById('acct-modal');
    var openBtn = document.getElementById('account-open-btn');
    var closeBtn = document.getElementById('acct-close');
    var acctLabel = document.getElementById('account-label');

    var authView = document.getElementById('acct-auth-view');
    var dashView = document.getElementById('acct-dash-view');
    var tabLogin = document.getElementById('acct-tab-login');
    var tabSignup = document.getElementById('acct-tab-signup');
    var loginForm = document.getElementById('acct-login-form');
    var signupForm = document.getElementById('acct-signup-form');
    var loginEmail = document.getElementById('acct-login-email');
    var signupName = document.getElementById('acct-signup-name');
    var signupEmail = document.getElementById('acct-signup-email');
    var signupPhone = document.getElementById('acct-signup-phone');
    var loginError = document.getElementById('acct-login-error');
    var signupError = document.getElementById('acct-signup-error');
    var dashError = document.getElementById('acct-dash-error');
    var dashName = document.getElementById('acct-dash-name');
    var pointsNum = document.getElementById('acct-points-num');
    var logoutBtn = document.getElementById('acct-logout');

    if (!overlay || !modal) return; // account UI not present

    var sb = null;
    if (window.supabase && window.supabase.createClient) {
      try { sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); }
      catch (e) { sb = null; }
    }

    /* ---------- session helpers ---------- */
    function getSession() {
      try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
      catch (e) { return null; }
    }
    function setSession(s) {
      try {
        if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
        else localStorage.removeItem(SESSION_KEY);
      } catch (e) {}
    }
    function showError(el, msg) {
      if (!el) return;
      el.textContent = msg;
      el.hidden = !msg;
    }

    /* ---------- header state ---------- */
    function firstName(full) {
      return String(full || '').trim().split(/\s+/)[0] || 'there';
    }
    function renderHeader() {
      var s = getSession();
      if (s && acctLabel) {
        var pts = (typeof s.points === 'number') ? s.points : 0;
        acctLabel.textContent = firstName(s.name) + ' · ' + pts + ' pts';
        if (openBtn) openBtn.classList.add('logged-in');
      } else if (acctLabel) {
        acctLabel.textContent = 'Account';
        if (openBtn) openBtn.classList.remove('logged-in');
      }
    }

    /* ---------- modal open/close ---------- */
    function openModal() {
      var s = getSession();
      if (s) { showDashboard(s); }
      else { showAuth(); }
      overlay.hidden = false;
      modal.hidden = false;
      document.body.style.overflow = 'hidden';
    }
    function closeModal() {
      overlay.hidden = true;
      modal.hidden = true;
      document.body.style.overflow = '';
      showError(loginError, '');
      showError(signupError, '');
      showError(dashError, '');
    }

    function showAuth() {
      authView.hidden = false;
      dashView.hidden = true;
    }
    function showDashboard(s) {
      authView.hidden = true;
      dashView.hidden = false;
      dashName.textContent = 'Hi, ' + firstName(s.name) + '!';
      pointsNum.textContent = (typeof s.points === 'number') ? s.points : 0;
    }

    if (openBtn) openBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (overlay) overlay.addEventListener('click', closeModal);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) closeModal();
    });

    /* ---------- tabs ---------- */
    function selectTab(which) {
      var isLogin = which === 'login';
      tabLogin.classList.toggle('active', isLogin);
      tabSignup.classList.toggle('active', !isLogin);
      loginForm.hidden = !isLogin;
      signupForm.hidden = isLogin;
      showError(loginError, '');
      showError(signupError, '');
    }
    if (tabLogin) tabLogin.addEventListener('click', function () { selectTab('login'); });
    if (tabSignup) tabSignup.addEventListener('click', function () { selectTab('signup'); });

    /* ---------- supabase helpers ---------- */
    function validEmail(v) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
    }

    function fetchPoints(customerId, cb) {
      if (!sb) { cb(0); return; }
      sb.from('rewards').select('points').eq('customer_id', customerId).limit(1)
        .then(function (res) {
          var pts = 0;
          if (res.data && res.data.length > 0) pts = res.data[0].points || 0;
          cb(pts);
        })
        .catch(function () { cb(0); });
    }

    function finishLogin(customer) {
      fetchPoints(customer.id, function (pts) {
        var session = {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone || '',
          points: pts
        };
        setSession(session);
        renderHeader();
        showDashboard(session);
      });
    }

    /* ---------- login ---------- */
    if (loginForm) loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      showError(loginError, '');
      var email = String(loginEmail.value || '').trim().toLowerCase();
      if (!validEmail(email)) { showError(loginError, 'Please enter a valid email address.'); return; }
      if (!sb) { showError(loginError, 'Account service is unavailable right now. Please try again later.'); return; }

      var btn = loginForm.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.innerHTML = 'Looking you up…'; }

      sb.from('customers').select('id, name, email, phone').eq('email', email).limit(1)
        .then(function (res) {
          if (btn) { btn.disabled = false; btn.innerHTML = 'Log In <i class="fas fa-arrow-right"></i>'; }
          if (res.error) throw res.error;
          if (!res.data || res.data.length === 0) {
            showError(loginError, 'No account found for that email. Try signing up instead.');
            return;
          }
          finishLogin(res.data[0]);
        })
        .catch(function (err) {
          if (btn) { btn.disabled = false; btn.innerHTML = 'Log In <i class="fas fa-arrow-right"></i>'; }
          showError(loginError, 'Something went wrong. Please try again.');
        });
    });

    /* ---------- signup ---------- */
    if (signupForm) signupForm.addEventListener('submit', function (e) {
      e.preventDefault();
      showError(signupError, '');
      var name = String(signupName.value || '').trim();
      var email = String(signupEmail.value || '').trim().toLowerCase();
      var phone = String(signupPhone.value || '').trim();
      if (!name) { showError(signupError, 'Please enter your name.'); return; }
      if (!validEmail(email)) { showError(signupError, 'Please enter a valid email address.'); return; }
      if (!sb) { showError(signupError, 'Account service is unavailable right now. Please try again later.'); return; }

      var btn = signupForm.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.innerHTML = 'Creating account…'; }

      // Check for existing account first
      sb.from('customers').select('id').eq('email', email).limit(1)
        .then(function (check) {
          if (check.data && check.data.length > 0) {
            throw new Error('exists');
          }
          return sb.from('customers').insert({ name: name, email: email, phone: phone || null }).select('id, name, email, phone').single();
        })
        .then(function (res) {
          if (res.error) throw res.error;
          var customer = res.data;
          // Create rewards row with 0 points
          return sb.from('rewards').insert({ customer_id: customer.id, points: 0 })
            .then(function () { return customer; });
        })
        .then(function (customer) {
          if (btn) { btn.disabled = false; btn.innerHTML = 'Create Account <i class="fas fa-arrow-right"></i>'; }
          finishLogin(customer);
        })
        .catch(function (err) {
          if (btn) { btn.disabled = false; btn.innerHTML = 'Create Account <i class="fas fa-arrow-right"></i>'; }
          if (err && err.message === 'exists') {
            showError(signupError, 'An account already exists for that email. Try logging in instead.');
          } else {
            showError(signupError, 'Something went wrong. Please try again.');
          }
        });
    });

    /* ---------- logout ---------- */
    if (logoutBtn) logoutBtn.addEventListener('click', function () {
      setSession(null);
      renderHeader();
      selectTab('login');
      showAuth();
      closeModal();
    });

    /* ---------- refresh points for existing session ---------- */
    (function refreshSessionPoints() {
      var s = getSession();
      if (s && s.id && sb) {
        fetchPoints(s.id, function (pts) {
          s.points = pts;
          setSession(s);
          renderHeader();
        });
      } else {
        renderHeader();
      }
    })();

    renderHeader();
  });
})();

/* ==================== ATR MY REPAIRS: TICKETS & MESSAGING ====================
   DISABLED 2026-10-29: this legacy module duplicated the account module in
   index.html — both rendered into the same containers (#acct-ticket-list,
   #acct-thread, #acct-messages) with different presentation. The index.html
   inline "ATRG Account Rebuild" module is now the single owner of the
   customer Repairs view. The early return below keeps this IIFE inert: its
   DOMContentLoaded listener is never registered. The module is fully
   self-contained (closure-private, no exports), and nothing else in this
   file calls into it — the separate account/rewards module above and the
   employee hub below are untouched. */
(function () {
  'use strict';
  return; // disabled — see note above

  var SUPABASE_URL = 'https://lyujxpuicarblpkdzuuc.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5dWp4cHVpY2FyYmxwa2R6dXVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNjAxMjQsImV4cCI6MjEwNzczNjEyNH0.io4qD7pw878Xx97yoS6xzclO33aa4QYKENpwIyZ06xg';
  var SESSION_KEY = 'atr-account';

  var STATUSES = ['Awaiting Estimate', 'Awaiting Diagnostics', 'Awaiting Customer Response', 'Awaiting Parts', 'En Route to Customer', 'In Progress', 'Quality Control', 'Ready', 'Job Complete'];
  var STATUS_CLASS = {
    'Awaiting Diagnostics': 'acct-st-waiting',
    'Awaiting Estimate': 'acct-st-waiting',
    'Awaiting Customer Response': 'acct-st-progress',
    'Awaiting Parts': 'acct-st-parts',
    'En Route to Customer': 'acct-st-progress',
    'In Progress': 'acct-st-progress',
    'Quality Control': 'acct-st-progress',
    'Ready': 'acct-st-ready',
    'Job Complete': 'acct-st-done'
  };

  document.addEventListener('DOMContentLoaded', function () {

    var repairsSection = document.getElementById('acct-repairs');
    var ticketList = document.getElementById('acct-ticket-list');
    var newTicketBtn = document.getElementById('acct-new-ticket-btn');
    var threadView = document.getElementById('acct-thread');
    var threadBack = document.getElementById('acct-thread-back');
    var threadInfo = document.getElementById('acct-thread-info');
    var messagesBox = document.getElementById('acct-messages');
    var msgForm = document.getElementById('acct-msg-form');
    var msgInput = document.getElementById('acct-msg-input');
    var msgError = document.getElementById('acct-msg-error');
    var newTicketView = document.getElementById('acct-newticket');
    var newTicketBack = document.getElementById('acct-newticket-back');
    var ticketForm = document.getElementById('acct-ticket-form');
    var ticketError = document.getElementById('acct-ticket-error');

    if (!repairsSection) return; // repairs UI not present

    var sb = null;
    if (window.supabase && window.supabase.createClient) {
      try { sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); }
      catch (e) { sb = null; }
    }

    var currentTicketId = null;
    var pollTimer = null;

    function getSession() {
      try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
      catch (e) { return null; }
    }
    function showError(el, msg) {
      if (!el) return;
      el.textContent = msg;
      el.hidden = !msg;
    }
    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    function fmtDate(iso) {
      try {
        var d = new Date(iso);
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
               d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      } catch (e) { return ''; }
    }

    /* ---------- views ---------- */
    function showRepairsList() {
      stopPolling();
      currentTicketId = null;
      repairsSection.hidden = false;
      threadView.hidden = true;
      newTicketView.hidden = true;
      loadTickets();
    }
    function showThread() {
      repairsSection.hidden = true;
      newTicketView.hidden = true;
      threadView.hidden = false;
    }
    function showNewTicket() {
      stopPolling();
      repairsSection.hidden = true;
      threadView.hidden = true;
      newTicketView.hidden = false;
      showError(ticketError, '');
    }

    /* ---------- ticket list ---------- */
    function loadTickets() {
      var s = getSession();
      if (!s || !s.id) {
        ticketList.innerHTML = '<p class="acct-muted">Log in to see your repairs.</p>';
        return;
      }
      if (!sb) {
        ticketList.innerHTML = '<p class="acct-muted">Repair tracking is unavailable right now.</p>';
        return;
      }
      ticketList.innerHTML = '<p class="acct-muted">Loading your repairs…</p>';
      sb.from('tickets').select('id, device_type, brand, model, issue, status, created_at')
        .eq('customer_id', s.id).order('created_at', { ascending: false })
        .then(function (res) {
          if (res.error) throw res.error;
          var tickets = res.data || [];
          if (!tickets.length) {
            ticketList.innerHTML = '<p class="acct-muted">No repairs yet. Tap <strong>New Request</strong> to book one.</p>';
            return;
          }
          ticketList.innerHTML = tickets.map(function (t) {
            var dev = [t.device_type, t.brand, t.model].filter(Boolean).join(' ');
            var cls = STATUS_CLASS[t.status] || 'acct-st-waiting';
            return '<div class="acct-ticket" data-ticket-id="' + t.id + '">' +
              '<div class="acct-ticket-top"><strong>' + esc(dev || 'Repair') + '</strong>' +
              '<span class="acct-status ' + cls + '">' + esc(t.status) + '</span></div>' +
              '<div class="acct-ticket-meta">' + esc(String(t.issue).slice(0, 90)) +
              (String(t.issue).length > 90 ? '…' : '') + '<br>Opened ' + fmtDate(t.created_at) + '</div>' +
              '</div>';
          }).join('');
        })
        .catch(function () {
          ticketList.innerHTML = '<p class="acct-muted">Could not load repairs. Please try again.</p>';
        });
    }

    ticketList.addEventListener('click', function (e) {
      var card = e.target.closest ? e.target.closest('[data-ticket-id]') : null;
      if (!card) return;
      openThread(card.getAttribute('data-ticket-id'));
    });

    /* ---------- thread ---------- */
    function openThread(ticketId) {
      currentTicketId = ticketId;
      showError(msgError, '');
      msgInput.value = '';
      if (!sb) return;
      sb.from('tickets').select('id, device_type, brand, model, issue, status, created_at')
        .eq('id', ticketId).limit(1).single()
        .then(function (res) {
          if (res.error) throw res.error;
          var t = res.data;
          var dev = [t.device_type, t.brand, t.model].filter(Boolean).join(' ');
          var cls = STATUS_CLASS[t.status] || 'acct-st-waiting';
          threadInfo.innerHTML = '<strong>' + esc(dev || 'Repair') + '</strong> ' +
            '<span class="acct-status ' + cls + '">' + esc(t.status) + '</span><br>' +
            esc(t.issue) + '<br><span style="color:var(--muted)">Opened ' + fmtDate(t.created_at) + '</span>';
          showThread();
          loadMessages();
          startPolling();
        })
        .catch(function () {
          showError(msgError, 'Could not open this repair. Please try again.');
        });
    }

    function loadMessages() {
      if (!sb || !currentTicketId) return;
      sb.from('messages').select('sender, message, created_at')
        .eq('ticket_id', currentTicketId).order('created_at', { ascending: true })
        .then(function (res) {
          if (res.error) throw res.error;
          var msgs = res.data || [];
          if (!msgs.length) {
            messagesBox.innerHTML = '<p class="acct-muted">No messages yet. Say hello — Austin will reply here.</p>';
            return;
          }
          messagesBox.innerHTML = msgs.map(function (m) {
            var who = m.sender === 'tech' ? 'acct-msg-tech' : 'acct-msg-customer';
            return '<div class="acct-msg ' + who + '">' + esc(m.message) +
              '<span class="acct-msg-time">' + fmtDate(m.created_at) + '</span></div>';
          }).join('');
          messagesBox.scrollTop = messagesBox.scrollHeight;
        })
        .catch(function () { /* keep existing messages on poll failure */ });
    }

    function startPolling() {
      stopPolling();
      pollTimer = setInterval(loadMessages, 8000);
    }
    function stopPolling() {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }

    if (threadBack) threadBack.addEventListener('click', showRepairsList);
    if (newTicketBack) newTicketBack.addEventListener('click', showRepairsList);
    if (newTicketBtn) newTicketBtn.addEventListener('click', showNewTicket);

    /* ---------- send message ---------- */
    if (msgForm) msgForm.addEventListener('submit', function (e) {
      e.preventDefault();
      showError(msgError, '');
      var s = getSession();
      var text = String(msgInput.value || '').trim();
      if (!text) return;
      if (!s || !currentTicketId || !sb) {
        showError(msgError, 'Could not send. Please try again.');
        return;
      }
      var btn = msgForm.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      sb.from('messages').insert({ ticket_id: currentTicketId, sender: 'customer', message: text })
        .then(function (res) {
          if (btn) btn.disabled = false;
          if (res.error) throw res.error;
          msgInput.value = '';
          loadMessages();
        })
        .catch(function () {
          if (btn) btn.disabled = false;
          showError(msgError, 'Message failed to send. Please try again.');
        });
    });

    /* ---------- new ticket ---------- */
    if (ticketForm) ticketForm.addEventListener('submit', function (e) {
      e.preventDefault();
      showError(ticketError, '');
      var s = getSession();
      var deviceType = document.getElementById('acct-t-device').value;
      var brand = String(document.getElementById('acct-t-brand').value || '').trim();
      var model = String(document.getElementById('acct-t-model').value || '').trim();
      var issue = String(document.getElementById('acct-t-issue').value || '').trim();
      if (!issue) { showError(ticketError, 'Please describe the problem.'); return; }
      if (!s || !s.id || !sb) { showError(ticketError, 'Please log in again, then try.'); return; }

      var btn = ticketForm.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.innerHTML = 'Submitting…'; }

      sb.from('tickets').insert({
        customer_id: s.id,
        customer_name: s.name || null,
        customer_phone: s.phone || null,
        device_type: deviceType,
        brand: brand || null,
        model: model || null,
        issue: issue,
        status: 'Awaiting Estimate',
        source: (window.atrLeadSource ? window.atrLeadSource() : '') || 'website'
      }).select('id').single()
        .then(function (res) {
          if (btn) { btn.disabled = false; btn.innerHTML = 'Submit Request <i class="fas fa-arrow-right"></i>'; }
          if (res.error) throw res.error;
          // Reset form and open the new ticket thread
          document.getElementById('acct-t-brand').value = '';
          document.getElementById('acct-t-model').value = '';
          document.getElementById('acct-t-issue').value = '';
          openThread(res.data.id);
        })
        .catch(function () {
          if (btn) { btn.disabled = false; btn.innerHTML = 'Submit Request <i class="fas fa-arrow-right"></i>'; }
          showError(ticketError, 'Could not submit. Please try again.');
        });
    });

    /* ---------- refresh ticket list whenever dashboard opens ---------- */
    // Hook into the account modal: when it opens and user is logged in, load tickets.
    var openBtn = document.getElementById('account-open-btn');
    if (openBtn) openBtn.addEventListener('click', function () {
      setTimeout(function () {
        var s = getSession();
        var dashView = document.getElementById('acct-dash-view');
        if (s && dashView && !dashView.hidden) {
          showRepairsList();
        }
      }, 50);
    });

    // If modal closes, stop polling
    var closeBtn = document.getElementById('acct-close');
    var overlay = document.getElementById('acct-overlay');
    if (closeBtn) closeBtn.addEventListener('click', stopPolling);
    if (overlay) overlay.addEventListener('click', stopPolling);
  });
})();

/* SITE_AUDIT_BATCH2_2026_10_30: the dead in-page employee hub (login
   modal + dashboard wiring) was removed. portal.html is the one staff
   portal; the header Portal link and the footer Employee Portal link
   in index.html are unchanged. */

/* ===== Logo color picker ===== */
(function () {
  'use strict';
  var VARIANTS = {
    original: { img: 'images/atr-logo.png', fav: 'favicon-32x32.png' },
    teal: { img: 'images/atr-logo-teal.png', fav: 'images/atr-logo-teal-64.png' },
    orange: { img: 'images/atr-logo-orange.png', fav: 'images/atr-logo-orange-64.png' },
    violet: { img: 'images/atr-logo-violet.png', fav: 'images/atr-logo-violet-64.png' }
  };
  var KEY = 'atr-logo-variant';
  function applyVariant(name) {
    var v = VARIANTS[name] || VARIANTS.original;
    var img = document.getElementById('brand-logo-img');
    if (img) img.src = v.img;
    var links = document.querySelectorAll('link[rel="icon"]');
    for (var i = 0; i < links.length; i++) links[i].href = v.fav;
    var sw = document.querySelectorAll('.logo-swatch');
    for (var j = 0; j < sw.length; j++) {
      sw[j].classList.toggle('is-active', sw[j].getAttribute('data-logo-variant') === name);
    }
    try { localStorage.setItem(KEY, name); } catch (e) {}
  }
  function initLogoPicker() {
    var saved = 'original';
    try { saved = localStorage.getItem(KEY) || 'original'; } catch (e) {}
    if (!VARIANTS[saved]) saved = 'original';
    applyVariant(saved);
    var sw = document.querySelectorAll('.logo-swatch');
    for (var i = 0; i < sw.length; i++) {
      sw[i].addEventListener('click', function () {
        applyVariant(this.getAttribute('data-logo-variant'));
      });
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLogoPicker);
  } else {
    initLogoPicker();
  }
})();

/* ===== Add to Home Screen prompt ===== */
(function () {
  'use strict';
  var DISMISS_KEY = 'atr-install-dismissed';
  var deferredPrompt = null;

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
  }
  function isDismissed() {
    try { return !!localStorage.getItem(DISMISS_KEY); } catch (e) { return false; }
  }
  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) {}
  }
  function show() {
    if (isStandalone() || isDismissed()) return;
    var el = document.getElementById('install-prompt');
    if (el) el.hidden = false;
  }
  function hide() {
    var el = document.getElementById('install-prompt');
    if (el) el.hidden = true;
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    show();
  });
  window.addEventListener('appinstalled', function () { dismiss(); hide(); });

  document.addEventListener('DOMContentLoaded', function () {
    var closeBtn = document.getElementById('install-close');
    var actionBtn = document.getElementById('install-action');
    var steps = document.getElementById('install-steps');
    if (!document.getElementById('install-prompt')) return;

    var ua = navigator.userAgent || '';
    var isIOS = /iphone|ipad|ipod/i.test(ua);

    if (closeBtn) closeBtn.addEventListener('click', function () { dismiss(); hide(); });
    if (actionBtn) {
      if (isIOS && !deferredPrompt) actionBtn.textContent = 'Show me how';
      actionBtn.addEventListener('click', function () {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then(function () { deferredPrompt = null; hide(); });
        } else if (steps) {
          steps.hidden = !steps.hidden;
          actionBtn.textContent = steps.hidden ? (isIOS ? 'Show me how' : 'Add') : 'Hide steps';
        }
      });
    }

    // iOS has no beforeinstallprompt event — offer the steps version instead.
    // (Covers Safari and iOS in-app browsers, where the steps start with Safari.)
    if (isIOS) setTimeout(show, 5000);
  });
})();

/* Service worker registration (enables Add to Home Screen / install) */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js").catch(function () {});
  });
}

/* ==================== ACCESSIBILITY MENU ==================== */
(function () {
  var KEY = 'atr-a11y';
  var prefs = { text: false, contrast: false, motion: false, links: false };
  try {
    var raw = localStorage.getItem(KEY);
    if (raw) prefs = JSON.parse(raw) || prefs;
    else if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) prefs.motion = true;
  } catch (e) {}
  function apply() {
    var r = document.documentElement;
    r.classList.toggle('a11y-bigtext', !!prefs.text);
    r.classList.toggle('a11y-contrast', !!prefs.contrast);
    r.classList.toggle('a11y-motion', !!prefs.motion);
    r.classList.toggle('a11y-links', !!prefs.links);
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) {}
    var map = { 'a11y-text': 'text', 'a11y-contrast': 'contrast', 'a11y-motion': 'motion', 'a11y-links': 'links' };
    Object.keys(map).forEach(function (id) { var el = document.getElementById(id); if (el) el.checked = !!prefs[map[id]]; });
  }
  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('a11y-btn');
    var panel = document.getElementById('a11y-panel');
    if (!btn || !panel) return;
    apply();
    btn.addEventListener('click', function () {
      var open = panel.hidden;
      panel.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
      if (!panel.hidden && !panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
        panel.hidden = true; btn.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.focus(); }
    });
    ['text', 'contrast', 'motion', 'links'].forEach(function (k) {
      var el = document.getElementById('a11y-' + k);
      if (el) el.addEventListener('change', function () { prefs[k] = el.checked; apply(); });
    });
    var reset = document.getElementById('a11y-reset');
    if (reset) reset.addEventListener('click', function () {
      prefs = { text: false, contrast: false, motion: false, links: false };
      try { localStorage.removeItem(KEY); } catch (e) {}
      apply();
    });
  });
})();

/* ==================== SHARE BUTTON (FOOTER) ==================== */
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('share-btn');
    if (!btn) return;
    var shareData = {
      title: document.title,
      text: "Austin's Tech Repair Group \u2014 phone, tablet, computer, game console and smartwatch repair. We come to you.",
      url: 'https://austinstechrepairgroup.com/'
    };
    function showCopied() {
      var label = btn.querySelector('.share-label');
      if (!label) return;
      var orig = label.textContent;
      label.textContent = 'Link copied';
      btn.setAttribute('aria-label', 'Link copied');
      setTimeout(function () {
        label.textContent = orig;
        btn.setAttribute('aria-label', 'Share this page');
      }, 2000);
    }
    function fallbackCopy() {
      var ta = document.createElement('textarea');
      ta.value = shareData.url;
      ta.setAttribute('readonly', '');
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      showCopied();
    }
    btn.addEventListener('click', function () {
      if (navigator.share) {
        navigator.share(shareData).catch(function () {});
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareData.url).then(showCopied, fallbackCopy);
      } else {
        fallbackCopy();
      }
    });
  });
})();

/* ==================== HERO CAROUSEL, APPLE STYLE ==================== */
/* One slide at a time, 7 seconds each, with a visible fill timer on the
   active dot and a play/pause button. Pausing stops the timer exactly
   where it is, so a reader can take as long as they need. Autoplay also
   pauses on hover/focus and when the tab is hidden, and stays off when
   the visitor prefers reduced motion. */
(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', function () {
    var slides = document.querySelectorAll('.hero-slide');
    var dots = document.querySelectorAll('[data-hero-dot]');
    var prevBtn = document.querySelector('[data-hero-prev]');
    var nextBtn = document.querySelector('[data-hero-next]');
    var playBtn = document.querySelector('[data-hero-playpause]');
    var playIcon = document.querySelector('[data-hero-playpause-icon]');
    var carousel = document.querySelector('.hero-carousel');
    if (!slides.length || !dots.length) return;
    var DURATION = 7000;
    var current = 0;
    var playing = true;
    var startTime = 0;
    var elapsed = 0;
    var rafId = null;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) playing = false;
    function fillFor(i) {
      var dot = dots[i];
      return dot ? dot.querySelector('.hero-dot-fill') : null;
    }
    function show(index) {
      current = (index + slides.length) % slides.length;
      slides.forEach(function (s, i) { s.classList.toggle('is-active', i === current); });
      dots.forEach(function (d, i) {
        d.classList.toggle('is-active', i === current);
        var f = d.querySelector('.hero-dot-fill');
        if (f) f.style.width = i < current ? '100%' : '0%';
      });
      elapsed = 0;
      startTime = performance.now();
    }
    function tick(now) {
      if (!playing) return;
      var fill = fillFor(current);
      var pct = Math.min(100, ((elapsed + (now - startTime)) / DURATION) * 100);
      if (fill) fill.style.width = pct + '%';
      if (pct >= 100) { show(current + 1); }
      rafId = requestAnimationFrame(tick);
    }
    function start() {
      cancelAnimationFrame(rafId);
      startTime = performance.now();
      rafId = requestAnimationFrame(tick);
    }
    function pauseTimer() {
      if (!playing) return;
      elapsed += performance.now() - startTime;
      playing = false;
      cancelAnimationFrame(rafId);
      if (playBtn) { playBtn.setAttribute('aria-label', 'Play slideshow'); playBtn.setAttribute('aria-pressed', 'true'); }
      if (playIcon) playIcon.textContent = '\u25B6';
    }
    function playTimer() {
      if (playing) return;
      playing = true;
      startTime = performance.now();
      if (playBtn) { playBtn.setAttribute('aria-label', 'Pause slideshow'); playBtn.setAttribute('aria-pressed', 'false'); }
      if (playIcon) playIcon.textContent = '\u275A\u275A';
      rafId = requestAnimationFrame(tick);
    }
    dots.forEach(function (d) {
      d.addEventListener('click', function () {
        show(parseInt(d.getAttribute('data-hero-dot'), 10) || 0);
        if (playing) start();
      });
    });
    if (prevBtn) prevBtn.addEventListener('click', function () { show(current - 1); if (playing) start(); });
    if (nextBtn) nextBtn.addEventListener('click', function () { show(current + 1); if (playing) start(); });
    if (playBtn) playBtn.addEventListener('click', function () { if (playing) pauseTimer(); else playTimer(); });
    if (carousel) {
      carousel.addEventListener('mouseenter', function () { if (playing) { elapsed += performance.now() - startTime; cancelAnimationFrame(rafId); } });
      carousel.addEventListener('mouseleave', function () { if (playing) startTime = performance.now(), rafId = requestAnimationFrame(tick); });
      carousel.addEventListener('focusin', function () { if (playing) { elapsed += performance.now() - startTime; cancelAnimationFrame(rafId); } });
      carousel.addEventListener('focusout', function () { if (playing) startTime = performance.now(), rafId = requestAnimationFrame(tick); });
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && playing) { elapsed += performance.now() - startTime; cancelAnimationFrame(rafId); }
      else if (!document.hidden && playing) { startTime = performance.now(); rafId = requestAnimationFrame(tick); }
    });
    show(0);
    if (playing) start();
    else if (playBtn) { playBtn.setAttribute('aria-label', 'Play slideshow'); playBtn.setAttribute('aria-pressed', 'true'); if (playIcon) playIcon.textContent = '\u25B6'; }
  });
})();

/* ==================== MY ACCOUNT MENU ==================== */
/* The logged-in account modal is one My Account tab with a menu:
   Repairs, Account Settings, Sign Out. Repairs shows the repair list,
   thread, and new-request views; Account Settings shows profile,
   birthday, and password. Sign Out is the existing logout button,
   moved into the menu, so its wiring is unchanged. */
(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', function () {
    var menuItems = document.querySelectorAll('[data-acct-menu]');
    var repairsView = document.getElementById('acct-view-repairs');
    var settingsView = document.getElementById('acct-view-settings');
    if (!menuItems.length || !repairsView || !settingsView) return;
    function show(view) {
      repairsView.hidden = view !== 'repairs';
      settingsView.hidden = view !== 'settings';
      menuItems.forEach(function (btn) {
        btn.classList.toggle('is-active', btn.getAttribute('data-acct-menu') === view);
      });
      if (view === 'repairs') {
        var r = document.getElementById('acct-repairs');
        var th = document.getElementById('acct-thread');
        var nt = document.getElementById('acct-newticket');
        if (r) r.hidden = false;
        if (th) th.hidden = true;
        if (nt) nt.hidden = true;
      }
    }
    menuItems.forEach(function (btn) {
      btn.addEventListener('click', function () { show(btn.getAttribute('data-acct-menu')); });
    });
    var pwBtn = document.getElementById('acct-change-password');
    if (pwBtn) pwBtn.addEventListener('click', function () {
      var msg = document.getElementById('acct-password-msg');
      if (window.atrOpenReset) { window.atrOpenReset(); return; }
      if (msg) msg.textContent = 'Use Forgot your password on the sign in screen to change it by email.';
    });
  });
})();
