/* =====================================================================
 * ATRG Employee Portal — staff-only interface over the Supabase database
 * =====================================================================
 * "RepairShopr, but on steroids": tickets, job applications, investor
 * inquiries, customer feedback, customers, inventory and purchase
 * orders — read from (and, where allowed, written to) Austin's own
 * Supabase project (atr-customer-accounts).
 *
 * Access model (two layers):
 *  1. UX layer (this file): after Supabase Auth sign-in, the user's id
 *     must exist in public.employee_profiles. If it doesn't, we sign
 *     them straight back out and show "employee access only".
 *  2. Server layer (the real lock): Row Level Security in the database
 *     only lets employee_profiles members read this data, and only
 *     lets customers read their OWN rows. Even if someone hid this
 *     page's checks, the database would still refuse them.
 *
 * Style: ES5, matching the rest of the site's JavaScript.
 * All database/user text is escaped before it reaches the page (XSS).
 * ===================================================================== */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://lyujxpuicarblpkdzuuc.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5dWp4cHVpY2FyYmxwa2R6dXVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNjAxMjQsImV4cCI6MjEwNzczNjEyNH0.io4qD7pw878Xx97yoS6xzclO33aa4QYKENpwIyZ06xg';
  var SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  var RESUME_BUCKET = 'resumes';
  var SIGNED_URL_SECONDS = 3600;

  /* Ticket statuses: EXACT values from the tickets.status check
   * constraint (supabase-phase2-tickets.sql). Do not add values here
   * without updating the database constraint first. */
  var TICKET_STATUSES = ['Waiting', 'In Progress', 'Waiting for Parts', 'Quality Check', 'Ready for Pickup', 'Completed'];
  var APPLICATION_STATUSES = ['New', 'Reviewed', 'Contacted', 'Rejected'];
  var INVESTOR_STATUSES = ['New', 'Reviewed', 'Contacted', 'Closed'];

  /* ---------------- Supabase client bootstrap ----------------
   * Same lazy-load pattern as atr-forms.js: portal.html already loads
   * supabase-js v2 from the jsDelivr CDN, so window.supabase normally
   * exists; load it lazily if it somehow does not. */
  var sb = null;
  var sbWaiters = [];

  function createClient() {
    if (sb) return sb;
    if (window.supabase && window.supabase.createClient) {
      try { sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); }
      catch (e) { sb = null; }
    }
    return sb;
  }

  function withClient(fn) {
    var client = createClient();
    if (client) { fn(client); return; }
    sbWaiters.push(fn);
    if (!withClient.loading) {
      withClient.loading = true;
      var s = document.createElement('script');
      s.src = SUPABASE_CDN;
      s.async = true;
      s.onload = function () {
        createClient();
        var waiters = sbWaiters.slice();
        sbWaiters.length = 0;
        waiters.forEach(function (w) { w(sb); });
      };
      s.onerror = function () {
        var waiters = sbWaiters.slice();
        sbWaiters.length = 0;
        waiters.forEach(function (w) { w(null); });
      };
      document.head.appendChild(s);
    }
  }

  /* ---------------- small helpers ---------------- */
  function $(id) { return document.getElementById(id); }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function trim(v) { return String(v == null ? '' : v).trim(); }

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  }

  function fmtMoney(v) {
    if (v == null || v === '' || isNaN(Number(v))) return '—';
    return '$' + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtBool(v) {
    if (v === true) return '<span class="portal-check"><i class="fas fa-circle-check"></i> Yes</span>';
    if (v === false) return '<span class="portal-check no"><i class="fas fa-circle-xmark"></i> No</span>';
    return '—';
  }

  function valOrDash(v) {
    var t = trim(v);
    return t === '' ? '—' : esc(t);
  }

  /* Status text -> badge modifier class (portal.css defines colors). */
  function badgeClass(status) {
    var s = String(status || '').toLowerCase().replace(/[^a-z]/g, '');
    var map = {
      waiting: 'portal-st-waiting', new: 'portal-st-new',
      inprogress: 'portal-st-inprogress', processing: 'portal-st-inprogress',
      waitingforparts: 'portal-st-waitingparts',
      readyforpickup: 'portal-st-ready', shippedready: 'portal-st-ready',
      completed: 'portal-st-done', received: 'portal-st-done',
      reviewed: 'portal-st-reviewed', ordered: 'portal-st-reviewed',
      contacted: 'portal-st-contacted',
      cancelled: 'portal-st-cancelled', rejected: 'portal-st-rejected', closed: 'portal-st-closed',
      draft: 'portal-st-draft'
    };
    return map[s] || '';
  }

  function badge(status) {
    return '<span class="portal-badge ' + badgeClass(status) + '">' + esc(status || '—') + '</span>';
  }

  function statusOptions(values, current) {
    return values.map(function (v) {
      return '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(v) + '</option>';
    }).join('');
  }

  function starsHtml(rating) {
    var n = parseInt(rating, 10);
    if (isNaN(n) || n < 0) n = 0;
    if (n > 5) n = 5;
    var out = '';
    for (var i = 1; i <= 5; i++) {
      out += i <= n ? '★' : '<span class="portal-star-off">★</span>';
    }
    return '<span class="portal-stars" aria-label="' + n + ' out of 5 stars">' + out + '</span>';
  }

  function listError(el, what) {
    el.innerHTML = '<p class="portal-error">Couldn&rsquo;t load ' + esc(what) +
      '. Check your connection and hit Refresh — if it keeps happening, the database may be down.</p>';
  }

  function emptyState(el, text) {
    el.innerHTML = '<div class="portal-empty">' + esc(text) + '</div>';
  }

  function showDashError(msg) {
    var box = $('portal-dash-error');
    if (!box) return;
    if (!msg) { box.hidden = true; box.textContent = ''; return; }
    box.textContent = msg;
    box.hidden = false;
  }

  /* ---------------- portal state ---------------- */
  var state = {
    user: null,
    profile: null,
    loaded: { tickets: false, applications: false, investors: false, feedback: false, customers: false, inventory: false },
    customersCache: [], inventoryCache: []
  };

  function setCount(id, n) {
    var el = $(id);
    if (!el) return;
    if (n > 0) { el.textContent = String(n); el.hidden = false; }
    else { el.hidden = true; el.textContent = ''; }
  }

  /* ================= AUTH ================= */
  function showLogin(errorMsg) {
    $('portal-dash-view').hidden = true;
    $('portal-login-view').hidden = false;
    var err = $('portal-login-error');
    if (errorMsg) { err.textContent = errorMsg; err.hidden = false; }
    else { err.hidden = true; err.textContent = ''; }
  }

  function showDashboard() {
    $('portal-login-view').hidden = true;
    $('portal-dash-view').hidden = false;
    $('portal-emp-name').textContent = state.profile.name || state.user.email || 'teammate';
    tickClock();
    if (!state.clockTimer) state.clockTimer = setInterval(tickClock, 30000);
    var roleEl = $('portal-emp-role');
    roleEl.textContent = state.profile.role || '';
    roleEl.style.display = state.profile.role ? '' : 'none';
    activateTab('tickets');
  }

  /* The employee gate: signed-in is NOT enough — the auth user's id
   * must have a row in employee_profiles. Anyone else (e.g. a customer
   * account) is signed back out immediately. */
  function verifyEmployee(client, user, done) {
    client.from('employee_profiles').select('id, name, role').eq('id', user.id).maybeSingle()
      .then(function (res) {
        if (res.error || !res.data) { done(null); return; }
        done(res.data);
      })
      .catch(function () { done(null); });
  }

  function enterIfEmployee(client, user) {
    verifyEmployee(client, user, function (profile) {
      if (!profile) {
        client.auth.signOut().then(function () {
          state.user = null; state.profile = null;
          showLogin('That account isn’t an employee account. This portal is employee access only — customers, please use the customer area on the main site instead.');
        });
        return;
      }
      state.user = user;
      state.profile = profile;
      showDashboard();
    });
  }

  function initAuth() {
    withClient(function (client) {
      if (!client) { showLogin('Couldn’t reach the sign-in service. Check your connection and reload the page.'); return; }

      client.auth.getSession().then(function (res) {
        var session = res.data && res.data.session;
        if (session && session.user) { enterIfEmployee(client, session.user); }
        else { showLogin(null); }
      }).catch(function () { showLogin(null); });

      client.auth.onAuthStateChange(function (event) {
        if (event === 'SIGNED_OUT') {
          state.user = null; state.profile = null;
          showLogin(null);
        }
      });

      $('portal-login-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var email = trim($('portal-login-email').value);
        var password = $('portal-login-password').value;
        var err = $('portal-login-error');
        err.hidden = true; err.textContent = '';
        if (!email || !password) {
          err.textContent = 'Enter your employee email and password.';
          err.hidden = false;
          return;
        }
        var btn = $('portal-login-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in&hellip;';
        client.auth.signInWithPassword({ email: email, password: password })
          .then(function (res) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-right-to-bracket"></i> Sign In';
            if (res.error) {
              err.textContent = 'Sign-in failed: ' + res.error.message + ' Double-check the email and password and try again.';
              err.hidden = false;
              return;
            }
            $('portal-login-password').value = '';
            enterIfEmployee(client, res.data.user);
          })
          .catch(function () {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-right-to-bracket"></i> Sign In';
            err.textContent = 'Sign-in failed. Check your connection and try again.';
            err.hidden = false;
          });
      });

      $('portal-logout').addEventListener('click', function () {
        client.auth.signOut();
      });
    });
  }

  /* ================= TABS ================= */
  var LOADERS = {
    tickets: loadTickets, applications: loadApplications, investors: loadInvestors,
    feedback: loadFeedback, customers: loadCustomers, inventory: loadInventory,
  };

  function activateTab(name) {
    var tabs = document.querySelectorAll('.portal-tab');
    tabs.forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-tab') === name); });
    ['tickets', 'applications', 'investors', 'feedback', 'customers', 'inventory', 'timeclock', 'links', 'square', 'checkin', 'requests'].forEach(function (n) {
      $('portal-panel-' + n).hidden = n !== name;
    });
    closeDrawer();
    if (!state.loaded[name] && LOADERS[name]) LOADERS[name](false);
  }

  function initTabs() {
    document.querySelectorAll('.portal-tab').forEach(function (t) {
      t.addEventListener('click', function () { activateTab(t.getAttribute('data-tab')); });
    });
    document.querySelectorAll('[data-refresh]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var name = btn.getAttribute('data-refresh');
        state.loaded[name] = false;
        if (LOADERS[name]) LOADERS[name](true);
      });
    });
  }

  /* ================= DRAWER ================= */
  function openDrawer(title) {
    $('portal-drawer-title').textContent = title;
    $('portal-drawer-overlay').hidden = false;
    var d = $('portal-drawer');
    d.classList.add('open');
    d.setAttribute('aria-hidden', 'false');
  }

  function closeDrawer() {
    $('portal-drawer-overlay').hidden = true;
    var d = $('portal-drawer');
    d.classList.remove('open');
    d.setAttribute('aria-hidden', 'true');
  }

  function initDrawer() {
    $('portal-drawer-close').addEventListener('click', closeDrawer);
    $('portal-drawer-overlay').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });
  }

  function drawerLoading(title) {
    openDrawer(title);
    $('portal-drawer-body').innerHTML = '<p class="portal-muted">Loading&hellip;</p>';
  }

  function kvRows(pairs) {
    var out = '<dl class="portal-kv">';
    pairs.forEach(function (p) {
      out += '<dt>' + esc(p[0]) + '</dt><dd>' + p[1] + '</dd>';
    });
    return out + '</dl>';
  }

  /* ================= TICKETS ================= */
  function deviceLabel(t) {
    var parts = [t.device_type, t.brand, t.model].map(trim).filter(function (p) { return p !== ''; });
    return parts.length ? parts.join(' · ') : 'Device not specified';
  }

  var QCLASS = { 'Waiting': 'q-red', 'Waiting for Parts': 'q-orange', 'In Progress': 'q-yellow', 'Quality Check': 'q-lime', 'Ready for Pickup': 'q-green', 'Completed': 'q-done' };
  function renderTickets(rows) {
    var list = $('portal-ticket-list');
    if (!rows.length) { emptyState(list, 'No tickets match. New service requests from the website will show up here.'); return; }
    var posMap = {}, n = 0;
    for (var i = rows.length - 1; i >= 0; i--) { if (rows[i].status !== 'Completed') { n++; posMap[rows[i].id] = n; } }
    list.innerHTML = rows.map(function (t) {
      var qchip = posMap[t.id] ? '<span class="q-chip">Queue #' + posMap[t.id] + '</span>' : '';
      var appt = t.appointment_at ? '<p class="portal-card-meta"><i class="fas fa-calendar-check"></i> Appointment: ' + esc(fmtDateTime(t.appointment_at)) + '</p>' : '';
      var src = t.source ? ' <span class="portal-badge portal-badge-source">' + esc(t.source) + '</span>' : '';
      var phone = trim(t.customer_phone);
      var phoneHtml = phone ? ' · <a href="tel:' + esc(phone.replace(/[^0-9+]/g, '')) + '">' + esc(phone) + '</a>' : '';
      var email = trim(t.customer_email);
      var emailHtml = email ? '<p class="portal-card-meta"><i class="fas fa-envelope"></i> ' + esc(email) + '</p>' : '';
      return '<article class="portal-card ' + (QCLASS[t.status] || '') + '" data-view-ticket="' + esc(t.id) + '" style="cursor:pointer">' +
        '<div class="portal-card-top"><p class="portal-card-title">' + esc(deviceLabel(t)) + '</p><span class="portal-card-topright">' + qchip + badge(t.status) + '</span></div>' +
        '<p class="portal-card-meta"><i class="fas fa-user"></i> ' + esc(t.customer_name || 'No name given') + phoneHtml + src + '</p>' +
        emailHtml + appt +
        '<p class="portal-card-issue">' + esc(t.issue || '') + '</p>' +
        '<p class="portal-card-meta">Received ' + esc(fmtDateTime(t.created_at)) + '</p>' +
        '<div class="portal-card-actions"><button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-view-ticket="' + esc(t.id) + '"><i class="fas fa-eye"></i> View details</button></div>' +
        '</article>';
    }).join('');
  }

  function loadTickets(force) {
    var list = $('portal-ticket-list');
    if (!force) list.innerHTML = '<p class="portal-muted">Loading tickets&hellip;</p>';
    withClient(function (client) {
      if (!client) { listError(list, 'tickets'); return; }
      var filter = $('portal-ticket-filter').value;
      var q = client.from('tickets').select('*').order('created_at', { ascending: false }).limit(200);
      if (filter !== 'all') q = q.eq('status', filter);
      q.then(function (res) {
        if (res.error) { listError(list, 'tickets'); return; }
        state.loaded.tickets = true;
        renderTickets(res.data || []);
        var open = (res.data || []).filter(function (t) { return t.status !== 'Completed'; }).length;
        setCount('portal-count-tickets', $('portal-ticket-filter').value === 'all' ? open : 0);
      }).catch(function () { listError(list, 'tickets'); });
    });
  }

  function renderTicketThread(messages) {
    var box = $('portal-thread');
    if (!box) return;
    if (!messages.length) {
      box.innerHTML = '<p class="portal-muted">No messages on this ticket yet.</p>';
      return;
    }
    box.innerHTML = messages.map(function (m) {
      var who = m.sender === 'tech' ? 'Tech' : 'Customer';
      return '<div class="portal-msg portal-msg-' + (m.sender === 'tech' ? 'tech' : 'customer') + '">' +
        esc(m.message) +
        '<span class="portal-msg-meta">' + who + ' · ' + esc(fmtDateTime(m.created_at)) + '</span></div>';
    }).join('');
    box.scrollTop = box.scrollHeight;
  }

  function loadTicketThread(client, ticketId) {
    client.from('messages').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true })
      .then(function (res) {
        renderTicketThread(res.error ? [] : (res.data || []));
      })
      .catch(function () { renderTicketThread([]); });
  }

  function openTicket(id) {
    drawerLoading('Ticket details');
    withClient(function (client) {
      if (!client) { $('portal-drawer-body').innerHTML = '<p class="portal-error">Couldn&rsquo;t reach the database.</p>'; return; }
      client.from('tickets').select('*').eq('id', id).maybeSingle().then(function (res) {
        if (res.error || !res.data) {
          $('portal-drawer-body').innerHTML = '<p class="portal-error">Couldn&rsquo;t load that ticket. It may have been deleted.</p>';
          return;
        }
        var t = res.data;
        var gateBanner = t.status === 'Waiting for Parts'
          ? '<div class="portal-gate"><i class="fas fa-triangle-exclamation"></i> <strong>Parts not on hand yet.</strong> Don&rsquo;t start this repair until the part is in and scanned to the ticket.</div>'
          : '';
        var body = gateBanner +
          '<div class="portal-card-top"><p class="portal-card-title">' + esc(deviceLabel(t)) + '</p>' + badge(t.status) + '</div>' +
          kvRows([
            ['Customer', valOrDash(t.customer_name)],
            ['Phone', valOrDash(t.customer_phone)],
            ['Email', valOrDash(t.customer_email)],
            ['Issue', valOrDash(t.issue)],
            ['Appointment', esc(fmtDateTime(t.appointment_at))],
            ['Service address', valOrDash(t.service_address)],
            ['Preferred contact', valOrDash(t.contact_method)],
            ['Serial / IMEI', valOrDash(t.serial_imei)],
            ['Reason', valOrDash(t.issue_reason)],
            ['Power test', (t.triage_volts || t.triage_amps) ? esc([t.triage_volts ? t.triage_volts + ' V' : '', t.triage_amps ? t.triage_amps + ' A' : ''].filter(Boolean).join(' / ')) : '—'],
            ['Powers on?', valOrDash(t.power_on)],
            ['Backed up?', valOrDash(t.backed_up)],
            ['Repaired before?', valOrDash(t.prior_repair)],
            ['Under warranty?', valOrDash(t.warranty_status)],
            ['Terms accepted', fmtBool(t.terms_accepted)],
            ['Dispatch fee ack.', fmtBool(t.dispatch_acknowledged)],
            ['Work authorized', fmtBool(t.work_auth_accepted)],
            ['Marketing opt-in', fmtBool(t.marketing_opt_in)],
            ['Source', valOrDash(t.source)],
            ['Customer account', t.customer_id ? esc(t.customer_id) : 'Web submission — no account'],
            ['Received', esc(fmtDateTime(t.created_at))],
            ['Last updated', esc(fmtDateTime(t.updated_at))]
          ]) +
          '<div class="portal-drawer-section p2-actions"><button class="portal-btn portal-btn-primary portal-btn-sm" type="button" id="p2-receipt-btn"><i class="fas fa-receipt"></i> Print receipt</button>' +
          '<button class="portal-btn p2-btn-danger portal-btn-sm" type="button" id="p2-delete-btn"><i class="fas fa-trash"></i> Delete ticket</button>' +
          '<span class="portal-muted portal-small" id="p2-action-msg"></span>' +
          '<div id="p2-delete-confirm" hidden><p class="portal-error">Permanently delete this ticket? Its charges and messages go with it. Part orders stay on file but detach from the ticket. This cannot be undone.</p>' +
          '<button class="portal-btn p2-btn-danger portal-btn-sm" type="button" id="p2-delete-yes">Yes, delete it</button> ' +
          '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" id="p2-delete-no">Keep ticket</button></div></div>' +
          '<div class="portal-drawer-section"><h3>Charges</h3>' +
          '<div id="p2-charges"><p class="portal-muted">Loading charges&hellip;</p></div>' +
          '<form id="p2-charge-form" class="p2-form">' +
          '<select id="p2-charge-kind" aria-label="Charge type"><option value="part">Part</option><option value="labor">Labor</option><option value="one_off">Other charge</option><option value="dispatch">House-call fee</option><option value="deposit_credit">Deposit received (credit)</option></select>' +
          '<input id="p2-charge-desc" type="text" placeholder="Description" maxlength="200" aria-label="Charge description" />' +
          '<div class="p2-form-row"><input id="p2-charge-qty" type="number" step="0.5" min="0" value="1" aria-label="Quantity" />' +
          '<input id="p2-charge-price" type="number" step="0.01" min="0" placeholder="Price $" aria-label="Unit price" />' +
          '<input id="p2-charge-cost" type="number" step="0.01" min="0" placeholder="Our cost $ (optional)" aria-label="Unit cost" /></div>' +
          '<button class="portal-btn portal-btn-primary portal-btn-sm" type="submit">Add charge</button>' +
          '<p class="portal-error" id="p2-charge-error" hidden></p></form></div>' +
          '<div class="portal-drawer-section"><h3>Payment</h3>' +
          '<div class="p2-actions"><button class="portal-btn portal-btn-primary portal-btn-sm" type="button" id="p3-checkout-btn"><i class="fas fa-credit-card"></i> Charge / Check out</button>' +
          '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" id="p3-cash-btn"><i class="fas fa-money-bill-wave"></i> Mark paid — cash</button>' +
          '<span class="portal-muted portal-small" id="p3-pay-msg"></span></div>' +
          '<div id="p3-checkout-link" hidden></div></div>' +
          '<div class="portal-drawer-section"><h3>Parts on this ticket</h3>' +
          '<div id="p2-parts"><p class="portal-muted">Loading parts&hellip;</p></div>' +
          '<form id="p2-part-form" class="p2-form">' +
          '<select id="p2-part-stock" aria-label="Pull a part from stock"><option value="">Loading stock\u2026</option></select>' +
          '<input id="p2-part-desc" type="text" placeholder="Part description (e.g. iPhone 13 Pro Max battery — OEM)" maxlength="200" aria-label="Part description" />' +
          '<div class="p2-form-row"><input id="p2-part-supplier" type="text" placeholder="Supplier" maxlength="80" aria-label="Supplier" />' +
          '<input id="p2-part-sku" type="text" placeholder="Supplier SKU" maxlength="80" aria-label="Supplier SKU" /></div>' +
          '<div class="p2-form-row"><input id="p2-part-cost" type="number" step="0.01" min="0" placeholder="Our cost $" aria-label="Our cost" />' +
          '<input id="p2-part-retail" type="number" step="0.01" min="0" placeholder="Customer price $" aria-label="Customer price" />' +
          '<input id="p2-part-qty" type="number" step="1" min="1" value="1" aria-label="Quantity" /></div>' +
          '<label class="p2-check"><input type="checkbox" id="p2-part-addcharge" checked /> Add the customer price to Charges as a part line</label>' +
          '<button class="portal-btn portal-btn-primary portal-btn-sm" type="submit">Add part order</button>' +
          '<p class="portal-error" id="p2-part-error" hidden></p></form></div>' +
          '<div class="portal-drawer-section"><h3>Status</h3>' +
          '<div class="portal-status-row"><select id="portal-ticket-status" aria-label="Ticket status">' +
          statusOptions(TICKET_STATUSES, t.status) + '</select>' +
          '<button class="portal-btn portal-btn-primary portal-btn-sm" type="button" id="portal-ticket-status-save">Save status</button>' +
          '<span class="portal-muted portal-small" id="portal-ticket-status-msg"></span></div></div>' +
          '<div class="portal-drawer-section"><h3>Messages &amp; notes</h3>' +
          '<div class="portal-thread" id="portal-thread"><p class="portal-muted">Loading messages&hellip;</p></div>' +
          '<form id="portal-note-form"><div class="portal-note-row">' +
          '<textarea id="portal-note-input" placeholder="Add a note to this ticket&hellip;" maxlength="2000" aria-label="Add a note to this ticket"></textarea>' +
          '<button class="portal-btn portal-btn-primary" type="submit"><i class="fas fa-paper-plane"></i></button></div>' +
          '<p class="portal-muted portal-small">Notes are saved to this ticket&rsquo;s message thread as Tech.</p>' +
          '<p class="portal-error" id="portal-note-error" hidden></p></form></div>';

        $('portal-drawer-body').innerHTML = body;
        loadTicketThread(client, t.id);
        loadCharges(client, t);
        loadParts(client, t);
        loadStockItems(client, t);
        wireTicketActions(client, t);
        wirePaymentActions(client, t);

        $('portal-ticket-status-save').addEventListener('click', function () {
          var next = $('portal-ticket-status').value;
          var msg = $('portal-ticket-status-msg');
          msg.textContent = 'Saving…';
          client.from('tickets').update({ status: next }).eq('id', t.id).then(function (res2) {
            if (res2.error) { msg.textContent = 'Couldn&rsquo;t save — try again.'; return; }
            msg.textContent = 'Saved.';
            if (next === 'Ready for Pickup' && trim(t.customer_phone)) {
              var digits = String(t.customer_phone).replace(/\D/g, '');
              if (digits.length === 10) digits = '1' + digits;
              var first = trim(t.customer_name || '').split(' ')[0] || 'there';
              var dev = [t.device_type, t.brand, t.model].map(trim).filter(function (x) { return x !== ''; }).join(' ') || 'device';
              var body = 'Hi ' + first + ', great news from Austin\'s Tech Repair Group — your ' + dev + ' repair is complete and ready! We\'ll arrange getting it back to you. Reply here or call (937) 280-6243. Thank you!';
              msg.innerHTML = 'Saved. <a class="portal-btn portal-btn-primary portal-btn-sm" style="margin-left:0.5rem;text-decoration:none" href="sms:+' + digits + '?&body=' + encodeURIComponent(body) + '">Text ' + esc(first) + ' it\'s ready</a>';
            }
            state.loaded.tickets = false;
            loadTickets(true);
          }).catch(function () { msg.textContent = 'Couldn&rsquo;t save — try again.'; });
        });

        $('portal-note-form').addEventListener('submit', function (e) {
          e.preventDefault();
          var text = trim($('portal-note-input').value);
          var err = $('portal-note-error');
          err.hidden = true;
          if (!text) return;
          client.from('messages').insert({ ticket_id: t.id, sender: 'tech', message: text }).then(function (res2) {
            if (res2.error) { err.textContent = 'Couldn&rsquo;t save that note. Try again.'; err.hidden = false; return; }
            $('portal-note-input').value = '';
            loadTicketThread(client, t.id);
          }).catch(function () { err.textContent = 'Couldn&rsquo;t save that note. Try again.'; err.hidden = false; });
        });
      }).catch(function () {
        $('portal-drawer-body').innerHTML = '<p class="portal-error">Couldn&rsquo;t load that ticket.</p>';
      });
    });
  }

  /* ================= PHASE 2: CHARGES, PARTS, RECEIPT, LABELS ================= */
  function shortCode(t) { return String(t.id || '').slice(0, 8).toUpperCase(); }

  function chargeTotals(rows) {
    var subtotal = 0, deposits = 0;
    rows.forEach(function (c) {
      var amt = Number(c.qty || 0) * Number(c.unit_price || 0);
      if (c.kind === 'deposit_credit') deposits += amt; else subtotal += amt;
    });
    return { subtotal: subtotal, deposits: deposits, balance: subtotal - deposits };
  }

  function renderCharges(t, rows) {
    var box = $('p2-charges');
    if (!box) return;
    if (!rows.length) {
      box.innerHTML = '<p class="portal-muted">No charges yet. Add the repair price, parts, and the house-call fee here — the receipt is built from these lines.</p>';
    } else {
      var tot = chargeTotals(rows);
      var html = rows.map(function (c) {
        var amt = Number(c.qty || 0) * Number(c.unit_price || 0);
        var kindLabel = { part: 'Part', labor: 'Labor', one_off: 'Other', dispatch: 'House-call fee', deposit_credit: 'Deposit' }[c.kind] || c.kind;
        var sign = c.kind === 'deposit_credit' ? '&minus;' : '';
        return '<div class="p2-line"><div class="p2-line-main"><span class="p2-kind">' + esc(kindLabel) + '</span> ' + esc(c.description) +
          '<span class="portal-muted portal-small"> &times;' + esc(c.qty) + ' @ ' + fmtMoney(c.unit_price) +
          (c.unit_cost != null ? ' (our cost ' + fmtMoney(c.unit_cost) + ')' : '') + '</span></div>' +
          '<div class="p2-line-amt">' + sign + fmtMoney(Math.abs(amt)) + '</div>' +
          '<button class="p2-x" type="button" data-charge-del="' + esc(c.id) + '" aria-label="Remove charge">&times;</button></div>';
      }).join('');
      html += '<div class="p2-totals">' +
        '<div><span>Subtotal</span><span>' + fmtMoney(tot.subtotal) + '</span></div>' +
        (tot.deposits ? '<div><span>Deposits received</span><span>&minus;' + fmtMoney(tot.deposits) + '</span></div>' : '') +
        '<div class="p2-grand"><span>Balance due</span><span>' + fmtMoney(tot.balance) + '</span></div></div>';
      box.innerHTML = html;
    }
    box.querySelectorAll('[data-charge-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        withClient(function (client) {
          client.from('ticket_charges').delete().eq('id', btn.getAttribute('data-charge-del')).then(function (res) {
            if (!res.error) loadCharges(client, t);
          });
        });
      });
    });
  }

  function loadCharges(client, t) {
    client.from('ticket_charges').select('*').eq('ticket_id', t.id).order('created_at', { ascending: true }).then(function (res) {
      if (res.error) { var b = $('p2-charges'); if (b) b.innerHTML = '<p class="portal-error">Couldn&rsquo;t load charges.</p>'; return; }
      t._charges = res.data || [];
      renderCharges(t, t._charges);
    }).catch(function () {});
  }

  function renderParts(t, rows) {
    var box = $('p2-parts');
    if (!box) return;
    if (!rows.length) {
      box.innerHTML = '<p class="portal-muted">No parts ordered for this ticket yet.</p>';
      return;
    }
    box.innerHTML = rows.map(function (p) {
      var statusOpts = ['Ordered', 'Received', 'Cancelled'].map(function (s) {
        return '<option value="' + s + '"' + (p.status === s ? ' selected' : '') + '>' + s + '</option>';
      }).join('');
      return '<div class="p2-line p2-part"><div class="p2-line-main">' + esc(p.description) +
        '<span class="portal-muted portal-small">' +
        (p.supplier ? ' · ' + esc(p.supplier) : '') + (p.supplier_sku ? ' · SKU ' + esc(p.supplier_sku) : '') +
        ' &times;' + esc(p.qty) +
        (p.our_cost != null ? ' · our cost ' + fmtMoney(p.our_cost) : '') +
        (p.retail_price != null ? ' · customer ' + fmtMoney(p.retail_price) : '') +
        (p.received_at ? ' · received ' + esc(fmtDate(p.received_at)) : '') + '</span></div>' +
        '<select class="p2-part-status" data-part-id="' + esc(p.id) + '" aria-label="Part status">' + statusOpts + '</select>' +
        '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-part-label="' + esc(p.id) + '"><i class="fas fa-tag"></i> Label</button>' +
        '<button class="p2-x" type="button" data-part-del="' + esc(p.id) + '" aria-label="Remove part order">&times;</button></div>';
    }).join('');
    box.querySelectorAll('.p2-part-status').forEach(function (sel) {
      sel.addEventListener('change', function () {
        withClient(function (client) {
          var patch = { status: sel.value };
          if (sel.value === 'Received') patch.received_at = new Date().toISOString();
          client.from('part_orders').update(patch).eq('id', sel.getAttribute('data-part-id')).then(function (res) {
            if (!res.error) loadParts(client, t);
          });
        });
      });
    });
    box.querySelectorAll('[data-part-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var part = null;
        rows.forEach(function (r) { if (r.id === btn.getAttribute('data-part-del')) part = r; });
        withClient(function (client) {
          client.from('part_orders').delete().eq('id', btn.getAttribute('data-part-del')).then(function (res) {
            if (!res.error) {
              if (part && part.inventory_id) adjustStock(client, part.inventory_id, Number(part.qty) || 1);
              loadParts(client, t);
            }
          });
        });
      });
    });
    box.querySelectorAll('[data-part-label]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var part = null;
        rows.forEach(function (r) { if (r.id === btn.getAttribute('data-part-label')) part = r; });
        if (part) printPartLabel(t, part);
      });
    });
  }

  function loadParts(client, t) {
    client.from('part_orders').select('*').eq('ticket_id', t.id).order('created_at', { ascending: true }).then(function (res) {
      if (res.error) { var b = $('p2-parts'); if (b) b.innerHTML = '<p class="portal-error">Couldn&rsquo;t load parts.</p>'; return; }
      t._parts = res.data || [];
      renderParts(t, t._parts);
    }).catch(function () {});
  }

  function printArea(html, cls) {
    var area = $('portal-print-area');
    if (!area) { window.print(); return; }
    area.className = cls;
    area.innerHTML = html;
    area.hidden = false;
    document.body.classList.add('portal-printing');
    setTimeout(function () {
      window.print();
      setTimeout(function () {
        document.body.classList.remove('portal-printing');
        area.hidden = true;
        area.innerHTML = '';
      }, 400);
    }, 60);
  }

  function printReceipt(t) {
    var rows = t._charges || [];
    var tot = chargeTotals(rows);
    var lines = rows.map(function (c) {
      var amt = Number(c.qty || 0) * Number(c.unit_price || 0);
      var label = c.kind === 'deposit_credit' ? esc(c.description) + ' (deposit)' : esc(c.description);
      var sign = c.kind === 'deposit_credit' ? '&minus;' : '';
      return '<tr><td>' + label + '</td><td class="rc-num">' + esc(c.qty) + '</td><td class="rc-num">' + sign + fmtMoney(Math.abs(amt)) + '</td></tr>';
    }).join('');
    if (!rows.length) lines = '<tr><td colspan="3">No charges recorded.</td></tr>';
    var html = '<div class="rc">' +
      '<h1>Austin&rsquo;s Tech Repair Group</h1>' +
      '<p class="rc-sub">Mobile Repair — Ohio · (937) 280-6243<br/>austinstechrepairgroup.com</p>' +
      '<p class="rc-meta">Receipt · Ticket #' + shortCode(t) + '<br/>' + esc(fmtDateTime(t.created_at)) + '</p>' +
      '<p class="rc-meta"><strong>' + esc(t.customer_name || '') + '</strong><br/>' + esc(deviceLabel(t)) + '<br/>' + esc(t.issue || '') + '</p>' +
      '<table class="rc-table"><thead><tr><th>Description</th><th class="rc-num">Qty</th><th class="rc-num">Amount</th></tr></thead><tbody>' + lines + '</tbody></table>' +
      '<table class="rc-table rc-totals"><tbody>' +
      '<tr><td>Subtotal</td><td class="rc-num">' + fmtMoney(tot.subtotal) + '</td></tr>' +
      (tot.deposits ? '<tr><td>Deposits received</td><td class="rc-num">&minus;' + fmtMoney(tot.deposits) + '</td></tr>' : '') +
      '<tr class="rc-grand"><td>Balance due</td><td class="rc-num">' + fmtMoney(tot.balance) + '</td></tr>' +
      '</tbody></table>' +
      (tot.balance <= 0 && tot.subtotal > 0 ? '<p class="rc-paid">PAID IN FULL — thank you!</p>' : '') +
      '<p class="rc-foot">Repairs are backed by our 1-Year Limited Warranty (parts &amp; labor). The $35 house-call fee is non-refundable. Thank you for your business!</p>' +
      '</div>';
    printArea(html, 'receipt');
  }

  function printPartLabel(t, p) {
    var partUrl = 'https://austinstechrepairgroup.com/portal.html?part=' + p.id;
    var html = '<div class="lbl"><div class="lbl-flex"><div class="lbl-text">' +
      '<div class="lbl-biz">AUSTIN&rsquo;S TECH REPAIR GROUP</div>' +
      '<div class="lbl-part">' + esc(p.description) + '</div>' +
      '<div class="lbl-meta">Ticket #' + shortCode(t) + ' \u00b7 ' + esc(t.customer_name || '') + '</div>' +
      '<div class="lbl-meta">' + esc(deviceLabel(t)) + ' \u00b7 ' + esc(fmtDate(p.ordered_at || p.created_at)) + '</div>' +
      '</div><div class="lbl-qr" id="p3-label-qr"></div></div></div>';
    printArea(html, 'label');
    var qrBox = document.getElementById('p3-label-qr');
    if (qrBox && window.QRCode) {
      try {
        new window.QRCode(qrBox, { text: partUrl, width: 72, height: 72, correctLevel: window.QRCode.CorrectLevel.M });
      } catch (e) { /* the label still prints its text if the QR library is unavailable */ }
    }
  }

  function wireTicketActions(client, t) {
    var receiptBtn = $('p2-receipt-btn');
    if (receiptBtn) receiptBtn.addEventListener('click', function () { printReceipt(t); });

    var delBtn = $('p2-delete-btn'), confirmBox = $('p2-delete-confirm');
    if (delBtn && confirmBox) {
      delBtn.addEventListener('click', function () { confirmBox.hidden = false; delBtn.hidden = true; });
      $('p2-delete-no').addEventListener('click', function () { confirmBox.hidden = true; delBtn.hidden = false; });
      $('p2-delete-yes').addEventListener('click', function () {
        client.from('tickets').delete().eq('id', t.id).then(function (res) {
          if (res.error) { $('p2-action-msg').textContent = 'Couldn&rsquo;t delete — try again.'; return; }
          closeDrawer();
          state.loaded.tickets = false;
          loadTickets(true);
        }).catch(function () { $('p2-action-msg').textContent = 'Couldn&rsquo;t delete — try again.'; });
      });
    }

    var kindSel = $('p2-charge-kind');
    if (kindSel) kindSel.addEventListener('change', function () {
      if (kindSel.value === 'dispatch') {
        if (!$('p2-charge-desc').value) $('p2-charge-desc').value = 'House-call fee (non-refundable)';
        if (!$('p2-charge-price').value) $('p2-charge-price').value = '35';
      }
      if (kindSel.value === 'deposit_credit' && !$('p2-charge-desc').value) {
        $('p2-charge-desc').value = 'Parts deposit received';
      }
    });

    var chargeForm = $('p2-charge-form');
    if (chargeForm) chargeForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('p2-charge-error'); err.hidden = true;
      var desc = trim($('p2-charge-desc').value);
      var price = parseFloat($('p2-charge-price').value);
      if (!desc || isNaN(price)) { err.textContent = 'Give the charge a description and a price.'; err.hidden = false; return; }
      var costRaw = $('p2-charge-cost').value;
      client.from('ticket_charges').insert({
        ticket_id: t.id,
        kind: kindSel.value,
        description: desc,
        qty: parseFloat($('p2-charge-qty').value) || 1,
        unit_price: price,
        unit_cost: costRaw === '' ? null : parseFloat(costRaw)
      }).then(function (res) {
        if (res.error) { err.textContent = 'Couldn&rsquo;t add that charge. Try again.'; err.hidden = false; return; }
        chargeForm.reset(); $('p2-charge-qty').value = '1';
        loadCharges(client, t);
      }).catch(function () { err.textContent = 'Couldn&rsquo;t add that charge. Try again.'; err.hidden = false; });
    });

    var stockSelEl = $('p2-part-stock');
    if (stockSelEl) stockSelEl.addEventListener('change', function () {
      var it = null;
      (t._stockItems || []).forEach(function (r) { if (r.id === stockSelEl.value) it = r; });
      if (!it) return;
      if (!$('p2-part-desc').value) $('p2-part-desc').value = it.product_name || '';
      if (!$('p2-part-supplier').value && it.supplier) $('p2-part-supplier').value = it.supplier;
      if (!$('p2-part-sku').value && it.supplier_sku) $('p2-part-sku').value = it.supplier_sku;
      if (!$('p2-part-cost').value && it.cost != null) $('p2-part-cost').value = it.cost;
      if (!$('p2-part-retail').value && it.retail_price != null) $('p2-part-retail').value = it.retail_price;
    });

    var partForm = $('p2-part-form');
    if (partForm) partForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('p2-part-error'); err.hidden = true;
      var stockSel = $('p2-part-stock');
      var stockId = stockSel && stockSel.value ? stockSel.value : null;
      var stockItem = null;
      if (stockId && t._stockItems) t._stockItems.forEach(function (it) { if (it.id === stockId) stockItem = it; });
      var desc = trim($('p2-part-desc').value);
      if (!desc && stockItem) desc = stockItem.product_name;
      if (!desc) { err.textContent = 'Describe the part first.'; err.hidden = false; return; }
      var qtyWanted = parseInt($('p2-part-qty').value, 10) || 1;
      if (stockItem && qtyWanted > (Number(stockItem.stock_qty) || 0)) {
        err.textContent = 'Only ' + stockItem.stock_qty + ' of that part in stock.'; err.hidden = false; return;
      }
      var costRaw = $('p2-part-cost').value, retailRaw = $('p2-part-retail').value;
      var qty = parseInt($('p2-part-qty').value, 10) || 1;
      var part = {
        ticket_id: t.id,
        inventory_id: stockItem ? stockItem.id : null,
        description: desc,
        supplier: trim($('p2-part-supplier').value) || null,
        supplier_sku: trim($('p2-part-sku').value) || null,
        our_cost: costRaw === '' ? null : parseFloat(costRaw),
        retail_price: retailRaw === '' ? null : parseFloat(retailRaw),
        qty: qty,
        status: 'Ordered'
      };
      client.from('part_orders').insert(part).then(function (res) {
        if (res.error) { err.textContent = 'Couldn&rsquo;t add that part. Try again.'; err.hidden = false; return; }
        if (stockItem) { adjustStock(client, stockItem.id, -qty); loadStockItems(client, t); }
        var addCharge = $('p2-part-addcharge').checked && part.retail_price != null && part.retail_price > 0;
        partForm.reset(); $('p2-part-qty').value = '1'; $('p2-part-addcharge').checked = true;
        loadParts(client, t);
        if (addCharge) {
          client.from('ticket_charges').insert({
            ticket_id: t.id, kind: 'part', description: desc, qty: qty,
            unit_cost: part.our_cost, unit_price: part.retail_price
          }).then(function () { loadCharges(client, t); });
        }
      }).catch(function () { err.textContent = 'Couldn&rsquo;t add that part. Try again.'; err.hidden = false; });
    });
  }

  /* ================= PHASE 3: STOCK + TICKET PAYMENTS ================= */
  /* Read-modify-write on stock_qty: fine for a small shop's volume,
   * and every path funnels through here so counts stay consistent. */
  function adjustStock(client, inventoryId, delta) {
    if (!inventoryId || !delta) return;
    client.from('inventory').select('stock_qty').eq('id', inventoryId).maybeSingle().then(function (res) {
      if (res.error || !res.data) return;
      var next = Math.max(0, (Number(res.data.stock_qty) || 0) + delta);
      client.from('inventory').update({ stock_qty: next }).eq('id', inventoryId).then(function () {});
    }).catch(function () {});
  }

  function loadStockItems(client, t) {
    var sel = $('p2-part-stock');
    if (!sel) return;
    client.from('inventory').select('*').gt('stock_qty', 0).order('product_name', { ascending: true }).then(function (res) {
      if (res.error) return;
      t._stockItems = res.data || [];
      sel.innerHTML = '<option value="">\u2014 New part order (not from stock) \u2014</option>' + t._stockItems.map(function (it) {
        return '<option value="' + esc(it.id) + '">' + esc(it.product_name) + ' \u2014 ' + esc(it.stock_qty) + ' in stock (' + esc(it.location || 'van') + ')</option>';
      }).join('');
    }).catch(function () {});
  }

  function wirePaymentActions(client, t) {
    var checkoutBtn = $('p3-checkout-btn');
    var cashBtn = $('p3-cash-btn');
    var msg = $('p3-pay-msg');
    var linkBox = $('p3-checkout-link');
    if (checkoutBtn) checkoutBtn.addEventListener('click', function () {
      checkoutBtn.disabled = true;
      msg.textContent = 'Creating Square payment link\u2026';
      if (linkBox) { linkBox.hidden = true; linkBox.innerHTML = ''; }
      client.auth.getSession().then(function (sres) {
        var token = sres && sres.data && sres.data.session ? sres.data.session.access_token : '';
        if (!token) { checkoutBtn.disabled = false; msg.textContent = 'Session expired \u2014 sign in again.'; return; }
        fetch(SUPABASE_URL + '/functions/v1/square-ticket-checkout', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ ticket_id: t.id })
        }).then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
          .then(function (out2) {
            checkoutBtn.disabled = false;
            if (!out2.ok || !out2.data || !out2.data.url) {
              msg.textContent = (out2.data && out2.data.error) ? out2.data.error : 'Couldn\u2019t create the payment link.';
              return;
            }
            msg.textContent = 'Payment link ready \u2014 ' + fmtMoney(out2.data.amount_cents / 100) + '.';
            if (linkBox) {
              linkBox.innerHTML = '<p class="portal-card-meta"><a href="' + esc(out2.data.url) + '" target="_blank" rel="noopener">' + esc(out2.data.url) + '</a></p>' +
                '<p class="portal-muted portal-small">Send this link to the customer. When Square shows the payment completed, record it in Charges above as a \u201cDeposit received (credit)\u201d line so the balance zeroes out.</p>';
              linkBox.hidden = false;
            }
          }).catch(function () { checkoutBtn.disabled = false; msg.textContent = 'Couldn\u2019t create the payment link. Check your connection.'; });
      }).catch(function () { checkoutBtn.disabled = false; msg.textContent = 'Session expired \u2014 sign in again.'; });
    });

    if (cashBtn) cashBtn.addEventListener('click', function () {
      if (cashBtn.getAttribute('data-confirm') !== '1') {
        cashBtn.setAttribute('data-confirm', '1');
        cashBtn.innerHTML = '<i class="fas fa-money-bill-wave"></i> Confirm \u2014 paid in cash?';
        return;
      }
      cashBtn.removeAttribute('data-confirm');
      cashBtn.innerHTML = '<i class="fas fa-money-bill-wave"></i> Mark paid \u2014 cash';
      var tot = chargeTotals(t._charges || []);
      if (tot.balance <= 0) { msg.textContent = 'Nothing due on this ticket.'; return; }
      cashBtn.disabled = true;
      msg.textContent = 'Recording cash payment\u2026';
      client.from('ticket_charges').insert({
        ticket_id: t.id, kind: 'deposit_credit', description: 'Paid in cash',
        qty: 1, unit_price: Math.round(tot.balance * 100) / 100
      }).then(function (res) {
        cashBtn.disabled = false;
        if (res.error) { msg.textContent = 'Couldn\u2019t record that payment. Try again.'; return; }
        msg.textContent = 'Marked paid \u2014 cash. Balance is now $0.00.';
        loadCharges(client, t);
      }).catch(function () { cashBtn.disabled = false; msg.textContent = 'Couldn\u2019t record that payment. Try again.'; });
    });
  }

  /* ================= JOB APPLICATIONS ================= */
  function renderApplications(rows) {
    var list = $('portal-application-list');
    if (!rows.length) { emptyState(list, 'No job applications yet. Applications from the Careers section of the website will show up here.'); return; }
    list.innerHTML = rows.map(function (a) {
      var bits = [];
      if (a.position) bits.push(esc(a.position));
      if (a.email) bits.push(esc(a.email));
      if (a.phone) bits.push(esc(a.phone));
      return '<article class="portal-card">' +
        '<div class="portal-card-top"><p class="portal-card-title">' + esc(a.full_name || 'Applicant') + '</p>' + badge(a.status) + '</div>' +
        '<p class="portal-card-meta">' + bits.join(' · ') + '</p>' +
        '<p class="portal-card-meta">Applied ' + esc(fmtDateTime(a.created_at)) + '</p>' +
        '<div class="portal-card-actions"><button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-view-application="' + esc(a.id) + '"><i class="fas fa-eye"></i> View details</button></div>' +
        '</article>';
    }).join('');
  }

  function loadApplications(force) {
    var list = $('portal-application-list');
    if (!force) list.innerHTML = '<p class="portal-muted">Loading applications&hellip;</p>';
    withClient(function (client) {
      if (!client) { listError(list, 'job applications'); return; }
      client.from('job_applications').select('*').order('created_at', { ascending: false }).limit(200)
        .then(function (res) {
          if (res.error) { listError(list, 'job applications'); return; }
          state.loaded.applications = true;
          renderApplications(res.data || []);
          setCount('portal-count-applications', (res.data || []).filter(function (a) { return a.status === 'New'; }).length);
        })
        .catch(function () { listError(list, 'job applications'); });
    });
  }

  function openApplication(id) {
    drawerLoading('Application details');
    withClient(function (client) {
      if (!client) { $('portal-drawer-body').innerHTML = '<p class="portal-error">Couldn&rsquo;t reach the database.</p>'; return; }
      client.from('job_applications').select('*').eq('id', id).maybeSingle().then(function (res) {
        if (res.error || !res.data) {
          $('portal-drawer-body').innerHTML = '<p class="portal-error">Couldn&rsquo;t load that application.</p>';
          return;
        }
        var a = res.data;
        var resumeBtn = a.resume_url
          ? '<button class="portal-btn portal-btn-primary portal-btn-sm" type="button" id="portal-resume-btn"><i class="fas fa-file-arrow-down"></i> View résumé</button> <span class="portal-muted portal-small" id="portal-resume-msg"></span>'
          : 'No résumé uploaded';
        var body =
          '<div class="portal-card-top"><p class="portal-card-title">' + esc(a.full_name || 'Applicant') + '</p>' + badge(a.status) + '</div>' +
          kvRows([
            ['Position', valOrDash(a.position)],
            ['Email', valOrDash(a.email)],
            ['Phone', valOrDash(a.phone)],
            ['Address', valOrDash(a.address)],
            ['Education', valOrDash(a.education)],
            ['Recent employer', valOrDash(a.recent_employer)],
            ['Employment dates', valOrDash(a.employment_dates)],
            ['Reference', valOrDash(a.reference_name)],
            ['Reference contact', valOrDash(a.reference_contact)],
            ['Cover notes', a.cover_notes ? esc(a.cover_notes).replace(/\n/g, '<br>') : '—'],
            ['Résumé', resumeBtn],
            ['Applied', esc(fmtDateTime(a.created_at))]
          ]) +
          '<div class="portal-drawer-section"><h3>Status</h3>' +
          '<div class="portal-status-row"><select id="portal-application-status" aria-label="Application status">' +
          statusOptions(APPLICATION_STATUSES, a.status) + '</select>' +
          '<button class="portal-btn portal-btn-primary portal-btn-sm" type="button" id="portal-application-status-save">Save status</button>' +
          '<span class="portal-muted portal-small" id="portal-application-status-msg"></span></div></div>';
        $('portal-drawer-body').innerHTML = body;

        var rBtn = $('portal-resume-btn');
        if (rBtn) {
          rBtn.addEventListener('click', function () {
            var msg = $('portal-resume-msg');
            msg.textContent = 'Getting a secure link…';
            var path = String(a.resume_url);
            if (/^https?:\/\//i.test(path)) { window.open(path, '_blank', 'noopener'); msg.textContent = ''; return; }
            client.storage.from(RESUME_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS).then(function (r) {
              if (r.error || !r.data || !r.data.signedUrl) {
                msg.textContent = 'Couldn&rsquo;t open the résumé — the file may be missing.';
                return;
              }
              msg.textContent = '';
              window.open(r.data.signedUrl, '_blank', 'noopener');
            }).catch(function () { msg.textContent = 'Couldn&rsquo;t open the résumé.'; });
          });
        }

        $('portal-application-status-save').addEventListener('click', function () {
          var next = $('portal-application-status').value;
          var msg = $('portal-application-status-msg');
          msg.textContent = 'Saving…';
          client.from('job_applications').update({ status: next }).eq('id', a.id).then(function (res2) {
            if (res2.error) { msg.textContent = 'Couldn&rsquo;t save — try again.'; return; }
            msg.textContent = 'Saved.';
            state.loaded.applications = false;
            loadApplications(true);
          }).catch(function () { msg.textContent = 'Couldn&rsquo;t save — try again.'; });
        });
      }).catch(function () {
        $('portal-drawer-body').innerHTML = '<p class="portal-error">Couldn&rsquo;t load that application.</p>';
      });
    });
  }

  /* ================= INVESTORS ================= */
  function renderInvestors(rows) {
    var list = $('portal-investor-list');
    if (!rows.length) { emptyState(list, 'No investor inquiries yet. Inquiries from the Investors section of the website will show up here.'); return; }
    list.innerHTML = rows.map(function (v) {
      var bits = [];
      if (v.company_name) bits.push(esc(v.company_name));
      if (v.investor_type) bits.push(esc(v.investor_type));
      if (v.amount_usd != null) bits.push('Considering ' + esc(fmtMoney(v.amount_usd)));
      return '<article class="portal-card">' +
        '<div class="portal-card-top"><p class="portal-card-title">' + esc(v.full_name || 'Investor') + '</p>' + badge(v.status) + '</div>' +
        '<p class="portal-card-meta">' + bits.join(' · ') + '</p>' +
        '<p class="portal-card-meta">' + esc(v.email || '') + ' · Received ' + esc(fmtDateTime(v.created_at)) + '</p>' +
        '<div class="portal-card-actions"><button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-view-investor="' + esc(v.id) + '"><i class="fas fa-eye"></i> View details</button></div>' +
        '</article>';
    }).join('');
  }

  function loadInvestors(force) {
    var list = $('portal-investor-list');
    if (!force) list.innerHTML = '<p class="portal-muted">Loading investor inquiries&hellip;</p>';
    withClient(function (client) {
      if (!client) { listError(list, 'investor inquiries'); return; }
      client.from('investor_inquiries').select('*').order('created_at', { ascending: false }).limit(200)
        .then(function (res) {
          if (res.error) { listError(list, 'investor inquiries'); return; }
          state.loaded.investors = true;
          renderInvestors(res.data || []);
          setCount('portal-count-investors', (res.data || []).filter(function (v) { return v.status === 'New'; }).length);
        })
        .catch(function () { listError(list, 'investor inquiries'); });
    });
  }

  function openInvestor(id) {
    drawerLoading('Investor inquiry');
    withClient(function (client) {
      if (!client) { $('portal-drawer-body').innerHTML = '<p class="portal-error">Couldn&rsquo;t reach the database.</p>'; return; }
      client.from('investor_inquiries').select('*').eq('id', id).maybeSingle().then(function (res) {
        if (res.error || !res.data) {
          $('portal-drawer-body').innerHTML = '<p class="portal-error">Couldn&rsquo;t load that inquiry.</p>';
          return;
        }
        var v = res.data;
        var body =
          '<div class="portal-card-top"><p class="portal-card-title">' + esc(v.full_name || 'Investor') + '</p>' + badge(v.status) + '</div>' +
          kvRows([
            ['Email', valOrDash(v.email)],
            ['Phone', valOrDash(v.phone)],
            ['Company', valOrDash(v.company_name)],
            ['Investor type', valOrDash(v.investor_type)],
            ['Amount (USD)', esc(fmtMoney(v.amount_usd))],
            ['Focus / interest', valOrDash(v.focus)],
            ['Message', v.message ? esc(v.message).replace(/\n/g, '<br>') : '—'],
            ['OK to contact', fmtBool(v.consent_contact)],
            ['Received', esc(fmtDateTime(v.created_at))]
          ]) +
          '<div class="portal-drawer-section"><h3>Status</h3>' +
          '<div class="portal-status-row"><select id="portal-investor-status" aria-label="Investor inquiry status">' +
          statusOptions(INVESTOR_STATUSES, v.status) + '</select>' +
          '<button class="portal-btn portal-btn-primary portal-btn-sm" type="button" id="portal-investor-status-save">Save status</button>' +
          '<span class="portal-muted portal-small" id="portal-investor-status-msg"></span></div></div>';
        $('portal-drawer-body').innerHTML = body;

        $('portal-investor-status-save').addEventListener('click', function () {
          var next = $('portal-investor-status').value;
          var msg = $('portal-investor-status-msg');
          msg.textContent = 'Saving…';
          client.from('investor_inquiries').update({ status: next }).eq('id', v.id).then(function (res2) {
            if (res2.error) { msg.textContent = 'Couldn&rsquo;t save — try again.'; return; }
            msg.textContent = 'Saved.';
            state.loaded.investors = false;
            loadInvestors(true);
          }).catch(function () { msg.textContent = 'Couldn&rsquo;t save — try again.'; });
        });
      }).catch(function () {
        $('portal-drawer-body').innerHTML = '<p class="portal-error">Couldn&rsquo;t load that inquiry.</p>';
      });
    });
  }

  /* ================= FEEDBACK ================= */
  function renderFeedback(rows) {
    var list = $('portal-feedback-list');
    if (!rows.length) { emptyState(list, 'No feedback yet. “How Did We Do” responses will show up here.'); return; }
    list.innerHTML = rows.map(function (f) {
      var rec = trim(f.would_recommend)
        ? ' <span class="portal-badge ' + (/yes/i.test(f.would_recommend) ? 'portal-st-ready' : 'portal-st-cancelled') + '">Recommends: ' + esc(f.would_recommend) + '</span>'
        : '';
      var who = trim(f.customer_name) || 'Anonymous customer';
      var contact = trim(f.customer_email) ? ' · ' + esc(f.customer_email) : '';
      var comments = trim(f.comments) ? '<p class="portal-card-issue">&ldquo;' + esc(f.comments) + '&rdquo;</p>' : '';
      var exp = trim(f.experience) ? '<p class="portal-card-meta">Experience: ' + esc(f.experience) + '</p>' : '';
      return '<article class="portal-card">' +
        '<div class="portal-card-top"><p class="portal-card-title">' + esc(who) + '</p>' + starsHtml(f.rating) + '</div>' +
        '<p class="portal-card-meta">' + esc(fmtDateTime(f.created_at)) + contact + '</p>' +
        exp + comments +
        '<div class="portal-card-actions">' + rec + '</div>' +
        '</article>';
    }).join('');
  }

  function loadFeedback(force) {
    var list = $('portal-feedback-list');
    if (!force) list.innerHTML = '<p class="portal-muted">Loading feedback&hellip;</p>';
    withClient(function (client) {
      if (!client) { listError(list, 'feedback'); return; }
      client.from('feedback').select('*').order('created_at', { ascending: false }).limit(200)
        .then(function (res) {
          if (res.error) { listError(list, 'feedback'); return; }
          state.loaded.feedback = true;
          renderFeedback(res.data || []);
        })
        .catch(function () { listError(list, 'feedback'); });
    });
  }

  /* ================= CUSTOMERS ================= */
  function renderCustomers(rows) {
    var list = $('portal-customer-list');
    if (!rows.length) { emptyState(list, 'No customers match. Customer accounts from the website will show up here.'); return; }
    list.innerHTML = rows.map(function (c) {
      return '<article class="portal-card">' +
        '<div class="portal-card-top"><p class="portal-card-title">' + esc(c.name || 'Customer') + '</p>' +
        '<span class="portal-badge portal-st-reviewed"><i class="fas fa-coins"></i> ' + esc(String(c.points)) + ' pts</span></div>' +
        '<p class="portal-card-meta"><i class="fas fa-envelope"></i> ' + esc(c.email || '—') +
        (c.phone ? ' · <i class="fas fa-phone"></i> ' + esc(c.phone) : '') + '</p>' +
        '<p class="portal-card-meta"><i class="fas fa-cake-candles"></i> Birthday: ' +
        '<input type="date" class="p3-bday-input" data-bday-input="' + esc(c.id) + '" value="' + esc(c.birthday || '') + '" aria-label="Customer birthday" /> ' +
        '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-bday-save="' + esc(c.id) + '">Save</button> ' +
        '<span class="portal-muted portal-small" data-bday-msg="' + esc(c.id) + '"></span></p>' +
        '<p class="portal-card-meta">' + esc(String(c.orderCount)) + ' shop order' + (c.orderCount === 1 ? '' : 's') +
        ' · Customer since ' + esc(fmtDate(c.created_at)) + '</p>' +
        '</article>';
    }).join('');
  }

  function loadCustomers(force) {
    var list = $('portal-customer-list');
    if (!force) list.innerHTML = '<p class="portal-muted">Loading customers&hellip;</p>';
    withClient(function (client) {
      if (!client) { listError(list, 'customers'); return; }
      client.from('customers').select('*').order('created_at', { ascending: false }).limit(500)
        .then(function (res) {
          if (res.error) { listError(list, 'customers'); return; }
          var customers = res.data || [];
          var pointsByCustomer = {};
          var ordersByCustomer = {};
          var pending = 2;
          function finish() {
            pending--;
            if (pending > 0) return;
            var rows = customers.map(function (c) {
              return {
                id: c.id, name: c.name, email: c.email, phone: c.phone, created_at: c.created_at, birthday: c.birthday,
                points: pointsByCustomer[c.id] || 0,
                orderCount: ordersByCustomer[c.id] || 0
              };
            });
            state.customersCache = rows;
            state.loaded.customers = true;
            applyCustomerSearch();
          }
          client.from('rewards').select('customer_id, points').then(function (r) {
            if (!r.error) (r.data || []).forEach(function (row) { pointsByCustomer[row.customer_id] = row.points; });
            finish();
          }).catch(finish);
          client.from('orders').select('customer_id').then(function (r) {
            if (!r.error) (r.data || []).forEach(function (row) {
              if (row.customer_id) ordersByCustomer[row.customer_id] = (ordersByCustomer[row.customer_id] || 0) + 1;
            });
            finish();
          }).catch(finish);
        })
        .catch(function () { listError(list, 'customers'); });
    });
  }

  function applyCustomerSearch() {
    var q = trim($('portal-cust-search').value).toLowerCase();
    var rows = state.customersCache.filter(function (c) {
      if (!q) return true;
      return (String(c.name || '') + ' ' + String(c.email || '')).toLowerCase().indexOf(q) !== -1;
    });
    renderCustomers(rows);
  }

  function saveBirthday(customerId) {
    var input = document.querySelector('[data-bday-input="' + customerId + '"]');
    var msg = document.querySelector('[data-bday-msg="' + customerId + '"]');
    if (!input) return;
    var val = input.value || null;
    if (msg) msg.textContent = 'Saving\u2026';
    withClient(function (client) {
      if (!client) { if (msg) msg.textContent = 'No connection.'; return; }
      client.from('customers').update({ birthday: val }).eq('id', customerId).then(function (res) {
        if (res.error) { if (msg) msg.textContent = 'Couldn\u2019t save.'; return; }
        if (msg) msg.textContent = 'Saved.';
        state.customersCache.forEach(function (c) { if (c.id === customerId) c.birthday = val; });
      }).catch(function () { if (msg) msg.textContent = 'Couldn\u2019t save.'; });
    });
  }

  /* ================= INVENTORY (Phase 3: editable van/shop stock) ================= */
  function itemLines(items) {
    if (!items) return '—';
    var arr = items;
    if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch (e) { return esc(arr); } }
    if (!Array.isArray(arr)) return esc(JSON.stringify(arr));
    if (!arr.length) return '—';
    return '<ul class="portal-items">' + arr.map(function (it) {
      if (it == null) return '';
      if (typeof it !== 'object') return '<li>' + esc(it) + '</li>';
      var name = it.name || it.product_name || it.product || it.title || it.description || 'Item';
      var bits = [esc(name)];
      var qty = it.qty != null ? it.qty : it.quantity;
      if (qty != null) bits.push('× ' + esc(String(qty)));
      var price = it.price != null ? it.price : (it.unit_price != null ? it.unit_price : it.cost);
      if (price != null && !isNaN(Number(price))) bits.push(esc(fmtMoney(price)));
      return '<li>' + bits.join(' · ') + '</li>';
    }).join('') + '</ul>';
  }

  function renderInventory(rows) {
    var list = $('portal-inventory-list');
    if (!list) return;
    var filterEl = $('portal-inv-filter');
    var filter = filterEl ? filterEl.value : 'all';
    var shown = (rows || []).filter(function (p) { return filter === 'all' || (p.location || 'van') === filter; });
    if (!shown.length) {
      emptyState(list, (rows && rows.length) ? 'No stock in that location yet.' : 'No inventory products yet. Add the first one with the form below.');
      return;
    }
    var html = '<div class="portal-table-wrap"><table class="portal-table"><thead><tr>' +
      '<th>Product</th><th>Category</th><th>Supplier</th><th>SKU</th><th>Cost</th><th>Retail</th><th>Location</th><th>Stock</th><th></th>' +
      '</tr></thead><tbody>';
    html += shown.map(function (p) {
      var threshold = (typeof p.reorder_point === 'number') ? p.reorder_point : 5;
      var low = typeof p.stock_qty === 'number' && p.stock_qty <= threshold;
      var locOpts = ['van', 'shop'].map(function (loc) {
        return '<option value="' + loc + '"' + ((p.location || 'van') === loc ? ' selected' : '') + '>' + (loc === 'van' ? 'Van' : 'Shop') + '</option>';
      }).join('');
      return '<tr><td>' + esc(p.product_name || '—') + '</td><td>' + esc(p.category || '—') + '</td><td>' +
        esc(p.supplier || '—') + '</td><td>' + esc(p.supplier_sku || '—') + '</td><td>' + esc(fmtMoney(p.cost)) +
        '</td><td>' + esc(fmtMoney(p.retail_price)) + '</td>' +
        '<td><select class="p3-mini-select" data-inv-loc="' + esc(p.id) + '" aria-label="Stock location">' + locOpts + '</select></td>' +
        '<td class="' + (low ? 'portal-stock-low' : 'portal-stock-ok') + '">' +
        '<button class="p3-qty-btn" type="button" data-inv-dec="' + esc(p.id) + '" aria-label="Decrease stock">&minus;</button> ' +
        esc(String(p.stock_qty == null ? '—' : p.stock_qty)) + (low ? ' (low)' : '') +
        ' <button class="p3-qty-btn" type="button" data-inv-inc="' + esc(p.id) + '" aria-label="Increase stock">+</button></td>' +
        '<td class="p3-inv-actions"><button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-inv-edit="' + esc(p.id) + '">Edit</button> ' +
        '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-inv-del="' + esc(p.id) + '">Delete</button></td></tr>';
    }).join('');
    list.innerHTML = html + '</tbody></table></div>';
    wireInventoryRows(list);
  }

  function invRow(id) {
    var found = null;
    state.inventoryCache.forEach(function (p) { if (p.id === id) found = p; });
    return found;
  }

  function updateInventoryRow(id, patch) {
    withClient(function (client) {
      if (!client) return;
      client.from('inventory').update(patch).eq('id', id).then(function (res) {
        if (!res.error) { state.loaded.inventory = false; loadInventory(true); }
      }).catch(function () {});
    });
  }

  function wireInventoryRows(list) {
    list.querySelectorAll('[data-inv-inc]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var p = invRow(btn.getAttribute('data-inv-inc'));
        if (p) updateInventoryRow(p.id, { stock_qty: (Number(p.stock_qty) || 0) + 1 });
      });
    });
    list.querySelectorAll('[data-inv-dec]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var p = invRow(btn.getAttribute('data-inv-dec'));
        if (p) updateInventoryRow(p.id, { stock_qty: Math.max(0, (Number(p.stock_qty) || 0) - 1) });
      });
    });
    list.querySelectorAll('[data-inv-loc]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        updateInventoryRow(sel.getAttribute('data-inv-loc'), { location: sel.value });
      });
    });
    list.querySelectorAll('[data-inv-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () { fillInventoryForm(invRow(btn.getAttribute('data-inv-edit'))); });
    });
    list.querySelectorAll('[data-inv-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-inv-del');
        if (btn.getAttribute('data-confirm') !== '1') {
          btn.setAttribute('data-confirm', '1');
          btn.textContent = 'Confirm delete?';
          return;
        }
        withClient(function (client) {
          if (!client) return;
          client.from('inventory').delete().eq('id', id).then(function (res) {
            if (res.error) { btn.textContent = 'In use — can’t delete'; return; }
            state.loaded.inventory = false;
            loadInventory(true);
          }).catch(function () { btn.textContent = 'Try again'; });
        });
      });
    });
  }

  function fillInventoryForm(p) {
    if (!p) return;
    $('portal-inv-id').value = p.id;
    $('portal-inv-name').value = p.product_name || '';
    $('portal-inv-category').value = p.category || '';
    $('portal-inv-supplier').value = p.supplier || '';
    $('portal-inv-sku').value = p.supplier_sku || '';
    $('portal-inv-cost').value = p.cost != null ? p.cost : '';
    $('portal-inv-retail').value = p.retail_price != null ? p.retail_price : '';
    $('portal-inv-qty').value = p.stock_qty != null ? p.stock_qty : 0;
    $('portal-inv-reorder').value = p.reorder_point != null ? p.reorder_point : 5;
    $('portal-inv-location').value = p.location || 'van';
    $('portal-inv-submit').innerHTML = '<i class="fas fa-save"></i> Save changes';
    var cancel = $('portal-inv-cancel'); if (cancel) cancel.hidden = false;
    var form = $('portal-inv-form');
    if (form && form.scrollIntoView) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetInventoryForm() {
    var form = $('portal-inv-form');
    if (!form) return;
    form.reset();
    $('portal-inv-id').value = '';
    $('portal-inv-location').value = 'van';
    $('portal-inv-submit').innerHTML = '<i class="fas fa-plus"></i> Add stock item';
    var cancel = $('portal-inv-cancel'); if (cancel) cancel.hidden = true;
  }

  function saveInventoryItem(e) {
    e.preventDefault();
    var err = $('portal-inv-error');
    var ok = $('portal-inv-success');
    err.hidden = true; err.textContent = '';
    ok.hidden = true;
    var name = trim($('portal-inv-name').value);
    if (!name) { err.textContent = 'Product name is required.'; err.hidden = false; return; }
    function num(id) { var v = $(id).value; return v === '' ? null : parseFloat(v); }
    var row = {
      product_name: name,
      category: trim($('portal-inv-category').value) || null,
      supplier: trim($('portal-inv-supplier').value) || null,
      supplier_sku: trim($('portal-inv-sku').value) || null,
      cost: num('portal-inv-cost'),
      retail_price: num('portal-inv-retail'),
      stock_qty: parseInt($('portal-inv-qty').value, 10) || 0,
      reorder_point: parseInt($('portal-inv-reorder').value, 10),
      location: $('portal-inv-location').value
    };
    if (isNaN(row.reorder_point)) row.reorder_point = 5;
    var id = $('portal-inv-id').value;
    var btn = $('portal-inv-submit');
    btn.disabled = true;
    withClient(function (client) {
      if (!client) { btn.disabled = false; err.textContent = 'Couldn’t reach the database.'; err.hidden = false; return; }
      var q = id ? client.from('inventory').update(row).eq('id', id) : client.from('inventory').insert(row);
      q.then(function (res) {
        btn.disabled = false;
        if (res.error) { err.textContent = 'Couldn’t save that item: ' + res.error.message; err.hidden = false; return; }
        resetInventoryForm();
        ok.hidden = false;
        state.loaded.inventory = false;
        loadInventory(true);
      }).catch(function () { btn.disabled = false; err.textContent = 'Couldn’t save that item. Try again.'; err.hidden = false; });
    });
  }

  function renderPurchaseOrders(rows) {
    var list = $('portal-po-list');
    if (!rows.length) { emptyState(list, 'No purchase orders yet.'); return; }
    list.innerHTML = rows.map(function (po) {
      return '<article class="portal-card">' +
        '<div class="portal-card-top"><p class="portal-card-title">' + esc(po.supplier || 'Supplier') + '</p>' + badge(po.status) + '</div>' +
        '<p class="portal-card-meta">Total cost: ' + esc(fmtMoney(po.total_cost)) +
        ' · Ordered: ' + esc(fmtDate(po.ordered_at)) + ' · Received: ' + esc(fmtDate(po.received_at)) + '</p>' +
        itemLines(po.items) +
        (trim(po.notes) ? '<p class="portal-card-meta">' + esc(po.notes) + '</p>' : '') +
        '</article>';
    }).join('');
  }

  function loadInventory(force) {
    var list = $('portal-inventory-list');
    if (!force) list.innerHTML = '<p class="portal-muted">Loading inventory&hellip;</p>';
    withClient(function (client) {
      if (!client) { listError(list, 'inventory'); listError($('portal-po-list'), 'purchase orders'); return; }
      client.from('inventory').select('*').order('product_name', { ascending: true })
        .then(function (res) {
          if (res.error) { listError(list, 'inventory'); return; }
          state.loaded.inventory = true;
          state.inventoryCache = res.data || [];
          renderInventory(state.inventoryCache);
        })
        .catch(function () { listError(list, 'inventory'); });
      client.from('purchase_orders').select('*').order('created_at', { ascending: false }).limit(100)
        .then(function (res) {
          if (res.error) { listError($('portal-po-list'), 'purchase orders'); return; }
          renderPurchaseOrders(res.data || []);
        })
        .catch(function () { listError($('portal-po-list'), 'purchase orders'); });
    });
  }

  /* ================= GLOBAL CLICK DELEGATION ================= */
  function initDelegation() {
    document.addEventListener('click', function (e) {
      var t = e.target;
      while (t && t !== document) {
        if (t.getAttribute) {
          var tid = t.getAttribute('data-view-ticket');
          if (tid) { openTicket(tid); return; }
          var aid = t.getAttribute('data-view-application');
          if (aid) { openApplication(aid); return; }
          var iid = t.getAttribute('data-view-investor');
          if (iid) { openInvestor(iid); return; }
          var bid = t.getAttribute('data-bday-save');
          if (bid) { saveBirthday(bid); return; }
        }
        t = t.parentNode;
      }
    });

    $('portal-ticket-filter').addEventListener('change', function () {
      state.loaded.tickets = false;
      loadTickets(true);
    });
    $('portal-cust-search').addEventListener('input', applyCustomerSearch);
    var invFilterEl = $('portal-inv-filter');
    if (invFilterEl) invFilterEl.addEventListener('change', function () { renderInventory(state.inventoryCache); });
    var invFormEl = $('portal-inv-form');
    if (invFormEl) invFormEl.addEventListener('submit', saveInventoryItem);
    var invCancelEl = $('portal-inv-cancel');
    if (invCancelEl) invCancelEl.addEventListener('click', resetInventoryForm);
  }

  /* ================= INIT ================= */
  function init() {
    initTabs();
    initExtraTabs();
    initDrawer();
    initDelegation();
    initAuth();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

  /* ================= GREETING + CLOCK ================= */
  function tickClock() {
    var g = $('portal-greeting'), c = $('portal-clock'), d = $('portal-date');
    var now = new Date(), hr = now.getHours();
    var word = hr >= 5 && hr < 12 ? 'Good morning' : hr >= 12 && hr < 17 ? 'Good afternoon' : hr >= 17 && hr < 22 ? 'Good evening' : 'Good night';
    if (g) g.textContent = word;
    if (c) c.textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (d) d.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  }

  /* ================= EXTRA TABS (timeclock / links / square) ================= */
  var EXTRA_LOADERS = { timeclock: loadTimeClock, checkin: loadCheckinCustomers };
  var extraLoaded = {};
  function showExtraPanel(name) {
    document.querySelectorAll('.portal-panel').forEach(function (pn) { pn.hidden = true; });
    var panel = $('portal-panel-' + name);
    if (panel) panel.hidden = false;
    document.querySelectorAll('.portal-tab').forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-tab') === name); });
    closeDrawer();
    var nav = $('portal-nav'); if (nav) nav.classList.remove('open');
    if (!extraLoaded[name] && EXTRA_LOADERS[name]) { extraLoaded[name] = true; EXTRA_LOADERS[name](false); }
  }
  function initExtraTabs() {
    ['timeclock', 'links', 'square', 'checkin'].forEach(function (name) {
      var tab = $('portal-tab-' + name);
      if (tab) tab.addEventListener('click', function () { showExtraPanel(name); });
    });
    var toggle = $('portal-nav-toggle');
    if (toggle) toggle.addEventListener('click', function () { var nav = $('portal-nav'); if (nav) nav.classList.toggle('open'); });
    initCheckin();
    var rb = $('tc-test-receipt'); if (rb) rb.addEventListener('click', function () { printTest(false); });
    var lb = $('tc-test-label'); if (lb) lb.addEventListener('click', function () { printTest(true); });
    var act = $('tc-action'); if (act) act.addEventListener('click', toggleClock);
  }
  function printTest(isLabel) {
    var w = window.open('', '_blank', 'width=420,height=560');
    if (!w) return;
    var inner = isLabel
      ? '<div style="font-family:monospace;width:2.25in;height:1.25in;border:1px solid #000;padding:4px;font-size:10px">ATRG TEST LABEL<br>Part: TEST-000<br>Not a real part</div>'
      : '<div style="font-family:monospace;width:3in;padding:8px"><h3 style="margin:0">Austin\'s Tech Repair Group</h3><p>TEST RECEIPT &mdash; not a real sale<br>(937) 280-6243<br>austinstechrepairgroup.com</p><p>Printer connection OK &#10003;</p></div>';
    w.document.write('<html><head><title>Test print</title></head><body>' + inner + '<script>window.print();<\/script></body></html>');
    w.document.close();
  }

  /* ================= TIME CLOCK ================= */
  var tcOpenEntry = null;
  function isManager() { return /owner|admin|manager/i.test((state.profile && state.profile.role) || ''); }
  function fmtHours(ms) { return (ms / 3600000).toFixed(2) + ' hrs'; }
  function weekStart() { var d = new Date(); d.setHours(0, 0, 0, 0); var day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d; }
  function loadTimeClock() {
    withClient(function (client) {
      if (!client || !state.user) return;
      client.from('time_entries').select('*').eq('employee_id', state.user.id).order('clock_in', { ascending: false }).limit(60)
        .then(function (res) {
          var status = $('tc-status'), btn = $('tc-action'), list = $('tc-my-list');
          if (res.error) { if (status) status.textContent = 'Time clock is not set up yet.'; if (list) list.innerHTML = ''; return; }
          var rows = res.data || [];
          tcOpenEntry = null;
          rows.forEach(function (r) { if (!r.clock_out) tcOpenEntry = r; });
          var ws = weekStart(), total = 0;
          var html = rows.filter(function (r) { return new Date(r.clock_in) >= ws; }).map(function (r) {
            var ci = new Date(r.clock_in), co = r.clock_out ? new Date(r.clock_out) : null;
            if (co) total += (co - ci);
            return '<div class="tc-row"><span>' + esc(ci.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })) + ' &middot; ' + esc(ci.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) + ' &rarr; ' + (co ? esc(co.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) + ' (' + fmtHours(co - ci) + ')' : '<strong>on the clock</strong>') + '</span>' + (r.approved ? '<span class="tc-badge">Approved</span>' : '<span class="tc-badge tc-badge-pending">Pending</span>') + '</div>';
          }).join('');
          if (list) list.innerHTML = (html || '<p class="portal-muted">No time logged this week yet.</p>') + '<p class="tc-total">Closed time this week: <strong>' + fmtHours(total) + '</strong></p>';
          if (tcOpenEntry) {
            if (status) status.innerHTML = 'You are <strong>on the clock</strong> since ' + esc(new Date(tcOpenEntry.clock_in).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) + '.';
            if (btn) btn.textContent = 'Clock Out';
          } else {
            if (status) status.textContent = 'You are off the clock.';
            if (btn) btn.textContent = 'Clock In';
          }
          loadBirthdays(client);
          if (isManager()) loadTimeAdmin(client);
        });
    });
  }
  function loadTimeAdmin(client) {
    var wrap = $('tc-admin-wrap'), list = $('tc-admin-list');
    if (!wrap || !list) return;
    wrap.hidden = false;
    client.from('time_entries').select('*').order('clock_in', { ascending: false }).limit(100).then(function (res) {
      if (res.error) { list.innerHTML = '<p class="portal-muted">Team time unavailable.</p>'; return; }
      var rows = res.data || [];
      var onNow = rows.filter(function (r) { return !r.clock_out; });
      var pending = rows.filter(function (r) { return r.clock_out && !r.approved; });
      var html = '';
      html += '<p class="tc-sub">On the clock now: ' + (onNow.length ? onNow.map(function (r) { return esc(r.employee_name || 'Tech'); }).join(', ') : 'nobody') + '</p>';
      if (!pending.length) html += '<p class="portal-muted">No hours waiting for approval.</p>';
      html += pending.map(function (r) {
        var ci = new Date(r.clock_in), co = new Date(r.clock_out);
        return '<div class="tc-row"><span><strong>' + esc(r.employee_name || 'Tech') + '</strong> &middot; ' + esc(ci.toLocaleDateString([], { month: 'short', day: 'numeric' })) + ' &middot; ' + fmtHours(co - ci) + '</span><button class="portal-btn portal-btn-primary portal-btn-sm" type="button" data-approve="' + r.id + '">Approve</button></div>';
      }).join('');
      list.innerHTML = html;
      list.querySelectorAll('[data-approve]').forEach(function (b) {
        b.addEventListener('click', function () {
          client.from('time_entries').update({ approved: true }).eq('id', b.getAttribute('data-approve')).then(function () { loadTimeAdmin(client); loadTimeClock(); });
        });
      });
    });
  }
  function toggleClock() {
    withClient(function (client) {
      if (!client || !state.user) return;
      var btn = $('tc-action'); if (btn) btn.disabled = true;
      var done = function () { if (btn) btn.disabled = false; extraLoaded.timeclock = true; loadTimeClock(); };
      if (tcOpenEntry) {
        client.from('time_entries').update({ clock_out: new Date().toISOString() }).eq('id', tcOpenEntry.id).then(done).catch(done);
      } else {
        client.from('time_entries').insert({ employee_id: state.user.id, employee_name: (state.profile && state.profile.name) || state.user.email }).then(done).catch(done);
      }
    });
  }

  /* ================= CHECK-IN / TRIAGE ================= */
  var ciCustomerId = null, ciCustomersCache = null;
  function loadCheckinCustomers() {
    withClient(function (client) {
      if (!client) return;
      client.from('customers').select('id, name, email, phone').order('name', { ascending: true }).limit(500)
        .then(function (res) { if (!res.error) ciCustomersCache = res.data || []; });
    });
  }
  function initCheckin() {
    var search = $('ci-search');
    if (!search || search.getAttribute('data-wired')) return;
    search.setAttribute('data-wired', '1');
    search.addEventListener('input', function () {
      var box = $('ci-results'); if (!box) return;
      var term = search.value.trim().toLowerCase();
      if (!term || !ciCustomersCache) { box.innerHTML = ''; return; }
      var hits = ciCustomersCache.filter(function (cu) { return (cu.name || '').toLowerCase().indexOf(term) !== -1; }).slice(0, 6);
      box.innerHTML = hits.map(function (cu) {
        return '<button type="button" class="ci-result" data-ci-pick="' + cu.id + '"><strong>' + esc(cu.name || '') + '</strong><span>' + esc(cu.phone || '') + (cu.email ? ' &middot; ' + esc(cu.email) : '') + '</span></button>';
      }).join('');
      box.querySelectorAll('[data-ci-pick]').forEach(function (b) {
        b.addEventListener('click', function () {
          var cu = ciCustomersCache.filter(function (x) { return String(x.id) === b.getAttribute('data-ci-pick'); })[0];
          if (!cu) return;
          ciCustomerId = cu.id;
          $('ci-name').value = cu.name || ''; $('ci-phone').value = cu.phone || ''; $('ci-email').value = cu.email || '';
          box.innerHTML = '<p class="portal-muted portal-small">Customer linked &mdash; their account will see this repair.</p>';
        });
      });
    });
    document.querySelectorAll('#ci-reasons .ci-chip').forEach(function (chip) {
      chip.addEventListener('click', function () { chip.classList.toggle('on'); });
    });
    $('ci-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('ci-error'); err.hidden = true;
      var reasons = Array.prototype.map.call(document.querySelectorAll('#ci-reasons .ci-chip.on'), function (c) { return c.textContent.trim(); }).join(', ');
      var row = {
        customer_id: ciCustomerId || null,
        customer_name: $('ci-name').value.trim(),
        customer_phone: $('ci-phone').value.trim(),
        customer_email: $('ci-email').value.trim() || null,
        device_type: $('ci-type').value,
        brand: $('ci-brand').value.trim() || null,
        model: $('ci-model').value.trim() || null,
        serial_imei: $('ci-serial').value.trim() || null,
        issue_reason: reasons || null,
        issue: $('ci-notes').value.trim(),
        triage_volts: $('ci-volts').value.trim() || null,
        triage_amps: $('ci-amps').value.trim() || null,
        power_on: $('ci-power').value || null,
        backed_up: $('ci-backup').value || null,
        prior_repair: $('ci-prior').value || null,
        warranty_status: $('ci-warranty').value || null,
        source: 'check-in',
        status: 'Waiting',
        terms_accepted: true,
        dispatch_acknowledged: true,
        work_auth_accepted: false,
        marketing_opt_in: false
      };
      if (!row.customer_name || !row.customer_phone || !row.issue) {
        err.textContent = 'Name, phone, and check-in notes are required.'; err.hidden = false; return;
      }
      var btn = $('ci-submit'); btn.disabled = true;
      withClient(function (client) {
        if (!client) { btn.disabled = false; return; }
        client.from('tickets').insert(row).select('id').single().then(function (res) {
          btn.disabled = false;
          if (res.error) { err.textContent = 'Could not create the ticket — try again.'; err.hidden = false; return; }
          $('ci-form').reset(); ciCustomerId = null;
          document.querySelectorAll('#ci-reasons .ci-chip.on').forEach(function (c) { c.classList.remove('on'); });
          state.loaded.tickets = false;
          activateTab('tickets');
          loadTickets(true);
          if (res.data && res.data.id) setTimeout(function () { openTicket(res.data.id); }, 450);
        }).catch(function () { btn.disabled = false; err.textContent = 'Could not create the ticket — try again.'; err.hidden = false; });
      });
    });
  }

  /* ================= BIRTHDAYS (team) ================= */
  function loadBirthdays(client) {
    var box = $('tc-birthdays'); if (!box) return;
    client.from('employee_profiles').select('id, name, birthday').then(function (res) {
      if (res.error || !res.data) { box.innerHTML = '<p class="portal-muted">Birthdays are not set up yet.</p>'; return; }
      var mine = res.data.filter(function (x) { return state.user && x.id === state.user.id; })[0];
      var input = $('tc-birthday');
      if (mine && input && mine.birthday) input.value = mine.birthday;
      var now = new Date(); now.setHours(0, 0, 0, 0);
      var ups = res.data.filter(function (x) { return x.birthday; }).map(function (x) {
        var parts = String(x.birthday).split('-');
        var d = new Date(now.getFullYear(), Number(parts[1]) - 1, Number(parts[2]));
        if (d < now) d.setFullYear(now.getFullYear() + 1);
        return { name: x.name || 'Teammate', date: d, days: Math.round((d - now) / 86400000) };
      }).filter(function (x) { return x.days <= 60; }).sort(function (a, b) { return a.days - b.days; });
      box.innerHTML = ups.length ? ups.map(function (x) {
        return '<div class="tc-row"><span><i class="fas fa-cake-candles"></i> <strong>' + esc(x.name) + '</strong></span><span>' + esc(x.date.toLocaleDateString([], { month: 'long', day: 'numeric' })) + (x.days === 0 ? ' &mdash; <strong>today!</strong>' : ' &middot; in ' + x.days + ' day' + (x.days === 1 ? '' : 's')) + '</span></div>';
      }).join('') : '<p class="portal-muted">No team birthdays in the next 60 days.</p>';
    });
    var save = $('tc-birthday-save');
    if (save && !save.getAttribute('data-wired')) {
      save.setAttribute('data-wired', '1');
      save.addEventListener('click', function () {
        var val = $('tc-birthday').value || null;
        var msg = $('tc-birthday-msg');
        if (msg) msg.textContent = 'Saving\u2026';
        client.from('employee_profiles').update({ birthday: val }).eq('id', state.user.id).then(function (res2) {
          if (!msg) return;
          msg.textContent = res2.error ? 'Couldn\'t save \u2014 try again.' : 'Saved. Your day is on the board.';
          if (!res2.error) loadBirthdays(client);
        });
      });
    }
  }
