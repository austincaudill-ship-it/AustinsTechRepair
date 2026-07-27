/* ============================================
   AUSTIN'S TECH REPAIR GROUP — MAIN SCRIPT
   ============================================ */

(function () {
  'use strict';

  /* ===== CONFIGURATION ===== */
  const CONFIG = {
    squareCheckoutUrl: 'https://squareup.com',
    shopifyStoreUrl: 'https://austinstechedgerepair.myshopify.com',
    jotformRepairFormId: '261955946010055',
  };

  /* ===== REPAIR DATA ===== */
  const repairData = {
    Phones: {
      title: 'Phone Issues',
      makes: ['Apple', 'Samsung', 'Google', 'Motorola', 'OnePlus', 'Other'],
      issues: [
        { name: 'Screen', estimate: '$89 — $199' },
        { name: 'Battery', estimate: '$49 — $89' },
        { name: 'Charging Port', estimate: '$59 — $99' },
        { name: 'Camera', estimate: '$69 — $149' },
        { name: 'Speaker', estimate: '$39 — $79' },
        { name: 'Microphone', estimate: '$39 — $79' },
        { name: 'Water Damage', estimate: '$99 — $249' },
        { name: 'Software', estimate: '$49 — $129' },
        { name: 'Data Transfer', estimate: '$39 — $89' },
      ],
    },
    Tablets: {
      title: 'Tablet Issues',
      makes: ['Apple', 'Samsung', 'Amazon', 'Lenovo', 'Other'],
      issues: [
        { name: 'Screen', estimate: '$99 — $249' },
        { name: 'Battery', estimate: '$59 — $119' },
        { name: 'Charging Port', estimate: '$69 — $109' },
        { name: 'Touch Issues', estimate: '$79 — $149' },
        { name: 'Camera', estimate: '$59 — $129' },
        { name: 'Speaker', estimate: '$39 — $89' },
        { name: 'Water Damage', estimate: '$99 — $249' },
        { name: 'Software', estimate: '$49 — $129' },
        { name: 'Data Transfer', estimate: '$39 — $89' },
      ],
    },
    Computers: {
      title: 'Computer Issues',
      makes: ['Apple', 'Dell', 'HP', 'Lenovo', 'Acer', 'ASUS', 'Custom Build', 'Other'],
      issues: [
        { name: 'Hard Drive / SSD', estimate: '$89 — $249' },
        { name: 'Motherboard', estimate: '$149 — $399' },
        { name: 'RAM / Memory', estimate: '$59 — $149' },
        { name: 'Power Supply', estimate: '$69 — $179' },
        { name: 'Display', estimate: '$99 — $299' },
        { name: 'Keyboard', estimate: '$49 — $149' },
        { name: 'Trackpad / Mouse', estimate: '$39 — $99' },
        { name: 'Charging / DC Jack', estimate: '$79 — $179' },
        { name: 'Virus Removal', estimate: '$49 — $129' },
        { name: 'Software', estimate: '$49 — $149' },
        { name: 'Data Recovery', estimate: '$99 — $399' },
      ],
    },
    Gaming: {
      title: 'Gaming Issues',
      makes: ['PlayStation', 'Xbox', 'Nintendo', 'PC', 'Other'],
      issues: [
        { name: 'HDMI Port', estimate: '$89 — $179' },
        { name: 'Power', estimate: '$69 — $149' },
        { name: 'Overheating', estimate: '$59 — $129' },
        { name: 'Storage', estimate: '$69 — $199' },
        { name: 'Disc Drive', estimate: '$79 — $159' },
        { name: 'Controller / Input', estimate: '$39 — $89' },
        { name: 'Fan / Cooling', estimate: '$49 — $99' },
        { name: 'Software', estimate: '$49 — $129' },
        { name: 'Data Recovery', estimate: '$99 — $249' },
      ],
    },
    'Smart Watches': {
      title: 'Smart Watch Issues',
      makes: ['Apple', 'Samsung', 'Fitbit', 'Garmin', 'Other'],
      issues: [
        { name: 'Battery', estimate: '$49 — $99' },
        { name: 'Display', estimate: '$79 — $179' },
        { name: 'Charging', estimate: '$39 — $89' },
        { name: 'Pairing', estimate: '$29 — $69' },
        { name: 'Sync Issues', estimate: '$29 — $69' },
        { name: 'Buttons / Crown', estimate: '$39 — $89' },
        { name: 'Water Damage', estimate: '$69 — $149' },
        { name: 'Software', estimate: '$39 — $89' },
      ],
    },
    Business: {
      title: 'Business Support',
      makes: ['Microsoft', 'Dell', 'HP', 'Lenovo', 'Canon', 'Brother', 'Other'],
      issues: [
        { name: 'Helpdesk & End-User Support', estimate: '$49 — $199/mo' },
        { name: 'Network & Infrastructure', estimate: '$99 — $499/mo' },
        { name: 'Cybersecurity', estimate: '$149 — $599/mo' },
        { name: 'Cloud Services', estimate: '$99 — $399/mo' },
        { name: 'Backup & Disaster Recovery', estimate: '$99 — $299/mo' },
        { name: 'Microsoft 365 / SaaS Support', estimate: '$49 — $199/mo' },
        { name: 'Servers / Storage', estimate: '$149 — $599/mo' },
        { name: 'VoIP / Phone Systems', estimate: '$99 — $299/mo' },
        { name: 'Website Support', estimate: '$49 — $199/mo' },
        { name: 'Application Support', estimate: '$49 — $199/mo' },
        { name: 'IT Consulting', estimate: '$99 — $299/hr' },
        { name: 'Project Implementation', estimate: 'Custom Quote' },
      ],
    },
  };

  /* ===== POLICIES ===== */
  const policies = {
    privacy: `<h2>Privacy Policy</h2><div class="eff">Effective Date: June 21, 2026</div><p>Austin's Tech Repair Group LLC respects your privacy and is committed to protecting the personal inform[...]`,
    repair: `<h2>Repair Service Agreement</h2><div class="eff">Authorization, liability, payment, and Ohio law</div><p>By submitting a device for service, the customer authorizes Austin's Tech Re[...]`,
    backup: `<h2>Data Backup & Loss Waiver</h2><div class="eff">Customer responsibility for backups</div><p>Repair procedures may result in loss, corruption, deletion, or alteration of data store[...]`,
    'warranty-policy': `<h2>1-Year Limited Warranty Policy</h2><div class="eff">Effective Date: June 21, 2026</div><p>Austin's Tech Repair Group LLC warrants repair labor and installed replacemen[...]`,
    terms: `<h2>Terms & Conditions</h2><div class="eff">Use of services and website</div><p>Use of this site and our services is subject to these terms and conditions.</p><section><strong>1. Acce[...]`,
    'website-terms': `<h2>Website Terms of Use</h2><div class="eff">Use of this website</div><p>All content is provided "AS IS" without warranty of any kind.</p><section><strong>1. Use of Content[...]`,
  };

  /* ===== STATE ===== */
  let cart = loadCart();
  let slideIndex = 0;
  let activeFlipCard = null;
  let repairState = {
    device: '',
    make: '',
    model: '',
    issue: '',
    estimate: '',
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    customer_location: '',
    preferred_time: '',
    additional_details: '',
    files: []
  };
  let uploadedFiles = [];
  let contactUploadedFiles = [];

  /* ===== DOM REFS ===== */
  const header = document.getElementById('header');
  const pages = () => document.querySelectorAll('.page');
  const mobileMenu = document.getElementById('mobile-menu');
  const searchOverlay = document.getElementById('search-overlay');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  const cartDrawer = document.getElementById('cart-drawer');
  const cartBadge = document.getElementById('cart-badge');
  const cartDrawerItems = document.getElementById('cart-drawer-items');
  const cartDrawerTotal = document.getElementById('cart-drawer-total');
  const policyOverlay = document.getElementById('policy-overlay');
  const policyBody = document.getElementById('policy-body');

  /* ===== INIT ===== */
  // Wrap each init call so one failure can't break the rest
  function safeInit(name, fn) {
    try { fn(); } catch (err) { console.error('Init error in ' + name + ':', err); }
  }

  document.addEventListener('DOMContentLoaded', () => {
    safeInit('theme', initTheme);
    safeInit('navigation', initNavigation);
    safeInit('mobileMenu', initMobileMenu);
    safeInit('search', initSearch);
    safeInit('cart', initCart);
    safeInit('repairWizard', initRepairWizard);
    safeInit('fileUpload', initFileUpload);
    safeInit('contactFileUpload', initContactFileUpload);
    safeInit('forms', initForms);
    safeInit('scrollReveal', initScrollReveal);
    safeInit('slideshow', initSlideshow);
    safeInit('faq', initFAQ);
    safeInit('productFilters', initProductFilters);
    safeInit('headerScroll', initHeaderScroll);
    safeInit('shopifyLink', initShopifyLink);
    safeInit('updateCart', updateCart);
    safeInit('renderCartDrawer', renderCartDrawer);
    safeInit('renderSearch', () => renderSearch(''));
    
    // Initialize URL-based navigation
    safeInit('hashNavigation', initHashNavigation);
    safeInit('loadPageFromHash', loadPageFromHash);
    
    // Listen for back button
    window.addEventListener('hashchange', loadPageFromHash);
  });

  /* ===== URL HASH NAVIGATION ===== */
  function initHashNavigation() {
    window.setPageWithHash = function(pageId) {
      window.location.hash = pageId;
    };
  }

  function loadPageFromHash() {
    let pageId = window.location.hash.slice(1) || 'home';
    if (!document.getElementById(pageId)) {
      pageId = 'home';
      window.location.hash = pageId;
    }
    setPage(pageId);
  }

  /* ===== THEME TOGGLE ===== */
  function initTheme() {
    const toggle = document.getElementById('theme-toggle');
    const root = document.documentElement;
    let dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(dark, toggle, root);
    toggle.addEventListener('click', () => {
      dark = !dark;
      applyTheme(dark, toggle, root);
    });
  }
  function applyTheme(dark, toggle, root) {
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    toggle.innerHTML = dark
      ? '<i class="fas fa-sun" aria-hidden="true"></i>'
      : '<i class="fas fa-moon" aria-hidden="true"></i>';
    toggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  }

  /* ===== NAVIGATION ===== */
  function initNavigation() {
    document.addEventListener('click', (e) => {
      const pageBtn = e.target.closest('[data-page]');
      if (pageBtn) {
        e.preventDefault();
        const pageId = pageBtn.getAttribute('data-page');
        window.location.hash = pageId;
        closeMenu();
        closeSearch();
        closeCart();
        return;
      }

      const policyBtn = e.target.closest('[data-policy]');
      if (policyBtn) {
        e.preventDefault();
        openPolicy(policyBtn.getAttribute('data-policy'));
        return;
      }

      const addCartBtn = e.target.closest('[data-add-cart]');
      if (addCartBtn) {
        try {
          const item = JSON.parse(addCartBtn.getAttribute('data-add-cart'));
          addToCart(item);
          openCart();
        } catch (err) {
          console.error('Cart parse error', err);
        }
        return;
      }

      const flipCard = e.target.closest('.flip-card');
      if (flipCard && !e.target.closest('button[data-page]')) {
        if (activeFlipCard && activeFlipCard !== flipCard) {
          activeFlipCard.classList.remove('flipped');
        }
        flipCard.classList.toggle('flipped');
        activeFlipCard = flipCard.classList.contains('flipped') ? flipCard : null;
        return;
      }
    });

    const brand = document.querySelector('.brand');
    if (brand) {
      brand.addEventListener('click', () => { window.location.hash = 'home'; });
      brand.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          window.location.hash = 'home';
        }
      });
    }
  }

  function setPage(pageId) {
    pages().forEach((p) => p.classList.remove('active'));
    const target = document.getElementById(pageId);
    if (target) {
      target.classList.add('active');
      document.querySelectorAll('.nav-link').forEach((l) => l.classList.remove('active'));
      document.querySelectorAll('.menu-link').forEach((l) => l.classList.remove('active'));
      document.querySelectorAll(`[data-page="${pageId}"]`).forEach((btn) => {
        if (btn.classList.contains('nav-link') || btn.classList.contains('menu-link')) {
          btn.classList.add('active');
        }
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  /* ===== MOBILE MENU ===== */
  function initMobileMenu() {
    document.getElementById('menu-toggle').addEventListener('click', openMenu);
    document.getElementById('menu-close').addEventListener('click', closeMenu);
    mobileMenu.addEventListener('click', (e) => {
      if (e.target === mobileMenu) closeMenu();
    });
  }
  function openMenu() {
    mobileMenu.classList.add('open');
    document.body.classList.add('no-scroll');
    mobileMenu.setAttribute('aria-hidden', 'false');
  }
  function closeMenu() {
    mobileMenu.classList.remove('open');
    document.body.classList.remove('no-scroll');
    mobileMenu.setAttribute('aria-hidden', 'true');
  }

  /* ===== SEARCH ===== */
  function initSearch() {
    const searchToggle = document.getElementById('search-toggle');
    searchToggle.addEventListener('click', openSearch);
    document.getElementById('search-close').addEventListener('click', closeSearch);
    searchOverlay.addEventListener('click', (e) => {
      if (e.target === searchOverlay) closeSearch();
    });

    searchInput.addEventListener('input', (e) => renderSearch(e.target.value));

    const heroSearchForm = document.getElementById('hero-search-form');
    const heroSearchInput = document.getElementById('hero-search-input');
    heroSearchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = heroSearchInput.value.trim();
      if (q) {
        openSearch();
        searchInput.value = q;
        renderSearch(q);
      }
    });
  }
  function openSearch() {
    searchOverlay.classList.add('open');
    document.body.classList.add('no-scroll');
    document.getElementById('search-toggle').setAttribute('aria-expanded', 'true');
    setTimeout(() => searchInput.focus(), 50);
  }
  function closeSearch() {
    searchOverlay.classList.remove('open');
    document.body.classList.remove('no-scroll');
    document.getElementById('search-toggle').setAttribute('aria-expanded', 'false');
  }

  function renderSearch(q) {
    const items = [
      ['home', 'Home', 'Main landing page'],
      ['shop', 'Shop', 'Browse products & accessories'],
      ['repair', 'Repair', 'Start a repair request with estimate'],
      ['about', 'About', 'Learn about us & service area'],
      ['contact', 'Contact', 'Send a message or photos'],
      ['b2b', 'B2B', 'Business & managed IT support'],
      ['atr-one', 'ATR One', '$19.99/month membership'],
      ['employee', 'Employee Portal', 'Internal login'],
    ];
    const deviceItems = Object.keys(repairData).map((d) => [d, d + ' Repair', repairData[d].title]);
    const allItems = [...items, ...deviceItems];

    const f = allItems.filter(
      (x) => !q || x[1].toLowerCase().includes(q.toLowerCase()) || x[2].toLowerCase().includes(q.toLowerCase())
    );
    searchResults.innerHTML =
      f
        .map(
          (x) =>
            `<button class="search-result" type="button" data-page="${x[0]}"><span class="search-result-name">${x[1]}</span><span class="search-result-meta">${x[2]}</span></button>`
        )
        .join('') || '<p style="color: var(--text-muted);">No results found.</p>';
  }

  /* ===== CART ===== */
  function loadCart() {
    try {
      return JSON.parse(localStorage.getItem('atr_cart')) || [];
    } catch {
      return [];
    }
  }
  function saveCart() {
    try {
      localStorage.setItem('atr_cart', JSON.stringify(cart));
    } catch {}
    updateCart();
    renderCartDrawer();
  }
  function addToCart(item) {
    const existing = cart.find((i) => i.id === item.id);
    if (existing) {
      existing.qty = (existing.qty || 1) + 1;
    } else {
      cart.push({ ...item, qty: 1 });
    }
    saveCart();
  }
  function updateCart() {
    const count = cart.reduce((s, i) => s + (i.qty || 1), 0);
    cartBadge.textContent = count;
    cartBadge.classList.toggle('show', count > 0);
  }
  function renderCartDrawer() {
    if (!cart.length) {
      cartDrawerItems.innerHTML =
        '<div class="cart-empty"><i class="fas fa-cart-shopping"></i><p>Your cart is empty</p></div>';
      cartDrawerTotal.textContent = '$0.00';
      return;
    }
    cartDrawerItems.innerHTML = cart
      .map(
        (item) => `
        <div class="cart-item">
          <img class="cart-item__img" src="${item.image || ''}" alt="${item.name}" />
          <div class="cart-item__meta">
            <p class="cart-item__name">${item.name}</p>
            <p class="cart-item__line">$${Number(item.price || 0).toFixed(2)} × ${item.qty || 1}</p>
            <div class="cart-item__actions">
              <button class="cart-mini-btn" type="button" data-cart-dec="${item.id}">-</button>
              <button class="cart-mini-btn" type="button" data-cart-inc="${item.id}">+</button>
              <button class="cart-mini-btn" type="button" data-cart-remove="${item.id}">Remove</button>
            </div>
          </div>
        </div>
      `
      )
      .join('');
    cartDrawerTotal.textContent = '$' + cart.reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0).toFixed(2);
  }

  function initCart() {
    document.getElementById('cart-toggle').addEventListener('click', openCart);
    document.getElementById('cart-drawer-close').addEventListener('click', closeCart);
    document.getElementById('cart-drawer-close-btn').addEventListener('click', closeCart);

    cartDrawerItems.addEventListener('click', (e) => {
      const inc = e.target.closest('[data-cart-inc]');
      const dec = e.target.closest('[data-cart-dec]');
      const remove = e.target.closest('[data-cart-remove]');
      if (inc) {
        const item = cart.find((i) => i.id === inc.getAttribute('data-cart-inc'));
        if (item) { item.qty = (item.qty || 1) + 1; saveCart(); }
      }
      if (dec) {
        const item = cart.find((i) => i.id === dec.getAttribute('data-cart-dec'));
        if (item) {
          item.qty = (item.qty || 1) - 1;
          if (item.qty <= 0) cart = cart.filter((i) => i.id !== item.id);
          saveCart();
        }
      }
      if (remove) {
        cart = cart.filter((i) => i.id !== remove.getAttribute('data-cart-remove'));
        saveCart();
      }
    });

    document.getElementById('cart-clear').addEventListener('click', () => {
      cart = [];
      saveCart();
    });

    document.getElementById('cart-checkout-square').addEventListener('click', () => {
      checkoutWithSquare();
    });

    document.getElementById('cart-checkout-shopify').addEventListener('click', () => {
      checkoutWithShopify();
    });
  }

  function openCart() {
    cartDrawer.classList.add('open');
    cartDrawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
  }
  function closeCart() {
    cartDrawer.classList.remove('open');
    cartDrawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
  }

  /* ===== SQUARE CHECKOUT ===== */
  function checkoutWithSquare() {
    if (!cart.length) return;
    const total = cart.reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0);
    const summary = cart.map((i) => `${i.name} x${i.qty || 1} ($${(i.price * i.qty).toFixed(2)})`).join(', ');
    const squareUrl = CONFIG.squareCheckoutUrl + '?total=' + total.toFixed(2) + '&desc=' + encodeURIComponent(summary);
    window.open(squareUrl, '_blank');
    showCheckoutNotice('Square', total);
  }

  /* ===== SHOPIFY CHECKOUT ===== */
  function checkoutWithShopify() {
    if (!cart.length) return;
    const total = cart.reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0);
    const shopifyUrl = CONFIG.shopifyStoreUrl + '/cart';
    window.open(shopifyUrl, '_blank');
    showCheckoutNotice('Shopify', total);
  }

  function showCheckoutNotice(platform, total) {
    const notice = document.createElement('div');
    notice.style.cssText =
      'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--dark-bg);color:#fff;padding:16px 24px;border-radius:12px;z-index:5000;font-size:14px;font-weight:700;box-shadow:0 4px 12px rgba(0,0,0,.15);';
    notice.innerHTML = `<i class="fas fa-circle-check" style="color:var(--success);margin-right:8px;"></i> Redirecting to ${platform} checkout... Total: $${total.toFixed(2)}`;
    document.body.appendChild(notice);
    setTimeout(() => notice.remove(), 4000);
  }

  /* ===== SHOPIFY STORE LINK ===== */
  function initShopifyLink() {
    const link = document.getElementById('shopify-store-link');
    if (link) {
      link.href = CONFIG.shopifyStoreUrl;
    }
  }

  /* ===== REPAIR WIZARD ===== */
  function initRepairWizard() {
    document.addEventListener('click', (e) => {
      // Device selection
      const deviceBtn = e.target.closest('#step-device [data-device]');
      if (deviceBtn) {
        repairState.device = deviceBtn.getAttribute('data-device');
        renderIssues(repairState.device);
        showStep('brand');
        updateProgress(2);
        return;
      }

      // Brand selection
      const brandBtn = e.target.closest('#step-brand [data-make]');
      if (brandBtn) {
        repairState.make = brandBtn.getAttribute('data-make');
        document.querySelectorAll('#step-brand .option-btn').forEach((b) => b.classList.remove('selected'));
        brandBtn.classList.add('selected');
        return;
      }

      // Model input
      const modelNextBtn = e.target.closest('[data-action="model-next"]');
      if (modelNextBtn) {
        const modelInput = document.getElementById('device-model-input');
        repairState.model = modelInput.value.trim();
        if (repairState.model) {
          showStep('issue');
          updateProgress(3);
        } else {
          alert('Please enter a device model');
        }
        return;
      }

      // Issue selection
      const issueBtn = e.target.closest('#step-issue [data-type]');
      if (issueBtn) {
        repairState.issue = issueBtn.getAttribute('data-type');
        repairState.estimate = issueBtn.getAttribute('data-estimate') || 'Custom Quote';
        showStep('contact');
        updateProgress(4);
        return;
      }

      // Contact form submission
      const submitRepairBtn = e.target.closest('[data-action="submit-repair"]');
      if (submitRepairBtn) {
        const contactForm = document.getElementById('repair-contact-form');
        if (contactForm && contactForm.checkValidity()) {
          repairState.customer_name = document.getElementById('customer-name-input').value.trim();
          repairState.customer_phone = document.getElementById('customer-phone-input').value.trim();
          repairState.customer_email = document.getElementById('customer-email-input').value.trim();
          repairState.customer_location = document.getElementById('customer-location-input').value.trim();
          repairState.preferred_time = document.getElementById('preferred-time-input').value;
          repairState.additional_details = document.getElementById('additional-details-input').value.trim();
          repairState.files = uploadedFiles;

          submitRepair(repairState);
          showStep('thanks');
          updateProgress(5);
        } else {
          alert('Please fill in all required fields');
        }
        return;
      }

      // Back buttons
      const backBtn = e.target.closest('[data-back]');
      if (backBtn) {
        const target = backBtn.getAttribute('data-back');
        if (target === 'device') { showStep('device'); updateProgress(1); }
        if (target === 'brand') { showStep('brand'); updateProgress(2); }
        if (target === 'model') { showStep('model'); updateProgress(2); }
        if (target === 'issue') { showStep('issue'); updateProgress(3); }
        if (target === 'contact') { showStep('contact'); updateProgress(4); }
        return;
      }

      // Reset button
      const resetBtn = e.target.closest('[data-action="reset-repair"]');
      if (resetBtn) {
        repairState = {
          device: '', make: '', model: '', issue: '', estimate: '',
          customer_name: '', customer_phone: '', customer_email: '', customer_location: '',
          preferred_time: '', additional_details: '', files: []
        };
        uploadedFiles = [];
        showStep('device');
        updateProgress(1);
        if (document.getElementById('repair-contact-form')) {
          document.getElementById('repair-contact-form').reset();
        }
        return;
      }
    });
  }

  function showStep(step) {
    document.querySelectorAll('.repair-step').forEach((s) => s.classList.remove('active'));
    const map = {
      device: 'step-device',
      brand: 'step-brand',
      model: 'step-model',
      issue: 'step-issue',
      contact: 'step-contact',
      thanks: 'step-thanks'
    };
    const el = document.getElementById(map[step]);
    if (el) el.classList.add('active');
  }

  function updateProgress(step) {
    for (let i = 1; i <= 5; i++) {
      const el = document.getElementById('progress-' + i);
      if (!el) continue;
      el.classList.remove('active', 'completed');
      if (i < step) el.classList.add('completed');
      if (i === step) el.classList.add('active');
    }
  }

  function renderIssues(device) {
    const data = repairData[device];
    if (!data) return;
    document.getElementById('issue-title').textContent = data.title;

    const brandGrid = document.getElementById('step-brand');
    if (brandGrid) {
      const brandContainer = brandGrid.querySelector('.option-grid');
      if (brandContainer) {
        brandContainer.innerHTML = data.makes
          .map((m) => `<button class="option-btn" type="button" data-make="${m}">${m}</button>`)
          .join('');
      }
    }

    const issueList = document.getElementById('step-issue');
    if (issueList) {
      const issueContainer = issueList.querySelector('.option-grid');
      if (issueContainer) {
        issueContainer.innerHTML = data.issues
          .map(
            (item) =>
              `<button class="option-btn" type="button" data-type="${item.name}" data-estimate="${item.estimate}">${item.name} <span style="font-family:var(--font-mono);font-size:var(--text-xs);color:var(--text-muted);margin-left:8px;">${item.estimate}</span></button>`
          )
          .join('');
      }
    }
  }

  function submitRepair(data) {
    // Save to localStorage for employee portal
    try {
      const repairs = JSON.parse(localStorage.getItem('atr_repairs') || '[]');
      const repairId = 'R' + Date.now();
      const newRepair = {
        id: repairId,
        device: data.device,
        brand: data.make,
        model: data.model,
        issue: data.issue,
        estimate: data.estimate,
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        customer_email: data.customer_email,
        customer_location: data.customer_location,
        preferred_time: data.preferred_time,
        additional_details: data.additional_details,
        status: 'Received',
        submitted_at: new Date().toISOString(),
        files: data.files ? data.files.map(f => ({ name: f.name, size: f.size, type: f.type })) : []
      };
      repairs.push(newRepair);
      localStorage.setItem('atr_repairs', JSON.stringify(repairs));
      console.log('Repair submitted:', newRepair);
    } catch (err) {
      console.error('Error saving repair:', err);
    }
  }

  /* ===== FILE UPLOAD ===== */
  function initFileUpload() {
    const dropZone = document.getElementById('file-drop-zone');
    const fileInput = document.getElementById('file-upload');
    const browseBtn = document.getElementById('file-browse-btn');
    const previewList = document.getElementById('file-preview-list');

    if (!dropZone || !fileInput) return;

    setupFileDropZone(dropZone, fileInput, browseBtn, previewList, (files) => {
      uploadedFiles = files;
    });
  }

  function initContactFileUpload() {
    const dropZone = document.getElementById('contact-file-drop-zone');
    const fileInput = document.getElementById('contact-file-upload');
    const browseBtn = document.getElementById('contact-file-browse-btn');
    const previewList = document.getElementById('contact-file-preview-list');

    if (!dropZone || !fileInput) return;

    setupFileDropZone(dropZone, fileInput, browseBtn, previewList, (files) => {
      contactUploadedFiles = files;
    });
  }

  function setupFileDropZone(dropZone, fileInput, browseBtn, previewList, onFilesCallback) {
    browseBtn.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('click', (e) => {
      if (e.target === dropZone || e.target.tagName === 'I' || e.target.tagName === 'P') {
        fileInput.click();
      }
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--primary)';
      dropZone.style.background = 'var(--primary-highlight)';
    });
    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '';
      dropZone.style.background = '';
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '';
      dropZone.style.background = '';
      handleFiles(e.dataTransfer.files, previewList, onFilesCallback);
    });

    fileInput.addEventListener('change', (e) => {
      handleFiles(e.target.files, previewList, onFilesCallback);
    });
  }

  function handleFiles(fileList, previewList, onFilesCallback) {
    const files = Array.from(fileList).slice(0, 5);
    const validFiles = files.filter((f) => f.size <= 10 * 1024 * 1024);

    if (files.length > 5) {
      alert('Maximum 5 files allowed. Only the first 5 will be uploaded.');
    }

    onFilesCallback(validFiles);
    renderFilePreviews(validFiles, previewList);
  }

  function renderFilePreviews(files, previewList) {
    previewList.innerHTML = '';
    files.forEach((file, idx) => {
      const isImage = file.type.startsWith('image/');
      const preview = document.createElement('div');
      preview.style.cssText =
        'position:relative;width:80px;height:80px;border-radius:8px;overflow:hidden;border:2px solid var(--border);background:var(--surface-2);';

      if (isImage) {
        const img = document.createElement('img');
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
        img.src = URL.createObjectURL(file);
        img.alt = file.name;
        preview.appendChild(img);
      } else {
        const icon = document.createElement('div');
        icon.style.cssText = 'width:100%;height:100%;display:grid;place-items:center;color:var(--text-muted);';
        icon.innerHTML = '<i class="fas fa-file" style="font-size:1.5rem;"></i>';
        preview.appendChild(icon);
      }

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.style.cssText =
        'position:absolute;top:2px;right:2px;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,.7);color:#fff;border:none;font-size:10px;cursor:pointer;display:grid;place-items:center;';
      removeBtn.innerHTML = '<i class="fas fa-times"></i>';
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        preview.remove();
      };
      preview.appendChild(removeBtn);

      preview.title = file.name + ' (' + (file.size / 1024).toFixed(0) + 'KB)';
      previewList.appendChild(preview);
    });
  }

  /* ===== FORMS ===== */
  function initForms() {
    const contactForm = document.getElementById('contact-file-form');
    if (contactForm) {
      contactForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(contactForm);
        const data = {
          name: formData.get('name'),
          contact: formData.get('contact'),
          message: formData.get('message'),
          timestamp: new Date().toISOString(),
        };
        submitToJotForm(data, contactUploadedFiles, 'contact')
          .then(() => {
            const thanks = document.getElementById('contact-file-thanks');
            if (thanks) {
              thanks.hidden = false;
              contactForm.style.display = 'none';
            }
          })
          .catch(() => {
            const thanks = document.getElementById('contact-file-thanks');
            if (thanks) {
              thanks.hidden = false;
              contactForm.style.display = 'none';
            }
          });
      });
    }
  }

  /* ===== JOTFORM SUBMISSION ===== */
  function submitToJotForm(data, files, type) {
    return new Promise((resolve, reject) => {
      console.log(`${type} form submitted:`, data);
      if (files && files.length) {
        console.log('Files uploaded:', files.map(f => ({ name: f.name, size: f.size, type: f.type })));
      }

      try {
        const submissions = JSON.parse(localStorage.getItem('atr_submissions') || '[]');
        submissions.push({ type, data, files: files ? files.map(f => ({ name: f.name, size: f.size, type: f.type })) : [], timestamp: new Date().toISOString() });
        localStorage.setItem('atr_submissions', JSON.stringify(submissions));
      } catch {}

      resolve();
    });
  }

  /* ===== POLICY OVERLAY ===== */
  function openPolicy(key) {
    const html = policies[key];
    if (!html) return;
    policyBody.innerHTML = html;
    policyOverlay.classList.add('open');
    document.body.classList.add('no-scroll');
    policyOverlay.setAttribute('aria-hidden', 'false');
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('#policy-close') || e.target === policyOverlay) {
      policyOverlay.classList.remove('open');
      document.body.classList.remove('no-scroll');
      policyOverlay.setAttribute('aria-hidden', 'true');
      policyBody.innerHTML = '';
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMenu();
      closeSearch();
      closeCart();
      policyOverlay.classList.remove('open');
      document.body.classList.remove('no-scroll');
    }
  });

  /* ===== SCROLL REVEAL ===== */
  function initScrollReveal() {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );

    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
  }

  /* ===== SLIDESHOW ===== */
  function initSlideshow() {
    const slides = document.querySelectorAll('.slide');
    const dotsContainer = document.getElementById('slide-dots');
    if (slides.length === 0) return;

    if (dotsContainer) {
      dotsContainer.innerHTML = Array.from(slides)
        .map((_, i) => `<div class="slide-dot${i === 0 ? ' active' : ''}" data-slide="${i}"></div>`)
        .join('');

      dotsContainer.addEventListener('click', (e) => {
        const dot = e.target.closest('.slide-dot');
        if (dot) {
          const idx = parseInt(dot.getAttribute('data-slide'));
          goToSlide(idx);
        }
      });
    }

    setInterval(() => {
      goToSlide((slideIndex + 1) % slides.length);
    }, 5000);
  }

  function goToSlide(idx) {
    const slides = document.querySelectorAll('.slide');
    const dots = document.querySelectorAll('.slide-dot');
    slides[slideIndex]?.classList.remove('active');
    dots[slideIndex]?.classList.remove('active');
    slideIndex = idx;
    slides[slideIndex]?.classList.add('active');
    dots[slideIndex]?.classList.add('active');
  }

  /* ===== FAQ ACCORDION ===== */
  function initFAQ() {
    document.addEventListener('click', (e) => {
      const question = e.target.closest('.faq-question');
      if (!question) return;

      const item = question.parentElement;
      const isOpen = item.classList.contains('open');

      document.querySelectorAll('.faq-item').forEach((f) => f.classList.remove('open'));

      if (!isOpen) {
        item.classList.add('open');
      }
    });
  }

  /* ===== PRODUCT FILTERS ===== */
  function initProductFilters() {
    document.addEventListener('click', (e) => {
      const filterBtn = e.target.closest('.filter-btn');
      if (!filterBtn) return;

      const filter = filterBtn.getAttribute('data-filter');

      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      filterBtn.classList.add('active');

      document.querySelectorAll('.product-card').forEach((card) => {
        if (filter === 'all' || card.getAttribute('data-category') === filter) {
          card.style.display = '';
        } else {
          card.style.display = 'none';
        }
      });
    });
  }

  /* ===== HEADER SCROLL ===== */
  function initHeaderScroll() {
    let lastScroll = 0;
    window.addEventListener('scroll', () => {
      const currentScroll = window.pageYOffset;
      if (currentScroll > 10) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
      lastScroll = currentScroll;
    });
  }

  /* ===== EMPLOYEE PORTAL (global functions) ===== */
  const DEMO_USER = 'demo';
  const DEMO_PASS = '0000';

  window.login = function () {
    const u = document.getElementById('username').value.trim();
    const p = document.getElementById('passcode').value.trim();
    const msg = document.getElementById('loginMsg');
    if (u === DEMO_USER && p === DEMO_PASS) {
      document.getElementById('loginView').classList.add('hidden');
      document.getElementById('portalView').classList.remove('hidden');
      msg.textContent = '';
    } else {
      msg.textContent = 'Invalid credentials. Use demo / 0000';
    }
  };

  window.logout = function () {
    document.getElementById('portalView').classList.add('hidden');
    document.getElementById('loginView').classList.remove('hidden');
    document.getElementById('username').value = '';
    document.getElementById('passcode').value = '';
  };

  window.openModal = function (id) {
    const dlg = document.getElementById(id);
    if (dlg && typeof dlg.showModal === 'function') dlg.showModal();
  };

  window.closeModal = function (id) {
    const dlg = document.getElementById(id);
    if (dlg && typeof dlg.close === 'function') dlg.close();
  };

  window.showSection = function (name, btn) {
    document.querySelectorAll('.portal-section').forEach((s) => s.classList.remove('active'));
    document.getElementById(name)?.classList.add('active');
    document.querySelectorAll('.portal-nav button').forEach((b) => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
  };

  /* ===== EXPOSE CONFIG FOR USER ===== */
  window.ATR_CONFIG = CONFIG;
})();
