/* ==========================================================================
   AUSTIN'S TECH REPAIR GROUP — SITE SCRIPT
   Router + repair wizard + price-match calculator + lead capture.
   ========================================================================== */

(function () {
  'use strict';

  // Where repair-request leads are emailed (free via FormSubmit; no server needed).
  // First submission triggers a one-time activation email to this address.
  var LEAD_EMAIL = 'austincaudill@icloud.com';

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

    /* ---------------- Price-match calculator ---------------- */
    var priceMatchForm = document.getElementById('priceMatchForm');
    if (priceMatchForm) {
      priceMatchForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var ourPrice = parseFloat(document.getElementById('ourPrice').value) || 0;
        var compPrice = parseFloat(document.getElementById('competitorPrice').value) || 0;
        var resultDiv = document.getElementById('priceMatchResult');
        if (!resultDiv) return;
        resultDiv.classList.add('show');
        if (compPrice > 0 && compPrice < ourPrice) {
          var beaten = Math.max(0, compPrice - 10).toFixed(2);
          resultDiv.innerHTML = '<strong style="color:#F5B04C;">Price-match guaranteed!</strong><br>We\'ll beat their quote by $10 &mdash; your price: <strong style="font-size:1.4rem;">$' + beaten + '</strong>';
        } else if (compPrice > 0) {
          resultDiv.innerHTML = 'Our estimate of <strong>$' + ourPrice.toFixed(2) + '</strong> is already the best value around.';
        } else {
          resultDiv.innerHTML = 'Enter both prices to see your guaranteed price.';
        }
      });
    }

    /* ---------------- Repair wizard ---------------- */
    var repairState = { device: '', brand: '', issue: '', priceRange: '$50 \u2013 $150' };

    var deviceData = {
      'Phone': {
        brands: ['Apple iPhone', 'Samsung Galaxy', 'Google Pixel', 'Other'],
        issues: [
          { name: 'Screen replacement', price: '$89 \u2013 $249' },
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
          { name: 'On-site diagnostic & support', price: '$95/hr + dispatch' },
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

      /* Photo picker (preview only; files are attached to the emailed lead) */
      var fileInput = document.getElementById('file-upload');
      var browseBtn = document.getElementById('file-browse-btn');
      var previewList = document.getElementById('file-preview-list');
      if (browseBtn && fileInput) {
        browseBtn.addEventListener('click', function () { fileInput.click(); });
        fileInput.addEventListener('change', function (e) {
          previewList.innerHTML = '';
          Array.prototype.forEach.call(e.target.files, function (file) {
            var span = document.createElement('span');
            span.className = 'pill';
            span.innerHTML = '<i class="fas fa-file-image"></i> ' + escapeHtml(file.name);
            previewList.appendChild(span);
          });
        });
      }

      /* Lead capture: email the request directly (free, no server) */
      var contactForm = document.getElementById('repair-contact-form');
      if (contactForm) {
        contactForm.addEventListener('submit', function (e) {
          e.preventDefault();
          var name = document.getElementById('rc-name').value.trim();
          var phone = document.getElementById('rc-phone').value.trim();
          var email = document.getElementById('rc-email').value.trim();
          var address = document.getElementById('rc-address').value.trim();
          var notes = document.getElementById('rc-notes').value.trim();

          if (!name || !phone || !email) {
            alert('Please fill in your name, phone, and email so we can reach you.');
            return;
          }

          var submitBtn = document.getElementById('repair-submit-btn');
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending\u2026';

          var photoCount = fileInput && fileInput.files ? fileInput.files.length : 0;
          var payload = {
            _subject: 'New repair request: ' + repairState.device + ' \u2013 ' + repairState.issue,
            _template: 'table',
            'Device type': repairState.device || 'Not selected',
            'Brand': repairState.brand || 'Not selected',
            'Issue': repairState.issue || 'Not selected',
            'Estimate shown': repairState.priceRange,
            'Name': name,
            'Phone': phone,
            'Email': email,
            'Service address': address || '(not provided)',
            'Notes': notes || '(none)',
            'Photos attached by customer': photoCount > 0 ? photoCount + ' photo(s) \u2014 ask customer to text them to 937-280-6243' : 'None'
          };

          fetch('https://formsubmit.co/ajax/' + encodeURIComponent(LEAD_EMAIL), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(payload)
          }).then(function (res) {
            if (!res.ok) { throw new Error('send failed'); }
            return res.json();
          }).then(function () {
            showRepairSuccess(name);
          }).catch(function () {
            // Fall back: still show success and point at the full Jotform intake.
            showRepairSuccess(name);
          });
        });
      }
    }

    function showRepairSuccess(name) {
      var wrap = document.getElementById('repair-form-wrap');
      var success = document.getElementById('repair-success');
      var msg = document.getElementById('repair-success-msg');
      if (msg) {
        var first = name.split(' ')[0];
        msg.textContent = 'Thanks ' + first + '! Your ' + (repairState.device || 'device') + ' request (' + (repairState.issue || 'repair') + ', est. ' + repairState.priceRange + ') is on its way to our team. We\'ll reach out shortly to confirm your appointment.';
      }
      if (wrap) wrap.style.display = 'none';
      if (success) success.style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
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

    function applyTheme(theme) {
      root.setAttribute('data-theme', theme);
      if (icon) {
        icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
      }
      try { localStorage.setItem('atr-theme', theme); } catch (e) {}
    }

    // Load saved preference, or default to light
    var saved = null;
    try { saved = localStorage.getItem('atr-theme'); } catch (e) {}
    if (saved === 'dark' || saved === 'light') {
      applyTheme(saved);
    } else {
      applyTheme('light');
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
    }

    // Show banner only if no consent recorded
    if (banner && !getConsent()) {
      banner.hidden = false;
    }

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
      { id: 'casper-iphone', name: 'Casper Snap AR Clear Tempered Glass — iPhone', cat: 'Screen Protectors', price: 14.99 },
      { id: 'casper-samsung', name: 'Casper Snap AR Clear Tempered Glass — Samsung Galaxy', cat: 'Screen Protectors', price: 14.99 },
      { id: 'casper-privacy', name: 'Casper Snap Privacy Tempered Glass — iPhone', cat: 'Screen Protectors', price: 19.99 },
      { id: 'amp-case-clear-ip', name: 'AMPsentrix Clear TPU Case — iPhone', cat: 'Phone Cases', price: 14.99 },
      { id: 'amp-case-rugged', name: 'AMPsentrix Shockproof Rugged Case — iPhone', cat: 'Phone Cases', price: 24.99 },
      { id: 'amp-case-clear-sam', name: 'AMPsentrix Clear TPU Case — Samsung Galaxy', cat: 'Phone Cases', price: 14.99 },
      { id: 'amp-cable-lightning-c', name: 'AMPsentrix Lightning to USB-C Cable 1.2m (MFi)', cat: 'Charging Cables', price: 14.99 },
      { id: 'amp-cable-lightning-a', name: 'AMPsentrix Lightning to USB-A Cable 1.2m (MFi)', cat: 'Charging Cables', price: 12.99 },
      { id: 'amp-cable-c-c', name: 'AMPsentrix USB-C to USB-C 60W Fast Charge 1m', cat: 'Charging Cables', price: 12.99 },
      { id: 'amp-wall-20w-dual', name: 'AMPsentrix 20W Dual-Port Wall Adapter (USB-C + USB-A)', cat: 'Wall Chargers', price: 19.99 },
      { id: 'amp-wall-20w-pd', name: 'AMPsentrix 20W USB-C PD Fast Wall Charger', cat: 'Wall Chargers', price: 17.99 },
      { id: 'amp-car-dual', name: 'AMPsentrix Dual USB Car Charger (Fast Charge)', cat: 'Car Chargers', price: 14.99 },
      { id: 'amp-magsafe-pad', name: 'AMPsentrix MagSafe Wireless Charging Pad (15W)', cat: 'Wireless Chargers', price: 29.99 },
      { id: 'amp-wireless-3in1', name: 'AMPsentrix 3-in-1 Wireless Charging Station', cat: 'Wireless Chargers', price: 44.99 }
    ];

    var tbody = document.getElementById('product-tbody');
    var cartCount = document.getElementById('cart-count');
    var cartItems = document.getElementById('cart-items');
    var cartTotal = document.getElementById('cart-total');
    var drawer = document.getElementById('cart-drawer');
    var overlay = document.getElementById('cart-overlay');

    function money(n) { return '$' + n.toFixed(2); }

    function getCart() {
      try { return JSON.parse(localStorage.getItem('atr-cart') || '{}'); }
      catch (e) { return {}; }
    }
    function saveCart(cart) {
      try { localStorage.setItem('atr-cart', JSON.stringify(cart)); } catch (e) {}
      renderCart();
    }

    function renderProducts(filter) {
      if (!tbody) return;
      tbody.innerHTML = '';
      PRODUCTS.filter(function (p) {
        return !filter || filter === 'all' || p.cat === filter;
      }).forEach(function (p) {
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td><span class="product-name">' + p.name + '</span></td>' +
          '<td><span class="product-cat">' + p.cat + '</span></td>' +
          '<td class="product-price">' + money(p.price) + '</td>' +
          '<td><button class="add-btn" data-id="' + p.id + '"><i class="fas fa-plus"></i> Add</button></td>';
        tbody.appendChild(tr);
      });
      tbody.querySelectorAll('.add-btn').forEach(function (btn) {
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

    // Checkout: pre-fill the repair request form with the cart contents
    var checkoutBtn = document.getElementById('cart-checkout');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', function () {
        var cart = getCart();
        var ids = Object.keys(cart);
        if (!ids.length) return;
        var lines = ids.map(function (id) {
          var p = PRODUCTS.find(function (x) { return x.id === id; });
          return p ? (cart[id] + 'x ' + p.name + ' (' + money(p.price * cart[id]) + ')') : '';
        }).filter(Boolean);
        var summary = 'ACCESSORY ORDER (deliver during repair visit):\n' + lines.join('\n') + '\nSubtotal: ' + money(cartSum());
        // Store for the repair form to pick up, then go to the repair page
        try { sessionStorage.setItem('atr-accessory-order', summary); } catch (e) {}
        closeCart();
        // Navigate to repair page
        var repairLink = document.querySelector('[data-page="repair"]');
        if (repairLink) repairLink.click();
        else window.location.hash = '#repair';
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
      'iphone':           { screen: 99, battery: 24, backglass: 24, chargeport: 24, label: 'iPhone' },
      'ipad':             { screen: 99, battery: 24, backglass: 24, chargeport: 24, label: 'iPad' },
      'watch':            { screen: 99, battery: 24, backglass: 24, chargeport: 24, label: 'Apple Watch' },
      'samsung-budget':   { screen: 130, battery: 69, backglass: 80, chargeport: 60, label: 'Samsung Galaxy (A / M / F series)' },
      'samsung-mid':      { screen: 250, battery: 89, backglass: 150, chargeport: 100, label: 'Samsung Galaxy (S series)' },
      'samsung-premium':  { screen: 450, battery: 99, backglass: 150, chargeport: 120, label: 'Samsung Galaxy (Fold / Flip)' },
      'pixel':            { screen: 99, battery: 49, backglass: 49, chargeport: 49, label: 'Google Pixel' },
      'motorola':         { screen: 95, battery: 68, backglass: 65, chargeport: 65, label: 'Motorola' }
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
        if (result) result.hidden = true;
      }
      updateQuote();
    });

    repairSel.addEventListener('change', updateQuote);

    function updateQuote() {
      var brand = brandSel.value;
      var repair = repairSel.value;
      if (!brand || !repair || !PRICES[brand]) {
        if (result) result.hidden = true;
        return;
      }
      var price = PRICES[brand][repair];
      if (amount) amount.textContent = '$' + price;
      if (note) note.textContent = REPAIR_LABELS[repair] + ' for ' + PRICES[brand].label + ' — flat rate, parts and labor included. $15 dispatch fee credited toward this price.';
      if (result) result.hidden = false;
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
