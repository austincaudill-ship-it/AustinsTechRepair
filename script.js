/* ==========================================================================
   Austin's Tech Repair Group LLC — Main JavaScript
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const bottomNavItems = document.querySelectorAll('.mobile-bottom-nav .bottom-nav-item');
  const desktopNavLinks = document.querySelectorAll('.nav-link, .menu-link');
  const pages = document.querySelectorAll('.page');
  const mobileMenu = document.querySelector('.mobile-menu');
  const menuToggle = document.getElementById('bottom-menu-toggle');
  const menuCloseBtn = document.querySelector('.menu-close');

  // Function to switch active pages and update all navigation highlights
  function navigateToPage(targetPageId) {
    if (!targetPageId) return;

    // 1. Switch visible page sections
    pages.forEach(page => {
      if (page.id === targetPageId) {
        page.classList.add('active');
      } else {
        page.classList.remove('active');
      }
    });

    // 2. Update Desktop & Mobile Menu link active states
    desktopNavLinks.forEach(link => {
      const linkTarget = link.getAttribute('data-page') || link.getAttribute('href')?.replace('#', '');
      if (linkTarget === targetPageId) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    // 3. Update Mobile Bottom Thumb Nav active states
    bottomNavItems.forEach(item => {
      const itemTarget = item.getAttribute('data-page') || item.getAttribute('href')?.replace('#', '');
      if (itemTarget === targetPageId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Scroll back to top smoothly on page change
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Handle Bottom Thumb Navigation Clicks
  bottomNavItems.forEach(item => {
    item.addEventListener('click', function (e) {
      // If the menu button is tapped, toggle the full menu drawer instead of navigating
      if (this.id === 'bottom-menu-toggle') {
        e.preventDefault();
        if (mobileMenu) {
          const isOpen = mobileMenu.getAttribute('aria-hidden') === 'false';
          mobileMenu.setAttribute('aria-hidden', isOpen ? 'true' : 'false');
          this.classList.toggle('active', !isOpen);
        }
        return;
      }

      // Handle standard page links in bottom nav
      const target = this.getAttribute('data-page') || this.getAttribute('href')?.replace('#', '');
      if (target) {
        e.preventDefault();
        navigateToPage(target);

        // Close mobile menu drawer if open
        if (mobileMenu) {
          mobileMenu.setAttribute('aria-hidden', 'true');
        }
      }
    });
  });

  // Handle Desktop & Menu Drawer Link Clicks
  desktopNavLinks.forEach(link => {
    link.addEventListener('click', function (e) {
      const target = this.getAttribute('data-page') || this.getAttribute('href')?.replace('#', '');
      if (target && document.getElementById(target)) {
        e.preventDefault();
        navigateToPage(target);

        // Close mobile menu drawer if open
        if (mobileMenu) {
          mobileMenu.setAttribute('aria-hidden', 'true');
        }
      }
    });
  });

  // Close Mobile Menu Button
  if (menuCloseBtn && mobileMenu) {
    menuCloseBtn.addEventListener('click', () => {
      mobileMenu.setAttribute('aria-hidden', 'true');
      if (menuToggle) menuToggle.classList.remove('active');
    });
  }

  // Close mobile menu when clicking backdrop overlay
  if (mobileMenu) {
    mobileMenu.addEventListener('click', (e) => {
      if (e.target === mobileMenu) {
        mobileMenu.setAttribute('aria-hidden', 'true');
        if (menuToggle) menuToggle.classList.remove('active');
      }
    });
  }
});
