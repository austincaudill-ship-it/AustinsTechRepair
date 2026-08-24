/* ==========================================================================
   AUSTIN'S TECH REPAIR GROUP — MASTER JAVASCRIPT
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // -------------------------------------------------------------------------
  // 1. PAGE NAVIGATION ROUTING & TABS
  // -------------------------------------------------------------------------
  const navLinks = document.querySelectorAll('.nav-link, .menu-link, .footer-link, [data-page]');
  const pages = document.querySelectorAll('.page');

  function switchPage(targetPageId) {
    if (!targetPageId) return;
    
    const cleanId = targetPageId.replace('#', '');
    const targetElement = document.getElementById(cleanId);
    
    if (targetElement && targetElement.classList.contains('page')) {
      pages.forEach(p => p.classList.remove('active'));
      targetElement.classList.add('active');

      navLinks.forEach(l => {
        const pageAttr = l.getAttribute('data-page') || l.getAttribute('href');
        if (pageAttr && pageAttr.includes(cleanId)) {
          l.classList.add('active');
        } else {
          l.classList.remove('active');
        }
      });

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('#') && href.length > 1) {
        e.preventDefault();
        const pageId = href.substring(1);
        switchPage(pageId);
        window.location.hash = pageId;

        const mobileMenu = document.getElementById('mobile-menu');
        if (mobileMenu) mobileMenu.setAttribute('aria-hidden', 'true');
      }
    });
  });

  if (window.location.hash) {
    switchPage(window.location.hash.substring(1));
  }

  // -------------------------------------------------------------------------
  // 2. MOBILE MENU DRAWER
  // -------------------------------------------------------------------------
  const mobileMenu = document.getElementById('mobile-menu');
  const bottomMenuToggle = document.getElementById('bottom-menu-toggle');
  const menuClose = document.getElementById('menu-close');

  if (bottomMenuToggle && mobileMenu) {
    bottomMenuToggle.addEventListener('click', () => {
      mobileMenu.setAttribute('aria-hidden', 'false');
    });
  }

  if (menuClose && mobileMenu) {
    menuClose.addEventListener('click', () => {
      mobileMenu.setAttribute('aria-hidden', 'true');
    });
  }

  // -------------------------------------------------------------------------
  // 3. COOKIE CONSENT & PREFERENCE CENTER LOGIC
  // -------------------------------------------------------------------------
  const cookieBanner = document.getElementById('cookie-banner');
  const acceptBtn = document.getElementById('cookie-accept');
  const declineBtn = document.getElementById('cookie-decline');
  const prefsOpenBtn = document.getElementById('cookie-prefs-open');
  const prefsModal = document.getElementById('cookie-prefs-modal');
  const prefsClose = document.getElementById('cookie-prefs-close');
  const prefsCancel = document.getElementById('cookie-prefs-cancel');
  const prefsBackdrop = document.getElementById('cookie-prefs-backdrop');
  const prefsSave = document.getElementById('cookie-prefs-save');
  const prefAnalytics = document.getElementById('pref-analytics');
  const prefMarketing = document.getElementById('pref-marketing');
  
  const COOKIE_STORAGE_KEY = 'atr_cookie_preference';
  const COOKIE_DETAILS_KEY = 'atr_cookie_details';

  if (cookieBanner && !localStorage.getItem(COOKIE_STORAGE_KEY)) {
    setTimeout(() => {
      cookieBanner.classList.add('active');
      cookieBanner.setAttribute('aria-hidden', 'false');
    }, 600);
  }

  if (acceptBtn) {
    acceptBtn.addEventListener('click', () => {
      localStorage.setItem(COOKIE_STORAGE_KEY, 'all');
      localStorage.setItem(COOKIE_DETAILS_KEY, JSON.stringify({ analytics: true, marketing: true }));
      closeBanner();
    });
  }

  if (declineBtn) {
    declineBtn.addEventListener('click', () => {
      localStorage.setItem(COOKIE_STORAGE_KEY, 'necessary');
      localStorage.setItem(COOKIE_DETAILS_KEY, JSON.stringify({ analytics: false, marketing: false }));
      closeBanner();
    });
  }

  if (prefsOpenBtn) {
    prefsOpenBtn.addEventListener('click', () => {
      openPrefsModal();
    });
  }

  function closePrefsModal() {
    if (prefsModal) {
      prefsModal.classList.remove('active');
      prefsModal.setAttribute('aria-hidden', 'true');
    }
  }

  function openPrefsModal() {
    if (prefsModal) {
      const savedDetails = JSON.parse(localStorage.getItem(COOKIE_DETAILS_KEY));
      if (savedDetails) {
        if (prefAnalytics) prefAnalytics.checked = savedDetails.analytics;
        if (prefMarketing) prefMarketing.checked = savedDetails.marketing;
      }
      prefsModal.classList.add('active');
      prefsModal.setAttribute('aria-hidden', 'false');
    }
  }

  if (prefsClose) prefsClose.addEventListener('click', closePrefsModal);
  if (prefsCancel) prefsCancel.addEventListener('click', closePrefsModal);
  if (prefsBackdrop) prefsBackdrop.addEventListener('click', closePrefsModal);

  if (prefsSave) {
    prefsSave.addEventListener('click', () => {
      const details = {
        analytics: prefAnalytics ? prefAnalytics.checked : false,
        marketing: prefMarketing ? prefMarketing.checked : false
      };
      localStorage.setItem(COOKIE_STORAGE_KEY, 'custom');
      localStorage.setItem(COOKIE_DETAILS_KEY, JSON.stringify(details));
      closePrefsModal();
      closeBanner();
    });
  }

  function closeBanner() {
    if (cookieBanner) {
      cookieBanner.classList.remove('active');
      cookieBanner.setAttribute('aria-hidden', 'true');
    }
  }

  // -------------------------------------------------------------------------
  // 4. FOOTER SLIDESHOW COMPONENT
  // -------------------------------------------------------------------------
  const slides = document.querySelectorAll('.slideshow .slide');
  const dotsContainer = document.getElementById('slide-dots');
  let currentSlide = 0;

  if (slides.length > 0 && dotsContainer) {
    slides.forEach((_, index) => {
      const dot = document.createElement('span');
      dot.classList.add('slide-dot');
      if (index === 0) dot.classList.add('active');
      dot.addEventListener('click', () => goToSlide(index));
      dotsContainer.appendChild(dot);
    });

    const dots = dotsContainer.querySelectorAll('.slide-dot');

    function goToSlide(n) {
      slides[currentSlide].classList.remove('active');
      dots[currentSlide].classList.remove('active');
      currentSlide = (n + slides.length) % slides.length;
      slides[currentSlide].classList.add('active');
      dots[currentSlide].classList.add('active');
    }

    setInterval(() => {
      goToSlide(currentSlide + 1);
    }, 5000);
  }

  // -------------------------------------------------------------------------
  // 5. SHOPPING CART & DRAWERS
  // -------------------------------------------------------------------------
  const cartToggle = document.getElementById('cart-toggle');
  const cartDrawer = document.getElementById('cart-drawer');
  const cartCloseBtn = document.getElementById('cart-drawer-close-btn');
  const cartBackdrop = document.getElementById('cart-drawer-close');

  function toggleCart(open) {
    if (cartDrawer) {
      cartDrawer.setAttribute('aria-hidden', open ? 'false' : 'true');
      document.body.style.overflow = open ? 'hidden' : '';
    }
  }

  if (cartToggle) cartToggle.addEventListener('click', () => toggleCart(true));
  if (cartCloseBtn) cartCloseBtn.addEventListener('click', () => toggleCart(false));
  if (cartBackdrop) cartBackdrop.addEventListener('click', () => toggleCart(false));

  // Scroll Reveal Animation Observer
  const observerOptions = { threshold: 0.1, rootMargin: '0px 0px -50px 0px' };
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        obs.unobserve(entry.target);
      }
    });
  }, observerOptions);

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
});
