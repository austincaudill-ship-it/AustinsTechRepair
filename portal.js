/* ============================================================
   AUSTIN'S TECH REPAIR GROUP — Employee Portal Controller (Cyber Master)
   ============================================================ */

(function () {
  'use strict';

  /* ---- Demo & Persistent Database Data ---- */
  function seedData() {
    return {
      tickets: [
        { id: 'T1042', customer: 'Sarah Mitchell', phone: '(513) 555-0100', email: 'sarah.m@email.com', deviceType: 'Phone', brand: 'Apple', device: 'iPhone 13 Pro', issue: 'Screen replacement', status: 'In Progress', priority: 'High', assigned: 'Demo User', due: '2026-07-29', partsCost: 65, laborCost: 40, price: 189, notes: 'Customer dropped phone, screen cracked but touch still works.' },
        { id: 'T1041', customer: 'David Kim', phone: '(937) 555-0142', email: 'dkim@email.com', deviceType: 'Laptop', brand: 'Dell', device: 'XPS 15', issue: 'SSD upgrade', status: 'Ready', priority: 'Normal', assigned: 'Demo User', due: '2026-07-28', partsCost: 80, laborCost: 50, price: 179, notes: 'Upgrading from 256GB to 1TB SSD. Data transfer included.' },
        { id: 'T1040', customer: 'Jessica Lopez', phone: '(513) 555-0188', email: 'jlopez@email.com', deviceType: 'Console', brand: 'Sony PlayStation', device: 'PS5', issue: 'HDMI port repair', status: 'Diagnosed', priority: 'Urgent', assigned: 'Demo User', due: '2026-07-29', partsCost: 15, laborCost: 80, price: 149, notes: 'HDMI port loose, no signal to TV.' },
        { id: 'T1039', customer: 'Mike Thompson', phone: '(937) 555-0199', email: 'mthompson@email.com', deviceType: 'Phone', brand: 'Samsung', device: 'Galaxy S22', issue: 'Battery replacement', status: 'Completed', priority: 'Normal', assigned: 'Demo User', due: '2026-07-26', partsCost: 25, laborCost: 30, price: 79, notes: 'Battery swelling, replaced with OEM.' },
      ],
      customers: [
        { id: 'C201', name: 'Sarah Mitchell', phone: '(513) 555-0100', email: 'sarah.m@email.com', address: 'Dayton, OH', repairs: 3, totalSpent: 457, member: true },
        { id: 'C202', name: 'David Kim', phone: '(937) 555-0142', email: 'dkim@email.com', address: 'Xenia, OH', repairs: 5, totalSpent: 892, member: true },
      ],
      inventory: [
        { sku: 'IP13-OLED', name: 'iPhone 13 Pro OLED Screen', category: 'Screens', qty: 3, cost: 65, retail: 129, supplier: 'MobileSentrix', location: 'Shelf A-1', reorder: 2 },
        { sku: 'S22-BAT', name: 'Galaxy S22 Battery', category: 'Batteries', qty: 8, cost: 12, retail: 39, supplier: 'MobileSentrix', location: 'Shelf B-2', reorder: 3 },
      ],
      orders: [
        { id: 'AMZ-8842', platform: 'Amazon', items: '5x iPhone 13 OLED Screens', cost: 325, status: 'Shipped', date: '2026-07-25', expected: '2026-07-28', tracking: '1Z999AA10123456784' },
      ],
      transactions: [
        { id: 'TXN-501', type: 'Repair', amount: 189, cost: 105, method: 'Square', date: '2026-07-26' },
        { id: 'TXN-500', type: 'Product Sale', amount: 35, cost: 15, method: 'Cash', date: '2026-07-26' },
      ],
      employees: [
        { id: 'E01', name: 'Demo User', role: 'Technician', email: 'demo@atr.com', phone: '(513) 478-8077', repairs: 4, status: 'Active' },
        { id: 'E02', name: 'Austin Reed', role: 'Owner', email: 'austin@atr.com', phone: '(513) 478-8077', repairs: 0, status: 'Active' },
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
  let editingId = null;

  /* ---- Mobile Sidebar Toggle ---- */
  window.toggleSidebar = function () {
    const appContainer = document.querySelector('.app');
    if (appContainer) appContainer.classList.toggle('mobile-nav-open');
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.toggle('open');
  };

  /* ---- Authentication ---- */
  const USERS = { 
    'admin': { passcode: 'admin123', name: 'Austin Reed', role: 'Owner' }, 
    'demo': { passcode: 'demo', name: 'Demo User', role: 'Technician' } 
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
      if (msg) msg.textContent = 'Invalid credentials. Try demo / demo';
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

  /* ---- Portal Section Navigation ---- */
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
    if (sectionId === 'portal-customers') renderCustomers();
    if (sectionId === 'portal-inventory') renderInventory();
    if (sectionId === 'portal-orders') renderOrders();
    if (sectionId === 'portal-financials') renderFinancials();
    if (sectionId === 'portal-timeclock') renderTimeClock();
    if (sectionId === 'portal-employees') renderEmployees();
  };

  /* ---- Modal Helpers ---- */
  window.closeModal = function (id) {
    const modal = document.getElementById(id);
    if (modal && typeof modal.close === 'function') modal.close();
  };

  function openModal(id) {
    const modal = document.getElementById(id);
    if (modal && typeof modal.showModal === 'function') modal.showModal();
  }

  /* ---- Dashboard Rendering & Charts ---- */
  function renderDashboard() {
    const stats = document.getElementById('dashboard-stats');
    if (!stats) return;

    const todayRevenue = db.transactions.reduce((s, t) => s + t.amount, 0);
    const activeTickets = db.tickets.filter(t => !['Completed', 'Cancelled'].includes(t.status)).length;
    const pendingOrders = db.orders.filter(o => o.status === 'Pending' || o.status === 'Shipped').length;
    const lowStock = db.inventory.filter(i => i.qty <= i.reorder).length;

    stats.innerHTML = `
      <div class="stat-card"><div class="stat-icon green"><i class="fas fa-dollar-sign"></i></div><div class="stat-info"><div class="stat-label">Total Revenue</div><div class="stat-value">$${todayRevenue.toFixed(2)}</div></div></div>
      <div class="stat-card"><div class="stat-icon blue"><i class="fas fa-ticket"></i></div><div class="stat-info"><div class="stat-label">Active Tickets</div><div class="stat-value">${activeTickets}</div></div></div>
      <div class="stat-card"><div class="stat-icon orange"><i class="fas fa-truck-fast"></i></div><div class="stat-info"><div class="stat-label">Pending Orders</div><div class="stat-value">${pendingOrders}</div></div></div>
      <div class="stat-card"><div class="stat-icon red"><i class="fas fa-triangle-exclamation"></i></div><div class="stat-info"><div class="stat-label">Low Stock Items</div><div class="stat-value">${lowStock}</div></div></div>
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
          label: 'Revenue',
          data: [320, 450, 280, 510, 380, 670, 424],
          borderColor: '#00ff66',
          backgroundColor: 'rgba(0, 255, 102, 0.1)',
          fill: true,
          tension: 0.4,
          borderWidth: 2,
          pointBackgroundColor: '#00ff66',
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

  /* ---- Ticket Management ---- */
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
          <td><span class="badge ${statusBadgeClass(t.status)}">${t.status}</span></td>
          <td><span class="badge ${priorityBadgeClass(t.priority)}">${t.priority}</span></td>
          <td>${t.assigned}</td>
          <td>${t.due}</td>
          <td><div class="action-btns">
            <button class="pbtn pbtn-light pbtn-sm" onclick="editTicket('${t.id}')">Edit</button>
            <button class="pbtn pbtn-danger pbtn-sm" onclick="deleteTicket('${t.id}')">Del</button>
          </div></td>
        </tr>
      `).join('');
  };

  window.openTicketModal = function () {
    editingId = null;
    document.getElementById('ticketModalTitle').textContent = 'New Repair Ticket';
    document.getElementById('ticket-edit-id').value = '';
    ['ticket-customer', 'ticket-phone', 'ticket-device', 'ticket-issue'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    openModal('ticketModal');
  };

  window.editTicket = function (id) {
    const t = db.tickets.find(x => x.id === id);
    if (!t) return;
    editingId = id;
    document.getElementById('ticketModalTitle').textContent = 'Edit Repair Ticket';
    document.getElementById('ticket-edit-id').value = id;
    document.getElementById('ticket-customer').value = t.customer;
    document.getElementById('ticket-phone').value = t.phone || '';
    document.getElementById('ticket-device').value = t.device;
    document.getElementById('ticket-issue').value = t.issue;
    document.getElementById('ticket-priority').value = t.priority;
    openModal('ticketModal');
  };

  window.saveTicket = function () {
    const id = document.getElementById('ticket-edit-id').value;
    const ticket = {
      customer: document.getElementById('ticket-customer').value,
      phone: document.getElementById('ticket-phone').value || '(513) 555-0100',
      brand: 'Generic',
      device: document.getElementById('ticket-device').value,
      issue: document.getElementById('ticket-issue').value,
      priority: document.getElementById('ticket-priority').value,
      assigned: 'Demo User',
      due: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      partsCost: 20, laborCost: 40, price: 120
    };

    if (!ticket.customer || !ticket.device || !ticket.issue) { alert('Please fill in required fields.'); return; }

    if (id) {
      const idx = db.tickets.findIndex(t => t.id === id);
      if (idx >= 0) db.tickets[idx] = { ...db.tickets[idx], ...ticket };
    } else {
      const newId = 'T' + (1043 + db.tickets.length);
      db.tickets.unshift({ id: newId, status: 'Pending', ...ticket });
    }
    saveDb();
    closeModal('ticketModal');
    renderTickets();
    renderKanban();
  };

  window.deleteTicket = function (id) {
    if (confirm(`Delete ticket ${id}?`)) {
      db.tickets = db.tickets.filter(t => t.id !== id);
      saveDb();
      renderTickets();
      renderKanban();
    }
  };

  /* ---- Kanban Board ---- */
  function renderKanban() {
    const board = document.getElementById('kanban-board');
    if (!board) return;
    const statuses = ['Pending', 'Diagnosed', 'In Progress', 'Ready', 'Completed'];
    board.innerHTML = statuses.map(status => {
      const tickets = db.tickets.filter(t => t.status === status);
      return `
        <div class="kanban-column">
          <div class="kanban-column-header">${status} <span class="count">${tickets.length}</span></div>
          ${tickets.map(t => `
            <div class="kanban-card">
              <div class="kc-ticket">${t.id}</div>
              <div class="kc-customer">${t.customer}</div>
              <div class="kc-device">${t.device} —${t.issue}</div>
              <button class="pbtn pbtn-light pbtn-sm" style="width:100%; margin-top:8px;" onclick="advanceTicket('${t.id}')">Advance Status &rarr;</button>
            </div>
          `).join('') || '<p style="color:var(--text-faint);font-size:0.75rem;text-align:center;padding:12px;">No tickets</p>'}
        </div>
      `;
    }).join('');
  }

  window.advanceTicket = function (id) {
    const t = db.tickets.find(x => x.id === id);
    if (!t) return;
    const statuses = ['Pending', 'Diagnosed', 'In Progress', 'Ready', 'Completed'];
    const idx = statuses.indexOf(t.status);
    if (idx < statuses.length - 1) {
      t.status = statuses[idx + 1];
      saveDb();
      renderKanban();
      renderTickets();
    }
  };

  /* ---- Placeholder Renderers for other tabs ---- */
  window.renderCustomers = function () {};
  window.renderInventory = function () {};
  window.renderOrders = function () {};
  window.renderFinancials = function () {};
  window.renderTimeClock = function () {};
  window.renderEmployees = function () {};

  /* ---- Helper Badges ---- */
  function statusBadgeClass(status) {
    const map = { 'Pending': 'orange', 'Diagnosed': 'blue', 'In Progress': 'blue', 'Ready': 'green', 'Completed': 'green' };
    return map[status] || 'gray';
  }

  function priorityBadgeClass(priority) {
    const map = { 'Urgent': 'red', 'High': 'orange', 'Normal': 'blue' };
    return map[priority] || 'gray';
  }

  function initPortal() {
    renderDashboard();
    renderTickets();
  }

  /* Global Keyboard Shortcut for Enter on Login */
  document.getElementById('passcode')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') login();
  });

})();

