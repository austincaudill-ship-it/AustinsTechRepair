document.addEventListener('DOMContentLoaded', () => {
  const bottomNavItems = document.querySelectorAll('.mobile-bottom-nav .bottom-nav-item');
  const mobileMenu = document.querySelector('.mobile-menu');
  const menuToggle = document.getElementById('bottom-menu-toggle');

  // Handle bottom thumb navigation clicks
  bottomNavItems.forEach(item => {
    item.addEventListener('click', function (e) {
      // If the menu button is clicked, toggle the mobile drawer overlay
      if (this.id === 'bottom-menu-toggle') {
        if (mobileMenu) {
          const isOpen = mobileMenu.getAttribute('aria-hidden') === 'false';
          mobileMenu.setAttribute('aria-hidden', isOpen ? 'true' : 'false');
          this.classList.toggle('active', !isOpen);
        }
        return;
      }

      // Remove active class from all bottom nav items and add to the clicked one
      bottomNavItems.forEach(nav => nav.classList.remove('active'));
      this.classList.add('active');

      // If you are using a page-switching system with data-page or href attributes:
      const targetPage = this.getAttribute('data-page') || this.getAttribute('href')?.replace('#', '');
      if (targetPage) {
        // Hide all pages and show the targeted page
        document.querySelectorAll('.page').forEach(page => {
          page.classList.remove('active');
        });
        const activePageElement = document.getElementById(targetPage);
        if (activePageElement) {
          activePageElement.classList.add('active');
        }
      }
    });
  });

  // Optional: Close mobile menu when clicking outside or on close buttons
  const menuCloseBtn = document.querySelector('.menu-close');
  if (menuCloseBtn && mobileMenu) {
    menuCloseBtn.addEventListener('click', () => {
      mobileMenu.setAttribute('aria-hidden', 'true');
      if (menuToggle) menuToggle.classList.remove('active');
    });
  }
});
