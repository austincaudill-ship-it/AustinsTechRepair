/* ============================================================
   AUSTIN'S TECH REPAIR GROUP — Main Site JavaScript
   ============================================================ */
(function () {
  'use strict';

  /* ---- Theme Toggle ---- */
  const themeToggle = document.getElementById('theme-toggle');
  
  // Check for saved theme in localStorage, otherwise fallback to system preference
  let currentTheme = localStorage.getItem('theme') || 
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  function initTheme() {
    document.documentElement.setAttribute('data-theme', currentTheme);
    updateThemeIcon();
  }

  function updateThemeIcon() {
    if (themeToggle) {
      themeToggle.innerHTML = currentTheme === 'dark'
        ? '<i class="fas fa-sun" aria-hidden="true"></i>'
        : '<i class="fas fa-moon" aria-hidden="true"></i>';
    }
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', currentTheme);
      localStorage.setItem('theme', currentTheme); // Save preference
      updateThemeIcon();
    });
  }

  initTheme();
})();
  /* ---- Page Navigation ---- */
  const pages = document.querySelectorAll('.page');
  const navLinks = document.querySelectorAll('[data-page]');

  function navigateTo(pageId) {
    pages.forEach(p => p.classList.remove('active'));
    const target = document.getElementById(pageId);
    if (target) {
      target.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    navLinks.forEach(l => l.classList.remove('active'));
    document.querySelectorAll(`[data-page="${pageId}"]`).forEach(l => l.classList.add('active'));

    closeMobileMenu();
    closeSearchOverlay();
    closeCartDrawer();
  }

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      const page = link.getAttribute('data-page');
      if (page) {
        e.preventDefault();
        navigateTo(page);
      }
    });
  });

  // Handle hash-based navigation on load
  window.addEventListener('load', () => {
    const hash = window.location.hash.replace('#', '');
    if (hash && document.getElementById(hash)) {
      navigateTo(hash);
    }
  });

  /* ---- Mobile Menu ---- */
  const mobileMenu = document.getElementById('mobile-menu');
  const menuToggle = document.getElementById('menu-toggle');
  const menuClose = document.getElementById('menu-close');

  function openMobileMenu() {
    if (mobileMenu) {
      mobileMenu.classList.add('open');
      mobileMenu.setAttribute('aria-hidden', 'false');
    }
  }
  function closeMobileMenu() {
    if (mobileMenu) {
      mobileMenu.classList.remove('open');
      mobileMenu.setAttribute('aria-hidden', 'true');
    }
  }

  if (menuToggle) menuToggle.addEventListener('click', openMobileMenu);
  if (menuClose) menuClose.addEventListener('click', closeMobileMenu);

  /* ---- Search Overlay ---- */
  const searchToggle = document.getElementById('search-toggle');
  const searchOverlay = document.getElementById('search-overlay');
  const searchClose = document.getElementById('search-close');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');

  const searchData = [
    { title: 'Phone Repair', sub: 'Screens, batteries, charging ports', icon: 'fa-mobile-screen-button', page: 'repair' },
    { title: 'Tablet Repair', sub: 'Displays, batteries, touch issues', icon: 'fa-tablet-screen-button', page: 'repair' },
    { title: 'Computer Repair', sub: 'SSD upgrades, RAM, virus removal', icon: 'fa-laptop', page: 'repair' },
    { title: 'Gaming Console Repair', sub: 'HDMI, power, cooling, storage', icon: 'fa-gamepad', page: 'repair' },
    { title: 'Smart Watch Repair', sub: 'Battery, display, charging', icon: 'fa-stopwatch', page: 'repair' },
    { title: 'B2B & Managed IT', sub: 'Networking, servers, cloud, helpdesk', icon: 'fa-building', page: 'b2b' },
    { title: 'ATR One Membership', sub: '$19.99/month — priority service', icon: 'fa-star', page: 'atr-one' },
    { title: 'Shop Products', sub: 'Cases, chargers, accessories', icon: 'fa-bag-shopping', page: 'shop' },
    { title: 'Contact Us', sub: 'Phone, text, email, photos', icon: 'fa-envelope', page: 'contact' },
    { title: 'About Us', sub: '15+ years serving Ohio', icon: 'fa-circle-info', page: 'about' },
    { title: 'Start a Repair', sub: 'Get an instant estimate', icon: 'fa-wrench', page: 'repair' },
    { title: 'Employee Portal', sub: 'Sign in to manage operations', icon: 'fa-id-badge', page: 'employee' },
  ];

  function openSearchOverlay() {
    if (searchOverlay) {
      searchOverlay.classList.add('open');
      searchOverlay.setAttribute('aria-hidden', 'false');
      if (searchInput) { searchInput.focus(); searchInput.value = ''; renderSearchResults(''); }
    }
  }
  function closeSearchOverlay() {
    if (searchOverlay) {
      searchOverlay.classList.remove('open');
      searchOverlay.setAttribute('aria-hidden', 'true');
    }
  }

  function renderSearchResults(query) {
    if (!searchResults) return;
    if (!query.trim()) {
      searchResults.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: var(--space-4); font-size: var(--text-sm);">Start typing to search...</p>';
      return;
    }
    const q = query.toLowerCase();
    const matches = searchData.filter(item =>
      item.title.toLowerCase().includes(q) || item.sub.toLowerCase().includes(q)
    );
    if (matches.length === 0) {
      searchResults.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: var(--space-4); font-size: var(--text-sm);">No results found.</p>';
      return;
    }
    searchResults.innerHTML = matches.map(item =>
      `<div class="search-result-item" data-page="${item.page}">
        <i class="fas ${item.icon}" aria-hidden="true"></i>
        <div><div class="result-title">${item.title}</div><div class="result-sub">${item.sub}</div></div>
      </div>`
    ).join('');
    searchResults.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => navigateTo(item.getAttribute('data-page')));
    });
  }

  if (searchToggle) searchToggle.addEventListener('click', openSearchOverlay);
  if (searchClose) searchClose.addEventListener('click', closeSearchOverlay);
  if (searchInput) searchInput.addEventListener('input', (e) => renderSearchResults(e.target.value));

  // Hero search
  const heroSearchForm = document.getElementById('hero-search-form');
  const heroSearchInput = document.getElementById('hero-search-input');
  if (heroSearchForm) {
    heroSearchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (heroSearchInput && heroSearchInput.value.trim()) {
        openSearchOverlay();
        if (searchInput) {
          searchInput.value = heroSearchInput.value;
          renderSearchResults(heroSearchInput.value);
        }
      }
    });
  }

  /* ---- Cart System ---- */
  let cart = [];

  const cartToggle = document.getElementById('cart-toggle');
  const cartDrawer = document.getElementById('cart-drawer');
  const cartDrawerClose = document.getElementById('cart-drawer-close');
  const cartDrawerCloseBtn = document.getElementById('cart-drawer-close-btn');
  const cartBadge = document.getElementById('cart-badge');
  const cartItemsContainer = document.getElementById('cart-drawer-items');
  const cartTotal = document.getElementById('cart-drawer-total');

  function openCartDrawer() {
    if (cartDrawer) { cartDrawer.classList.add('open'); cartDrawer.setAttribute('aria-hidden', 'false'); }
  }
  function closeCartDrawer() {
    if (cartDrawer) { cartDrawer.classList.remove('open'); cartDrawer.setAttribute('aria-hidden', 'true'); }
  }

  function updateCartUI() {
    const count = cart.reduce((sum, item) => sum + item.qty, 0);
    if (cartBadge) { cartBadge.textContent = count; cartBadge.setAttribute('data-count', count); }

    if (!cartItemsContainer) return;
    if (cart.length === 0) {
      cartItemsContainer.innerHTML = '<div class="cart-empty"><i class="fas fa-cart-shopping"></i><p>Your cart is empty</p></div>';
    } else {
      cartItemsContainer.innerHTML = cart.map((item, i) =>
        `<div class="cart-item">
          ${item.image ? `<img src="${item.image}" alt="${item.name}" />` : ''}
          <div class="cart-item-info">
            <div class="cart-item-name">${item.name}</div>
            <div class="cart-item-price">$${item.price.toFixed(2)} × ${item.qty}</div>
            <div class="cart-item-remove" data-remove="${i}">Remove</div>
          </div>
        </div>`
      ).join('');
      cartItemsContainer.querySelectorAll('[data-remove]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.getAttribute('data-remove'));
          cart.splice(idx, 1);
          updateCartUI();
        });
      });
    }

    const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    if (cartTotal) cartTotal.textContent = `$${total.toFixed(2)}`;
  }

  function addToCart(item) {
    const existing = cart.find(c => c.id === item.id);
    if (existing) {
      existing.qty++;
    } else {
      cart.push({ ...item, qty: 1 });
    }
    updateCartUI();
    openCartDrawer();
  }

  // Listen for add-to-cart events
  document.querySelectorAll('[data-add-cart]').forEach(btn => {
    btn.addEventListener('click', () => {
      try {
        const item = JSON.parse(btn.getAttribute('data-add-cart'));
        addToCart(item);
      } catch (e) { console.error('Invalid cart data', e); }
    });
  });

  if (cartToggle) cartToggle.addEventListener('click', openCartDrawer);
  if (cartDrawerClose) cartDrawerClose.addEventListener('click', closeCartDrawer);
  if (cartDrawerCloseBtn) cartDrawerCloseBtn.addEventListener('click', closeCartDrawer);

  const cartClear = document.getElementById('cart-clear');
  if (cartClear) cartClear.addEventListener('click', () => { cart = []; updateCartUI(); });

  // Checkout buttons
  const squareCheckout = document.getElementById('cart-checkout-square');
  if (squareCheckout) squareCheckout.addEventListener('click', () => {
    if (cart.length === 0) { alert('Your cart is empty.'); return; }
    window.open('https://squareup.com', '_blank');
  });

  const shopifyCheckout = document.getElementById('cart-checkout-shopify');
  if (shopifyCheckout) shopifyCheckout.addEventListener('click', () => {
    if (cart.length === 0) { alert('Your cart is empty.'); return; }
    window.open('https://austinstechedgerepair.myshopify.com', '_blank');
  });

  // Shopify store link
  const shopifyLink = document.getElementById('shopify-store-link');
  if (shopifyLink) shopifyLink.href = 'https://austinstechedgerepair.myshopify.com';

  updateCartUI();

  /* ---- Shop Filters ---- */
  const filterBtns = document.querySelectorAll('.filter-btn');
  const productCards = document.querySelectorAll('.product-card');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.getAttribute('data-filter');
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      productCards.forEach(card => {
        const cat = card.getAttribute('data-category');
        card.style.display = (filter === 'all' || cat === filter) ? '' : 'none';
      });
    });
  });

  /* ---- Slideshow ---- */
  const slides = document.querySelectorAll('.slide');
  const slideDotsContainer = document.getElementById('slide-dots');
  let currentSlide = 0;
  let slideInterval = null;

  if (slides.length > 0) {
    // Create dots
    if (slideDotsContainer) {
      slideDotsContainer.innerHTML = '';
      slides.forEach((_, i) => {
        const dot = document.createElement('div');
        dot.className = 'slide-dot' + (i === 0 ? ' active' : '');
        dot.addEventListener('click', () => goToSlide(i));
        slideDotsContainer.appendChild(dot);
      });
    }

    function goToSlide(index) {
      slides[currentSlide].classList.remove('active');
      const dots = slideDotsContainer ? slideDotsContainer.querySelectorAll('.slide-dot') : [];
      if (dots[currentSlide]) dots[currentSlide].classList.remove('active');
      currentSlide = (index + slides.length) % slides.length;
      slides[currentSlide].classList.add('active');
      if (dots[currentSlide]) dots[currentSlide].classList.add('active');
    }

    function nextSlide() { goToSlide(currentSlide + 1); }

    slideInterval = setInterval(nextSlide, 5000);
  }

  /* ---- FAQ ---- */
  document.querySelectorAll('.faq-question').forEach(q => {
    q.addEventListener('click', () => {
      const item = q.closest('.faq-item');
      const answer = item.querySelector('.faq-answer');
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open .faq-answer').forEach(a => { a.style.maxHeight = '0'; a.closest('.faq-item').classList.remove('open'); });
      if (!isOpen) {
        item.classList.add('open');
        answer.style.maxHeight = answer.scrollHeight + 'px';
      }
    });
  });

  /* ---- Policy Overlay ---- */
  const policyOverlay = document.getElementById('policy-overlay');
  const policyClose = document.getElementById('policy-close');
  const policyBody = document.getElementById('policy-body');

  const policies = {
    privacy: {
      title: 'Privacy Policy',
      content: `
        <h2>Privacy Policy</h2>
        <p>Austin's Tech Repair Group LLC ("we," "our," "us") respects your privacy. This policy describes how we collect, use, and protect your personal information.</p>
        <h3>Information We Collect</h3>
        <p>We collect information you provide directly: name, phone number, email address, and device details when you submit a repair request or contact us.</p>
        <h3>How We Use Your Information</h3>
        <ul><li>To process repair requests and provide quotes</li><li>To communicate about your repair status</li><li>To improve our services and customer experience</li></ul>
        <h3>Data Security</h3>
        <p>We implement reasonable security measures to protect your data. Payment processing is handled by Square and Shopify — we never store your payment card information.</p>
        <h3>Contact</h3>
        <p>For privacy questions, call us at 513-478-8077.</p>
      `
    },
    repair: {
      title: 'Repair Service Agreement',
      content: `
        <h2>Repair Service Agreement</h2>
        <p>By submitting a device for repair, you agree to the following terms:</p>
        <h3>Diagnostic & Pricing</h3>
        <p>All estimates are approximate. Final pricing is confirmed after a free diagnostic. You will be notified before any repair work begins.</p>
        <h3>Parts & Warranty</h3>
        <p>We use quality aftermarket and OEM parts. All repairs are backed by a 1-year warranty covering parts and labor. Warranty does not cover accidental damage, water damage, or user-caused issues.</p>
        <h3>Data Responsibility</h3>
        <p>We recommend backing up your data before any repair. While we take precautions, we are not responsible for data loss during repairs.</p>
        <h3>Device Pickup</h3>
        <p>Devices must be picked up within 30 days of repair completion. Uncollected devices after 30 days may be recycled or sold to cover repair costs.</p>
      `
    },
    backup: {
      title: 'Data Backup Waiver',
      content: `
        <h2>Data Backup Waiver</h2>
        <p>Austin's Tech Repair Group LLC is not liable for any data loss that may occur during the repair process.</p>
        <h3>Recommendation</h3>
        <p>We strongly recommend backing up all data before submitting your device for repair. This includes photos, contacts, documents, and app data.</p>
        <h3>Our Responsibility</h3>
        <p>While we take every precaution to protect your data, repairs may involve software resets, component replacement, or other procedures that could result in data loss. By proceeding with repair, you acknowledge this risk.</p>
        <h3>Data Recovery</h3>
        <p>If data loss occurs, we offer data recovery services at an additional cost. Recovery is not guaranteed.</p>
      `
    },
    'warranty-policy': {
      title: '1-Year Warranty Policy',
      content: `
        <h2>1-Year Warranty Policy</h2>
        <p>All repairs performed by Austin's Tech Repair Group LLC are covered by a 1-year warranty.</p>
        <h3>Coverage</h3>
        <ul><li>Defective replacement parts</li><li>Workmanship issues related to the original repair</li><li>Labor costs for warranty repairs</li></ul>
        <h3>Exclusions</h3>
        <ul><li>Accidental or intentional damage (drops, cracks, water damage)</li><li>Damage caused by unauthorized modifications</li><li>Software issues unrelated to the original repair</li><li>Normal wear and tear</li></ul>
        <h3>Claim Process</h3>
        <p>Bring your device and original repair receipt to any of our service locations. We will assess the issue and perform warranty repairs at no cost if covered.</p>
      `
    },
    terms: {
      title: 'Terms & Conditions',
      content: `
        <h2>Terms & Conditions</h2>
        <h3>Service Acceptance</h3>
        <p>By using our services, you agree to these terms. Austin's Tech Repair Group LLC provides repair services for electronic devices on a best-effort basis.</p>
        <h3>Pricing</h3>
        <p>All prices are quoted before repair and require customer approval. Prices may change based on parts availability and diagnostic findings.</p>
        <h3>Cancellations</h3>
        <p>You may cancel a repair before work begins at no charge. If parts have been ordered or work has started, a fee may apply.</p>
        <h3>Liability</h3>
        <p>Our liability is limited to the cost of the repair service. We are not liable for consequential damages or data loss.</p>
      `
    },
    'website-terms': {
      title: 'Website Terms of Use',
      content: `
        <h2>Website Terms of Use</h2>
        <p>By accessing this website, you agree to these terms.</p>
        <h3>Content Usage</h3>
        <p>All content on this website is the property of Austin's Tech Repair Group LLC. You may not reproduce or distribute content without permission.</p>
        <h3>Independent Provider</h3>
        <p>Austin's Tech Repair Group LLC is an independent repair provider. We are not affiliated with, endorsed by, or sponsored by any manufacturer. All trademarks belong to their respective owners.</p>
        <h3>Third-Party Links</h3>
        <p>This website may contain links to third-party websites. We are not responsible for the content or practices of external sites.</p>
        <h3>Changes</h3>
        <p>We reserve the right to modify these terms at any time. Continued use of the website constitutes acceptance of updated terms.</p>
      `
    }
  };

  document.querySelectorAll('[data-policy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-policy');
      const policy = policies[key];
      if (policy && policyOverlay && policyBody) {
        policyBody.innerHTML = `<h2>${policy.title}</h2>${policy.content.replace(/<h2>.*?<\/h2>/, '')}`;
        policyOverlay.classList.add('open');
        policyOverlay.setAttribute('aria-hidden', 'false');
      }
    });
  });

  if (policyClose) policyClose.addEventListener('click', () => {
    policyOverlay.classList.remove('open');
    policyOverlay.setAttribute('aria-hidden', 'true');
  });

  /* ---- Contact File Upload ---- */
  const contactFileForm = document.getElementById('contact-file-form');
  const contactFileUpload = document.getElementById('contact-file-upload');
  const contactFileBrowseBtn = document.getElementById('contact-file-browse-btn');
  const contactFileDropZone = document.getElementById('contact-file-drop-zone');
  const contactFilePreview = document.getElementById('contact-file-preview-list');
  const contactFileThanks = document.getElementById('contact-file-thanks');

  if (contactFileBrowseBtn && contactFileUpload) {
    contactFileBrowseBtn.addEventListener('click', () => contactFileUpload.click());
  }

  if (contactFileDropZone && contactFileUpload) {
    contactFileDropZone.addEventListener('click', (e) => {
      if (e.target.tagName !== 'BUTTON') contactFileUpload.click();
    });
    contactFileDropZone.addEventListener('dragover', (e) => { e.preventDefault(); contactFileDropZone.style.borderColor = 'var(--primary)'; });
    contactFileDropZone.addEventListener('dragleave', () => { contactFileDropZone.style.borderColor = 'var(--border)'; });
    contactFileDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      contactFileDropZone.style.borderColor = 'var(--border)';
      handleContactFiles(e.dataTransfer.files);
    });
    contactFileUpload.addEventListener('change', (e) => handleContactFiles(e.target.files));
  }

  function handleContactFiles(files) {
    if (!contactFilePreview) return;
    Array.from(files).slice(0, 5).forEach(file => {
      if (file.size > 10 * 1024 * 1024) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const preview = document.createElement('div');
        preview.style.cssText = 'width: 80px; height: 80px; border-radius: var(--radius-md); overflow: hidden; position: relative; background: var(--surface-2);';
        if (file.type.startsWith('image/')) {
          preview.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;" /><div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.6);color:#fff;font-size:0.5rem;padding:2px;text-align:center;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${file.name}</div>`;
        } else {
          preview.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:1.5rem;color:var(--text-faint);"><i class="fas fa-file"></i></div>`;
        }
        contactFilePreview.appendChild(preview);
      };
      reader.readAsDataURL(file);
    });
  }

  if (contactFileForm) {
    contactFileForm.addEventListener('submit', (e) => {
      e.preventDefault();
      contactFileForm.style.display = 'none';
      if (contactFileThanks) contactFileThanks.hidden = false;
    });
  }

  /* ---- Reveal Animation ---- */
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

  /* ---- ESC key to close overlays ---- */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMobileMenu();
      closeSearchOverlay();
      closeCartDrawer();
      if (policyOverlay) { policyOverlay.classList.remove('open'); policyOverlay.setAttribute('aria-hidden', 'true'); }
    }
  });

})();
