/* ============================================================
   PORTAL.JS — Full Employee Portal Application
   Austin's Tech Repair Group LLC
   Features: CRUD for tickets, customers, inventory, orders,
   employees, transactions. Time clock. Financial dashboards.
   Charts. Reports. localStorage data persistence.
   ============================================================ */

// ============= DATA LAYER =============
const DB_KEY = 'atr_portal_data';

function loadData() {
  const raw = localStorage.getItem(DB_KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch(e) { return seedData(); }
  }
  return seedData();
}

function saveData() {
  localStorage.setItem(DB_KEY, JSON.stringify(DB));
}

let DB = loadData();

// ============= SEED DATA =============
function seedData() {
  const today = new Date();
  const fmt = (d) => d.toISOString().split('T')[0];
  const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return fmt(d); };
  const daysAhead = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return fmt(d); };

  return {
    tickets: [
      { id:'T1042', customer:'Sarah Mitchell', phone:'513-555-0100', email:'sarah.m@email.com', deviceType:'Phone', brand:'Apple', device:'iPhone 13 Pro', issue:'Screen Replacement', status:'In Progress', priority:'High', assignedTo:'Demo User', dueDate:daysAhead(2), createdDate:daysAgo(2), completedDate:null, partsCost:45, laborCost:60, retailPrice:165, notes:'Customer wants OEM quality screen.' },
      { id:'T1043', customer:'David Kim', phone:'513-555-0101', email:'dkim@email.com', deviceType:'Laptop', brand:'Dell', device:'XPS 15', issue:'Battery Replacement', status:'Parts Ordered', priority:'Normal', assignedTo:'Demo User', dueDate:daysAhead(3), createdDate:daysAgo(1), completedDate:null, partsCost:55, laborCost:80, retailPrice:180, notes:'Battery swollen, needs urgent replacement.' },
      { id:'T1044', customer:'Jessica Lopez', phone:'513-555-0102', email:'jlopez@email.com', deviceType:'Tablet', brand:'Apple', device:'iPad Air 5th Gen', issue:'Charge Port Repair', status:'Ready', priority:'Normal', assignedTo:'Demo User', dueDate:daysAhead(0), createdDate:daysAgo(3), completedDate:null, partsCost:25, laborCost:55, retailPrice:120, notes:'Ready for pickup. Customer notified via SMS.' },
      { id:'T1045', customer:'Michael Brown', phone:'513-555-0103', email:'mbrown@email.com', deviceType:'Console', brand:'Sony', device:'PS5', issue:'HDMI Port Repair', status:'In Progress', priority:'Urgent', assignedTo:'Demo User', dueDate:daysAhead(1), createdDate:daysAgo(1), completedDate:null, partsCost:15, laborCost:100, retailPrice:175, notes:'No video output. HDMI port damaged.' },
      { id:'T1046', customer:'Emily Davis', phone:'513-555-0104', email:'edavis@email.com', deviceType:'Phone', brand:'Samsung', device:'Galaxy S23 Ultra', issue:'Camera Lens Replacement', status:'Diagnosed', priority:'Low', assignedTo:'Demo User', dueDate:daysAhead(5), createdDate:daysAgo(1), completedDate:null, partsCost:30, laborCost:45, retailPrice:99, notes:'Rear camera lens cracked.' },
      { id:'T1047', customer:'Robert Wilson', phone:'513-555-0105', email:'rwilson@email.com', deviceType:'Laptop', brand:'HP', device:'Pavilion x360', issue:'Screen + Hinge', status:'Pending', priority:'Normal', assignedTo:'Unassigned', dueDate:daysAhead(4), createdDate:daysAgo(0), completedDate:null, partsCost:65, laborCost:90, retailPrice:200, notes:'Screen flickering and hinge broken.' },
      { id:'T1048', customer:'Ashley Garcia', phone:'513-555-0106', email:'agarcia@email.com', deviceType:'Smartwatch', brand:'Apple', device:'Apple Watch Series 9', issue:'Screen Replacement', status:'Completed', priority:'Normal', assignedTo:'Demo User', dueDate:daysAgo(1), createdDate:daysAgo(4), completedDate:daysAgo(1), partsCost:35, laborCost:50, retailPrice:129, notes:'Completed successfully. Customer picked up.' },
      { id:'T1049', customer:'James Taylor', phone:'513-555-0107', email:'jtaylor@email.com', deviceType:'Phone', brand:'Google', device:'Pixel 8 Pro', issue:'Battery Replacement', status:'Completed', priority:'Normal', assignedTo:'Demo User', dueDate:daysAgo(2), createdDate:daysAgo(5), completedDate:daysAgo(2), partsCost:40, laborCost:50, retailPrice:130, notes:'Battery health at 72%. Replaced.' },
      { id:'T1050', customer:'Sarah Mitchell', phone:'513-555-0100', email:'sarah.m@email.com', deviceType:'Phone', brand:'Apple', device:'iPhone 12', issue:'Back Glass Replacement', status:'Completed', priority:'Low', assignedTo:'Demo User', dueDate:daysAgo(5), createdDate:daysAgo(8), completedDate:daysAgo(5), partsCost:20, laborCost:60, retailPrice:110, notes:'Back glass shattered. Replaced with OEM.' },
    ],
    customers: [
      { id:'C001', name:'Sarah Mitchell', phone:'513-555-0100', email:'sarah.m@email.com', address:'Dayton, OH', member:true, totalSpent:440, ticketCount:2 },
      { id:'C002', name:'David Kim', phone:'513-555-0101', email:'dkim@email.com', address:'Kettering, OH', member:false, totalSpent:180, ticketCount:1 },
      { id:'C003', name:'Jessica Lopez', phone:'513-555-0102', email:'jlopez@email.com', address:'Xenia, OH', member:true, totalSpent:120, ticketCount:1 },
      { id:'C004', name:'Michael Brown', phone:'513-555-0103', email:'mbrown@email.com', address:'Beavercreek, OH', member:false, totalSpent:175, ticketCount:1 },
      { id:'C005', name:'Emily Davis', phone:'513-555-0104', email:'edavis@email.com', address:'Centerville, OH', member:false, totalSpent:99, ticketCount:1 },
      { id:'C006', name:'Robert Wilson', phone:'513-555-0105', email:'rwilson@email.com', address:'Dayton, OH', member:false, totalSpent:200, ticketCount:1 },
      { id:'C007', name:'Ashley Garcia', phone:'513-555-0106', email:'agarcia@email.com', address:'Huber Heights, OH', member:true, totalSpent:129, ticketCount:1 },
      { id:'C008', name:'James Taylor', phone:'513-555-0107', email:'jtaylor@email.com', address:'Xenia, OH', member:false, totalSpent:130, ticketCount:1 },
    ],
    inventory: [
      { id:'P001', name:'iPhone 13 Pro OLED Screen', sku:'IP13P-OLED', category:'Screens', quantity:5, reorderLevel:3, cost:45, retail:99, supplier:'MobileSentrix', location:'Shelf A-1' },
      { id:'P002', name:'iPhone 12 Back Glass', sku:'IP12-BG', category:'Screens', quantity:8, reorderLevel:3, cost:20, retail:60, supplier:'Amazon', location:'Shelf A-2' },
      { id:'P003', name:'Samsung S23 Ultra Camera Lens', sku:'SAM-S23U-CL', category:'Cameras', quantity:2, reorderLevel:3, cost:30, retail:75, supplier:'eBay', location:'Shelf B-1' },
      { id:'P004', name:'Dell XPS 15 Battery', sku:'DELL-XPS15-BAT', category:'Batteries', quantity:1, reorderLevel:2, cost:55, retail:120, supplier:'MobileSentrix', location:'Shelf C-1' },
      { id:'P005', name:'PS5 HDMI Port', sku:'PS5-HDMI', category:'Ports', quantity:4, reorderLevel:2, cost:15, retail:50, supplier:'eBay', location:'Shelf D-1' },
      { id:'P006', name:'iPad Air Charge Port', sku:'IPAIR-CP', category:'Ports', quantity:0, reorderLevel:3, cost:25, retail:65, supplier:'MobileSentrix', location:'Shelf D-2' },
      { id:'P007', name:'Pixel 8 Pro Battery', sku:'PIX-8P-BAT', category:'Batteries', quantity:3, reorderLevel:2, cost:40, retail:90, supplier:'Amazon', location:'Shelf C-2' },
      { id:'P008', name:'Apple Watch S9 Screen', sku:'AWS9-SCR', category:'Screens', quantity:2, reorderLevel:2, cost:35, retail:85, supplier:'MobileSentrix', location:'Shelf A-3' },
      { id:'P009', name:'Precision Screwdriver Set', sku:'TOOL-SD01', category:'Tools', quantity:6, reorderLevel:2, cost:15, retail:35, supplier:'Amazon', location:'Drawer E-1' },
      { id:'P010', name:'Heat Gun Pro', sku:'TOOL-HG01', category:'Tools', quantity:2, reorderLevel:1, cost:45, retail:89, supplier:'Amazon', location:'Drawer E-2' },
    ],
    orders: [
      { id:'O001', platform:'Amazon', orderNumber:'AMZ-88234', items:'3x iPhone 13 OLED Screens', totalCost:135, status:'Shipped', orderDate:daysAgo(2), expectedDate:daysAhead(1), tracking:'1Z999AA10123456789', notes:'Expedited shipping' },
      { id:'O002', platform:'MobileSentrix', orderNumber:'MS-44120', items:'5x Dell XPS Batteries, 10x Charge Ports', totalCost:350, status:'Pending', orderDate:daysAgo(1), expectedDate:daysAhead(4), tracking:'', notes:'Waiting for confirmation' },
      { id:'O003', platform:'eBay', orderNumber:'EBY-77881', items:'2x PS5 HDMI Ports', totalCost:30, status:'Received', orderDate:daysAgo(5), expectedDate:daysAgo(3), tracking:'9400111899223456789', notes:'All received, stocked' },
      { id:'O004', platform:'Shopify', orderNumber:'SHO-10234', items:'12x ATR T-Shirts (various sizes)', totalCost:180, status:'Shipped', orderDate:daysAgo(3), expectedDate:daysAhead(0), tracking:'1Z999AA10987654321', notes:'Company shirts restock' },
      { id:'O005', platform:'Amazon', orderNumber:'AMZ-88235', items:'2x Heat Gun Pro, 5x Screwdriver Sets', totalCost:165, status:'Pending', orderDate:daysAgo(0), expectedDate:daysAhead(3), tracking:'', notes:'Tools restock' },
      { id:'O006', platform:'Distro', orderNumber:'DIS-30012', items:'Parts distribution batch', totalCost:500, status:'Shipped', orderDate:daysAgo(4), expectedDate:daysAhead(2), tracking:'1Z999AA14567891234', notes:'Monthly distribution order' },
    ],
    transactions: [
      { id:'TX001', ticketId:'T1048', type:'Repair', amount:129, cost:35, profit:94, method:'Square', date:daysAgo(1) },
      { id:'TX002', ticketId:'T1049', type:'Repair', amount:130, cost:40, profit:90, method:'Card', date:daysAgo(2) },
      { id:'TX003', ticketId:'T1050', type:'Repair', amount:110, cost:20, profit:90, method:'Cash', date:daysAgo(5) },
      { id:'TX004', ticketId:null, type:'Product', amount:45, cost:15, profit:30, method:'Square', date:daysAgo(1) },
      { id:'TX005', ticketId:null, type:'Subscription', amount:25, cost:0, profit:25, method:'Card', date:daysAgo(3) },
      { id:'TX006', ticketId:null, type:'Product', amount:89, cost:45, profit:44, method:'Shopify', date:daysAgo(2) },
      { id:'TX007', ticketId:null, type:'B2B', amount:450, cost:200, profit:250, method:'Card', date:daysAgo(4) },
      { id:'TX008', ticketId:null, type:'Repair', amount:120, cost:25, profit:95, method:'Square', date:daysAgo(6) },
      { id:'TX009', ticketId:null, type:'Product', amount:35, cost:15, profit:20, method:'Cash', date:daysAgo(7) },
      { id:'TX010', ticketId:null, type:'Subscription', amount:25, cost:0, profit:25, method:'Card', date:daysAgo(7) },
    ],
    employees: [
      { id:'E001', name:'Austin Caudill', role:'Owner', email:'austin@atrgroup.com', phone:'513-478-8077', status:'Active', repairsAssigned:4 },
      { id:'E002', name:'Demo User', role:'Senior Technician', email:'demo@atrgroup.com', phone:'513-555-0199', status:'Active', repairsAssigned:5 },
      { id:'E003', name:'Maria Santos', role:'Technician', email:'maria@atrgroup.com', phone:'513-555-0188', status:'Active', repairsAssigned:0 },
      { id:'E004', name:'Tyler Johnson', role:'Front Desk', email:'tyler@atrgroup.com', phone:'513-555-0177', status:'Active', repairsAssigned:0 },
    ],
    timeClock: [
      { id:'TC001', employee:'Demo User', clockIn:daysAgo(0)+'T08:00:00', clockOut:null, date:daysAgo(0) },
      { id:'TC002', employee:'Demo User', clockIn:daysAgo(1)+'T08:05:00', clockOut:daysAgo(1)+'T17:02:00', date:daysAgo(1) },
      { id:'TC003', employee:'Demo User', clockIn:daysAgo(2)+'T07:58:00', clockOut:daysAgo(2)+'T17:00:00', date:daysAgo(2) },
      { id:'TC004', employee:'Demo User', clockIn:daysAgo(3)+'T08:02:00', clockOut:daysAgo(3)+'T16:55:00', date:daysAgo(3) },
      { id:'TC005', employee:'Demo User', clockIn:daysAgo(4)+'T08:00:00', clockOut:daysAgo(4)+'T17:10:00', date:daysAgo(4) },
    ],
    activity: [
      { icon:'green', text:'Ticket T1048 completed — Ashley Garcia', time:'1 day ago' },
      { icon:'blue', text:'New ticket T1047 created — Robert Wilson', time:'2 hours ago' },
      { icon:'orange', text:'Parts ordered for T1043 — Dell XPS 15 battery', time:'5 hours ago' },
      { icon:'green', text:'Ticket T1049 completed — James Taylor', time:'2 days ago' },
      { icon:'purple', text:'New order placed: Amazon AMZ-88235', time:'3 hours ago' },
      { icon:'blue', text:'Ticket T1044 marked Ready — Jessica Lopez', time:'4 hours ago' },
    ],
    ticketCounter: 1051,
    customerCounter: 9,
    partCounter: 11,
    orderCounter: 7,
    txnCounter: 11,
    employeeCounter: 5,
    activityCounter: 7,
  };
}

