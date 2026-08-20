/* ============================================================
   AUSTIN'S TECH REPAIR GROUP — Employee Portal (Enhanced)
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
        { id: 'T1038', customer: 'Emma Wilson', phone: '(513) 555-0211', email: 'ewilson@email.com', deviceType: 'Tablet', brand: 'Apple', device: 'iPad Air', issue: 'Screen replacement', status: 'Pending', priority: 'Normal', assigned: 'Unassigned', due: '2026-08-01', partsCost: 90, laborCost: 50, price: 219, notes: 'Cracked screen, waiting for parts.' },
        { id: 'T1037', customer: 'Robert Brown', phone: '(937) 555-0233', email: 'rbrown@email.com', deviceType: 'Laptop', brand: 'HP', device: 'Pavilion 15', issue: 'Virus removal', status: 'Parts Ordered', priority: 'Low', assigned: 'Demo User', due: '2026-07-30', partsCost: 0, laborCost: 60, price: 129, notes: 'Malware detected, running cleanup.' },
      ],
      customers: [
        { id: 'C201', name: 'Sarah Mitchell', phone: '(513) 555-0100', email: 'sarah.m@email.com', address: 'Dayton, OH', repairs: 3, totalSpent: 457, member: true },
        { id: 'C202', name: 'David Kim', phone: '(937) 555-0142', email: 'dkim@email.com', address: 'Xenia, OH', repairs: 5, totalSpent: 892, member: true },
        { id: 'C203', name: 'Jessica Lopez', phone: '(513) 555-0188', email: 'jlopez@email.com', address: 'Beavercreek, OH', repairs: 2, totalSpent: 298, member: false },
        { id: 'C204', name: 'Mike Thompson', phone: '(937) 555-0199', email: 'mthompson@email.com', address: 'Kettering, OH', repairs: 1, totalSpent: 79, member: false },
        { id: 'C205', name: 'Emma Wilson', phone: '(513) 555-0211', email: 'ewilson@email.com', address: 'Centerville, OH', repairs: 4, totalSpent: 678, member: true },
      ],
      inventory: [
        { sku: 'IP13-OLED', name: 'iPhone 13 Pro OLED Screen', category: 'Screens', qty: 3, cost: 65, retail: 129, supplier: 'MobileSentrix', location: 'Shelf A-1', reorder: 2 },
        { sku: 'S22-BAT', name: 'Galaxy S22 Battery', category: 'Batteries', qty: 8, cost: 12, retail: 39, supplier: 'MobileSentrix', location: 'Shelf B-2', reorder: 3 },
        { sku: 'USBC-PORT', name: 'USB-C Charging Port', category: 'Ports', qty: 15, cost: 5, retail: 25, supplier: 'Amazon', location: 'Shelf C-1', reorder: 5 },
        { sku: 'IP13-CAM', name: 'iPhone 13 Camera Module', category: 'Cameras', qty: 2, cost: 28, retail: 69, supplier: 'eBay', location: 'Shelf A-3', reorder: 2 },
        { sku: 'TOOL-SET', name: 'Precision Screwdriver Set', category: 'Tools', qty: 5, cost: 15, retail: 35, supplier: 'Amazon', location: 'Tool Wall', reorder: 2 },
        { sku: 'SCRN-PROT', name: 'Screen Protector Universal', category: 'Accessories', qty: 20, cost: 2, retail: 15, supplier: 'MobileSentrix', location: 'Shelf D-1', reorder: 10 },
      ],
      orders: [
        { id: 'AMZ-8842', platform: 'Amazon', items: '5x iPhone 13 OLED Screens', cost: 325, status: 'Shipped', date: '2026-07-25', expected: '2026-07-28', tracking: '1Z999AA10123456784' },
        { id: 'EBY-3391', platform: 'eBay', items: '3x Galaxy S22 Batteries', cost: 36, status: 'Received', date: '2026-07-23', expected: '2026-07-26', tracking: '9405511899223456789' },
        { id: 'MSX-1102', platform: 'MobileSentrix', items: '10x USB-C Ports, 5x Camera Modules', cost: 85, status: 'Pending', date: '2026-07-27', expected: '2026-07-30', tracking: '' },
        { id: 'SHP-7783', platform: 'Shopify', items: 'Customer order: Watch Band x2', cost: 18, status: 'Received', date: '2026-07-24', expected: '2026-07-26', tracking: '1Z999AA10198765432' },
        { id: 'SQR-4456', platform: 'Square', items: 'In-store: Fast Charger x3', cost: 45, status: 'Received', date: '2026-07-22', expected: '2026-07-22', tracking: '' },
      ],
      transactions: [
        { id: 'TXN-501', type: 'Repair', amount: 189, cost: 105, method: 'Square', date: '2026-07-26' },
        { id: 'TXN-500', type: 'Product Sale', amount: 35, cost: 15, method: 'Cash', date: '2026-07-26' },
        { id: 'TXN-499', type: 'Repair', amount: 79, cost: 25, method: 'Card', date: '2026-07-25' },
        { id: 'TXN-498', type: 'Subscription', amount: 19.99, cost: 0, method: 'Square', date: '2026-07-25' },
        { id: 'TXN-497', type: 'B2B Service', amount: 450, cost: 100, method: 'PayPal', date: '2026-07-24' },
        { id: 'TXN-496', type: 'Repair', amount: 129, cost: 60, method: 'Square', date: '2026-07-24' },
        { id: 'TXN-495', type: 'Product Sale', amount: 29.99, cost: 12, method: 'Shopify', date: '2026-07-23' },
      ],
      employees: [
        { id: 'E01', name: 'Demo User', role: 'Technician', email: 'demo@atr.com', phone: '(513) 478-8077', repairs: 4, status: 'Active' },
        { id: 'E02', name: 'Austin Reed', role: 'Owner', email: 'austin@atr.com', phone: '(513) 478-8077', repairs: 0, status: 'Active' },
      ],
      timesheet: [
        { date: '2026-07-26', clockIn: '08:00', clockOut: '17:00', hours: 9, status: 'Completed' },
        { date: '2026-07-25', clockIn: '08:00', clockOut: '17:00', hours: 9, status: 'Completed' },
        { date: '2026-07-24', clockIn: '08:00', clockOut: '16:30', hours: 8.5, status: 'Completed' },
        { date: '2026-07-23', clockIn: '08:30', clockOut: '17:00', hours: 8.5, status: 'Completed' },
      ],
      clockStatus: { clockedIn: true, clockInTime: '08:00' },
    };
  }

  // Load database from localStorage or fallback to initial seed data
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
      console.error('Failed to save portal state to localStorage:', err);
    }
  }

  let charts = {};
  let editingId = null;
  let pendingDelete = null;

  /* ---- Login ---- */
  const USERS = { 'admin': { passcode: 'admin123', name: 'Austin Reed', role: 'Owner' }, 'demo': { passcode: 'demo', name: 'Demo User', role: 'Technician' } };

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
      if (msg) msg.textContent = 'Invalid credentials. Try demo/demo or admin/admin123';
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
    if (sectionId === 'portal-dashboard') renderDashboard();
    if (sectionId === 'portal-tickets') renderTickets();
    if (sectionId === 'portal-queue') renderKanban();
    if (sectionId === 'portal-customers') renderCustomers();
    if (sectionId === 'portal-inventory') renderInventory();
    if (sectionId === 'portal-orders') renderOrders();
    if (sectionId === 'portal-financials') renderFinancials();
    if (sectionId === 'portal-timeclock') renderTimeClock();
    if (sectionId === 'portal-employees') renderEmployees();
    if (sectionId === 'portal-reports') renderReports();
    if (sectionId === 'portal-hud') renderHUD();
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

  /* ---- Dashboard ---- */
  function renderDashboard() {
    const stats = document.getElementById('dashboard-stats');
    if (!stats) return;

    const todayRevenue = db.transactions.filter(t => t.date === '2026-07-26').reduce((s, t) => s + t.amount, 0);
    const activeTickets = db.tickets.filter(t => !['Completed', 'Cancelled'].includes(t.status)).length;
    const pendingOrders = db.orders.filter(o => o.status === 'Pending' || o.status === 'Shipped').length;
    const lowStock = db.inventory.filter(i => i.qty <= i.reorder).length;

    stats.innerHTML = `
      <div class="stat-card"><div class="stat-icon green"><i class="fas fa-dollar-sign"></i></div><div class="stat-info"><div class="stat-label">Today's Revenue</div><div class="stat-value">$${todayRevenue.toFixed(2)}</div></div></div>
      <div class="stat-card"><div class="stat-icon blue"><i class="fas fa-ticket"></i></div><div class="stat-info"><div class="stat-label">Active Tickets</div><div class="stat-value">${activeTickets}</div></div></div>
      <div class="stat-card"><div class="stat-icon orange"><i class="fas fa-truck-fast"></i></div><div class="stat-info"><div class="stat-label">Pending Orders</div><div class="stat-value">${pendingOrders}</div></div></div>
      <div class="stat-card"><div class="stat-icon red"><i class="fas fa-triangle-exclamation"></i></div><div class="stat-info"><div class="stat-label">Low Stock Items</div><div class="stat-value">${lowStock}</div></div></div>
    `;

    const feed = document.getElementById('activity-feed');
    if (feed) {
      const activities = [
        { text: '<strong>Ticket T1042</strong> moved to In Progress', time: '2 hours ago' },
        { text: '<strong>Order AMZ-8842</strong> shipped via Amazon', time: '5 hours ago' },
        { text: '<strong>$189.00</strong> payment received — Sarah Mitchell', time: '6 hours ago' },
        { text: '<strong>iPhone 13 OLED Screen</strong> stock low (3 left)', time: '8 hours ago' },
        { text: '<strong>David Kim</strong> ticket marked Ready', time: '1 day ago' },
      ];
      feed.innerHTML = activities.map(a => `<div class="activity-item"><div class="activity-dot"></div><div><div class="activity-text">${a.text}</div><div class="activity-time">${a.time}</div></div></div>`).join('');
    }

    setTimeout(() => {
      drawRevenueChart();
      drawStatusChart();
    }, 100);
  }

  function drawRevenueChart() {
    const canvas = document.getElementById('revenueChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (charts.revenue) charts.revenue.destroy();

    const days = ['Jul 20', 'Jul 21', 'Jul 22', 'Jul 23', 'Jul 24', 'Jul 25', 'Jul 26'];
    const revenue = [320, 450, 280, 510, 380, 670, 224];

    charts.revenue = new Chart(canvas, {
      type: 'line',
      data: {
        labels: days,
        datasets: [{
          label: 'Revenue',
          data: revenue,
          borderColor: getCSSVar('--primary'),
          backgroundColor: hexToRgba(getCSSVar('--primary'), 0.1),
          fill: true,
          tension: 0.4,
          borderWidth: 2,
          pointBackgroundColor: getCSSVar('--primary'),
          pointRadius: 4,
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: getCSSVar('--divider') } }, x: { grid: { display: false } } } }
    });
  }

  function drawStatusChart() {
    const canvas = document.getElementById('statusChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (charts.status) charts.status.destroy();

    const statuses = ['Pending', 'Diagnosed', 'Parts Ordered', 'In Progress', 'Ready', 'Completed'];
    const counts = statuses.map(s => db.tickets.filter(t => t.status === s).length);

    charts.status = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: statuses,
        datasets: [{
          data: counts,
          backgroundColor: ['#f59e0b', '#3b82f6', '#a78bfa', '#0057ff', '#10b981', '#6b7280'],
          borderWidth: 0,
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 8 } } } }
    });
  }

  /* ---- Tickets ---- */
  function renderTickets() {
    const tbody = document.getElementById('tickets-tbody');
    if (!tbody) return;
    const statusFilter = document.getElementById('ticket-filter-status')?.value || '';
    const priorityFilter = document.getElementById('ticket-filter-priority')?.value || '';
    const search = document.getElementById('ticket-search')?.value.toLowerCase() || '';

    const tickets = db.tickets.filter(t => {
      if (statusFilter && t.status !== statusFilter) return false;
      if (priorityFilter && t.priority !== priorityFilter) return false;
      if (search && !(`${t.id} ${t.customer} ${t.device} ${t.issue}`.toLowerCase().includes(search))) return false;
      return true;
    });

    tbody.innerHTML = tickets.length === 0 ? '<tr><td colspan="9" style="text-align:center;padding:var(--space-6);color:var(--text-muted);">No tickets found</td></tr>' :
      tickets.map(t => `
        <tr>
          <td><strong>${t.id}</strong></td>
          <td>${t.customer}</td>
          <td>${t.brand} ${t.device}</td>
          <td>${t.issue}</td>
          <td><span class="badge ${statusBadgeClass(t.status)}">${t.status}</span></td>
          <td><span class="badge ${priorityBadgeClass(t.priority)}">${t.priority}</span></td>
          <td>${t.assigned}</td>
          <td>${formatDate(t.due)}</td>
          <td><div class="action-btns">
            <button class="action-btn" onclick="viewTicket('${t.id}')" title="View"><i class="fas fa-eye"></i></button>
            <button class="action-btn" onclick="editTicket('${t.id}')" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="action-btn danger" onclick="deleteTicket('${t.id}')" title="Delete"><i class="fas fa-trash"></i></button>
          </div></td>
        </tr>
      `).join('');
  }

  window.viewTicket = function (id) {
    const t = db.tickets.find(x => x.id === id);
    if (!t) return;
    const body = document.getElementById('ticketDetailBody');
    if (body) {
      body.innerHTML = `
        <div class="detail-grid">
          <div class="detail-item"><span class="detail-label">Ticket #</span><span class="detail-value">${t.id}</span></div>
          <div class="detail-item"><span class="detail-label">Status</span><span class="detail-value"><span class="badge ${statusBadgeClass(t.status)}">${t.status}</span></span></div>
          <div class="detail-item"><span class="detail-label">Customer</span><span class="detail-value">${t.customer}</span></div>
          <div class="detail-item"><span class="detail-label">Phone</span><span class="detail-value">${t.phone}</span></div>
          <div class="detail-item"><span class="detail-label">Email</span><span class="detail-value">${t.email || '—'}</span></div>
          <div class="detail-item"><span class="detail-label">Priority</span><span class="detail-value">${t.priority}</span></div>
          <div class="detail-item"><span class="detail-label">Device</span><span class="detail-value">${t.brand} ${t.device}</span></div>
          <div class="detail-item"><span class="detail-label">Issue</span><span class="detail-value">${t.issue}</span></div>
          <div class="detail-item"><span class="detail-label">Assigned To</span><span class="detail-value">${t.assigned}</span></div>
          <div class="detail-item"><span class="detail-label">Due Date</span><span class="detail-value">${formatDate(t.due)}</span></div>
          <div class="detail-item"><span class="detail-label">Parts Cost</span><span class="detail-value">$${t.partsCost.toFixed(2)}</span></div>
          <div class="detail-item"><span class="detail-label">Labor Cost</span><span class="detail-value">$${t.laborCost.toFixed(2)}</span></div>
          <div class="detail-item"><span class="detail-label">Retail Price</span><span class="detail-value">$${t.price.toFixed(2)}</span></div>
          <div class="detail-item"><span class="detail-label">Profit</span><span class="detail-value" style="color:var(--success)">$${(t.price - t.partsCost - t.laborCost).toFixed(2)}</span></div>
        </div>
        ${t.notes ? `<div style="margin-top:var(--space-4);"><span class="detail-label">Notes</span><p style="margin-top:var(--space-2);font-size:var(--text-sm);color:var(--text-muted);">${t.notes}</p></div>` : ''}
      `;
    }
    const editBtn = document.getElementById('ticketDetailEdit');
    if (editBtn) editBtn.onclick = () => { closeModal('ticketDetailModal'); editTicket(id); };
    openModal('ticketDetailModal');
  };

  window.editTicket = function (id) {
    const t = db.tickets.find(x => x.id === id);
    if (!t) return;
    editingId = id;
    document.getElementById('ticketModalTitle').textContent = 'Edit Repair Ticket';
    document.getElementById('ticket-edit-id').value = id;
    document.getElementById('ticket-customer').value = t.customer;
    document.getElementById('ticket-phone').value = t.phone;
    document.getElementById('ticket-email').value = t.email || '';
    document.getElementById('ticket-device-type').value = t.deviceType;
    document.getElementById('ticket-brand').value = t.brand;
    document.getElementById('ticket-device').value = t.device;
    document.getElementById('ticket-issue').value = t.issue;
    document.getElementById('ticket-priority').value = t.priority;
    document.getElementById('ticket-parts-cost').value = t.partsCost;
    document.getElementById('ticket-labor-cost').value = t.laborCost;
    document.getElementById('ticket-price').value = t.price;
    document.getElementById('ticket-assigned').value = t.assigned;
    document.getElementById('ticket-notes').value = t.notes || '';
    openModal('ticketModal');
  };

  window.openTicketModal = function () {
    editingId = null;
    document.getElementById('ticketModalTitle').textContent = 'New Repair Ticket';
    document.getElementById('ticket-edit-id').value = '';
    ['ticket-customer', 'ticket-phone', 'ticket-email', 'ticket-brand', 'ticket-device', 'ticket-issue', 'ticket-notes'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('ticket-parts-cost').value = 0;
    document.getElementById('ticket-labor-cost').value = 0;
    document.getElementById('ticket-price').value = 0;
    openModal('ticketModal');
  };

  window.saveTicket = function () {
    const id = document.getElementById('ticket-edit-id').value;
    const ticket = {
      customer: document.getElementById('ticket-customer').value,
      phone: document.getElementById('ticket-phone').value,
      email: document.getElementById('ticket-email').value,
      deviceType: document.getElementById('ticket-device-type').value,
      brand: document.getElementById('ticket-brand').value,
      device: document.getElementById('ticket-device').value,
      issue: document.getElementById('ticket-issue').value,
      priority: document.getElementById('ticket-priority').value,
      partsCost: parseFloat(document.getElementById('ticket-parts-cost').value) || 0,
      laborCost: parseFloat(document.getElementById('ticket-labor-cost').value) || 0,
      price: parseFloat(document.getElementById('ticket-price').value) || 0,
      assigned: document.getElementById('ticket-assigned').value,
      notes: document.getElementById('ticket-notes').value,
      due: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
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
    pendingDelete = { type: 'ticket', id };
    const confirmMsg = document.getElementById('confirmMessage');
    if (confirmMsg) confirmMsg.textContent = `Delete ticket ${id}? This cannot be undone.`;
    openModal('confirmModal');
  };

  /* ---- Kanban ---- */
  function renderKanban() {
    const board = document.getElementById('kanban-board');
    if (!board) return;
    const statuses = ['Pending', 'Diagnosed', 'Parts Ordered', 'In Progress', 'Ready', 'Completed'];
    board.innerHTML = statuses.map(status => {
      const tickets = db.tickets.filter(t => t.status === status);
      return `
        <div class="kanban-column">
          <div class="kanban-column-header">${status} <span class="count">${tickets.length}</span></div>
          ${tickets.map(t => `
            <div class="kanban-card">
              <div class="kc-ticket">${t.id}</div>
              <div class="kc-customer">${t.customer}</div>
              <div class="kc-device">${t.brand} ${t.device} — ${t.issue}</div>
              <div class="kc-footer">
                <span class="badge ${priorityBadgeClass(t.priority)}">${t.priority}</span>
                <div class="kanban-arrows">
                  ${status !== 'Pending' ? `<span class="kanban-arrow" onclick="moveTicket('${t.id}', -1)" title="Move back"><i class="fas fa-chevron-left"></i></span>` : ''}
                  ${status !== 'Completed' ? `<span class="kanban-arrow" onclick="moveTicket('${t.id}', 1)" title="Move forward"><i class="fas fa-chevron-right"></i></span>` : ''}
                </div>
              </div>
            </div>
          `).join('') || '<p style="color:var(--text-faint);font-size:var(--text-xs);text-align:center;padding:var(--space-3);">No tickets</p>'}
        </div>
      `;
    }).join('');
  }

  window.moveTicket = function (id, direction) {
    const t = db.tickets.find(x => x.id === id);
    if (!t) return;
    const statuses = ['Pending', 'Diagnosed', 'Parts Ordered', 'In Progress', 'Ready', 'Completed'];
    const idx = statuses.indexOf(t.status);
    const newIdx = Math.max(0, Math.min(statuses.length - 1, idx + direction));
    t.status = statuses[newIdx];
    saveDb();
    renderKanban();
    renderTickets();
  };

  /* ---- Customers ---- */
  function renderCustomers() {
    const tbody = document.getElementById('customers-tbody');
    if (!tbody) return;
    const search = document.getElementById('customer-search')?.value.toLowerCase() || '';
    const customers = db.customers.filter(c => !search || `${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(search));

    tbody.innerHTML = customers.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:var(--space-6);color:var(--text-muted);">No customers found</td></tr>' :
      customers.map(c => `
        <tr>
          <td>${c.id}</td>
          <td>${c.name}</td>
          <td>${c.phone}</td>
          <td>${c.email || '—'}</td>
          <td>${c.repairs}</td>
          <td>$${c.totalSpent.toFixed(2)}</td>
          <td>${c.member ? '<span class="badge purple">ATR One</span>' : '<span class="badge gray">—</span>'}</td>
          <td><div class="action-btns">
            <button class="action-btn" onclick="editCustomer('${c.id}')" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="action-btn danger" onclick="deleteCustomer('${c.id}')" title="Delete"><i class="fas fa-trash"></i></button>
          </div></td>
        </tr>
      `).join('');
  }

  window.openCustomerModal = function () {
    editingId = null;
    document.getElementById('customerModalTitle').textContent = 'Add Customer';
    document.getElementById('customer-edit-id').value = '';
    ['customer-name', 'customer-phone', 'customer-email', 'customer-address'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('customer-member').value = 'false';
    openModal('customerModal');
  };

  window.editCustomer = function (id) {
    const c = db.customers.find(x => x.id === id);
    if (!c) return;
    editingId = id;
    document.getElementById('customerModalTitle').textContent = 'Edit Customer';
    document.getElementById('customer-edit-id').value = id;
    document.getElementById('customer-name').value = c.name;
    document.getElementById('customer-phone').value = c.phone;
    document.getElementById('customer-email').value = c.email || '';
    document.getElementById('customer-address').value = c.address || '';
    document.getElementById('customer-member').value = c.member ? 'true' : 'false';
    openModal('customerModal');
  };

  window.saveCustomer = function () {
    const name = document.getElementById('customer-name').value;
    if (!name) { alert('Name is required.'); return; }
    const data = {
      name, phone: document.getElementById('customer-phone').value,
      email: document.getElementById('customer-email').value,
      address: document.getElementById('customer-address').value,
      member: document.getElementById('customer-member').value === 'true',
    };
    if (editingId) {
      const idx = db.customers.findIndex(c => c.id === editingId);
      if (idx >= 0) db.customers[idx] = { ...db.customers[idx], ...data };
    } else {
      const newId = 'C' + (206 + db.customers.length);
      db.customers.push({ id: newId, repairs: 0, totalSpent: 0, ...data });
    }
    saveDb();
    closeModal('customerModal');
    renderCustomers();
  };

  window.deleteCustomer = function (id) {
    pendingDelete = { type: 'customer', id };
    const confirmMsg = document.getElementById('confirmMessage');
    if (confirmMsg) confirmMsg.textContent = `Delete customer ${id}? This cannot be undone.`;
    openModal('confirmModal');
  };

  /* ---- Inventory ---- */
  function renderInventory() {
    const tbody = document.getElementById('inventory-tbody');
    if (!tbody) return;
    const filter = document.getElementById('inventory-filter')?.value || '';
    const search = document.getElementById('inventory-search')?.value.toLowerCase() || '';
    const items = db.inventory.filter(i => {
      if (filter && i.category !== filter) return false;
      if (search && !(`${i.sku} ${i.name} ${i.supplier}`.toLowerCase().includes(search))) return false;
      return true;
    });

    tbody.innerHTML = items.length === 0 ? '<tr><td colspan="9" style="text-align:center;padding:var(--space-6);color:var(--text-muted);">No parts found</td></tr>' :
      items.map(i => `
        <tr>
          <td><strong>${i.sku}</strong></td>
          <td>${i.name}</td>
          <td>${i.category}</td>
          <td>${i.qty <= i.reorder ? `<span style="color:var(--danger);font-weight:700;">${i.qty} ⚠</span>` : i.qty}</td>
          <td>$${i.cost.toFixed(2)}</td>
          <td>$${i.retail.toFixed(2)}</td>
          <td>${i.supplier}</td>
          <td>${i.location}</td>
          <td><div class="action-btns">
            <button class="action-btn" onclick="editPart('${i.sku}')" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="action-btn danger" onclick="deletePart('${i.sku}')" title="Delete"><i class="fas fa-trash"></i></button>
          </div></td>
        </tr>
      `).join('');
  }

  window.openPartModal = function () {
    editingId = null;
    document.getElementById('partModalTitle').textContent = 'Add Part';
    document.getElementById('part-edit-id').value = '';
    ['part-name', 'part-sku', 'part-supplier', 'part-location'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('part-qty').value = 1;
    document.getElementById('part-cost').value = 0;
    document.getElementById('part-retail').value = 0;
    document.getElementById('part-reorder').value = 3;
    openModal('partModal');
  };

  window.editPart = function (sku) {
    const p = db.inventory.find(x => x.sku === sku);
    if (!p) return;
    editingId = sku;
    document.getElementById('partModalTitle').textContent = 'Edit Part';
    document.getElementById('part-edit-id').value = sku;
    document.getElementById('part-name').value = p.name;
    document.getElementById('part-sku').value = p.sku;
    document.getElementById('part-category').value = p.category;
    document.getElementById('part-qty').value = p.qty;
    document.getElementById('part-cost').value = p.cost;
    document.getElementById('part-retail').value = p.retail;
    document.getElementById('part-supplier').value = p.supplier;
    document.getElementById('part-location').value = p.location;
    document.getElementById('part-reorder').value = p.reorder;
    openModal('partModal');
  };

  window.savePart = function () {
    const name = document.getElementById('part-name').value;
    const sku = document.getElementById('part-sku').value;
    if (!name || !sku) { alert('Part name and SKU are required.'); return; }
    const data = {
      name, sku,
      category: document.getElementById('part-category').value,
      qty: parseInt(document.getElementById('part-qty').value) || 0,
      cost: parseFloat(document.getElementById('part-cost').value) || 0,
      retail: parseFloat(document.getElementById('part-retail').value) || 0,
      supplier: document.getElementById('part-supplier').value,
      location: document.getElementById('part-location').value,
      reorder: parseInt(document.getElementById('part-reorder').value) || 0,
    };
    if (editingId) {
      const idx = db.inventory.findIndex(p => p.sku === editingId);
      if (idx >= 0) db.inventory[idx] = { ...db.inventory[idx], ...data };
    } else {
      db.inventory.push(data);
    }
    saveDb();
    closeModal('partModal');
    renderInventory();
  };

  window.deletePart = function (sku) {
    pendingDelete = { type: 'part', id: sku };
    const confirmMsg = document.getElementById('confirmMessage');
    if (confirmMsg) confirmMsg.textContent = `Delete part ${sku}? This cannot be undone.`;
    openModal('confirmModal');
  };

  /* ---- Orders ---- */
  let currentOrderTab = 'all';

  window.switchOrderTab = function (btn, tab) {
    currentOrderTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderOrders();
  };

  function renderOrders() {
    const tbody = document.getElementById('orders-tbody');
    if (!tbody) return;
    const orders = currentOrderTab === 'all' ? db.orders : db.orders.filter(o => o.platform === currentOrderTab);

    const navCount = document.getElementById('nav-order-count');
    if (navCount) navCount.textContent = db.orders.filter(o => o.status === 'Pending' || o.status === 'Shipped').length;

    tbody.innerHTML = orders.length === 0 ? '<tr><td colspan="9" style="text-align:center;padding:var(--space-6);color:var(--text-muted);">No orders found</td></tr>' :
      orders.map(o => `
        <tr>
          <td><strong>${o.id}</strong></td>
          <td>${o.platform}</td>
          <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;">${o.items}</td>
          <td>$${o.cost.toFixed(2)}</td>
          <td><span class="badge ${orderStatusBadge(o.status)}">${o.status}</span></td>
          <td>${formatDate(o.date)}</td>
          <td>${formatDate(o.expected)}</td>
          <td>${o.tracking ? `<span style="font-family:var(--font-mono);font-size:var(--text-xs);">${o.tracking}</span>` : '—'}</td>
          <td><div class="action-btns">
            <button class="action-btn" onclick="editOrder('${o.id}')" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="action-btn danger" onclick="deleteOrder('${o.id}')" title="Delete"><i class="fas fa-trash"></i></button>
          </div></td>
        </tr>
      `).join('');
  }

  window.openOrderModal = function () {
    editingId = null;
    document.getElementById('orderModalTitle').textContent = 'New Order';
    document.getElementById('order-edit-id').value = '';
    ['order-number', 'order-items', 'order-tracking', 'order-notes', 'order-expected'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('order-cost').value = 0;
    openModal('orderModal');
  };

  window.editOrder = function (id) {
    const o = db.orders.find(x => x.id === id);
    if (!o) return;
    editingId = id;
    document.getElementById('orderModalTitle').textContent = 'Edit Order';
    document.getElementById('order-edit-id').value = id;
    document.getElementById('order-platform').value = o.platform;
    document.getElementById('order-number').value = o.id;
    document.getElementById('order-items').value = o.items;
    document.getElementById('order-cost').value = o.cost;
    document.getElementById('order-status').value = o.status;
    document.getElementById('order-expected').value = o.expected;
    document.getElementById('order-tracking').value = o.tracking || '';
    openModal('orderModal');
  };

  window.saveOrder = function () {
    const number = document.getElementById('order-number').value;
    if (!number) { alert('Order number is required.'); return; }
    const data = {
      platform: document.getElementById('order-platform').value,
      id: number,
      items: document.getElementById('order-items').value,
      cost: parseFloat(document.getElementById('order-cost').value) || 0,
      status: document.getElementById('order-status').value,
      expected: document.getElementById('order-expected').value,
      tracking: document.getElementById('order-tracking').value,
      date: new Date().toISOString().split('T')[0],
    };
    if (editingId) {
      const idx = db.orders.findIndex(o => o.id === editingId);
      if (idx >= 0) db.orders[idx] = { ...db.orders[idx], ...data };
    } else {
      db.orders.unshift(data);
    }
    saveDb();
    closeModal('orderModal');
    renderOrders();
  };

  window.deleteOrder = function (id) {
    pendingDelete = { type: 'order', id };
    const confirmMsg = document.getElementById('confirmMessage');
    if (confirmMsg) confirmMsg.textContent = `Delete order ${id}? This cannot be undone.`;
    openModal('confirmModal');
  };

  /* ---- Financials ---- */
  function renderFinancials() {
    const stats = document.getElementById('financial-stats');
    if (!stats) return;

    const totalRevenue = db.transactions.reduce((s, t) => s + t.amount, 0);
    const totalCost = db.transactions.reduce((s, t) => s + t.cost, 0);
    const profit = totalRevenue - totalCost;
    const margin = totalRevenue > 0 ? ((profit / totalRevenue) * 100).toFixed(1) : 0;

    stats.innerHTML = `
      <div class="stat-card"><div class="stat-icon green"><i class="fas fa-dollar-sign"></i></div><div class="stat-info"><div class="stat-label">Total Revenue</div><div class="stat-value">$${totalRevenue.toFixed(2)}</div></div></div>
      <div class="stat-card"><div class="stat-icon blue"><i class="fas fa-chart-line"></i></div><div class="stat-info"><div class="stat-label">Total Profit</div><div class="stat-value">$${profit.toFixed(2)}</div></div></div>
      <div class="stat-card"><div class="stat-icon purple"><i class="fas fa-percentage"></i></div><div class="stat-info"><div class="stat-label">Profit Margin</div><div class="stat-value">${margin}%</div></div></div>
      <div class="stat-card"><div class="stat-icon orange"><i class="fas fa-receipt"></i></div><div class="stat-info"><div class="stat-label">Transactions</div><div class="stat-value">${db.transactions.length}</div></div></div>
    `;

    const tbody = document.getElementById('transactions-tbody');
    if (tbody) {
      tbody.innerHTML = db.transactions.slice().reverse().map(t => `
        <tr>
          <td>${t.id}</td>
          <td>${t.type}</td>
          <td>$${t.amount.toFixed(2)}</td>
          <td style="color:var(--success);">$${(t.amount - t.cost).toFixed(2)}</td>
          <td><span class="badge blue">${t.method}</span></td>
          <td>${formatDate(t.date)}</td>
        </tr>
      `).join('');
    }

    setTimeout(() => {
      drawProfitChart();
      drawPaymentChart();
      drawRevenueTypeChart();
    }, 100);
  }

  function drawProfitChart() {
    const canvas = document.getElementById('profitChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (charts.profit) charts.profit.destroy();

    const days = [];
    const rev = [];
    const prof = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const ds = d.toISOString().split('T')[0];
      days.push(ds.slice(5));
      const dayRev = 200 + Math.random() * 400;
      rev.push(Math.round(dayRev));
      prof.push(Math.round(dayRev * 0.55));
    }

    charts.profit = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: days,
        datasets: [
          { label: 'Revenue', data: rev, backgroundColor: hexToRgba(getCSSVar('--primary'), 0.6), borderRadius: 4 },
          { label: 'Profit', data: prof, backgroundColor: hexToRgba(getCSSVar('--success'), 0.6), borderRadius: 4 },
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { font: { size: 11 } } } }, scales: { y: { beginAtZero: true, grid: { color: getCSSVar('--divider') } }, x: { grid: { display: false }, ticks: { maxTicksLimit: 10, font: { size: 9 } } } } }
    });
  }

  function drawPaymentChart() {
    const canvas = document.getElementById('paymentChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (charts.payment) charts.payment.destroy();

    const methods = {};
    db.transactions.forEach(t => { methods[t.method] = (methods[t.method] || 0) + t.amount; });

    charts.payment = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: Object.keys(methods),
        datasets: [{ data: Object.values(methods), backgroundColor: ['#0057ff', '#10b981', '#f59e0b', '#a78bfa', '#f97316'], borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 8 } } } }
    });
  }

  function drawRevenueTypeChart() {
    const canvas = document.getElementById('revenueTypeChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (charts.revType) charts.revType.destroy();

    const types = {};
    db.transactions.forEach(t => { types[t.type] = (types[t.type] || 0) + t.amount; });

    charts.revType = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: Object.keys(types),
        datasets: [{ data: Object.values(types), backgroundColor: ['#0057ff', '#10b981', '#a78bfa', '#f59e0b'], borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 8 } } } }
    });
  }

  window.openTransactionModal = function () {
    ['txn-amount', 'txn-cost'].forEach(id => { const el = document.getElementById(id); if (el) el.value = 0; });
    const txnTicket = document.getElementById('txn-ticket');
    if (txnTicket) txnTicket.value = '';
    openModal('transactionModal');
  };

  window.saveTransaction = function () {
    const txn = {
      id: 'TXN-' + (502 + db.transactions.length),
      type: document.getElementById('txn-type').value,
      amount: parseFloat(document.getElementById('txn-amount').value) || 0,
      cost: parseFloat(document.getElementById('txn-cost').value) || 0,
      method: document.getElementById('txn-method').value,
      date: new Date().toISOString().split('T')[0],
    };
    db.transactions.push(txn);
    saveDb();
    closeModal('transactionModal');
    renderFinancials();
  };

  /* ---- Time Clock ---- */
  function renderTimeClock() {
    const display = document.getElementById('clock-status-display');
    if (display) {
      if (db.clockStatus.clockedIn) {
        display.innerHTML = `
          <div class="clock-display" style="color:var(--success);"><i class="fas fa-circle" style="font-size:0.5rem;"></i> Clocked In</div>
          <p style="color:var(--text-muted);margin-bottom:var(--space-3);">Since ${db.clockStatus.clockInTime} today</p>
          <button class="clock-btn out" onclick="clockOut()"><i class="fas fa-clock"></i> Clock Out</button>
        `;
      } else {
        display.innerHTML = `
          <div class="clock-display" style="color:var(--text-muted);"><i class="fas fa-circle" style="font-size:0.5rem;"></i> Clocked Out</div>
          <p style="color:var(--text-muted);margin-bottom:var(--space-3);">Not currently clocked in</p>
          <button class="clock-btn in" onclick="clockIn()"><i class="fas fa-clock"></i> Clock In</button>
        `;
      }
    }

    const tbody = document.getElementById('timesheet-tbody');
    if (tbody) {
      tbody.innerHTML = db.timesheet.map(t => `
        <tr>
          <td>${formatDate(t.date)}</td>
          <td>${t.clockIn}</td>
          <td>${t.clockOut}</td>
          <td>${t.hours}h</td>
          <td><span class="badge green">${t.status}</span></td>
        </tr>
      `).join('');
    }
  }

  window.clockIn = function () {
    db.clockStatus = { clockedIn: true, clockInTime: new Date().toTimeString().slice(0, 5) };
    const shiftStatus = document.getElementById('shift-status');
    if (shiftStatus) {
      shiftStatus.innerHTML = '<i class="fas fa-circle" style="font-size:6px"></i> Clocked In';
      shiftStatus.className = 'pill success';
    }
    saveDb();
    renderTimeClock();
  };

  window.clockOut = function () {
    const today = new Date().toISOString().split('T')[0];
    const hours = ((new Date().getHours() + new Date().getMinutes() / 60) - 8).toFixed(1);
    db.timesheet.unshift({ date: today, clockIn: db.clockStatus.clockInTime, clockOut: new Date().toTimeString().slice(0, 5), hours: parseFloat(hours), status: 'Completed' });
    db.clockStatus = { clockedIn: false, clockInTime: null };
    const shiftStatus = document.getElementById('shift-status');
    if (shiftStatus) {
      shiftStatus.innerHTML = '<i class="fas fa-circle" style="font-size:6px"></i> Clocked Out';
      shiftStatus.className = 'pill';
    }
    saveDb();
    renderTimeClock();
  };

  /* ---- Employees ---- */
  function renderEmployees() {
    const tbody = document.getElementById('employees-tbody');
    if (!tbody) return;
    tbody.innerHTML = db.employees.map(e => `
      <tr>
        <td>${e.name}</td>
        <td>${e.role}</td>
        <td>${e.email}</td>
        <td>${e.phone}</td>
        <td>${e.repairs}</td>
        <td><span class="badge ${e.status === 'Active' ? 'green' : 'gray'}">${e.status}</span></td>
        <td><div class="action-btns">
          <button class="action-btn" onclick="editEmployee('${e.id}')" title="Edit"><i class="fas fa-edit"></i></button>
          <button class="action-btn danger" onclick="deleteEmployee('${e.id}')" title="Delete"><i class="fas fa-trash"></i></button>
        </div></td>
      </tr>
    `).join('');
  }

  window.openEmployeeModal = function () {
    editingId = null;
    document.getElementById('employeeModalTitle').textContent = 'Add Employee';
    document.getElementById('employee-edit-id').value = '';
    ['employee-name', 'employee-email', 'employee-phone'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    openModal('employeeModal');
  };

  window.editEmployee = function (id) {
    const e = db.employees.find(x => x.id === id);
    if (!e) return;
    editingId = id;
    document.getElementById('employeeModalTitle').textContent = 'Edit Employee';
    document.getElementById('employee-edit-id').value = id;
    document.getElementById('employee-name').value = e.name;
    document.getElementById('employee-role').value = e.role;
    document.getElementById('employee-status').value = e.status;
    document.getElementById('employee-email').value = e.email;
    document.getElementById('employee-phone').value = e.phone;
    openModal('employeeModal');
  };

  window.saveEmployee = function () {
    const name = document.getElementById('employee-name').value;
    if (!name) { alert('Name is required.'); return; }
    const data = {
      name,
      role: document.getElementById('employee-role').value,
      status: document.getElementById('employee-status').value,
      email: document.getElementById('employee-email').value,
      phone: document.getElementById('employee-phone').value,
    };
    if (editingId) {
      const idx = db.employees.findIndex(e => e.id === editingId);
      if (idx >= 0) db.employees[idx] = { ...db.employees[idx], ...data };
    } else {
      db.employees.push({ id: 'E' + (3 + db.employees.length).toString().padStart(2, '0'), repairs: 0, ...data });
    }
    saveDb();
    closeModal('employeeModal');
    renderEmployees();
  };

  window.deleteEmployee = function (id) {
    pendingDelete = { type: 'employee', id };
    const confirmMsg = document.getElementById('confirmMessage');
    if (confirmMsg) confirmMsg.textContent = `Delete employee ${id}? This cannot be undone.`;
    openModal('confirmModal');
  };

  /* ---- Reports ---- */
  function renderReports() {
    const completed = db.tickets.filter(t => t.status === 'Completed').length;
    const total = db.tickets.length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const avgTicket = total > 0 ? (db.tickets.reduce((s, t) => s + t.price, 0) / total).toFixed(2) : 0;

    const compRateEl = document.getElementById('completion-rate');
    const avgTicketEl = document.getElementById('avg-ticket');
    const avgTimeEl = document.getElementById('avg-repair-time');

    if (compRateEl) compRateEl.innerHTML = `<div style="font-size:var(--text-2xl);font-weight:900;font-family:var(--font-display);color:var(--success);">${completionRate}%</div>`;
    if (avgTicketEl) avgTicketEl.innerHTML = `<div style="font-size:var(--text-2xl);font-weight:900;font-family:var(--font-display);color:var(--primary);">$${avgTicket}</div>`;
    if (avgTimeEl) avgTimeEl.innerHTML = `<div style="font-size:var(--text-2xl);font-weight:900;font-family:var(--font-display);color:var(--accent-blue);">1.5 days</div>`;

    setTimeout(() => {
      drawDeviceTypeChart();
      drawIssueTypeChart();
      drawTopCustomersChart();
    }, 100);
  }

  function drawDeviceTypeChart() {
    const canvas = document.getElementById('deviceTypeChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (charts.deviceType) charts.deviceType.destroy();
    const types = {};
    db.tickets.forEach(t => { types[t.deviceType] = (types[t.deviceType] || 0) + 1; });
    charts.deviceType = new Chart(canvas, { type: 'doughnut', data: { labels: Object.keys(types), datasets: [{ data: Object.values(types), backgroundColor: ['#0057ff', '#10b981', '#f59e0b', '#a78bfa', '#f97316', '#ef4444'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 8 } } } } });
  }

  function drawIssueTypeChart() {
    const canvas = document.getElementById('issueTypeChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (charts.issueType) charts.issueType.destroy();
    const types = {};
    db.tickets.forEach(t => { types[t.issue] = (types[t.issue] || 0) + 1; });
    charts.issueType = new Chart(canvas, { type: 'bar', data: { labels: Object.keys(types), datasets: [{ data: Object.values(types), backgroundColor: hexToRgba(getCSSVar('--primary'), 0.6), borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, grid: { color: getCSSVar('--divider') } }, y: { grid: { display: false } } } } });
  }

  function drawTopCustomersChart() {
    const canvas = document.getElementById('topCustomersChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (charts.topCustomers) charts.topCustomers.destroy();
    const top = db.customers.slice().sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 5);
    charts.topCustomers = new Chart(canvas, { type: 'bar', data: { labels: top.map(c => c.name), datasets: [{ label: 'Total Spent', data: top.map(c => c.totalSpent), backgroundColor: hexToRgba(getCSSVar('--primary'), 0.6), borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: getCSSVar('--divider') } }, x: { grid: { display: false } } } } });
  }

  /* ---- RepairShopr HUD ---- */
  function renderHUD() {
    const tbody = document.getElementById('hud-tickets-tbody');
    if (!tbody) return;
    const active = db.tickets.filter(t => t.status !== 'Completed' && t.status !== 'Cancelled');
    tbody.innerHTML = active.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:var(--space-6);color:var(--text-muted);">No active tickets</td></tr>' :
      active.map(t => `
        <tr>
          <td><strong>${t.id}</strong></td>
          <td>${t.customer}</td>
          <td>${t.brand} ${t.device}</td>
          <td>${t.issue}</td>
          <td><span class="badge ${statusBadgeClass(t.status)}">${t.status}</span></td>
          <td>$${t.price.toFixed(2)}</td>
          <td style="color:var(--success);">$${(t.price - t.partsCost - t.laborCost).toFixed(2)}</td>
          <td><div class="action-btns">
            <button class="action-btn" onclick="viewTicket('${t.id}')" title="View"><i class="fas fa-eye"></i></button>
            <button class="action-btn" onclick="editTicket('${t.id}')" title="Edit"><i class="fas fa-edit"></i></button>
          </div></td>
        </tr>
      `).join('');
    calcMarkup();
  }

  /* ---- Markup Calculator ---- */
  window.calcMarkup = function () {
    const cost = parseFloat(document.getElementById('markup-cost')?.value) || 0;
    const percent = parseFloat(document.getElementById('markup-percent')?.value) || 0;
    const labor = parseFloat(document.getElementById('markup-labor')?.value) || 0;
    const markupAmount = cost * (percent / 100);
    const price = cost + markupAmount + labor;
    const profit = price - cost - labor;
    const priceEl = document.getElementById('markup-price');
    const profitEl = document.getElementById('markup-profit');
    if (priceEl) priceEl.textContent = `$${price.toFixed(2)}`;
    if (profitEl) profitEl.textContent = `Profit: $${profit.toFixed(2)}`;
  };

  /* ---- Barcode Lookup ---- */
  window.barcodeLookup = function (value) {
    const result = document.getElementById('barcode-result');
    if (!result) return;
    if (!value.trim()) { result.innerHTML = ''; return; }
    const item = db.inventory.find(i => i.sku.toLowerCase().includes(value.toLowerCase()) || i.name.toLowerCase().includes(value.toLowerCase()));
    if (item) {
      result.innerHTML = `<div class="barcode-result-item"><div class="name">${item.name}</div><div class="details">SKU: ${item.sku} · Stock: ${item.qty} · Cost: $${item.cost.toFixed(2)} · Retail: $${item.retail.toFixed(2)} · Location: ${item.location}</div></div>`;
    } else {
      result.innerHTML = '<p style="color:var(--text-muted);font-size:var(--text-sm);">No matching part found.</p>';
    }
  };

  /* ---- Portal Search ---- */
  window.portalSearch = function (value) {
    if (!value.trim()) return;
    const q = value.toLowerCase();
    const ticketMatch = db.tickets.find(t => t.id.toLowerCase().includes(q) || t.customer.toLowerCase().includes(q));
    if (ticketMatch) { viewTicket(ticketMatch.id); return; }
    const customerMatch = db.customers.find(c => c.name.toLowerCase().includes(q));
    if (customerMatch) { showPortalSection('portal-customers', document.querySelector('.portal-nav button:nth-child(4)')); return; }
    const partMatch = db.inventory.find(i => i.sku.toLowerCase().includes(q) || i.name.toLowerCase().includes(q));
    if (partMatch) { showPortalSection('portal-inventory', document.querySelector('.portal-nav button:nth-child(5)')); return; }
  };

  /* ---- Confirm Delete ---- */
  document.getElementById('confirmDeleteBtn')?.addEventListener('click', () => {
    if (!pendingDelete) return;
    const { type, id } = pendingDelete;
    if (type === 'ticket') { db.tickets = db.tickets.filter(t => t.id !== id); renderTickets(); renderKanban(); }
    else if (type === 'customer') { db.customers = db.customers.filter(c => c.id !== id); renderCustomers(); }
    else if (type === 'part') { db.inventory = db.inventory.filter(p => p.sku !== id); renderInventory(); }
    else if (type === 'order') { db.orders = db.orders.filter(o => o.id !== id); renderOrders(); }
    else if (type === 'employee') { db.employees = db.employees.filter(e => e.id !== id); renderEmployees(); }
    saveDb();
    pendingDelete = null;
    closeModal('confirmModal');
  });

  /* ---- Data Management ---- */
  window.exportData = function () {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `atr-portal-data-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  window.importData = function (event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        db = JSON.parse(e.target.result);
        saveDb();
        alert('Data imported successfully.');
        renderDashboard();
      } catch (err) { alert('Invalid JSON file.'); }
    };
    reader.readAsText(file);
  };

  window.reseedData = function () {
    db = seedData();
    saveDb();
    alert('Demo data restored.');
    renderDashboard();
  };

  window.clearAllData = function () {
    db = { tickets: [], customers: [], inventory: [], orders: [], transactions: [], employees: [], timesheet: [], clockStatus: { clockedIn: false, clockInTime: null } };
    saveDb();
    alert('All data cleared.');
    renderDashboard();
  };

  /* ---- Init Portal ---- */
  function initPortal() {
    importRepairRequests();
    renderDashboard();
  }

  /* ---- Import Repair Requests from localStorage ---- */
  function importRepairRequests() {
    let requests = [];
    try {
      requests = JSON.parse(localStorage.getItem('atr_repair_requests') || '[]');
    } catch (e) { requests = []; }
    if (!requests.length) return;

    let newCount = 0;
    requests.forEach(function (req) {
      const exists = db.tickets.find(function (t) { return t.id === req.ticketId; });
      if (exists) return;

      const ticket = {
        id: req.ticketId,
        customer: req.customer.name,
        phone: req.customer.phone,
        email: req.customer.email,
        deviceType: req.device.type || 'Unknown',
        brand: req.device.brand || 'Unknown',
        device: req.device.model || (req.device.brand + ' ' + req.device.type),
        issue: req.device.issue || 'General repair',
        status: 'Pending',
        priority: 'Normal',
        assigned: 'Unassigned',
        due: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        partsCost: 0,
        laborCost: 0,
        price: 0,
        notes: (req.additionalDetails || '') +
               (req.estimate ? (req.additionalDetails ? ' | ' : '') + 'Estimate: ' + req.estimate : '') +
               (req.customer.preferredTime && req.customer.preferredTime !== 'anytime' ? ' | Preferred contact: ' + req.customer.preferredTime : '') +
               (req.customer.location ? ' | Location: ' + req.customer.location : '') +
               ' | Source: ' + (req.source || 'Website')
      };
      db.tickets.unshift(ticket);

      const custExists = db.customers.find(function (c) { return c.email === req.customer.email; });
      if (!custExists && req.customer.email) {
        db.customers.unshift({
          id: 'C' + (200 + db.customers.length + 1),
          name: req.customer.name,
          phone: req.customer.phone,
          email: req.customer.email,
          address: req.customer.location || 'Unknown',
          repairs: 1,
          totalSpent: 0,
          member: false
        });
      }

      newCount++;
    });

    localStorage.setItem('atr_repair_requests', JSON.stringify([]));
    saveDb();

    if (newCount > 0) {
      showPortalToast(newCount + ' new repair request' + (newCount > 1 ? 's' : '') + ' imported from the website', 'success');
    }
  }

  /* ---- Portal Toast Notification ---- */
  function showPortalToast(message, type) {
    const existing = document.getElementById('portal-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'portal-toast';
    toast.style.cssText = 'position:fixed;top:20px;right:20px;background:var(--surface);border:1px solid var(--border);border-left:4px solid var(--primary);border-radius:var(--radius-lg);padding:var(--space-4) var(--space-5);box-shadow:var(--shadow-xl);z-index:2000;display:flex;align-items:center;gap:var(--space-3);max-width:360px;animation:chatIn 300ms ease;';
    const icon = type === 'success' ? 'fa-circle-check' : 'fa-circle-info';
    const color = type === 'success' ? 'var(--success)' : 'var(--primary)';
    toast.innerHTML = `<i class="fas ${icon}" style="color:${color};font-size:1.25rem;"></i><span style="font-size:var(--text-sm);color:var(--text);">${message}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 300ms ease';
      setTimeout(() => { toast.remove(); }, 300);
    }, 5000);
  }

  /* ---- Utility Functions ---- */
  function getCSSVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#0057ff';
  }

  function hexToRgba(hex, alpha) {
    if (hex.startsWith('rgb')) return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function statusBadgeClass(status) {
    const map = {
      'Pending': 'orange', 'Diagnosed': 'blue', 'Parts Ordered': 'purple',
      'In Progress': 'blue', 'Ready': 'green', 'Completed': 'gray', 'Cancelled': 'red'
    };
    return map[status] || 'gray';
  }

  function priorityBadgeClass(priority) {
    const map = { 'Urgent': 'red', 'High': 'orange', 'Normal': 'blue', 'Low': 'gray' };
    return map[priority] || 'gray';
  }

  function orderStatusBadge(status) {
    const map = { 'Pending': 'orange', 'Shipped': 'blue', 'Received': 'green', 'Cancelled': 'red' };
    return map[status] || 'gray';
  }

  /* ---- Enter key on login ---- */
  document.getElementById('passcode')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') login();
  });

  /* ---- Listen for new repair requests in real-time ---- */
  window.addEventListener('atr:new-repair-request', function () {
    const portalView = document.getElementById('portalView');
    if (portalView && !portalView.classList.contains('hidden')) {
      importRepairRequests();
      const activeSection = document.querySelector('.portal-section.active');
      if (activeSection) {
        if (activeSection.id === 'portal-tickets') renderTickets();
        if (activeSection.id === 'portal-dashboard') renderDashboard();
        if (activeSection.id === 'portal-queue') renderKanban();
        if (activeSection.id === 'portal-customers') renderCustomers();
      }
    }
  });

  /* ---- Also listen for storage events (cross-tab) ---- */
  window.addEventListener('storage', function (e) {
    if (e.key === 'atr_repair_requests' && e.newValue && e.newValue !== '[]') {
      const portalView = document.getElementById('portalView');
      if (portalView && !portalView.classList.contains('hidden')) {
        importRepairRequests();
        const activeSection = document.querySelector('.portal-section.active');
        if (activeSection) {
          if (activeSection.id === 'portal-tickets') renderTickets();
          if (activeSection.id === 'portal-dashboard') renderDashboard();
          if (activeSection.id === 'portal-queue') renderKanban();
          if (activeSection.id === 'portal-customers') renderCustomers();
        }
      }
    }
  });

})();
