/* ==========================================================================
   Austin's Tech Repair Group LLC — Main JavaScript
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // Navigation & Page Elements
  const bottomNavItems = document.querySelectorAll('.mobile-bottom-nav .bottom-nav-item');
  const desktopNavLinks = document.querySelectorAll('.nav-link, .menu-link');
  const pages = document.querySelectorAll('.page');
  const mobileMenu = document.querySelector('.mobile-menu');
  const menuCloseBtn = document.querySelector('.menu-close');

  // Cart State & Elements
  let cart = [];
  const cartDrawer = document.getElementById('cart-drawer');
  const cartTrigger = document.getElementById('cart-toggle'); 
  const cartBackdrop = document.querySelector('.cart-drawer__backdrop');
  const cartCloseBtn = document.getElementById('cart-drawer-close-btn');
  const cartClearBtn = document.getElementById('cart-clear');
  const cartItemsContainer = document.getElementById('cart-drawer-items');
  const cartTotalPriceElem = document.getElementById('cart-drawer-total');
  const cartBadge = document.getElementById('cart-badge');

  // --- 1. PAGE NAVIGATION SYSTEM ---
  function navigateToPage(targetPageId) {
    if (!targetPageId) return;

    pages.forEach(page => {
      if (page.id === targetPageId) {
        page.classList.add('active');
      } else {
        page.classList.remove('active');
      }
    });

    desktopNavLinks.forEach(link => {
      const linkTarget = link.getAttribute('data-page') || link.getAttribute('href')?.replace('#', '');
      if (linkTarget === targetPageId) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    bottomNavItems.forEach(item => {
      const itemTarget = item.getAttribute('data-page') || item.getAttribute('href')?.replace('#', '');
      if (itemTarget === targetPageId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Bottom Thumb Nav Clicks
  bottomNavItems.forEach(item => {
    item.addEventListener('click', function (e) {
      if (this.id === 'bottom-menu-toggle') {
        e.preventDefault();
        if (mobileMenu) {
          const isOpen = mobileMenu.getAttribute('aria-hidden') === 'false';
          mobileMenu.setAttribute('aria-hidden', isOpen ? 'true' : 'false');
          this.classList.toggle('active', !isOpen);
        }
        return;
      }

      const href = this.getAttribute('href') || '';
      // Safely ignore external links (like Jotform) so they open naturally
      if (href.startsWith('http') || href.includes('://')) {
        return; 
      }

      const target = this.getAttribute('data-page') || href.replace('#', '');
      if (target) {
        e.preventDefault();
        navigateToPage(target);
        if (mobileMenu) mobileMenu.setAttribute('aria-hidden', 'true');
      }
    });
  });

  // Desktop & Drawer Nav Clicks
  desktopNavLinks.forEach(link => {
    link.addEventListener('click', function (e) {
      const href = this.getAttribute('href') || '';
      // Safely ignore external links (like Jotform) so they open naturally
      if (href.startsWith('http') || href.includes('://')) {
        if (mobileMenu) mobileMenu.setAttribute('aria-hidden', 'true');
        return; 
      }

      const target = this.getAttribute('data-page') || href.replace('#', '');
      if (target && document.getElementById(target)) {
        e.preventDefault();
        navigateToPage(target);
        if (mobileMenu) mobileMenu.setAttribute('aria-hidden', 'true');
      }
    });
  });

  // Mobile Menu Controls
  if (menuCloseBtn && mobileMenu) {
    menuCloseBtn.addEventListener('click', () => {
      mobileMenu.setAttribute('aria-hidden', 'true');
    });
  }

  if (mobileMenu) {
    mobileMenu.addEventListener('click', (e) => {
      if (e.target === mobileMenu) {
        mobileMenu.setAttribute('aria-hidden', 'true');
      }
    });
  }

  // --- 2. SHOPPING CART SYSTEM ---
  function updateCartUI() {
    if (!cartItemsContainer || !cartTotalPriceElem || !cartBadge) return;

    cartItemsContainer.innerHTML = '';
    let total = 0;
    let totalCount = 0;

    if (cart.length === 0) {
      cartItemsContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: var(--space-6);">Your cart is empty.</p>';
    } else {
      cart.forEach((item, index) => {
        total += item.price * item.quantity;
        totalCount += item.quantity;

        const cartItemElem = document.createElement('div');
        cartItemElem.className = 'cart-item';
        cartItemElem.innerHTML = `
          <img src="${item.img || 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=200&q=80'}" alt="${item.name}">
          <div class="cart-item-info">
            <div class="cart-item-title">${item.name}</div>
            <div class="cart-item-price">$${item.price.toFixed(2)} x ${item.quantity}</div>
          </div>
          <button class="cart-item-remove" data-index="${index}" style="color: var(--danger); font-size: 0.9rem; padding: 4px; cursor: pointer;"><i class="fa-solid fa-trash"></i></button>
        `;
        cartItemsContainer.appendChild(cartItemElem);
      });
    }

    cartTotalPriceElem.textContent = `$${total.toFixed(2)}`;
    cartBadge.textContent = totalCount;
    cartBadge.style.display = totalCount > 0 ? 'flex' : 'none';

    // Attach remove listeners
    document.querySelectorAll('.cart-item-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.getAttribute('data-index'));
        cart.splice(idx, 1);
        updateCartUI();
      });
    });
  }

  // Open/Close Cart Drawer
  function toggleCartDrawer(open) {
    if (!cartDrawer) return;
    cartDrawer.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  if (cartTrigger) {
    cartTrigger.addEventListener('click', () => toggleCartDrawer(true));
  }
  if (cartBackdrop) {
    cartBackdrop.addEventListener('click', () => toggleCartDrawer(false));
  }
  if (cartCloseBtn) {
    cartCloseBtn.addEventListener('click', () => toggleCartDrawer(false));
  }
  if (cartClearBtn) {
    cartClearBtn.addEventListener('click', () => {
      cart = [];
      updateCartUI();
    });
  }

  // Add to Cart Event Delegation (Properly parses JSON data-add-cart attribute)
  document.addEventListener('click', (e) => {
    const addToCartBtn = e.target.closest('.buy-btn, [data-add-cart]');
    if (addToCartBtn) {
      e.preventDefault();
      let name = 'Repair Service / Part';
      let price = 99.00;
      let img = '';

      const dataAttr = addToCartBtn.getAttribute('data-add-cart');
      if (dataAttr && dataAttr.startsWith('{')) {
        try {
          const parsed = JSON.parse(dataAttr);
          name = parsed.name || name;
          price = parsed.price !== undefined ? parseFloat(parsed.price) : price;
          img = parsed.image || parsed.img || img;
        } catch (err) {
          console.error("Error parsing cart item JSON:", err);
        }
      } else {
        name = addToCartBtn.getAttribute('data-name') || name;
        price = parseFloat(addToCartBtn.getAttribute('data-price')) || price;
        img = addToCartBtn.getAttribute('data-img') || img;
      }

      // Check if item already exists in cart
      const existingItem = cart.find(item => item.name === name);
      if (existingItem) {
        existingItem.quantity += 1;
      } else {
        cart.push({ name, price, img, quantity: 1 });
      }

      updateCartUI();
      toggleCartDrawer(true);
    }
  });

  // --- 3. APPLE-STYLE IMAGE CAROUSEL / SHOWCASE ---
  const slides = document.querySelectorAll('.showcase-slide');
  const dots = document.querySelectorAll('.showcase-dot');
  let currentSlide = 0;

  function showSlide(index) {
    slides.forEach((slide, i) => {
      slide.classList.toggle('active', i === index);
    });
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === index);
    });
  }

  if (slides.length > 0) {
    setInterval(() => {
      currentSlide = (currentSlide + 1) % slides.length;
      showSlide(currentSlide);
    }, 5000);

    dots.forEach((dot, index) => {
      dot.addEventListener('click', () => {
        currentSlide = index;
        showSlide(currentSlide);
      });
    });
  }
});