function reseedData() {
  DB = seedData();
  saveData();
  renderAll();
}

function clearAllData() {
  DB = { tickets:[], customers:[], inventory:[], orders:[], transactions:[], employees:[], timeClock:[], activity:[], ticketCounter:1000, customerCounter:0, partCounter:0, orderCounter:0, txnCounter:0, employeeCounter:0, activityCounter:0 };
  saveData();
  renderAll();
}

// ============= UTILITIES =============
function fmt$(n) { return '$' + (n || 0).toFixed(2); }
function nextId(prefix, counter) { return prefix + DB[counter]++; }
function statusBadge(status) {
  const map = { 'Pending':'gray', 'Diagnosed':'blue', 'Parts Ordered':'orange', 'In Progress':'blue', 'Ready':'green', 'Completed':'green', 'Cancelled':'red', 'Shipped':'blue', 'Received':'green', 'Active':'green', 'Inactive':'gray' };
  return `<span class="badge ${map[status] || 'gray'}">${status}</span>`;
}
function priorityBadge(priority) {
  const map = { 'Urgent':'red', 'High':'orange', 'Normal':'blue', 'Low':'gray' };
  return `<span class="badge ${map[priority] || 'gray'}">${priority}</span>`;
}
function stockDot(qty, reorder) {
  if (qty === 0) return `<span class="stock-dot out"></span> Out`;
  if (qty <= reorder) return `<span class="stock-dot low"></span> ${qty} (Low)`;
  if (qty <= reorder * 2) return `<span class="stock-dot medium"></span> ${qty}`;
  return `<span class="stock-dot high"></span> ${qty}`;
}

// ============= SECTION NAVIGATION =============
function showPortalSection(id, btn) {
  document.querySelectorAll('.portal-section').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.portal-nav button').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  // Render section-specific content
  if (id === 'portal-dashboard') renderDashboard();
  if (id === 'portal-tickets') renderTickets();
  if (id === 'portal-queue') renderKanban();
  if (id === 'portal-customers') renderCustomers();
  if (id === 'portal-inventory') renderInventory();
  if (id === 'portal-orders') renderOrders();
  if (id === 'portal-financials') renderFinancials();
  if (id === 'portal-timeclock') renderTimeClock();
  if (id === 'portal-employees') renderEmployees();
  if (id === 'portal-reports') renderReports();
  if (id === 'portal-hud') renderHUD();
}

// ============= MODAL HELPERS =============
function openModal(id) { const d = document.getElementById(id); if (d && d.showModal) d.showModal(); }
function closeModal(id) { const d = document.getElementById(id); if (d && d.close) d.close(); }

