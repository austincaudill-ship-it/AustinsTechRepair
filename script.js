/* ==========================================================================
   AUSTIN'S TECH REPAIR GROUP — MASTER APPLICATION SCRIPT
   ========================================================================== */

(function () {
  'use strict';

  /* ============================================================
     1. GLOBAL NAVIGATION, CAROUSEL & COOKIES
     ============================================================ */
  document.addEventListener('DOMContentLoaded', () => {
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

    // Showcase Slideshow Rotation
    const slides = document.querySelectorAll('.showcase-slide');
    const dots = document.querySelectorAll('.showcase-dot');
    let currentSlide = 0;

    function showSlide(index) {
      slides.forEach((slide, i) => {
        slide.classList.toggle('active', i === index);
        if (dots[i]) dots[i].classList.toggle('active', i === index);
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

    // Cookie Consent Banner
    const cookieBanner = document.getElementById('cookie-banner');
    const cookieAccept = document.getElementById('cookie-accept');
    const cookieDecline = document.getElementById('cookie-decline');

    if (cookieBanner && !localStorage.getItem('atr_cookie_consent')) {
      setTimeout(() => {
        cookieBanner.classList.add('active');
        cookieBanner.setAttribute('aria-hidden', 'false');
      }, 1000);
    }

    if (cookieAccept) {
      cookieAccept.addEventListener('click', () => {
        localStorage.setItem('atr_cookie_consent', 'all');
        cookieBanner.classList.remove('active');
        cookieBanner.setAttribute('aria-hidden', 'true');
      });
    }

    if (cookieDecline) {
      cookieDecline.addEventListener('click', () => {
        localStorage.setItem('atr_cookie_consent', 'necessary');
        cookieBanner.classList.remove('active');
        cookieBanner.setAttribute('aria-hidden', 'true');
      });
    }
  });


  /* ============================================================
     2. REPAIR WIZARD
     ============================================================ */
  const deviceData = {
    Phones: {
      brands: ['Apple', 'Samsung', 'Google', 'Motorola', 'LG', 'OnePlus', 'Other'],
      issues: [
        { name: 'Cracked Screen / Display', min: 79, max: 199 },
        { name: 'Battery Replacement', min: 39, max: 89 },
        { name: 'Charging Port Repair', min: 49, max: 99 },
        { name: 'Camera Repair', min: 59, max: 129 },
        { name: 'Speaker / Microphone', min: 39, max: 89 },
        { name: 'Water Damage Recovery', min: 79, max: 199 },
        { name: 'Software Troubleshooting', min: 29, max: 79 },
        { name: 'Data Transfer', min: 29, max: 59 },
        { name: 'Back Glass Replacement', min: 49, max: 129 },
      ]
    },
    Tablets: {
      brands: ['Apple', 'Samsung', 'Amazon', 'Lenovo', 'Microsoft', 'Other'],
      issues: [
        { name: 'Screen / Display Replacement', min: 89, max: 249 },
        { name: 'Battery Replacement', min: 49, max: 109 },
        { name: 'Charging Port Repair', min: 49, max: 99 },
        { name: 'Touch Screen Issue', min: 59, max: 149 },
        { name: 'Camera Repair', min: 49, max: 119 },
        { name: 'Software Setup & Support', min: 29, max: 79 },
      ]
    },
    Computers: {
      brands: ['Apple', 'Dell', 'HP', 'Lenovo', 'Asus', 'Acer', 'Microsoft', 'Custom', 'Other'],
      issues: [
        { name: 'SSD Upgrade', min: 79, max: 199 },
        { name: 'RAM Installation', min: 49, max: 129 },
        { name: 'Virus / Malware Removal', min: 59, max: 149 },
        { name: 'Display / Screen Repair', min: 99, max: 299 },
        { name: 'Power Issue / DC Jack', min: 79, max: 179 },
        { name: 'Software Recovery', min: 59, max: 149 },
        { name: 'Data Recovery / Rescue', min: 79, max: 299 },
        { name: 'Keyboard Replacement', min: 49, max: 149 },
        { name: 'Cooling / Fan Replacement', min: 49, max: 119 },
      ]
    },
    Gaming: {
      brands: ['Sony PlayStation', 'Microsoft Xbox', 'Nintendo', 'Steam Deck', 'Other'],
      issues: [
        { name: 'HDMI Port Repair', min: 79, max: 179 },
        { name: 'Cooling Fan Replacement', min: 49, max: 119 },
        { name: 'Storage / HDD Upgrade', min: 59, max: 179 },
        { name: 'Power Fault Diagnostics', min: 49, max: 149 },
        { name: 'Controller Repair', min: 29, max: 79 },
        { name: 'Overheating Solution', min: 49, max: 129 },
        { name: 'Disc Drive Repair', min: 59, max: 149 },
      ]
    },
    'Smart Watches': {
      brands: ['Apple Watch', 'Samsung Galaxy Watch', 'Garmin', 'Fitbit', 'Other'],
      issues: [
        { name: 'Battery Service', min: 49, max: 99 },
        { name: 'Display Replacement', min: 79, max: 179 },
        { name: 'Charging Issue', min: 39, max: 89 },
        { name: 'Pairing / Sync Fix', min: 29, max: 69 },
        { name: 'Button / Crown Repair', min: 39, max: 89 },
      ]
    },
    Business: {
      brands: ['Dell', 'HP', 'Lenovo', 'Microsoft', 'Apple', 'Custom Build', 'Other'],
      issues: [
        { name: 'Network Setup & Configuration', min: 99, max: 499 },
        { name: 'Server Installation', min: 199, max: 999 },
        { name: 'Workstation Repair', min: 79, max: 299 },
        { name: 'Data Backup Solution', min: 99, max: 399 },
        { name: 'Cybersecurity Assessment', min: 149, max: 599 },
        { name: 'Microsoft 365 Setup', min: 99, max: 299 },
        { name: 'VoIP Phone System', min: 149, max: 499 },
      ]
    },
  };

  let selectedDevice = null;
  let selectedBrand = null;
  let selectedIssue = null;

  const stepDevice = document.getElementById('step-device');
  const stepIssue = document.getElementById('step-issue');
  const stepEstimate = document.getElementById('step-estimate');
  const stepContact = document.getElementById('step-contact');
  const makeGrid = document.getElementById('make-grid');
  const issueList = document.getElementById('issue-list');
  const issueTitle = document.getElementById('issue-title');
  const estimateSummary = document.getElementById('estimate-summary');
  const estimatePrice = document.getElementById('estimate-price');
  const progressSteps = {
    1: document.getElementById('progress-1'),
    2: document.getElementById('progress-2'),
    3: document.getElementById('progress-3'),
    4: document.getElementById('progress-4'),
  };

  function showStep(step) {
    [stepDevice, stepIssue, stepEstimate, stepContact].forEach(s => s && s.classList.remove('active'));
    if (step) step.classList.add('active');
  }

  function setProgress(step) {
    for (let i = 1; i <= 4; i++) {
      if (progressSteps[i]) {
        if (i <= step) progressSteps[i].classList.add('active');
        else progressSteps[i].classList.remove('active');
      }
    }
  }

  document.querySelectorAll('#step-device .option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedDevice = btn.getAttribute('data-device');
      document.querySelectorAll('#step-device .option-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');

      const data = deviceData[selectedDevice];
      if (data && makeGrid) {
        makeGrid.innerHTML = data.brands.map(brand =>
          `<button class="option-btn" type="button" data-brand="${brand}"><i class="fas fa-tag"></i> <span>${brand}</span></button>`
        ).join('');
        makeGrid.querySelectorAll('.option-btn').forEach(b => {
          b.addEventListener('click', () => selectBrand(b));
        });
      }

      if (data && issueList) {
        issueList.innerHTML = data.issues.map(issue =>
          `<button type="button" class="issue-item-btn" data-issue="${issue.name}" data-min="${issue.min}" data-max="${issue.max}">
            <span style="font-weight: 600;">${issue.name}</span>
            <span style="font-family: var(--font-mono); font-size: 0.9rem; color: var(--primary); font-weight: 700;">$${issue.min} — $${issue.max}</span>
          </button>`
        ).join('');
        issueList.querySelectorAll('.issue-item-btn').forEach(item => {
          item.addEventListener('click', () => selectIssue(item));
        });
      }

      if (issueTitle) issueTitle.textContent = `Select Brand & Issue — ${selectedDevice}`;

      setTimeout(() => {
        showStep(stepIssue);
        setProgress(2);
      }, 300);
    });
  });

  function selectBrand(btn) {
    selectedBrand = btn.getAttribute('data-brand');
    document.querySelectorAll('#make-grid .option-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  }

  function selectIssue(item) {
    selectedIssue = {
      name: item.getAttribute('data-issue'),
      min: parseInt(item.getAttribute('data-min')),
      max: parseInt(item.getAttribute('data-max')),
    };
    document.querySelectorAll('#issue-list .issue-item-btn').forEach(i => i.classList.remove('selected', 'active'));
    item.classList.add('selected', 'active');

    if (estimateSummary) {
      estimateSummary.innerHTML = '';
      const chips = [
        { label: 'Device', value: selectedDevice },
        { label: 'Brand', value: selectedBrand || 'Not selected' },
        { label: 'Issue', value: selectedIssue.name },
      ];
      chips.forEach(chip => {
        const el = document.createElement('span');
        el.className = 'estimate-chip';
        el.style.cssText = 'padding: 8px 12px; background: var(--surface-alt); border-radius: var(--radius-lg); border: 1px solid var(--border); display: inline-block; margin-right: 8px; margin-bottom: 8px; font-size: 0.9rem;';
        el.innerHTML = `<strong>${chip.label}:</strong> ${chip.value}`;
        estimateSummary.appendChild(el);
      });
    }

    if (estimatePrice) {
      estimatePrice.textContent = `$${selectedIssue.min} — $${selectedIssue.max}`;
    }

    const deviceHidden = document.getElementById('repair-device-hidden');
    const makeHidden = document.getElementById('repair-make-hidden');
    const issueHidden = document.getElementById('repair-issue-hidden');
    if (deviceHidden) deviceHidden.value = selectedDevice || '';
    if (makeHidden) makeHidden.value = selectedBrand || '';
    if (issueHidden) issueHidden.value = selectedIssue.name || '';

    setTimeout(() => {
      showStep(stepEstimate);
      setProgress(3);
    }, 400);
  }

  document.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-back');
      if (target === 'device') { showStep(stepDevice); setProgress(1); }
      else if (target === 'issue') { showStep(stepIssue); setProgress(2); }
      else if (target === 'estimate') { showStep(stepEstimate); setProgress(3); }
    });
  });

  document.querySelectorAll('[data-action="continue-contact"]').forEach(btn => {
    btn.addEventListener('click', () => {
      showStep(stepContact);
      setProgress(4);
    });
  });

  const fileUpload = document.getElementById('file-upload');
  const fileBrowseBtn = document.getElementById('file-browse-btn');
  const fileDropZone = document.getElementById('file-drop-zone');
  const filePreviewList = document.getElementById('file-preview-list');

  if (fileBrowseBtn && fileUpload) {
    fileBrowseBtn.addEventListener('click', () => fileUpload.click());
  }

  if (fileDropZone && fileUpload) {
    fileDropZone.addEventListener('click', (e) => {
      if (e.target.tagName !== 'BUTTON') fileUpload.click();
    });
    fileDropZone.addEventListener('dragover', (e) => { e.preventDefault(); fileDropZone.style.borderColor = 'var(--primary)'; });
    fileDropZone.addEventListener('dragleave', () => { fileDropZone.style.borderColor = 'var(--border)'; });
    fileDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      fileDropZone.style.borderColor = 'var(--border)';
      handleFiles(e.dataTransfer.files);
    });
    fileUpload.addEventListener('change', (e) => handleFiles(e.target.files));
  }

  function handleFiles(files) {
    if (!filePreviewList) return;
    Array.from(files).slice(0, 5).forEach(file => {
      if (file.size > 10 * 1024 * 1024) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const preview = document.createElement('div');
        preview.style.cssText = 'width: 80px; height: 80px; border-radius: var(--radius-md); overflow: hidden; position: relative; background: var(--surface-alt);';
        if (file.type.startsWith('image/')) {
          preview.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;" /><div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.6);color:#fff;font-size:0.5rem;padding:2px;text-align:center;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${file.name}</div>`;
        } else {
          preview.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:1.5rem;color:var(--text-faint);"><i class="fas fa-file"></i></div>`;
        }
        filePreviewList.appendChild(preview);
      };
      reader.readAsDataURL(file);
    });
  }

  const repairForm = document.getElementById('repair-contact-form');
  const repairThanks = document.getElementById('repair-thanks');

  if (repairForm) {
    repairForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const repairRequest = {
        id: 'RR-' + Date.now(),
        ticketId: 'TKT-' + Math.floor(100000 + Math.random() * 900000),
        timestamp: new Date().toISOString(),
        status: 'new',
        source: 'Website Repair Wizard',
        device: {
          type: document.getElementById('repair-device-hidden')?.value || '',
          brand: document.getElementById('repair-make-hidden')?.value || '',
          model: document.getElementById('device-model')?.value || '',
          issue: document.getElementById('repair-issue-hidden')?.value || '',
        },
        estimate: selectedIssue ? '$' + selectedIssue.min + ' —$' + selectedIssue.max : 'Not provided',
        customer: {
          name: document.getElementById('full-name')?.value || '',
          phone: document.getElementById('phone-number')?.value || '',
          email: document.getElementById('email-address')?.value || '',
          location: document.getElementById('city-zip')?.value || '',
          preferredTime: document.getElementById('preferred-time')?.value || '',
        },
        additionalDetails: document.getElementById('additional-details')?.value || '',
        notes: []
      };

      const existing = JSON.parse(localStorage.getItem('atr_repair_requests') || '[]');
      existing.push(repairRequest);
      localStorage.setItem('atr_repair_requests', JSON.stringify(existing));

      window.dispatchEvent(new CustomEvent('atr:new-repair-request', { detail: repairRequest }));

      repairForm.style.display = 'none';
      if (repairThanks) repairThanks.hidden = false;
    });
  }


  /* ============================================================
     3. EMPLOYEE PORTAL CONTROLLER
     ============================================================ */
  function seedData() {
    return {
      tickets: [
        { id: 'T1042', customer: 'Sarah Mitchell', phone: '(513) 555-0100', email: 'sarah.m@email.com', deviceType: 'Phone', brand: 'Apple', device: 'iPhone 13 Pro', issue: 'Screen replacement', status: 'In Progress', priority: 'High', assigned: 'Austin Caudill', due: '2026-07-29', partsCost: 65, laborCost: 40, price: 189, notes: 'Customer dropped phone, screen cracked but touch still works.' },
        { id: 'T1041', customer: 'David Kim', phone: '(937) 555-0142', email: 'dkim@email.com', deviceType: 'Laptop', brand: 'Dell', device: 'XPS 15', issue: 'SSD upgrade', status: 'Ready', priority: 'Normal', assigned: 'Austin Caudill', due: '2026-07-28', partsCost: 80, laborCost: 50, price: 179, notes: 'Upgrading from 256GB to 1TB SSD. Data transfer included.' },
      ],
      customers: [
        { id: 'C201', name: 'Sarah Mitchell', phone: '(513) 555-0100', email: 'sarah.m@email.com', address: 'Dayton, OH', repairs: 3, totalSpent: 457, member: true },
      ],
      inventory: [
        { sku: 'IP13-OLED', name: 'iPhone 13 Pro OLED Screen', category: 'Screens', qty: 3, cost: 65, retail: 129, supplier: 'MobileSentrix', location: 'Shelf A-1', reorder: 2 },
      ],
      orders: [
        { id: 'AMZ-8842', platform: 'Amazon', items: '5x iPhone 13 OLED Screens', cost: 325, status: 'Shipped', date: '2026-07-25', expected: '2026-07-28', tracking: '1Z999AA10123456784' },
      ],
      transactions: [
        { id: 'TXN-501', type: 'Repair', amount: 189, cost: 105, method: 'Square', date: '2026-07-26' },
      ],
      employees: [
        { id: 'E01', name: 'Austin Caudill', role: 'Owner / Lead Tech', email: 'austin@austinstechrepairgroup.com', phone: '(937) 280-6243', repairs: 12, status: 'Active' },
      ],
      timesheet: [
        { date: '2026-07-26', clockIn: '08:00', clockOut: '17:00', hours: 9, status: 'Completed' },
      ],
      clockStatus: { clockedIn: true, clockInTime: '08:00' },
    };
  }

  let db;
  try {
    const savedDb = localStorage.getItem('atr_persistent_portal_db');
    db = savedDb ? JSON.parse(savedDb) : seedData();
  } catch (err) {
    db = seedData();
  }

  function saveDb() {
    try {
      localStorage.setItem('atr_persistent_portal_db', JSON.stringify(db));
    } catch (err) {
      console.error('Failed to save portal state:', err);
    }
  }

  let charts = {};

  window.toggleSidebar = function () {
    const appContainer = document.querySelector('.app');
    if (appContainer) appContainer.classList.toggle('mobile-nav-open');
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.toggle('open');
  };

  const USERS = { 
    'admin': { passcode: 'admin123', name: 'Austin Caudill', role: 'Owner / Lead Tech' }, 
    'demo': { passcode: 'demo', name: 'Demo Tech', role: 'Technician' } 
  };

  window.login = function () {
    const username = document.getElementById('username')?.value.trim();
    const passcode = document.getElementById('passcode')?.value;
    const msg = document.getElementById('loginMsg');
    const user = USERS[username];
    if (user && user.passcode === passcode) {
      document.getElementById('loginView')?.classList.add('hidden');
      document.getElementById('portalView')?.classList.remove('hidden');
      document.getElementById('portal-username').textContent = user.name;
      document.getElementById('portal-role').textContent = user.role;
      document.getElementById('portal-avatar').textContent = user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
      initPortal();
    } else {
      if (msg) msg.textContent = 'Invalid credentials. Try admin / admin123 or demo / demo';
    }
  };

  window.logout = function () {
    document.getElementById('portalView')?.classList.add('hidden');
    document.getElementById('loginView')?.classList.remove('hidden');
    const uInput = document.getElementById('username');
    const pInput = document.getElementById('passcode');
    if (uInput) uInput.value = '';
    if (pInput) pInput.value = '';
  };

  window.showPortalSection = function (sectionId, btn) {
    document.querySelectorAll('.portal-section').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(sectionId);
    if (target) target.classList.add('active');
    if (btn) {
      document.querySelectorAll('.portal-nav button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
    
    const appContainer = document.querySelector('.app');
    if (appContainer) appContainer.classList.remove('mobile-nav-open');

    if (sectionId === 'portal-dashboard') renderDashboard();
    if (sectionId === 'portal-tickets') renderTickets();
    if (sectionId === 'portal-queue') renderKanban();
  };

  function renderDashboard() {
    const stats = document.getElementById('dashboard-stats');
    if (!stats) return;

    const todayRevenue = db.transactions.reduce((s, t) => s + t.amount, 0);
    const activeTickets = db.tickets.filter(t => !['Completed', 'Cancelled'].includes(t.status)).length;
    const pendingOrders = db.orders.filter(o => o.status === 'Pending' || o.status === 'Shipped').length;
    const lowStock = db.inventory.filter(i => i.qty <= i.reorder).length;

    stats.innerHTML = `
      <div class="stat-card"><div class="stat-icon green"><i class="fas fa-dollar-sign"></i></div><div><div class="stat-label">Total Revenue</div><div class="stat-value">$${todayRevenue.toFixed(2)}</div></div></div>
      <div class="stat-card"><div class="stat-icon green"><i class="fas fa-ticket"></i></div><div><div class="stat-label">Active Tickets</div><div class="stat-value">${activeTickets}</div></div></div>
      <div class="stat-card"><div class="stat-icon green"><i class="fas fa-truck-fast"></i></div><div><div class="stat-label">Pending Orders</div><div class="stat-value">${pendingOrders}</div></div></div>
      <div class="stat-card"><div class="stat-icon green"><i class="fas fa-triangle-exclamation"></i></div><div><div class="stat-label">Low Stock Items</div><div class="stat-value">${lowStock}</div></div></div>
    `;

    setTimeout(() => {
      drawRevenueChart();
      drawStatusChart();
    }, 100);
  }

  function drawRevenueChart() {
    const canvas = document.getElementById('revenueChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (charts.revenue) charts.revenue.destroy();

    charts.revenue = new Chart(canvas, {
      type: 'line',
      data: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [{
          data: [320, 450, 280, 510, 380, 670, 424],
          borderColor: '#00ff66',
          backgroundColor: 'rgba(0, 255, 102, 0.1)',
          fill: true,
          tension: 0.4,
          borderWidth: 2,
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { grid: { display: false } } } }
    });
  }

  function drawStatusChart() {
    const canvas = document.getElementById('statusChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (charts.status) charts.status.destroy();

    const statuses = ['Pending', 'Diagnosed', 'In Progress', 'Ready', 'Completed'];
    const counts = statuses.map(s => db.tickets.filter(t => t.status === s).length);

    charts.status = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: statuses,
        datasets: [{
          data: counts,
          backgroundColor: ['#f59e0b', '#00d2ff', '#2563eb', '#00ff66', '#64748b'],
          borderWidth: 0,
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 }, padding: 8 } } } }
    });
  }

  window.renderTickets = function () {
    const tbody = document.getElementById('tickets-tbody');
    if (!tbody) return;
    tbody.innerHTML = db.tickets.length === 0 ? '<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--text-muted);">No tickets found</td></tr>' :
      db.tickets.map(t => `
        <tr>
          <td><strong>${t.id}</strong></td>
          <td>${t.customer}</td>
          <td>${t.brand} ${t.device}</td>
          <td>${t.issue}</td>
          <td><span class="pill">${t.status}</span></td>
          <td>${t.priority}</td>
          <td>${t.assigned}</td>
          <td>${t.due}</td>
          <td><button class="pbtn pbtn-light pbtn-sm" onclick="deleteTicket('${t.id}')">Del</button></td>
        </tr>
      `).join('');
  };

  window.deleteTicket = function (id) {
    if (confirm(`Delete ticket ${id}?`)) {
      db.tickets = db.tickets.filter(t => t.id !== id);
      saveDb();
      renderTickets();
    }
  };

  function renderKanban() {
    const board = document.getElementById('kanban-board');
    if (!board) return;
    const statuses = ['Pending', 'Diagnosed', 'In Progress', 'Ready', 'Completed'];
    board.innerHTML = statuses.map(status => {
      const tickets = db.tickets.filter(t => t.status === status);
      return `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1rem;min-width:220px;">
          <h4 style="margin-bottom:1rem;font-size:0.9rem;text-transform:uppercase;color:var(--primary);">${status} (${tickets.length})</h4>
          ${tickets.map(t => `<div style="background:var(--bg);padding:10px;border-radius:var(--radius-md);margin-bottom:8px;font-size:0.85rem;"><strong>${t.id}</strong> -${t.customer}</div>`).join('') || '<p style="font-size:0.75rem;color:var(--text-faint);">No tickets</p>'}
        </div>
      `;
    }).join('');
  }

  function initPortal() {
    renderDashboard();
    renderTickets();
  }

  document.getElementById('passcode')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') login();
  });


  /* ============================================================
     4. STEVE — AI REPAIR ASSISTANT TOGGLE LOGIC
     ============================================================ */
  document.addEventListener('DOMContentLoaded', () => {
    const steveWidget = document.getElementById('steve-widget');
    const steveToggle = document.getElementById('steve-toggle');
    const steveCloseBtn = document.getElementById('steve-close-btn');

    if (steveToggle && steveWidget) {
      steveToggle.addEventListener('click', () => {
        const isHidden = steveWidget.getAttribute('aria-hidden') === 'true';
        steveWidget.setAttribute('aria-hidden', isHidden ? 'false' : 'true');
      });
    }

    if (steveCloseBtn && steveWidget) {
      steveCloseBtn.addEventListener('click', () => {
        steveWidget.setAttribute('aria-hidden', 'true');
      });
    }
  });

})();
