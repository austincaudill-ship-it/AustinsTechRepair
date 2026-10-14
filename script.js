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

    // ==========================================
    // REPAIR WIZARD INTERACTIVE ENGINE
    // ==========================================
    const repairState = { device: '', brand: '', issue: '', priceRange: '$50 — $150' };

    const deviceData = {
      Phones: {
        brands: ['Apple', 'Samsung', 'Google', 'Other'],
        issues: [
          { name: 'Screen Replacement', price: '$89 — $249' },
          { name: 'Battery Replacement', price: '$69 — $119' },
          { name: 'Charging Port Repair', price: '$79 — $129' },
          { name: 'Camera or Speaker Fix', price: '$79 — $150' },
          { name: 'Water Damage / Diagnostic', price: '$49 — $120' }
        ]
      },
      Tablets: {
        brands: ['Apple iPad', 'Samsung Galaxy Tab', 'Microsoft Surface', 'Other'],
        issues: [
          { name: 'Screen / Digitizer Repair', price: '$119 — $299' },
          { name: 'Battery Service', price: '$89 — $159' },
          { name: 'Charging Port Repair', price: '$99 — $149' },
          { name: 'Diagnostic / Software', price: '$50 — $100' }
        ]
      },
      Computers: {
        brands: ['Apple Mac', 'Dell', 'HP', 'Lenovo', 'Custom PC'],
        issues: [
          { name: 'Screen Replacement (Laptop)', price: '$149 — $320' },
          { name: 'SSD Upgrade & OS Install', price: '$120 — $250' },
          { name: 'Virus Cleanup & Tuneup', price: '$79 — $130' },
          { name: 'DC Jack / Power Repair', price: '$110 — $220' }
        ]
      },
      Gaming: {
        brands: ['Sony PlayStation', 'Microsoft Xbox', 'Nintendo Switch'],
        issues: [
          { name: 'HDMI Port Repair', price: '$130 — $180' },
          { name: 'Power Fault / Overheating', price: '$90 — $160' },
          { name: 'Disc Drive / Storage Fix', price: '$80 — $150' }
        ]
      },
      "Smart Watches": {
        brands: ['Apple Watch', 'Samsung Galaxy Watch', 'Other'],
        issues: [
          { name: 'Screen Replacement', price: '$99 — $199' },
          { name: 'Battery Replacement', price: '$79 — $120' }
        ]
      },
      Business: {
        brands: ['Office IT Network', 'POS System', 'Printer / Peripheral', 'Server Rack'],
        issues: [
          { name: 'On-Site Diagnostic & Support', price: '$95/hr + Dispatch' },
          { name: 'Structured Cabling / Setup', price: 'Custom Quote' }
        ]
      }
    };

    const repairCard = document.querySelector('.repair-card');
    if (repairCard) {
      // Step 1: Device selection
      document.querySelectorAll('[data-device]').forEach(btn => {
        btn.addEventListener('click', () => {
          repairState.device = btn.getAttribute('data-device');
          document.getElementById('repair-device-hidden').value = repairState.device;
          populateBrandsAndIssues(repairState.device);
          goToRepairStep(2);
        });
      });

      // Back buttons
      document.querySelectorAll('.repair-card [data-back]').forEach(btn => {
        btn.addEventListener('click', () => {
          const target = btn.getAttribute('data-back');
          if (target === 'device') goToRepairStep(1);
          if (target === 'issue') goToRepairStep(2);
        });
      });

      // Continue to contact step
      const contBtn = document.querySelector('[data-action="continue-contact"]');
      if (contBtn) {
        contBtn.addEventListener('click', () => goToRepairStep(4));
      }

      // File upload preview handling
      const dropZone = document.getElementById('file-drop-zone');
      const fileInput = document.getElementById('file-upload');
      const browseBtn = document.getElementById('file-browse-btn');
      const previewList = document.getElementById('file-preview-list');

      if (browseBtn && fileInput) {
        browseBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
          previewList.innerHTML = '';
          Array.from(e.target.files).forEach(file => {
            const span = document.createElement('span');
            span.className = 'pill';
            span.style.background = 'var(--surface-alt)';
            span.innerHTML = `<i class="fas fa-file-image"></i> ${file.name}`;
            previewList.appendChild(span);
          });
        });
      }
    }

    function populateBrandsAndIssues(deviceKey) {
      const data = deviceData[deviceKey] || { brands: ['Standard'], issues: [{ name: 'Standard Repair', price: '$50 — $150' }] };
      
      const makeGrid = document.getElementById('make-grid');
      const issueList = document.getElementById('issue-list');
      
      if (makeGrid) {
        makeGrid.innerHTML = '';
        data.brands.forEach(brand => {
          const bBtn = document.createElement('button');
          bBtn.type = 'button';
          bBtn.className = 'option-btn';
          bBtn.style.padding = '0.75rem';
          bBtn.innerHTML = `<span>${brand}</span>`;
          bBtn.addEventListener('click', () => {
            makeGrid.querySelectorAll('.option-btn').forEach(b => b.style.borderColor = 'var(--border)');
            bBtn.style.borderColor = 'var(--primary)';
            repairState.brand = brand;
            document.getElementById('repair-make-hidden').value = brand;
          });
          makeGrid.appendChild(bBtn);
        });
      }

      if (issueList) {
        issueList.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'option-grid';
        data.issues.forEach(issue => {
          const iBtn = document.createElement('button');
          iBtn.type = 'button';
          iBtn.className = 'option-btn';
          iBtn.innerHTML = `<strong>${issue.name}</strong><span style="font-size:0.75rem; color:var(--primary);">${issue.price}</span>`;
          iBtn.addEventListener('click', () => {
            grid.querySelectorAll('.option-btn').forEach(b => b.style.borderColor = 'var(--border)');
            iBtn.style.borderColor = 'var(--primary)';
            repairState.issue = issue.name;
            repairState.priceRange = issue.price;
            document.getElementById('repair-issue-hidden').value = issue.name;

            // Update estimate screen and move to step 3
            document.getElementById('estimate-price').textContent = issue.price;
            document.getElementById('estimate-summary').innerHTML = `
              <span class="pill"><i class="fas fa-mobile"></i> ${repairState.device}</span>
              <span class="pill"><i class="fas fa-tag"></i> ${repairState.brand || 'Selected Brand'}</span>
              <span class="pill"><i class="fas fa-wrench"></i> ${repairState.issue}</span>
            `;
            goToRepairStep(3);
          });
          grid.appendChild(iBtn);
        });
        issueList.appendChild(grid);
      }
    }

    function goToRepairStep(stepNum) {
      document.querySelectorAll('.repair-step').forEach(s => s.classList.remove('active'));
      const stepEl = document.getElementById(`step-${stepNum === 1 ? 'device' : stepNum === 2 ? 'issue' : stepNum === 3 ? 'estimate' : 'contact'}`);
      if (stepEl) stepEl.classList.add('active');

      document.querySelectorAll('.progress-step').forEach((p, idx) => {
        if (idx < stepNum) {
          p.classList.add('active');
        } else {
          p.classList.remove('active');
        }
      });
    }

    // Portal Mobile Sidebar Toggles
    const portalToggle = document.getElementById('portalNavToggle');
    const portalSidebar = document.getElementById('portalSidebar');
    const portalClose = document.getElementById('portalSidebarClose');

    if (portalToggle && portalSidebar) {
      portalToggle.addEventListener('click', () => portalSidebar.classList.toggle('open'));
    }
    if (portalClose && portalSidebar) {
      portalClose.addEventListener('click', () => portalSidebar.classList.remove('open'));
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
    // Close sidebar on mobile after clicking a link
    const sidebar = document.getElementById('portalSidebar');
    if (sidebar) sidebar.classList.remove('open');
  };

  window.portalSearch = function(query) {
    console.log('Searching portal for:', query);
  };

  function renderDashboardTickets() {
    const stats = document.getElementById('dashboard-stats');
    const tbody = document.getElementById('tickets-tbody');
    const kanban = document.getElementById('kanban-board');
    
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

    if (kanban) {
      kanban.innerHTML = `
        <div style="background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg); padding:1rem; min-width:240px; flex:1;">
          <h4 style="font-size:0.85rem; text-transform:uppercase; margin-bottom:10px; color:var(--text-muted);">In Queue (1)</h4>
          <div style="background:var(--bg); padding:12px; border-radius:var(--radius-md); border:1px solid var(--border);"><strong>T1042</strong><p style="font-size:0.8rem; color:var(--text-muted);">iPhone 13 Pro Screen</p></div>
        </div>
      `;
    }
  }

})();