// ============= DASHBOARD =============
let revenueChart, statusChart, profitChart, paymentChart, revenueTypeChart, deviceTypeChart, issueTypeChart, topCustomersChart;

function renderDashboard() {
  const openTickets = DB.tickets.filter(t => !['Completed','Cancelled'].includes(t.status));
  const urgent = DB.tickets.filter(t => t.priority === 'Urgent' && !['Completed','Cancelled'].includes(t.status));
  const lowStock = DB.inventory.filter(p => p.quantity <= p.reorderLevel);
  const todayTxns = DB.transactions.filter(t => t.date === new Date().toISOString().split('T')[0]);
  const todayRevenue = todayTxns.reduce((s,t) => s + t.amount, 0);
  const todayProfit = todayTxns.reduce((s,t) => s + t.profit, 0);
  const weekRevenue = DB.transactions.reduce((s,t) => s + t.amount, 0);
  const weekProfit = DB.transactions.reduce((s,t) => s + t.profit, 0);

  document.getElementById('dashboard-stats').innerHTML = `
    <div class="stat-card">
      <div class="stat-icon blue"><i class="fas fa-ticket"></i></div>
      <div class="stat-value">${openTickets.length}</div>
      <div class="stat-label">Open Repairs</div>
      <div class="stat-trend up"><i class="fas fa-arrow-up"></i> ${urgent.length} urgent</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon green"><i class="fas fa-dollar-sign"></i></div>
      <div class="stat-value">${fmt$(weekRevenue)}</div>
      <div class="stat-label">Total Revenue</div>
      <div class="stat-trend up"><i class="fas fa-arrow-up"></i> ${fmt$(weekProfit)} profit</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon orange"><i class="fas fa-box"></i></div>
      <div class="stat-value">${lowStock.length}</div>
      <div class="stat-label">Low Stock Items</div>
      <div class="stat-trend down"><i class="fas fa-arrow-down"></i> Needs reorder</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon purple"><i class="fas fa-users"></i></div>
      <div class="stat-value">${DB.customers.length}</div>
      <div class="stat-label">Total Customers</div>
      <div class="stat-trend up"><i class="fas fa-arrow-up"></i> ${DB.customers.filter(c=>c.member).length} members</div>
    </div>
  `;

  // Activity feed
  document.getElementById('activity-feed').innerHTML = DB.activity.slice(0, 6).map(a => `
    <div class="activity-item">
      <div class="activity-icon ${a.icon}"><i class="fas fa-bolt"></i></div>
      <div class="activity-content"><strong>${a.text}</strong><span>${a.time}</span></div>
    </div>
  `).join('');

  // Revenue chart
  const ctx1 = document.getElementById('revenueChart');
  if (ctx1) {
    if (revenueChart) revenueChart.destroy();
    const labels = []; const revData = []; const profData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      labels.push(d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' }));
      const dayTxns = DB.transactions.filter(t => t.date === ds);
      revData.push(dayTxns.reduce((s,t) => s + t.amount, 0));
      profData.push(dayTxns.reduce((s,t) => s + t.profit, 0));
    }
    revenueChart = new Chart(ctx1, {
      type: 'bar',
      data: { labels, datasets: [
        { label:'Revenue', data:revData, backgroundColor:'#0057ff', borderRadius:6 },
        { label:'Profit', data:profData, backgroundColor:'#22c55e', borderRadius:6 },
      ]},
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ labels:{ color:'#888', font:{ size:11 } } } }, scales:{ y:{ ticks:{ color:'#888' }, grid:{ color:'rgba(128,128,128,.1)' } }, x:{ ticks:{ color:'#888' }, grid:{ display:false } } } }
    });
  }

  // Status chart
  const ctx2 = document.getElementById('statusChart');
  if (ctx2) {
    if (statusChart) statusChart.destroy();
    const statuses = ['Pending','Diagnosed','Parts Ordered','In Progress','Ready','Completed'];
    const counts = statuses.map(s => DB.tickets.filter(t => t.status === s).length);
    const colors = ['#9ca3af','#3b82f6','#f59e0b','#3b82f6','#22c55e','#22c55e'];
    statusChart = new Chart(ctx2, {
      type: 'doughnut',
      data: { labels: statuses, datasets: [{ data: counts, backgroundColor: colors }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ color:'#888', font:{ size:10 }, boxWidth:12 } } } }
    });
  }
}

// ============= REPAIR TICKETS =============
function renderTickets() {
  const statusFilter = document.getElementById('ticket-filter-status')?.value || '';
  const priorityFilter = document.getElementById('ticket-filter-priority')?.value || '';
  const search = (document.getElementById('ticket-search')?.value || '').toLowerCase();

  let tickets = DB.tickets.filter(t => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (priorityFilter && t.priority !== priorityFilter) return false;
    if (search && !(`${t.id} ${t.customer} ${t.device} ${t.issue}`.toLowerCase().includes(search))) return false;
    return true;
  });

  document.getElementById('tickets-tbody').innerHTML = tickets.length ? tickets.map(t => `
    <tr>
      <td><strong style="font-family:var(--font-mono);color:var(--primary)">${t.id}</strong></td>
      <td>${t.customer}</td>
      <td>${t.brand} ${t.device}</td>
      <td>${t.issue}</td>
      <td>${statusBadge(t.status)}</td>
      <td>${priorityBadge(t.priority)}</td>
      <td>${t.assignedTo}</td>
      <td>${t.dueDate || '-'}</td>
      <td>
        <button class="pbtn pbtn-light pbtn-sm pbtn-icon" onclick="viewTicket('${t.id}')" title="View"><i class="fas fa-eye"></i></button>
        <button class="pbtn pbtn-light pbtn-sm pbtn-icon" onclick="editTicket('${t.id}')" title="Edit"><i class="fas fa-edit"></i></button>
        <button class="pbtn pbtn-danger pbtn-sm pbtn-icon" onclick="deleteTicket('${t.id}')" title="Delete"><i class="fas fa-trash"></i></button>
      </td>
    </tr>
  `).join('') : `<tr><td colspan="9" style="text-align:center;padding:var(--space-5);color:var(--text-muted)">No tickets found</td></tr>`;
}

