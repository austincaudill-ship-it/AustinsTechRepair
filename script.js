/* ==========================================================================
   AUSTIN'S TECH REPAIR GROUP — MASTER APPLICATION SCRIPT
   ========================================================================== */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    // Page Switching Router
    const pages = document.querySelectorAll('.page');
    const navLinks = document.querySelectorAll('[data-page]');

    function switchPage(targetId) {
      const cleanId = targetId.replace('#', '');
      let found = false;
      
      pages.forEach(page => {
        if (page.id === cleanId) {
          page.classList.add('active');
          found = true;
        } else {
          page.classList.remove('active');
        }
      });

      if (!found && pages.length > 0) {
        document.getElementById('home').classList.add('active');
      }

      navLinks.forEach(link => {
        const linkPage = link.getAttribute('data-page');
        if (linkPage === cleanId) {
          link.classList.add('active');
        } else {
          link.classList.remove('active');
        }
      });

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    document.body.addEventListener('click', (e) => {
      const target = e.target.closest('[data-page]');
      if (target) {
        const href = target.getAttribute('href');
        if (href && href.startsWith('#')) {
          e.preventDefault();
          window.location.hash = href;
          switchPage(href);
          
          const mobileMenu = document.getElementById('mobile-menu');
          if (mobileMenu) mobileMenu.setAttribute('aria-hidden', 'true');
        }
      }
    });

    if (window.location.hash) {
      switchPage(window.location.hash);
    }

    window.addEventListener('hashchange', () => {
      if (window.location.hash) {
        switchPage(window.location.hash);
      }
    });

    // Mobile Menu Toggles
    const bottomMenuToggle = document.getElementById('bottom-menu-toggle');
    const mobileMenu = document.getElementById('mobile-menu');
    const menuClose = document.getElementById('menu-close');

    if (bottomMenuToggle && mobileMenu) {
      bottomMenuToggle.addEventListener('click', () => mobileMenu.setAttribute('aria-hidden', 'false'));
    }
    if (menuClose && mobileMenu) {
      menuClose.addEventListener('click', () => mobileMenu.setAttribute('aria-hidden', 'true'));
    }

    // Price Match Calculator Logic
    const priceMatchForm = document.getElementById('priceMatchForm');
    if (priceMatchForm) {
      priceMatchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const ourPrice = parseFloat(document.getElementById('ourPrice').value) || 0;
        const compPrice = parseFloat(document.getElementById('competitorPrice').value) || 0;
        const resultDiv = document.getElementById('result');

        if (!resultDiv) return;

        if (compPrice < ourPrice) {
          const beatenPrice = (compPrice - 10).toFixed(2);
          resultDiv.style.display = 'block';
          resultDiv.innerHTML = `<strong>Guaranteed Price Match!</strong> We will beat their quote by $10. Your new price is <span style="color: var(--primary); font-size: 1.25rem; font-weight: 800;">$${Math.max(0, beatenPrice)}</span>!`;
        } else {
          resultDiv.style.display = 'block';
          resultDiv.innerHTML = `Our current estimated price of <strong>$${ourPrice.toFixed(2)}</strong> is already extremely competitive and offers the best value!`;
        }
      });
    }
  });

  // Employee Portal Login & Dashboard Logic
  window.login = function () {
    const username = document.getElementById('username')?.value.trim();
    const passcode = document.getElementById('passcode')?.value;
    const msg = document.getElementById('loginMsg');
    
    if ((username === 'admin' && passcode === 'admin123') || (username === 'demo' && passcode === 'demo')) {
      document.getElementById('loginView')?.classList.add('hidden');
      document.getElementById('portalView')?.classList.remove('hidden');
      renderDashboardTickets();
    } else {
      if (msg) msg.textContent = 'Invalid credentials. Try admin / admin123 or demo / demo';
    }
  };

  window.logout = function () {
    document.getElementById('portalView')?.classList.add('hidden');
    document.getElementById('loginView')?.classList.remove('hidden');
  };

  window.showPortalSection = function (sectionId, btn) {
    document.querySelectorAll('.portal-section').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(sectionId);
    if (target) target.classList.add('active');
    if (btn) {
      document.querySelectorAll('.portal-nav button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
  };

  function renderDashboardTickets() {
    const stats = document.getElementById('dashboard-stats');
    const tbody = document.getElementById('tickets-tbody');
    
    if (stats) {
      stats.innerHTML = `
        <div class="stat-card"><div class="stat-icon"><i class="fas fa-dollar-sign"></i></div><div><div class="stat-label">Total Revenue</div><div class="stat-value">$424.00</div></div></div>
        <div class="stat-card"><div class="stat-icon"><i class="fas fa-ticket"></i></div><div><div class="stat-label">Active Tickets</div><div class="stat-value">2</div></div></div>
      `;
    }
    
    if (tbody) {
      tbody.innerHTML = `
        <tr><td><strong>T1042</strong></td><td>Sarah Mitchell</td><td>Apple iPhone 13 Pro</td><td>Screen replacement</td><td><span class="pill">In Progress</span></td><td>High</td><td>Austin Caudill</td><td>2026-07-29</td><td>-</td></tr>
      `;
    }
  }

})();