function openTicketModal() {
  document.getElementById('ticketModalTitle').textContent = 'New Repair Ticket';
  document.getElementById('ticket-edit-id').value = '';
  ['ticket-customer','ticket-phone','ticket-email','ticket-brand','ticket-device','ticket-issue','ticket-notes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('ticket-device-type').value = 'Phone';
  document.getElementById('ticket-priority').value = 'Normal';
  document.getElementById('ticket-parts-cost').value = '0';
  document.getElementById('ticket-labor-cost').value = '0';
  document.getElementById('ticket-price').value = '0';
  document.getElementById('ticket-assigned').value = 'Demo User';
  // Populate employee dropdown
  const sel = document.getElementById('ticket-assigned');
  sel.innerHTML = '<option value="Unassigned">Unassigned</option>' + DB.employees.map(e => `<option value="${e.name}">${e.name} (${e.role})</option>`).join('');
  sel.value = 'Demo User';
  openModal('ticketModal');
}

function editTicket(id) {
  const t = DB.tickets.find(x => x.id === id);
  if (!t) return;
  document.getElementById('ticketModalTitle').textContent = 'Edit Ticket ' + t.id;
  document.getElementById('ticket-edit-id').value = t.id;
  document.getElementById('ticket-customer').value = t.customer;
  document.getElementById('ticket-phone').value = t.phone;
  document.getElementById('ticket-email').value = t.email || '';
  document.getElementById('ticket-device-type').value = t.deviceType || 'Phone';
  document.getElementById('ticket-brand').value = t.brand;
  document.getElementById('ticket-device').value = t.device;
  document.getElementById('ticket-issue').value = t.issue;
  document.getElementById('ticket-priority').value = t.priority;
  document.getElementById('ticket-parts-cost').value = t.partsCost;
  document.getElementById('ticket-labor-cost').value = t.laborCost;
  document.getElementById('ticket-price').value = t.retailPrice;
  document.getElementById('ticket-notes').value = t.notes || '';
  const sel = document.getElementById('ticket-assigned');
  sel.innerHTML = '<option value="Unassigned">Unassigned</option>' + DB.employees.map(e => `<option value="${e.name}">${e.name} (${e.role})</option>`).join('');
  sel.value = t.assignedTo;
  openModal('ticketModal');
}

function saveTicket() {
  const editId = document.getElementById('ticket-edit-id').value;
  const customer = document.getElementById('ticket-customer').value.trim();
  if (!customer) { alert('Customer name is required'); return; }
  const data = {
    customer,
    phone: document.getElementById('ticket-phone').value.trim(),
    email: document.getElementById('ticket-email').value.trim(),
    deviceType: document.getElementById('ticket-device-type').value,
    brand: document.getElementById('ticket-brand').value.trim(),
    device: document.getElementById('ticket-device').value.trim(),
    issue: document.getElementById('ticket-issue').value.trim(),
    priority: document.getElementById('ticket-priority').value,
    partsCost: parseFloat(document.getElementById('ticket-parts-cost').value) || 0,
    laborCost: parseFloat(document.getElementById('ticket-labor-cost').value) || 0,
    retailPrice: parseFloat(document.getElementById('ticket-price').value) || 0,
    assignedTo: document.getElementById('ticket-assigned').value,
    notes: document.getElementById('ticket-notes').value.trim(),
  };

  if (editId) {
    const t = DB.tickets.find(x => x.id === editId);
    Object.assign(t, data);
  } else {
    const newTicket = {
      id: nextId('T', 'ticketCounter'),
      ...data,
      status: 'Pending',
      dueDate: new Date(Date.now() + 3*86400000).toISOString().split('T')[0],
      createdDate: new Date().toISOString().split('T')[0],
      completedDate: null,
    };
    DB.tickets.unshift(newTicket);
    // Auto-create customer if not exists
    const existing = DB.customers.find(c => c.phone === data.phone || c.name === customer);
    if (!existing) {
      DB.customers.push({ id: nextId('C', 'customerCounter'), name: customer, phone: data.phone, email: data.email, address: '', member: false, totalSpent: 0, ticketCount: 0 });
    }
    addActivity('blue', `New ticket ${newTicket.id} created — ${customer}`);
  }
  saveData();
  closeModal('ticketModal');
  renderTickets();
  renderAll();
}

function viewTicket(id) {
  const t = DB.tickets.find(x => x.id === id);
  if (!t) return;
  const profit = (t.retailPrice || 0) - (t.partsCost || 0) - (t.laborCost || 0);
  document.getElementById('ticketDetailTitle').textContent = `${t.id} — ${t.customer}`;
  document.getElementById('ticketDetailBody').innerHTML = `
    <div class="ticket-detail-grid">
      <div>
        <div class="portal-form-grid">
          <div class="portal-form-row">
            <div class="portal-field"><label>Customer</label><input type="text" value="${t.customer}" readonly></div>
            <div class="portal-field"><label>Phone</label><input type="text" value="${t.phone}" readonly></div>
          </div>
          <div class="portal-form-row">
            <div class="portal-field"><label>Device</label><input type="text" value="${t.brand} ${t.device}" readonly></div>
            <div class="portal-field"><label>Issue</label><input type="text" value="${t.issue}" readonly></div>
          </div>
          <div class="portal-form-row">
            <div class="portal-field"><label>Parts Cost</label><input type="text" value="${fmt$(t.partsCost)}" readonly></div>
            <div class="portal-field"><label>Labor Cost</label><input type="text" value="${fmt$(t.laborCost)}" readonly></div>
          </div>
          <div class="portal-form-row">
            <div class="portal-field"><label>Retail Price</label><input type="text" value="${fmt$(t.retailPrice)}" readonly></div>
            <div class="portal-field"><label>Profit</label><input type="text" value="${fmt$(profit)}" readonly style="color:var(--success);font-weight:700"></div>
          </div>
          ${t.notes ? `<div class="portal-field"><label>Notes</label><textarea readonly rows="3">${t.notes}</textarea></div>` : ''}
        </div>
      </div>
      <div>
        <h4 style="margin-bottom:var(--space-3);font-size:var(--text-sm);font-weight:800">Status & Actions</h4>
        <div style="margin-bottom:var(--space-4)">${statusBadge(t.status)} ${priorityBadge(t.priority)}</div>
        <div style="margin-bottom:var(--space-4)">
          <label style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;color:var(--text-muted);display:block;margin-bottom:var(--space-2)">Update Status</label>
          <select id="detail-status" onchange="updateTicketStatus('${t.id}', this.value)" style="width:100%;padding:var(--space-3);border:1.5px solid var(--border);border-radius:var(--radius-md);background:var(--surface-2);color:var(--text);font-size:var(--text-sm)">
            <option value="Pending" ${t.status==='Pending'?'selected':''}>Pending</option>
            <option value="Diagnosed" ${t.status==='Diagnosed'?'selected':''}>Diagnosed</option>
            <option value="Parts Ordered" ${t.status==='Parts Ordered'?'selected':''}>Parts Ordered</option>
            <option value="In Progress" ${t.status==='In Progress'?'selected':''}>In Progress</option>
            <option value="Ready" ${t.status==='Ready'?'selected':''}>Ready</option>
            <option value="Completed" ${t.status==='Completed'?'selected':''}>Completed</option>
            <option value="Cancelled" ${t.status==='Cancelled'?'selected':''}>Cancelled</option>
          </select>
        </div>
        <div class="ticket-timeline">
          <div class="timeline-item"><div class="timeline-dot ${t.status==='Completed'?'completed':'pending'}"></div><div class="timeline-content"><strong>Ticket Created</strong><span>${t.createdDate}</span></div></div>
          ${t.completedDate ? `<div class="timeline-item"><div class="timeline-dot completed"></div><div class="timeline-content"><strong>Completed</strong><span>${t.completedDate}</span></div></div>` : ''}
        </div>
      </div>
    </div>
  `;
  document.getElementById('ticketDetailEdit').onclick = () => { closeModal('ticketDetailModal'); editTicket(id); };
  openModal('ticketDetailModal');
}

function updateTicketStatus(id, status) {
  const t = DB.tickets.find(x => x.id === id);
  if (!t) return;
  t.status = status;
  if (status === 'Completed') {
    t.completedDate = new Date().toISOString().split('T')[0];
    // Add transaction
    const profit = (t.retailPrice || 0) - (t.partsCost || 0) - (t.laborCost || 0);
    DB.transactions.push({ id: nextId('TX', 'txnCounter'), ticketId: t.id, type: 'Repair', amount: t.retailPrice, cost: (t.partsCost + t.laborCost), profit, method: 'Square', date: new Date().toISOString().split('T')[0] });
    addActivity('green', `Ticket ${id} completed — ${t.customer}`);
  }
  saveData();
  renderAll();
}

function deleteTicket(id) {
  showConfirm(`Delete ticket ${id}? This cannot be undone.`, () => {
    DB.tickets = DB.tickets.filter(t => t.id !== id);
    saveData();
    renderAll();
  });
}

// ============= KANBAN =============
function renderKanban() {
  const columns = ['Pending','Diagnosed','Parts Ordered','In Progress','Ready','Completed'];
  document.getElementById('kanban-board').innerHTML = columns.map(col => {
    const items = DB.tickets.filter(t => t.status === col);
    return `
      <div class="kanban-column">
        <div class="kanban-column-header">
          <h4>${col}</h4>
          <span class="count">${items.length}</span>
        </div>
        ${items.map(t => `
          <div class="kanban-card" onclick="viewTicket('${t.id}')">
            <div class="kc-ticket">${t.id}</div>
            <div class="kc-customer">${t.customer}</div>
            <div class="kc-device">${t.brand} ${t.device}</div>
            <div class="kc-footer">
              ${priorityBadge(t.priority)}
              <span style="font-size:var(--text-xs);color:var(--text-muted)">${fmt$(t.retailPrice)}</span>
            </div>
            <div style="display:flex;gap:4px;margin-top:var(--space-2)">
              ${col !== 'Pending' ? `<button class="pbtn pbtn-light pbtn-sm" style="flex:1;font-size:10px" onclick="event.stopPropagation();moveTicket('${t.id}',-1)"><i class="fas fa-arrow-left"></i></button>` : ''}
              ${col !== 'Completed' ? `<button class="pbtn pbtn-light pbtn-sm" style="flex:1;font-size:10px" onclick="event.stopPropagation();moveTicket('${t.id}',1)"><i class="fas fa-arrow-right"></i></button>` : ''}
            </div>
          </div>
        `).join('') || '<div style="text-align:center;color:var(--text-faint);font-size:var(--text-xs);padding:var(--space-3)">No tickets</div>'}
      </div>
    `;
  }).join('');
}

function moveTicket(id, dir) {
  const columns = ['Pending','Diagnosed','Parts Ordered','In Progress','Ready','Completed'];
  const t = DB.tickets.find(x => x.id === id);
  if (!t) return;
  const idx = columns.indexOf(t.status);
  const newIdx = idx + dir;
  if (newIdx >= 0 && newIdx < columns.length) {
    t.status = columns[newIdx];
    if (t.status === 'Completed' && !t.completedDate) {
      t.completedDate = new Date().toISOString().split('T')[0];
      const profit = (t.retailPrice || 0) - (t.partsCost || 0) - (t.laborCost || 0);
      DB.transactions.push({ id: nextId('TX', 'txnCounter'), ticketId: t.id, type: 'Repair', amount: t.retailPrice, cost: (t.partsCost + t.laborCost), profit, method: 'Square', date: new Date().toISOString().split('T')[0] });
      addActivity('green', `Ticket ${id} completed — ${t.customer}`);
    }
    saveData();
    renderKanban();
  }
}

// ============= CUSTOMERS =============
function renderCustomers() {
  const search = (document.getElementById('customer-search')?.value || '').toLowerCase();
  let customers = DB.customers.filter(c => !search || `${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(search));
  // Update customer stats from tickets
  DB.customers.forEach(c => {
    const tix = DB.tickets.filter(t => t.customer === c.name || t.phone === c.phone);
    c.ticketCount = tix.length;
    c.totalSpent = tix.filter(t => t.status === 'Completed').reduce((s,t) => s + (t.retailPrice||0), 0);
  });

  document.getElementById('customers-tbody').innerHTML = customers.length ? customers.map(c => `
    <tr>
      <td><strong style="font-family:var(--font-mono)">${c.id}</strong></td>
      <td>${c.name}</td>
      <td>${c.phone}</td>
      <td>${c.email || '-'}</td>
      <td>${c.ticketCount}</td>
      <td>${fmt$(c.totalSpent)}</td>
      <td>${c.member ? '<span class="badge purple">ATR One</span>' : '<span class="badge gray">Standard</span>'}</td>
      <td>
        <button class="pbtn pbtn-light pbtn-sm pbtn-icon" onclick="editCustomer('${c.id}')" title="Edit"><i class="fas fa-edit"></i></button>
        <button class="pbtn pbtn-danger pbtn-sm pbtn-icon" onclick="deleteCustomer('${c.id}')" title="Delete"><i class="fas fa-trash"></i></button>
      </td>
    </tr>
  `).join('') : `<tr><td colspan="8" style="text-align:center;padding:var(--space-5);color:var(--text-muted)">No customers found</td></tr>`;
}

function openCustomerModal() {
  document.getElementById('customerModalTitle').textContent = 'Add Customer';
  document.getElementById('customer-edit-id').value = '';
  ['customer-name','customer-phone','customer-email','customer-address'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('customer-member').value = 'false';
  openModal('customerModal');
}

function editCustomer(id) {
  const c = DB.customers.find(x => x.id === id);
  if (!c) return;
  document.getElementById('customerModalTitle').textContent = 'Edit Customer';
  document.getElementById('customer-edit-id').value = c.id;
  document.getElementById('customer-name').value = c.name;
  document.getElementById('customer-phone').value = c.phone;
  document.getElementById('customer-email').value = c.email || '';
  document.getElementById('customer-address').value = c.address || '';
  document.getElementById('customer-member').value = c.member ? 'true' : 'false';
  openModal('customerModal');
}

function saveCustomer() {
  const editId = document.getElementById('customer-edit-id').value;
  const name = document.getElementById('customer-name').value.trim();
  if (!name) { alert('Customer name is required'); return; }
  const data = {
    name,
    phone: document.getElementById('customer-phone').value.trim(),
    email: document.getElementById('customer-email').value.trim(),
    address: document.getElementById('customer-address').value.trim(),
    member: document.getElementById('customer-member').value === 'true',
  };
  if (editId) {
    Object.assign(DB.customers.find(c => c.id === editId), data);
  } else {
    DB.customers.push({ id: nextId('C','customerCounter'), ...data, totalSpent:0, ticketCount:0 });
    addActivity('purple', `New customer added — ${name}`);
  }
  saveData();
  closeModal('customerModal');
  renderCustomers();
}

function deleteCustomer(id) {
  showConfirm(`Delete customer ${id}?`, () => {
    DB.customers = DB.customers.filter(c => c.id !== id);
    saveData(); renderCustomers();
  });
}

// ============= INVENTORY =============
function renderInventory() {
  const filter = document.getElementById('inventory-filter')?.value || '';
  const search = (document.getElementById('inventory-search')?.value || '').toLowerCase();
  let parts = DB.inventory.filter(p => {
    if (filter && p.category !== filter) return false;
    if (search && !`${p.name} ${p.sku} ${p.supplier}`.toLowerCase().includes(search)) return false;
    return true;
  });

  document.getElementById('inventory-tbody').innerHTML = parts.length ? parts.map(p => `
    <tr>
      <td><strong style="font-family:var(--font-mono)">${p.sku}</strong></td>
      <td>${p.name}</td>
      <td>${p.category}</td>
      <td><span class="stock-indicator">${stockDot(p.quantity, p.reorderLevel)}</span></td>
      <td>${fmt$(p.cost)}</td>
      <td>${fmt$(p.retail)}</td>
      <td>${p.supplier}</td>
      <td>${p.location}</td>
      <td>
        <button class="pbtn pbtn-light pbtn-sm pbtn-icon" onclick="editPart('${p.id}')" title="Edit"><i class="fas fa-edit"></i></button>
        <button class="pbtn pbtn-light pbtn-sm pbtn-icon" onclick="adjustStock('${p.id}', 1)" title="+1 Stock"><i class="fas fa-plus"></i></button>
        <button class="pbtn pbtn-danger pbtn-sm pbtn-icon" onclick="deletePart('${p.id}')" title="Delete"><i class="fas fa-trash"></i></button>
      </td>
    </tr>
  `).join('') : `<tr><td colspan="9" style="text-align:center;padding:var(--space-5);color:var(--text-muted)">No parts found</td></tr>`;
}

function openPartModal() {
  document.getElementById('partModalTitle').textContent = 'Add Part';
  document.getElementById('part-edit-id').value = '';
  ['part-name','part-sku','part-supplier','part-location'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('part-category').value = 'Screens';
  document.getElementById('part-qty').value = '1';
  document.getElementById('part-cost').value = '0';
  document.getElementById('part-retail').value = '0';
  document.getElementById('part-reorder').value = '3';
  openModal('partModal');
}

function editPart(id) {
  const p = DB.inventory.find(x => x.id === id);
  if (!p) return;
  document.getElementById('partModalTitle').textContent = 'Edit Part';
  document.getElementById('part-edit-id').value = p.id;
  document.getElementById('part-name').value = p.name;
  document.getElementById('part-sku').value = p.sku;
  document.getElementById('part-category').value = p.category;
  document.getElementById('part-qty').value = p.quantity;
  document.getElementById('part-cost').value = p.cost;
  document.getElementById('part-retail').value = p.retail;
  document.getElementById('part-supplier').value = p.supplier;
  document.getElementById('part-location').value = p.location;
  document.getElementById('part-reorder').value = p.reorderLevel;
  openModal('partModal');
}

function savePart() {
  const editId = document.getElementById('part-edit-id').value;
  const name = document.getElementById('part-name').value.trim();
  const sku = document.getElementById('part-sku').value.trim();
  if (!name || !sku) { alert('Part name and SKU are required'); return; }
  const data = {
    name, sku,
    category: document.getElementById('part-category').value,
    quantity: parseInt(document.getElementById('part-qty').value) || 0,
    cost: parseFloat(document.getElementById('part-cost').value) || 0,
    retail: parseFloat(document.getElementById('part-retail').value) || 0,
    supplier: document.getElementById('part-supplier').value.trim(),
    location: document.getElementById('part-location').value.trim(),
    reorderLevel: parseInt(document.getElementById('part-reorder').value) || 0,
  };
  if (editId) {
    Object.assign(DB.inventory.find(p => p.id === editId), data);
  } else {
    DB.inventory.push({ id: nextId('P','partCounter'), ...data });
  }
  saveData();
  closeModal('partModal');
  renderInventory();
}

function adjustStock(id, delta) {
  const p = DB.inventory.find(x => x.id === id);
  if (p) { p.quantity = Math.max(0, p.quantity + delta); saveData(); renderInventory(); }
}

function deletePart(id) {
  showConfirm('Delete this part?', () => { DB.inventory = DB.inventory.filter(p => p.id !== id); saveData(); renderInventory(); });
}

// ============= ORDERS =============
let currentOrderTab = 'all';
function switchOrderTab(btn, tab) {
  currentOrderTab = tab;
  document.querySelectorAll('#portal-orders .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderOrders();
}

function renderOrders() {
  let orders = DB.orders;
  if (currentOrderTab !== 'all') orders = orders.filter(o => o.platform === currentOrderTab);
  document.getElementById('orders-tbody').innerHTML = orders.length ? orders.map(o => `
    <tr>
      <td><strong style="font-family:var(--font-mono)">${o.orderNumber}</strong></td>
      <td>${o.platform}</td>
      <td style="max-width:250px">${o.items}</td>
      <td>${fmt$(o.totalCost)}</td>
      <td>${statusBadge(o.status)}</td>
      <td>${o.orderDate}</td>
      <td>${o.expectedDate || '-'}</td>
      <td>${o.tracking ? `<span style="font-family:var(--font-mono);font-size:var(--text-xs)">${o.tracking.substring(0,15)}...</span>` : '-'}</td>
      <td>
        <button class="pbtn pbtn-light pbtn-sm pbtn-icon" onclick="editOrder('${o.id}')" title="Edit"><i class="fas fa-edit"></i></button>
        <button class="pbtn pbtn-danger pbtn-sm pbtn-icon" onclick="deleteOrder('${o.id}')" title="Delete"><i class="fas fa-trash"></i></button>
      </td>
    </tr>
  `).join('') : `<tr><td colspan="9" style="text-align:center;padding:var(--space-5);color:var(--text-muted)">No orders found</td></tr>`;
  // Update nav badge
  const pendingCount = DB.orders.filter(o => o.status === 'Pending' || o.status === 'Shipped').length;
  const badge = document.getElementById('nav-order-count');
  if (badge) badge.textContent = pendingCount;
}

function openOrderModal() {
  document.getElementById('orderModalTitle').textContent = 'New Order';
  document.getElementById('order-edit-id').value = '';
  ['order-number','order-items','order-tracking','order-notes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('order-platform').value = 'Amazon';
  document.getElementById('order-cost').value = '0';
  document.getElementById('order-status').value = 'Pending';
  document.getElementById('order-expected').value = new Date(Date.now() + 3*86400000).toISOString().split('T')[0];
  openModal('orderModal');
}

function editOrder(id) {
  const o = DB.orders.find(x => x.id === id);
  if (!o) return;
  document.getElementById('orderModalTitle').textContent = 'Edit Order';
  document.getElementById('order-edit-id').value = o.id;
  document.getElementById('order-platform').value = o.platform;
  document.getElementById('order-number').value = o.orderNumber;
  document.getElementById('order-items').value = o.items;
  document.getElementById('order-cost').value = o.totalCost;
  document.getElementById('order-status').value = o.status;
  document.getElementById('order-expected').value = o.expectedDate || '';
  document.getElementById('order-tracking').value = o.tracking || '';
  document.getElementById('order-notes').value = o.notes || '';
  openModal('orderModal');
}

function saveOrder() {
  const editId = document.getElementById('order-edit-id').value;
  const orderNumber = document.getElementById('order-number').value.trim();
  if (!orderNumber) { alert('Order number is required'); return; }
  const data = {
    platform: document.getElementById('order-platform').value,
    orderNumber,
    items: document.getElementById('order-items').value.trim(),
    totalCost: parseFloat(document.getElementById('order-cost').value) || 0,
    status: document.getElementById('order-status').value,
    expectedDate: document.getElementById('order-expected').value,
    tracking: document.getElementById('order-tracking').value.trim(),
    notes: document.getElementById('order-notes').value.trim(),
    orderDate: new Date().toISOString().split('T')[0],
  };
  if (editId) {
    const o = DB.orders.find(x => x.id === editId);
    Object.assign(o, data, { orderDate: o.orderDate });
  } else {
    DB.orders.unshift({ id: nextId('O','orderCounter'), ...data });
    addActivity('purple', `New order placed: ${data.platform} ${orderNumber}`);
  }
  saveData();
  closeModal('orderModal');
  renderOrders();
}

function deleteOrder(id) {
  showConfirm('Delete this order?', () => { DB.orders = DB.orders.filter(o => o.id !== id); saveData(); renderOrders(); });
}

// ============= FINANCIALS =============
function renderFinancials() {
  const totalRevenue = DB.transactions.reduce((s,t) => s + t.amount, 0);
  const totalProfit = DB.transactions.reduce((s,t) => s + t.profit, 0);
  const totalCost = DB.transactions.reduce((s,t) => s + t.cost, 0);
  const margin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0;

  document.getElementById('financial-stats').innerHTML = `
    <div class="stat-card">
      <div class="stat-icon green"><i class="fas fa-dollar-sign"></i></div>
      <div class="stat-value">${fmt$(totalRevenue)}</div>
      <div class="stat-label">Total Revenue</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon blue"><i class="fas fa-chart-line"></i></div>
      <div class="stat-value">${fmt$(totalProfit)}</div>
      <div class="stat-label">Total Profit</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon orange"><i class="fas fa-receipt"></i></div>
      <div class="stat-value">${fmt$(totalCost)}</div>
      <div class="stat-label">Total Costs</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon purple"><i class="fas fa-percentage"></i></div>
      <div class="stat-value">${margin}%</div>
      <div class="stat-label">Profit Margin</div>
    </div>
  `;

  // Recent transactions
  document.getElementById('transactions-tbody').innerHTML = DB.transactions.slice(-10).reverse().map(t => `
    <tr>
      <td><strong style="font-family:var(--font-mono)">${t.id}</strong></td>
      <td><span class="badge ${t.type==='Repair'?'blue':t.type==='Product'?'purple':t.type==='Subscription'?'orange':'green'}">${t.type}</span></td>
      <td>${fmt$(t.amount)}</td>
      <td style="color:var(--success);font-weight:700">${fmt$(t.profit)}</td>
      <td>${t.method}</td>
      <td>${t.date}</td>
    </tr>
  `).join('');

  // Profit chart
  const ctx1 = document.getElementById('profitChart');
  if (ctx1) {
    if (profitChart) profitChart.destroy();
    const labels = []; const revData = []; const profData = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      labels.push(d.toLocaleDateString('en-US', { month:'short', day:'numeric' }));
      const dayTxns = DB.transactions.filter(t => t.date === ds);
      revData.push(dayTxns.reduce((s,t) => s + t.amount, 0));
      profData.push(dayTxns.reduce((s,t) => s + t.profit, 0));
    }
    profitChart = new Chart(ctx1, {
      type: 'line',
      data: { labels, datasets: [
        { label:'Revenue', data:revData, borderColor:'#0057ff', backgroundColor:'rgba(0,87,255,.1)', fill:true, tension:.3 },
        { label:'Profit', data:profData, borderColor:'#22c55e', backgroundColor:'rgba(34,197,94,.1)', fill:true, tension:.3 },
      ]},
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ labels:{ color:'#888', font:{ size:11 } } } }, scales:{ y:{ ticks:{ color:'#888' }, grid:{ color:'rgba(128,128,128,.1)' } }, x:{ ticks:{ color:'#888', maxTicksLimit:8 }, grid:{ display:false } } } }
    });
  }

  // Payment methods chart
  const ctx2 = document.getElementById('paymentChart');
  if (ctx2) {
    if (paymentChart) paymentChart.destroy();
    const methods = {};
    DB.transactions.forEach(t => { methods[t.method] = (methods[t.method] || 0) + t.amount; });
    paymentChart = new Chart(ctx2, {
      type: 'doughnut',
      data: { labels: Object.keys(methods), datasets: [{ data: Object.values(methods), backgroundColor:['#0057ff','#22c55e','#f59e0b','#8b5cf6','#ef4444'] }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ color:'#888', font:{ size:10 }, boxWidth:12 } } } }
    });
  }

  // Revenue by type chart
  const ctx3 = document.getElementById('revenueTypeChart');
  if (ctx3) {
    if (revenueTypeChart) revenueTypeChart.destroy();
    const types = {};
    DB.transactions.forEach(t => { types[t.type] = (types[t.type] || 0) + t.amount; });
    revenueTypeChart = new Chart(ctx3, {
      type: 'bar',
      data: { labels: Object.keys(types), datasets: [{ data: Object.values(types), backgroundColor:['#0057ff','#22c55e','#f59e0b','#8b5cf6'], borderRadius:6 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ ticks:{ color:'#888' }, grid:{ color:'rgba(128,128,128,.1)' } }, x:{ ticks:{ color:'#888' }, grid:{ display:false } } } }
    });
  }
}

function openTransactionModal() {
  ['txn-amount','txn-cost','txn-ticket'].forEach(id => document.getElementById(id).value = '0');
  document.getElementById('txn-type').value = 'Repair';
  document.getElementById('txn-method').value = 'Square';
  document.getElementById('txn-amount').value = '0';
  document.getElementById('txn-cost').value = '0';
  document.getElementById('txn-ticket').value = '';
  openModal('transactionModal');
}

function saveTransaction() {
  const amount = parseFloat(document.getElementById('txn-amount').value) || 0;
  const cost = parseFloat(document.getElementById('txn-cost').value) || 0;
  if (amount <= 0) { alert('Amount must be greater than 0'); return; }
  const txn = {
    id: nextId('TX','txnCounter'),
    ticketId: document.getElementById('txn-ticket').value.trim() || null,
    type: document.getElementById('txn-type').value,
    amount,
    cost,
    profit: amount - cost,
    method: document.getElementById('txn-method').value,
    date: new Date().toISOString().split('T')[0],
  };
  DB.transactions.push(txn);
  addActivity('green', `New transaction ${txn.id} — ${fmt$(amount)}`);
  saveData();
  closeModal('transactionModal');
  renderFinancials();
}

// ============= TIME CLOCK =============
function renderTimeClock() {
  const activeShift = DB.timeClock.find(tc => tc.clockOut === null);
  const display = document.getElementById('clock-status-display');

  if (activeShift) {
    const clockIn = new Date(activeShift.clockIn);
    const hours = ((Date.now() - clockIn.getTime()) / 3600000).toFixed(2);
    display.innerHTML = `
      <div style="font-size:3rem;color:var(--success);margin-bottom:var(--space-2)"><i class="fas fa-circle-check"></i></div>
      <div style="font-size:var(--text-lg);font-weight:800;margin-bottom:var(--space-1)">Clocked In</div>
      <div style="color:var(--text-muted);font-size:var(--text-sm);margin-bottom:var(--space-4)">Since ${clockIn.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})} · ${hours} hrs</div>
      <button class="pbtn pbtn-danger" onclick="clockOut()"><i class="fas fa-clock"></i> Clock Out</button>
    `;
  } else {
    display.innerHTML = `
      <div style="font-size:3rem;color:var(--text-faint);margin-bottom:var(--space-2)"><i class="fas fa-clock"></i></div>
      <div style="font-size:var(--text-lg);font-weight:800;margin-bottom:var(--space-1)">Not Clocked In</div>
      <div style="color:var(--text-muted);font-size:var(--text-sm);margin-bottom:var(--space-4)">Click below to start your shift</div>
      <button class="pbtn pbtn-success" onclick="clockIn()"><i class="fas fa-play"></i> Clock In</button>
    `;
  }

  // Timesheet
  document.getElementById('timesheet-tbody').innerHTML = DB.timeClock.slice(-7).reverse().map(tc => {
    const ci = new Date(tc.clockIn);
    const co = tc.clockOut ? new Date(tc.clockOut) : null;
    const hours = co ? ((co - ci) / 3600000).toFixed(2) : '—';
    return `
      <tr>
        <td>${tc.date}</td>
        <td>${ci.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}</td>
        <td>${co ? co.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}) : '<span class="badge green">Active</span>'}</td>
        <td>${hours}${co ? 'h' : ''}</td>
        <td>${tc.clockOut ? '<span class="badge gray">Completed</span>' : '<span class="badge green">Active</span>'}</td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="5" style="text-align:center;padding:var(--space-5);color:var(--text-muted)">No time entries</td></tr>`;
}

function clockIn() {
  const now = new Date();
  DB.timeClock.push({ id: 'TC' + Date.now(), employee: 'Demo User', clockIn: now.toISOString(), clockOut: null, date: now.toISOString().split('T')[0] });
  saveData();
  const badge = document.getElementById('shift-status');
  if (badge) { badge.className = 'pill success'; badge.innerHTML = '<i class="fas fa-circle" style="font-size:6px"></i> Clocked In'; }
  renderTimeClock();
}

function clockOut() {
  const active = DB.timeClock.find(tc => tc.clockOut === null);
  if (active) { active.clockOut = new Date().toISOString(); saveData(); }
  const badge = document.getElementById('shift-status');
  if (badge) { badge.className = 'pill warning'; badge.innerHTML = '<i class="fas fa-circle" style="font-size:6px"></i> Off Clock'; }
  renderTimeClock();
}

// ============= EMPLOYEES =============
function renderEmployees() {
  document.getElementById('employees-tbody').innerHTML = DB.employees.length ? DB.employees.map(e => {
    const assigned = DB.tickets.filter(t => t.assignedTo === e.name && !['Completed','Cancelled'].includes(t.status)).length;
    return `
      <tr>
        <td><strong>${e.name}</strong></td>
        <td>${e.role}</td>
        <td>${e.email || '-'}</td>
        <td>${e.phone || '-'}</td>
        <td>${assigned}</td>
        <td>${statusBadge(e.status)}</td>
        <td>
          <button class="pbtn pbtn-light pbtn-sm pbtn-icon" onclick="editEmployee('${e.id}')" title="Edit"><i class="fas fa-edit"></i></button>
          <button class="pbtn pbtn-danger pbtn-sm pbtn-icon" onclick="deleteEmployee('${e.id}')" title="Delete"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `;
  }).join('') : `<tr><td colspan="7" style="text-align:center;padding:var(--space-5);color:var(--text-muted)">No employees</td></tr>`;
}

function openEmployeeModal() {
  document.getElementById('employeeModalTitle').textContent = 'Add Employee';
  document.getElementById('employee-edit-id').value = '';
  ['employee-name','employee-email','employee-phone'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('employee-role').value = 'Technician';
  document.getElementById('employee-status').value = 'Active';
  openModal('employeeModal');
}

function editEmployee(id) {
  const e = DB.employees.find(x => x.id === id);
  if (!e) return;
  document.getElementById('employeeModalTitle').textContent = 'Edit Employee';
  document.getElementById('employee-edit-id').value = e.id;
  document.getElementById('employee-name').value = e.name;
  document.getElementById('employee-role').value = e.role;
  document.getElementById('employee-email').value = e.email || '';
  document.getElementById('employee-phone').value = e.phone || '';
  document.getElementById('employee-status').value = e.status;
  openModal('employeeModal');
}

function saveEmployee() {
  const editId = document.getElementById('employee-edit-id').value;
  const name = document.getElementById('employee-name').value.trim();
  if (!name) { alert('Employee name is required'); return; }
  const data = {
    name,
    role: document.getElementById('employee-role').value,
    email: document.getElementById('employee-email').value.trim(),
    phone: document.getElementById('employee-phone').value.trim(),
    status: document.getElementById('employee-status').value,
  };
  if (editId) {
    Object.assign(DB.employees.find(e => e.id === editId), data);
  } else {
    DB.employees.push({ id: nextId('E','employeeCounter'), ...data, repairsAssigned: 0 });
  }
  saveData();
  closeModal('employeeModal');
  renderEmployees();
}

function deleteEmployee(id) {
  showConfirm('Delete this employee?', () => { DB.employees = DB.employees.filter(e => e.id !== id); saveData(); renderEmployees(); });
}

// ============= REPORTS =============
function renderReports() {
  // Device type chart
  const ctx1 = document.getElementById('deviceTypeChart');
  if (ctx1) {
    if (deviceTypeChart) deviceTypeChart.destroy();
    const types = {};
    DB.tickets.forEach(t => { types[t.deviceType] = (types[t.deviceType] || 0) + 1; });
    deviceTypeChart = new Chart(ctx1, { type:'doughnut', data:{ labels:Object.keys(types), datasets:[{ data:Object.values(types), backgroundColor:['#0057ff','#22c55e','#f59e0b','#8b5cf6','#ef4444','#06b6d4'] }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ color:'#888', font:{size:10}, boxWidth:12 } } } } });
  }

  // Issue type chart
  const ctx2 = document.getElementById('issueTypeChart');
  if (ctx2) {
    if (issueTypeChart) issueTypeChart.destroy();
    const issues = {};
    DB.tickets.forEach(t => { const key = t.issue.split(' ')[0]; issues[key] = (issues[key] || 0) + 1; });
    issueTypeChart = new Chart(ctx2, { type:'bar', data:{ labels:Object.keys(issues), datasets:[{ data:Object.values(issues), backgroundColor:'#0057ff', borderRadius:6 }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ ticks:{ color:'#888', stepSize:1 }, grid:{ color:'rgba(128,128,128,.1)' } }, x:{ ticks:{ color:'#888' }, grid:{ display:false } } } } });
  }

  // Top customers
  const ctx3 = document.getElementById('topCustomersChart');
  if (ctx3) {
    if (topCustomersChart) topCustomersChart.destroy();
    const top = [...DB.customers].sort((a,b) => b.totalSpent - a.totalSpent).slice(0, 5);
    topCustomersChart = new Chart(ctx3, { type:'bar', data:{ labels:top.map(c=>c.name), datasets:[{ data:top.map(c=>c.totalSpent), backgroundColor:'#22c55e', borderRadius:6 }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ ticks:{ color:'#888' }, grid:{ color:'rgba(128,128,128,.1)' } }, x:{ ticks:{ color:'#888' }, grid:{ display:false } } } } });
  }

  // KPIs
  const completed = DB.tickets.filter(t => t.status === 'Completed').length;
  const total = DB.tickets.length;
  const rate = total > 0 ? ((completed / total) * 100).toFixed(0) : 0;
  const avgValue = completed > 0 ? (DB.tickets.filter(t => t.status === 'Completed').reduce((s,t) => s + (t.retailPrice||0), 0) / completed) : 0;

  document.getElementById('completion-rate').innerHTML = `<div style="font-size:var(--text-2xl);font-weight:800;color:var(--success)">${rate}%</div><div style="font-size:var(--text-xs);color:var(--text-muted)">${completed} of ${total} tickets</div>`;
  document.getElementById('avg-ticket').innerHTML = `<div style="font-size:var(--text-2xl);font-weight:800;color:var(--primary)">${fmt$(avgValue)}</div><div style="font-size:var(--text-xs);color:var(--text-muted)">per completed repair</div>`;

  // Avg repair time (days between created and completed)
  const completedTickets = DB.tickets.filter(t => t.completedDate);
  let avgDays = 0;
  if (completedTickets.length > 0) {
    const totalDays = completedTickets.reduce((s, t) => {
      const created = new Date(t.createdDate);
      const completed = new Date(t.completedDate);
      return s + Math.max(1, Math.round((completed - created) / 86400000));
    }, 0);
    avgDays = (totalDays / completedTickets.length).toFixed(1);
  }
  document.getElementById('avg-repair-time').innerHTML = `<div style="font-size:var(--text-2xl);font-weight:800;color:var(--warning)">${avgDays} days</div><div style="font-size:var(--text-xs);color:var(--text-muted)">average turnaround</div>`;
}

// ============= HUD =============
function renderHUD() {
  const active = DB.tickets.filter(t => !['Completed','Cancelled'].includes(t.status));
  document.getElementById('hud-tickets-tbody').innerHTML = active.length ? active.map(t => {
    const profit = (t.retailPrice || 0) - (t.partsCost || 0) - (t.laborCost || 0);
    return `
      <tr>
        <td><strong style="font-family:var(--font-mono);color:var(--primary)">${t.id}</strong></td>
        <td>${t.customer}</td>
        <td>${t.brand} ${t.device}</td>
        <td>${t.issue}</td>
        <td>${statusBadge(t.status)}</td>
        <td>${fmt$(t.retailPrice)}</td>
        <td style="color:var(--success);font-weight:700">${fmt$(profit)}</td>
        <td><button class="pbtn pbtn-light pbtn-sm pbtn-icon" onclick="viewTicket('${t.id}')"><i class="fas fa-eye"></i></button></td>
      </tr>
    `;
  }).join('') : `<tr><td colspan="8" style="text-align:center;padding:var(--space-5);color:var(--text-muted)">No active tickets</td></tr>`;
  calcMarkup();
}

function calcMarkup() {
  const cost = parseFloat(document.getElementById('markup-cost')?.value) || 0;
  const markup = parseFloat(document.getElementById('markup-percent')?.value) || 0;
  const labor = parseFloat(document.getElementById('markup-labor')?.value) || 0;
  const price = cost * (1 + markup / 100) + labor;
  const profit = price - cost - labor;
  const priceEl = document.getElementById('markup-price');
  const profitEl = document.getElementById('markup-profit');
  if (priceEl) priceEl.textContent = fmt$(price);
  if (profitEl) profitEl.textContent = `Profit: ${fmt$(profit)}`;
}

function barcodeLookup(sku) {
  const result = document.getElementById('barcode-result');
  if (!sku.trim()) { result.innerHTML = ''; return; }
  const part = DB.inventory.find(p => p.sku.toLowerCase().includes(sku.toLowerCase()) || p.name.toLowerCase().includes(sku.toLowerCase()));
  if (part) {
    result.innerHTML = `
      <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-md);padding:var(--space-4)">
        <div style="font-weight:800;font-size:var(--text-sm);margin-bottom:var(--space-2)">${part.name}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);font-size:var(--text-xs)">
          <div><span style="color:var(--text-muted)">SKU:</span> <strong>${part.sku}</strong></div>
          <div><span style="color:var(--text-muted)">Stock:</span> <strong>${part.quantity}</strong></div>
          <div><span style="color:var(--text-muted)">Cost:</span> <strong>${fmt$(part.cost)}</strong></div>
          <div><span style="color:var(--text-muted)">Retail:</span> <strong>${fmt$(part.retail)}</strong></div>
          <div><span style="color:var(--text-muted)">Supplier:</span> <strong>${part.supplier}</strong></div>
          <div><span style="color:var(--text-muted)">Location:</span> <strong>${part.location}</strong></div>
        </div>
      </div>
    `;
  } else {
    result.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:var(--space-4)">No part found for "${sku}"</div>`;
  }
}

// ============= ACTIVITY =============
function addActivity(icon, text) {
  DB.activity.unshift({ icon, text, time: 'Just now' });
  if (DB.activity.length > 50) DB.activity.pop();
}

// ============= SEARCH =============
function portalSearch(query) {
  if (!query.trim()) return;
  // Search across tickets, customers, inventory
  const q = query.toLowerCase();
  const ticketMatch = DB.tickets.find(t => t.id.toLowerCase().includes(q) || t.customer.toLowerCase().includes(q) || t.device.toLowerCase().includes(q));
  if (ticketMatch) { showPortalSection('portal-tickets', document.querySelector('.portal-nav button:nth-child(2)')); document.getElementById('ticket-search').value = query; renderTickets(); return; }
  const customerMatch = DB.customers.find(c => c.name.toLowerCase().includes(q) || c.phone.includes(q));
  if (customerMatch) { showPortalSection('portal-customers', document.querySelector('.portal-nav button:nth-child(4)')); document.getElementById('customer-search').value = query; renderCustomers(); return; }
  const partMatch = DB.inventory.find(p => p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
  if (partMatch) { showPortalSection('portal-inventory', document.querySelector('.portal-nav button:nth-child(5)')); document.getElementById('inventory-search').value = query; renderInventory(); return; }
}

// ============= DATA EXPORT/IMPORT =============
function exportData() {
  const blob = new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `atr-portal-data-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      DB = JSON.parse(e.target.result);
      saveData();
      renderAll();
      alert('Data imported successfully');
    } catch(err) { alert('Invalid JSON file'); }
  };
  reader.readAsText(file);
}

// ============= CONFIRM DELETE =============
let confirmCallback = null;
function showConfirm(message, callback) {
  document.getElementById('confirmMessage').textContent = message;
  confirmCallback = callback;
  const btn = document.getElementById('confirmDeleteBtn');
  btn.onclick = () => { if (confirmCallback) confirmCallback(); closeModal('confirmModal'); };
  openModal('confirmModal');
}

// ============= RENDER ALL =============
function renderAll() {
  renderDashboard();
  renderTickets();
  renderKanban();
  renderCustomers();
  renderInventory();
  renderOrders();
  renderFinancials();
  renderTimeClock();
  renderEmployees();
  renderReports();
  renderHUD();
}

// ============= INIT =============
// Populate employee dropdown on load
function populateEmployeeDropdown() {
  const sel = document.getElementById('ticket-assigned');
  if (sel) {
    sel.innerHTML = '<option value="Unassigned">Unassigned</option>' + DB.employees.map(e => `<option value="${e.name}">${e.name} (${e.role})</option>`).join('');
  }
}

// Hide JotForm agent widget when inside portal
function hideJotFormWidget() {
  document.body.classList.add('portal-active');
}

// Initialize when portal loads
document.addEventListener('DOMContentLoaded', () => {
  populateEmployeeDropdown();
  // The renderAll will be triggered when user logs in
});

// Override the existing login function to trigger portal render
const originalLogin = window.login;
window.login = function() {
  // Call the original login from script.js if it exists
  if (originalLogin) {
    originalLogin();
    // Check if login was successful (portal is visible)
    setTimeout(() => {
      const portalView = document.getElementById('portalView');
      if (portalView && !portalView.classList.contains('hidden')) {
        hideJotFormWidget();
        renderAll();
      }
    }, 100);
  }
};

// Override logout to remove portal-active class
const originalLogout = window.logout;
window.logout = function() {
  document.body.classList.remove('portal-active');
  if (originalLogout) originalLogout();
};
