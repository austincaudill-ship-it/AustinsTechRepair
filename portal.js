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
  /* PORTAL_SIGNED_RECEIPT_2026_10_30: the receipt's "View your
   * signed Repair Authorization" link uses a one-year signed URL so
   * the link on a printed/emailed receipt keeps working long after
   * the job is done. The link does NOT point at storage directly —
   * Supabase serves these HTML documents as raw text, so the receipt
   * links through the site's view-doc.html viewer page instead (see
   * printReceipt and view-doc.html). */
  var RECEIPT_AUTH_URL_SECONDS = 365 * 24 * 60 * 60;
  var DOC_VIEWER_URL = 'https://austinstechrepairgroup.com/view-doc.html?u=';

  /* PORTAL_POINTS_EARN_2026_10_30: loyalty points earning rate —
   * customers earn POINTS_PER_DOLLAR points per whole dollar of a
   * ticket's total when the job is marked Job Complete (see
   * awardPointsOnComplete). pointsMultiplierFor() below is the ATR One
   * boost hook: it returns 1 today, and a member multiplier later is a
   * one-line change inside that function only. */
  var POINTS_PER_DOLLAR = 1;

  /* Ticket statuses: EXACT values from the tickets.status check
   * constraint (supabase-phase2-tickets.sql). Do not add values here
   * without updating the database constraint first. */
  var TICKET_STATUSES = ['Awaiting Estimate', 'Awaiting Diagnostics', 'Awaiting Customer Response', 'Awaiting Parts', 'En Route to Customer', 'In Progress', 'Quality Control', 'Ready', 'Job Complete'];
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

  /* PORTAL_JOB_DATE_2026_10_30: job_date is a date-only value
   * ('YYYY-MM-DD'). Parse it as a LOCAL date — new Date('2026-06-30')
   * is UTC midnight and would display as Jun 29 in Ohio. Returns ''
   * when there is no job date so callers can fall back. */
  function fmtJobDate(v) {
    if (!v) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
    if (!m) return fmtDate(v);
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (isNaN(d.getTime())) return '';
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
      awaitingdiagnostics: 'portal-st-waiting', awaitingestimate: 'portal-st-waiting',
      awaitingcustomerresponse: 'portal-st-contacted', awaitingparts: 'portal-st-waitingparts',
      enroutetocustomer: 'portal-st-inprogress', qualitycontrol: 'portal-st-reviewed',
      ready: 'portal-st-ready', jobcomplete: 'portal-st-done',
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
    loaded: { tickets: false, applications: false, investors: false, feedback: false, customers: false, inventory: false, financials: false },
    customersCache: [], inventoryCache: []
  };

  function setCount(id, n) {
    var el = $(id);
    if (!el) return;
    if (n > 0) { el.textContent = String(n); el.hidden = false; }
    else { el.hidden = true; el.textContent = ''; }
  }

  /* ================= AUTH ================= */
  var resetSuccessMessage = null; function isRecoveryHash() { var h = window.location.hash || ""; var q = window.location.search || ""; return h.indexOf("type=recovery") !== -1 || q.indexOf("type=recovery") !== -1; } function showResetView(msg) { var dv = $("portal-dash-view"); if (dv) { dv.hidden = true; } var lv = $("portal-login-view"); if (lv) { lv.hidden = false; } var rf = $("portal-login-form"); if (rf) { rf.hidden = true; } var rv = $("portal-reset-view"); if (rv) { rv.hidden = false; } var re = $("portal-reset-error"); if (re) { if (msg) { re.textContent = msg; re.hidden = false; } else { re.hidden = true; re.textContent = ""; } } var fm2 = $("portal-forgot-msg"); if (fm2) { fm2.hidden = true; } } function initPasswordReset() { withClient(function (client) { if (!client) { return; } var fb = $("portal-forgot-btn"); if (fb) { fb.addEventListener("click", function () { var em = $("portal-login-email"); var email = em ? trim(em.value) : ""; var mg = $("portal-forgot-msg"); if (!email) { if (mg) { mg.textContent = "Enter your employee email first"; mg.hidden = false; } return; } client.auth.resetPasswordForEmail(email, { redirectTo: "https://austinstechrepairgroup.com/portal.html" }).then(function (res) { if (mg) { if (res.error) { mg.textContent = res.error.message || "Could not send the reset email. Try again."; } else { mg.textContent = "Check your email for a password reset link"; } mg.hidden = false; } }).catch(function (err) { if (mg) { mg.textContent = (err && err.message) || "Could not send the reset email. Try again."; mg.hidden = false; } }); }); } /* PORTAL_DEADEND_2026_10_30: "Back to sign in" exits the recovery view and restores the normal sign-in form. */ var bb = $("portal-reset-back-btn"); if (bb) { bb.addEventListener("click", function () { showLogin(null); }); } var rb = $("portal-reset-btn"); if (rb) { rb.addEventListener("click", function () { var pwEl = $("portal-reset-password"); var cfEl = $("portal-reset-confirm"); var er = $("portal-reset-error"); var pw = pwEl ? pwEl.value : ""; var cf = cfEl ? cfEl.value : ""; if (er) { er.hidden = true; er.textContent = ""; } if (pw !== cf) { if (er) { er.textContent = "Passwords do not match"; er.hidden = false; } return; } if (pw.length < 8) { if (er) { er.textContent = "Password must be at least 8 characters"; er.hidden = false; } return; } client.auth.updateUser({ password: pw }).then(function (res) { if (res.error) { if (er) { er.textContent = res.error.message || "Could not update the password. Try again."; er.hidden = false; } return; } var doneMsg = "Password updated. Sign in with your new password."; resetSuccessMessage = doneMsg; client.auth.signOut().then(function () { showLogin(doneMsg); }); }).catch(function (err) { if (er) { er.textContent = (err && err.message) || "Could not update the password. Try again."; er.hidden = false; } }); }); } }); } function showLogin(errorMsg) {
    $('portal-dash-view').hidden = true;
    $('portal-login-view').hidden = false;
    var _rf = $("portal-login-form"); if (_rf) { _rf.hidden = false; }
    var _rv = $("portal-reset-view"); if (_rv) { _rv.hidden = true; }
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
    /* PORTAL_TAB_MEMORY_2026_10_30: reopen on the tab Austin last used.
     * Clicking the saved tab's button replays exactly what a tap does,
     * whichever script handles that tab. No saved tab (or a stale one
     * with no matching button) keeps the old behavior: Repair Queue. */
    var startTab = savedTab();
    var startBtn = startTab ? $('portal-tab-' + startTab) : null;
    if (startBtn && startTab !== 'tickets') { startBtn.click(); }
    else { activateTab('tickets'); }
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

      var _lv = $("portal-login-view"); if (_lv) { _lv.hidden = true; }
    client.auth.getSession().then(function (res) {
        var session = res.data && res.data.session;
        if (session && session.user && isRecoveryHash()) { showResetView(null); } else if (session && session.user) { enterIfEmployee(client, session.user); }
        else { showLogin(null); }
      }).catch(function () { showLogin(null); });

          client.auth.onAuthStateChange(function (event) {
      if (event === 'PASSWORD_RECOVERY') { showResetView(null); return; }
      if (event === 'SIGNED_OUT') {
        state.user = null; state.profile = null;
        if (resetSuccessMessage) { showLogin(resetSuccessMessage); resetSuccessMessage = null; } else { showLogin(null); }
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
    documents: loadDocumentsTab, financials: loadFinancials,
  };

  /* PORTAL_TAB_MEMORY_2026_10_30: remember the last active tab across
   * refreshes (Austin's request, Oct 30, 2026). The name is saved
   * whenever a tab is activated — through activateTab, showExtraPanel,
   * or any nav-button click (the capture listener in initTabs also
   * covers the tabs whose handlers live in portal.html: Guides, New
   * Hires, Requests, Prices). localStorage only — loading or
   * refreshing the portal writes nothing to the database. */
  var TAB_KEY = 'atrg-portal-tab';
  function saveActiveTab(name) { try { window.localStorage.setItem(TAB_KEY, name); } catch (e) {} }
  function savedTab() { try { return window.localStorage.getItem(TAB_KEY) || ''; } catch (e) { return ''; } }

  function activateTab(name) {
    saveActiveTab(name);
    var nav = $('portal-nav'); if (nav) nav.classList.remove('open');
    var tabs = document.querySelectorAll('.portal-tab');
    tabs.forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-tab') === name); });
    ['tickets', 'applications', 'investors', 'feedback', 'customers', 'inventory', 'timeclock', 'links', 'square', 'checkin', 'requests', 'prices', 'documents', 'financials'].forEach(function (n) {
      $('portal-panel-' + n).hidden = n !== name;
    });
    closeDrawer();
    if (!state.loaded[name] && LOADERS[name]) LOADERS[name](false);
  }

  function initTabs() {
    document.querySelectorAll('.portal-tab').forEach(function (t) {
      t.addEventListener('click', function () { activateTab(t.getAttribute('data-tab')); });
    });
    /* PORTAL_TAB_MEMORY_2026_10_30: also record tabs whose own scripts
     * handle the click (portal.html sections), so the restore on load
     * works for every tab, not just the ones activateTab drives. */
    document.addEventListener('click', function (e) {
      var el = e.target;
      while (el && el !== document) {
        if (el.classList && el.classList.contains('portal-tab')) { saveActiveTab(el.getAttribute('data-tab')); return; }
        el = el.parentNode;
      }
    }, true);
    document.addEventListener('click', function (e) {
      var el = e.target;
      while (el && el !== document) {
        if (el.classList && el.classList.contains('portal-tab')) { var nv = $('portal-nav'); if (nv) nv.classList.remove('open'); return; }
        el = el.parentNode;
      }
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

  var QCLASS = { 'Awaiting Diagnostics': 'q-red', 'Awaiting Estimate': 'q-red', 'Awaiting Customer Response': 'q-yellow', 'Awaiting Parts': 'q-orange', 'En Route to Customer': 'q-yellow', 'In Progress': 'q-yellow', 'Quality Control': 'q-lime', 'Ready': 'q-green', 'Job Complete': 'q-done' };
  function renderTickets(rows) {
    var list = $('portal-ticket-list');
    if (!rows.length) { emptyState(list, 'No tickets match. New service requests from the website will show up here.'); return; }
    var posMap = {}, n = 0;
    for (var i = rows.length - 1; i >= 0; i--) { if (rows[i].status !== 'Job Complete') { n++; posMap[rows[i].id] = n; } }
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
      /* PORTAL_JOB_DATE_2026_10_30: the queue orders by job_date in the
       * same direction it used for created_at (newest first), with
       * created_at as the tiebreak — new jobs on top, old jobs sink to
       * the bottom on their own. If the job_date column is not live
       * yet, fall back to the previous created_at-only ordering so the
       * queue never breaks. */
      function done(res) {
        state.loaded.tickets = true;
        renderTickets(res.data || []);
        var open = (res.data || []).filter(function (t) { return t.status !== 'Job Complete'; }).length;
        setCount('portal-count-tickets', $('portal-ticket-filter').value === 'all' ? open : 0);
      }
      function run(useJobDate) {
        var q = client.from('tickets').select('*');
        if (useJobDate) q = q.order('job_date', { ascending: false });
        q = q.order('created_at', { ascending: false }).limit(200);
        if (filter !== 'all') q = q.eq('status', filter);
        q.then(function (res) {
          if (res.error) { if (useJobDate) { run(false); return; } listError(list, 'tickets'); return; }
          done(res);
        }).catch(function () { if (useJobDate) { run(false); return; } listError(list, 'tickets'); });
      }
      run(true);
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

    function fmtTimer(mins) {
    var m = Math.round(mins);
    var h = Math.floor(m / 60);
    var r = m % 60;
    return h ? (h + 'h ' + r + 'm') : (r + 'm');
  }
  function loadJobTimers(client, ticketId) {
    var totalEl = $('portal-timer-total'), listEl = $('portal-timer-list'), btn = $('portal-timer-btn');
    if (!totalEl || !listEl) return;
    client.from('job_timers').select('*').eq('ticket_id', ticketId).order('started_at', { ascending: true }).then(function (res) {
      if (res.error) { totalEl.textContent = 'Time on this job is unavailable right now.'; return; } var rows = res.data || [];
      var now = Date.now(), total = 0, running = null;
      rows.forEach(function (r) {
        var s = new Date(r.started_at).getTime();
        var e = r.stopped_at ? new Date(r.stopped_at).getTime() : now;
        total += Math.max(0, e - s) / 60000;
        if (!r.stopped_at) running = r;
      });
      totalEl.textContent = rows.length ? ('Time on this job: ' + fmtTimer(total) + (running ? ' (timer running)' : '')) : 'No time logged on this job yet.';
      if (btn) { btn.textContent = running ? 'Stop timer' : 'Start timer'; if (running) btn.setAttribute('data-running', running.id); else btn.removeAttribute('data-running'); }
      listEl.innerHTML = rows.map(function (r) {
        var s = new Date(r.started_at);
        var e = r.stopped_at ? new Date(r.stopped_at) : null;
        var mins = e ? Math.max(0, (e.getTime() - s.getTime()) / 60000) : Math.max(0, (now - s.getTime()) / 60000);
        return '<p class="portal-muted portal-small">' + esc(r.employee_name || 'Tech') + ' &middot; ' + esc(s.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) + ' &rarr; ' + (e ? esc(e.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) + ' (' + fmtTimer(mins) + ')' : '<strong>running</strong>') + '</p>';
      }).join('');
    }).catch(function () { totalEl.textContent = 'Time on this job is unavailable right now.'; });
  }
function loadTicketThread(client, ticketId) {
    client.from('messages').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true })
      .then(function (res) {
        renderTicketThread(res.error ? [] : (res.data || []));
      })
      .catch(function () { renderTicketThread([]); });
  }

  function renderRepairLog(notes) { var box = $("portal-repair-log-list"); if (!box) { return; } if (!notes || !notes.length) { box.innerHTML = "<p class=\"portal-muted\">No repair log updates yet.</p>"; return; } box.innerHTML = notes.map(function (n) { return "<div class=\"portal-msg portal-msg-tech\"><span class=\"portal-msg-meta\">" + esc(n.author || "Tech") + " · " + esc(fmtDateTime(n.created_at)) + "</span>" + esc(n.note) + "</div>"; }).join(""); } function loadRepairLog(client, ticketId) { client.from("ticket_notes").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: true }).then(function (res) { renderRepairLog(res.error ? [] : (res.data || [])); }).catch(function () { renderRepairLog([]); }); }

  /* PORTAL_DRAWER_DOCS_2026_10_30 (Austin, Oct 30, 2026): proof
   * photos on the Repair Log. A proof photo is an ordinary
   * ticket_documents row (doc_type 'other', the ticket-documents
   * bucket, the same 15 MB limit and storage-path shape as the
   * Documents attach flow) whose file_name starts with
   * REPAIR_LOG_PHOTO_PREFIX ("Repair log photo \u2014 " + the time it
   * was filed) \u2014 no schema change. It files on the ticket like
   * any document, so it also shows in the ticket's Documents list;
   * the Repair Log additionally renders a thumbnail strip of the
   * ticket's proof photos (signed URLs; tap opens the full photo
   * through viewDocument, same as a Documents View button). Upload
   * and filing errors show inline in the log section, never
   * silently. */
  var REPAIR_LOG_PHOTO_PREFIX = 'Repair log photo \u2014 ';
  function repairLogPhotoMsg(text) {
    var e = $('portal-repair-log-photo-error');
    if (!e) return;
    if (text) { e.textContent = text; e.hidden = false; }
    else { e.hidden = true; e.textContent = ''; }
  }
  function loadRepairLogPhotos(client, t) {
    var box = $('portal-repair-log-photos');
    if (!box) return;
    client.from('ticket_documents').select('*').eq('ticket_id', t.id).order('created_at', { ascending: true }).then(function (res) {
      if (res.error) { box.innerHTML = ''; return; }
      var photos = (res.data || []).filter(function (d) { return d.file_name && d.file_name.indexOf(REPAIR_LOG_PHOTO_PREFIX) === 0; });
      if (!photos.length) { box.innerHTML = ''; return; }
      box.innerHTML = '<p class="portal-muted portal-small" style="margin:0.7rem 0 0.35rem;">Proof photos</p>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;">' + photos.map(function (d) {
          return '<button class="portal-btn portal-btn-outline" type="button" data-rl-photo="' + esc(d.storage_path) + '" title="' + esc(d.file_name) + '" style="padding:3px;line-height:0;"><img alt="' + esc(d.file_name) + '" style="width:76px;height:76px;object-fit:cover;border-radius:8px;background:#eee;" /></button>';
        }).join('') + '</div>';
      var btns = box.querySelectorAll('[data-rl-photo]');
      for (var i = 0; i < btns.length; i++) {
        (function (btn) {
          var path = btn.getAttribute('data-rl-photo');
          client.storage.from(DOC_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS).then(function (r) {
            if (r.error || !r.data || !r.data.signedUrl) return;
            var img = btn.querySelector('img');
            if (img) img.src = r.data.signedUrl;
          }).catch(function () {});
          btn.addEventListener('click', function () { viewDocument(client, path); });
        })(btns[i]);
      }
    }).catch(function () { box.innerHTML = ''; });
  }
  function attachRepairLogPhoto(client, t, file) {
    repairLogPhotoMsg('');
    if (file.size > 15 * 1024 * 1024) { repairLogPhotoMsg('That file is over 15 MB \u2014 try a smaller photo.'); return; }
    var btn = $('portal-repair-log-photo-btn');
    var msg = $('portal-repair-log-photo-msg');
    if (btn) btn.disabled = true;
    if (msg) msg.textContent = 'Uploading photo\u2026';
    var path = t.id + '/other-' + docStamp() + '-' + safeFileName(file.name);
    client.storage.from(DOC_BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false }).then(function (up) {
      if (up.error) { if (btn) btn.disabled = false; if (msg) msg.textContent = ''; repairLogPhotoMsg('Upload failed \u2014 check the connection and try again.'); return; }
      var row = {
        ticket_id: t.id, doc_type: 'other', storage_path: path,
        file_name: REPAIR_LOG_PHOTO_PREFIX + fmtDateTime(new Date().toISOString()),
        signed_at: null
      };
      client.from('ticket_documents').insert(row).then(function (res) {
        if (btn) btn.disabled = false;
        if (msg) msg.textContent = '';
        if (res.error) { repairLogPhotoMsg('The photo uploaded but could not be filed on the ticket \u2014 try again.'); return; }
        loadRepairLogPhotos(client, t);
        loadDocuments(client, t);
      }).catch(function () { if (btn) btn.disabled = false; if (msg) msg.textContent = ''; repairLogPhotoMsg('The photo uploaded but could not be filed on the ticket \u2014 try again.'); });
    }).catch(function () { if (btn) btn.disabled = false; if (msg) msg.textContent = ''; repairLogPhotoMsg('Upload failed \u2014 check the connection and try again.'); });
  }
  function wireRepairLogPhotos(client, t) {
    var btn = $('portal-repair-log-photo-btn');
    var input = $('portal-repair-log-photo-file');
    if (btn && input) btn.addEventListener('click', function () { input.click(); });
    if (input) input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      input.value = '';
      if (f) attachRepairLogPhoto(client, t, f);
    });
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
        var gateBanner = t.status === 'Awaiting Parts'
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
            ['House-call fee ack.', fmtBool(t.dispatch_acknowledged)],
            ['Work authorized', fmtBool(t.work_auth_accepted)],
            ['Marketing opt-in', fmtBool(t.marketing_opt_in)],
            ['Source', valOrDash(t.source)],
            ['Customer account', t.customer_id ? esc(t.customer_id) : 'Web submission — no account'],
            ['Received', esc(fmtJobDate(t.job_date) || fmtDateTime(t.created_at))],
            ['Last updated', esc(fmtDateTime(t.updated_at))]
          ]) +
          '<div class="portal-drawer-section"><h3>Edit details</h3>' +
          '<p class="portal-muted portal-small">Update the triage and job details here. Save, and the Ticket details above refresh.</p>' +
          '<div class="portal-field"><label for="p2-edit-jobdate">Job date</label><input type="date" id="p2-edit-jobdate" value="' + esc(t.job_date || String(t.created_at || '').slice(0, 10)) + '" /></div>' +
          '<div class="portal-field"><label for="p2-edit-issue">Issue</label><textarea id="p2-edit-issue" rows="2">' + esc(t.issue || '') + '</textarea></div>' +
          '<div class="portal-field"><label for="p2-edit-address">Service address</label><input type="text" id="p2-edit-address" value="' + esc(t.service_address || '') + '" /></div>' +
          '<div class="portal-field"><label for="p2-edit-serial">Serial / IMEI</label><input type="text" id="p2-edit-serial" value="' + esc(t.serial_imei || '') + '" /></div>' +
          '<div class="portal-field"><label for="p2-edit-reason">Reason</label><input type="text" id="p2-edit-reason" value="' + esc(t.issue_reason || '') + '" /></div>' +
          '<div class="p2-form-row"><div class="portal-field"><label for="p2-edit-volts">Voltage (V)</label><input type="text" id="p2-edit-volts" value="' + esc(t.triage_volts || '') + '" /></div>' +
          '<div class="portal-field"><label for="p2-edit-amps">Draw (A)</label><input type="text" id="p2-edit-amps" value="' + esc(t.triage_amps || '') + '" /></div></div>' +
          '<div class="p2-form-row"><div class="portal-field"><label for="p2-edit-power">Powers on?</label><select id="p2-edit-power"><option value="">Not checked</option><option value="Yes"' + (t.power_on === 'Yes' ? ' selected' : '') + '>Yes</option><option value="No"' + (t.power_on === 'No' ? ' selected' : '') + '>No</option></select></div>' +
          '<div class="portal-field"><label for="p2-edit-backup">Backed up?</label><select id="p2-edit-backup"><option value="">Unknown</option><option value="Yes"' + (t.backed_up === 'Yes' ? ' selected' : '') + '>Yes</option><option value="No"' + (t.backed_up === 'No' ? ' selected' : '') + '>No</option></select></div>' +
          '<div class="portal-field"><label for="p2-edit-prior">Repaired before?</label><select id="p2-edit-prior"><option value="">Unknown</option><option value="Yes"' + (t.prior_repair === 'Yes' ? ' selected' : '') + '>Yes</option><option value="No"' + (t.prior_repair === 'No' ? ' selected' : '') + '>No</option></select></div></div>' +
          '<div class="portal-field"><label for="p2-edit-warranty">Under manufacturer warranty?</label><select id="p2-edit-warranty"><option value="">Unknown</option><option value="Yes &mdash; customer told our work may void it"' + (t.warranty_status && t.warranty_status.indexOf('Yes') === 0 ? ' selected' : '') + '>Yes &mdash; customer told our work may void it</option><option value="No"' + (t.warranty_status === 'No' ? ' selected' : '') + '>No</option></select></div>' +
          '<div class="p2-form-row"><div class="portal-field"><label for="p2-edit-terms">Terms accepted</label><select id="p2-edit-terms"><option value="true"' + (t.terms_accepted ? ' selected' : '') + '>Yes</option><option value="false"' + (!t.terms_accepted ? ' selected' : '') + '>No</option></select></div>' +
          '<div class="portal-field"><label for="p2-edit-dispatch">House-call fee acknowledged</label><select id="p2-edit-dispatch"><option value="true"' + (t.dispatch_acknowledged ? ' selected' : '') + '>Yes</option><option value="false"' + (!t.dispatch_acknowledged ? ' selected' : '') + '>No</option></select></div></div>' +
          '<div class="p2-form-row"><div class="portal-field"><label for="p2-edit-workauth">Work authorized</label><select id="p2-edit-workauth"><option value="true"' + (t.work_auth_accepted ? ' selected' : '') + '>Yes</option><option value="false"' + (!t.work_auth_accepted ? ' selected' : '') + '>No</option></select></div>' +
          '<div class="portal-field"><label for="p2-edit-marketing">Marketing opt-in</label><select id="p2-edit-marketing"><option value="true"' + (t.marketing_opt_in ? ' selected' : '') + '>Yes</option><option value="false"' + (!t.marketing_opt_in ? ' selected' : '') + '>No</option></select></div></div>' +
          '<button class="portal-btn portal-btn-primary portal-btn-sm" type="button" id="p2-edit-save">Save details</button> ' +
          '<span class="portal-muted portal-small" id="p2-edit-msg"></span></div>' +
          '<div class="portal-drawer-section p2-actions"><button class="portal-btn portal-btn-primary portal-btn-sm" type="button" id="p2-receipt-btn"><i class="fas fa-receipt"></i> Print receipt</button>' +
          '<button class="portal-btn p2-btn-danger portal-btn-sm" type="button" id="p2-delete-btn"><i class="fas fa-trash"></i> Delete ticket</button>' +
          '<span class="portal-muted portal-small" id="p2-action-msg"></span>' +
          '<div id="p2-delete-confirm" hidden><p class="portal-error">Permanently delete this ticket? Its charges and messages go with it. Part orders stay on file but detach from the ticket. This cannot be undone.</p>' +
          '<button class="portal-btn p2-btn-danger portal-btn-sm" type="button" id="p2-delete-yes">Yes, delete it</button> ' +
          '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" id="p2-delete-no">Keep ticket</button></div></div>' +
          '<div class="portal-drawer-section"><h3>Documents</h3>' +
          '<div id="p4-docs"><p class="portal-muted">Loading documents&hellip;</p></div>' +
          '<div class="p2-actions"><button class="portal-btn portal-btn-primary portal-btn-sm" type="button" id="p4-sign-btn"><i class="fas fa-pen-nib"></i> Sign repair authorization</button>' +
          '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" id="p4-media-btn"><i class="fas fa-camera"></i> Sign media release</button>' +
          '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" id="p4-attach-btn"><i class="fas fa-paperclip"></i> Attach document</button>' +
          '<select id="p4-attach-type" aria-label="Attach as document type" style="padding:0.4rem;border:2px solid var(--line, #d8cbb6);border-radius:8px;background:var(--bg, #fff);color:var(--ink, #2c231a);"><option value="receipt">Receipt</option><option value="repair_authorization">Signed authorization</option><option value="other">Other</option></select>' +
          '<input type="file" id="p4-attach-file" accept="image/*,application/pdf" hidden />' +
          '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" id="p4-existing-btn"><i class="fas fa-link"></i> Attach an existing document</button></div>' +
          '<div class="p2-form" id="p4-existing-picker" hidden>' +
          '<div id="p4-existing-list"><p class="portal-muted portal-small">Loading documents&hellip;</p></div></div>' +
          '<p class="portal-muted portal-small">Documents file themselves on this ticket. Signing the repair authorization here, or attaching one as a signed authorization, also marks Terms accepted and Work authorized on the ticket. The media release is separate: sign it only when the customer agrees to photos or clips of the device and the repair work.</p>' +
          '<p class="portal-error" id="p4-doc-msg" hidden></p></div>' +
          /* PORTAL_DRAWER_DOCS_2026_10_30: the Repair Log section
           * renders HERE, high in the drawer (right after Documents,
           * before ATR One and Charges) — it used to be appended at
           * the very bottom of the drawer. Log markup is unchanged;
           * the proof-photo strip and Attach a photo control at the
           * end of the section are new (same change). */
          '<div class="portal-drawer-section"><h3>Repair log</h3>' +
          '<p class="portal-muted portal-small">Internal tech documentation for this repair, not shown to the customer.</p>' +
          (t.status === 'In Progress' ? '<p class="portal-muted"><strong>This repair is in progress. Please log what is happening here.</strong></p>' : '') +
          '<div class="portal-thread" id="portal-repair-log-list"><p class="portal-muted">Loading repair log&hellip;</p></div>' +
          '<form id="portal-repair-log-form"><div class="portal-field"><label for="portal-repair-log-input">What is happening with this repair?</label></div>' +
          '<div class="portal-note-row"><textarea id="portal-repair-log-input" placeholder="What is happening with this repair?" maxlength="2000" aria-label="What is happening with this repair?"></textarea>' +
          '<button class="portal-btn portal-btn-primary" type="submit">Save update</button></div>' +
          '<p class="portal-error" id="portal-repair-log-error" hidden></p></form>' +
          '<div id="portal-repair-log-photos"></div>' +
          '<div class="p2-actions"><button class="portal-btn portal-btn-outline portal-btn-sm" type="button" id="portal-repair-log-photo-btn"><i class="fas fa-camera"></i> Attach a photo</button>' +
          '<span class="portal-muted portal-small" id="portal-repair-log-photo-msg"></span></div>' +
          '<input type="file" id="portal-repair-log-photo-file" accept="image/*" hidden />' +
          '<p class="portal-error" id="portal-repair-log-photo-error" hidden></p></div>' +
          '<div class="portal-drawer-section"><h3>ATR One</h3>' +
          '<div id="p5-atrone"><p class="portal-muted">Loading membership&hellip;</p></div>' +
          '<p class="portal-error" id="p5-atr-msg" hidden></p></div>' +
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
          '<div class="p2-actions"><button class="portal-btn portal-btn-outline portal-btn-sm" type="button" id="p2-scan-btn"><i class="fas fa-barcode"></i> Scan barcode</button>' +
          '<span class="portal-muted portal-small" id="p2-scan-msg"></span></div>' +
          '<div id="p2-scan-box" hidden><video id="p2-scan-video" playsinline muted style="width:100%;max-width:420px;border-radius:12px;background:#000"></video>' +
          '<div class="p2-actions"><button class="portal-btn portal-btn-outline portal-btn-sm" type="button" id="p2-scan-stop">Stop camera</button>' +
          '<input id="p2-scan-manual" type="text" placeholder="Or type the code" aria-label="Barcode code" />' +
          '<button class="portal-btn portal-btn-primary portal-btn-sm" type="button" id="p2-scan-use">Use code</button></div>' +
          '<p class="portal-muted portal-small" id="p2-scan-status">Point the camera at the barcode on the Sentrix packaging. If the camera cannot read it, type the code instead.</p></div>' +
          '<form id="p2-part-form" class="p2-form">' +
          '<select id="p2-part-stock" aria-label="Pull a part from stock"><option value="">Loading stock\u2026</option></select>' +
          '<input id="p2-part-desc" type="text" placeholder="Part description (e.g. iPhone 13 Pro Max battery — OEM)" maxlength="200" aria-label="Part description" />' +
          '<div class="p2-form-row"><input id="p2-part-supplier" type="text" placeholder="Supplier" maxlength="80" aria-label="Supplier" />' +
          '<input id="p2-part-sku" type="text" placeholder="Supplier SKU" maxlength="80" aria-label="Supplier SKU" /></div>' +
          '<div class="p2-form-row"><input id="p2-part-cost" type="number" step="0.01" min="0" placeholder="Our cost $" aria-label="Our cost" />' +
          '<input id="p2-part-retail" type="number" step="0.01" min="0" placeholder="Customer price $" aria-label="Customer price" />' +
          '<input id="p2-part-qty" type="number" step="1" min="1" value="1" aria-label="Quantity" /></div>' +
          '<div class="p2-form-row"><select id="p2-part-carrier" aria-label="Carrier"><option value="">Carrier</option><option value="FedEx">FedEx</option><option value="UPS">UPS</option><option value="USPS">USPS</option><option value="Other">Other</option></select>' +
          '<input id="p2-part-tracking" type="text" placeholder="Tracking number" maxlength="80" aria-label="Tracking number" />' +
          '<input id="p2-part-ordernum" type="text" placeholder="Order number" maxlength="80" aria-label="Order number" /></div>' +
          '<label class="p2-check"><input type="checkbox" id="p2-part-addcharge" checked /> Add the customer price to Charges as a part line</label>' +
          '<button class="portal-btn portal-btn-primary portal-btn-sm" type="submit">Add part order</button>' +
          '<p class="portal-error" id="p2-part-error" hidden></p></form></div>' +
          '<div class="portal-drawer-section"><h3>Status</h3>' +
          '<div class="portal-status-row"><select id="portal-ticket-status" aria-label="Ticket status">' +
          statusOptions(TICKET_STATUSES, t.status) + '</select>' +
          '<button class="portal-btn portal-btn-primary portal-btn-sm" type="button" id="portal-ticket-status-save">Save status</button>' +
          '<span class="portal-muted portal-small" id="portal-ticket-status-msg"></span></div></div>' +
          '<div class="portal-drawer-section"><h3>Job timer</h3>' +
          '<p class="portal-muted" id="portal-timer-total">Loading time on this job&hellip;</p>' +
          '<div class="portal-status-row"><button class="portal-btn portal-btn-primary portal-btn-sm" type="button" id="portal-timer-btn">Start timer</button>' +
          '<span class="portal-muted portal-small" id="portal-timer-msg"></span></div>' +
          '<div id="portal-timer-list"></div></div>' +
          '<div class="portal-drawer-section"><h3>Message customer</h3>' +
          '<div class="portal-thread" id="portal-thread"><p class="portal-muted">Loading messages&hellip;</p></div>' +
          '<form id="portal-note-form"><div class="portal-note-row">' +
          '<textarea id="portal-note-input" placeholder="Add a note to this ticket&hellip;" maxlength="2000" aria-label="Add a note to this ticket"></textarea>' +
          '<button class="portal-btn portal-btn-primary" type="submit"><i class="fas fa-paper-plane"></i></button></div>' +
          '<p class="portal-muted portal-small">Notes are saved to this ticket&rsquo;s message thread as Tech.</p>' +
          '<p class="portal-error" id="portal-note-error" hidden></p></form></div>';

        $('portal-drawer-body').innerHTML = body;
        loadTicketThread(client, t.id); loadRepairLog(client, t.id); loadRepairLogPhotos(client, t); wireRepairLogPhotos(client, t); var repairForm = $("portal-repair-log-form"); if (repairForm) { repairForm.addEventListener("submit", function (e) { e.preventDefault(); var input = $("portal-repair-log-input"); var err = $("portal-repair-log-error"); if (err) { err.hidden = true; err.textContent = ""; } var text = input ? trim(input.value) : ""; if (!text) { return; } client.from("ticket_notes").insert({ ticket_id: t.id, author: (state.profile && state.profile.name) || null, note: text }).then(function (res2) { if (res2.error) { if (err) { err.textContent = "Could not save that update. Try again."; err.hidden = false; } return; } if (input) { input.value = ""; } loadRepairLog(client, t.id); }).catch(function () { if (err) { err.textContent = "Could not save that update. Try again."; err.hidden = false; } }); }); } 
        loadCharges(client, t);
        loadParts(client, t);
        loadDocuments(client, t);
        wireDocuments(client, t);
        loadMembership(client, t);
        loadStockItems(client, t);
        loadJobTimers(client, t);
        var timerBtn = $('portal-timer-btn');
        if (timerBtn) timerBtn.addEventListener('click', function () {
          var msg = $('portal-timer-msg');
          var running = timerBtn.getAttribute('data-running');
          if (running) {
            client.from('job_timers').update({ stopped_at: new Date().toISOString() }).eq('id', running).then(function () { loadJobTimers(client, t); }).catch(function () { if (msg) msg.textContent = 'Could not stop the timer. Try again.'; });
          } else {
            timerBtn.disabled = true;
            client.from('job_timers').insert({ ticket_id: t.id, employee_name: (state.profile && state.profile.name) || null, started_at: new Date().toISOString() }).select().then(function (res) { timerBtn.disabled = false; if (res.error) { if (msg) msg.textContent = 'Could not start the timer. Try again.'; return; } var nid = res.data && res.data[0] ? res.data[0].id : null; if (nid) { timerBtn.textContent = 'Stop timer'; timerBtn.setAttribute('data-running', nid); var tot = $('portal-timer-total'); if (tot) tot.textContent = 'Time on this job: 0m (timer running)'; } loadJobTimers(client, t); }).catch(function () { timerBtn.disabled = false; if (msg) msg.textContent = 'Could not start the timer. Try again.'; });
          }
        });
        wireTicketActions(client, t);
        wirePaymentActions(client, t);

        var editSave = $('p2-edit-save');
        if (editSave) editSave.addEventListener('click', function () {
          var msg = $('p2-edit-msg');
          if (msg) msg.textContent = 'Saving\u2026';
          var patch = {
            issue: $('p2-edit-issue').value.trim() || null,
            service_address: $('p2-edit-address').value.trim() || null,
            serial_imei: $('p2-edit-serial').value.trim() || null,
            issue_reason: $('p2-edit-reason').value.trim() || null,
            triage_volts: $('p2-edit-volts').value.trim() || null,
            triage_amps: $('p2-edit-amps').value.trim() || null,
            power_on: $('p2-edit-power').value || null,
            backed_up: $('p2-edit-backup').value || null,
            prior_repair: $('p2-edit-prior').value || null,
            warranty_status: $('p2-edit-warranty').value || null,
            job_date: $('p2-edit-jobdate').value || null,
            terms_accepted: $('p2-edit-terms').value === 'true',
            dispatch_acknowledged: $('p2-edit-dispatch').value === 'true',
            work_auth_accepted: $('p2-edit-workauth').value === 'true',
            marketing_opt_in: $('p2-edit-marketing').value === 'true'
          };
          client.from('tickets').update(patch).eq('id', t.id).then(function (res2) {
            if (res2.error) { if (msg) msg.textContent = 'Couldn\u2019t save \u2014 try again.'; return; }
            openTicket(t.id);
          }).catch(function () { if (msg) msg.textContent = 'Couldn\u2019t save \u2014 try again.'; });
        });
        $('portal-ticket-status-save').addEventListener('click', function () {
          var next = $('portal-ticket-status').value;
          var msg = $('portal-ticket-status-msg');
          msg.textContent = 'Saving…';
          client.from('tickets').update({ status: next }).eq('id', t.id).then(function (res2) {
            if (res2.error) { msg.textContent = 'Couldn&rsquo;t save — try again.'; return; }
            msg.textContent = 'Saved.';
            if (next === 'Job Complete') {
              /* PORTAL_POINTS_EARN_2026_10_30: credit the customer's
               * loyalty points for this job (once per ticket — see
               * awardPointsOnComplete) and note it next to the save
               * confirmation when the credit lands. */
              awardPointsOnComplete(client, t, function (pts) {
                var m2 = $('portal-ticket-status-msg');
                if (m2) m2.textContent = 'Saved. +' + pts + ' pts to ' + pointsNameLabel(t) + '.';
              });
            }
            if (next === 'Awaiting Parts') { showTrackingPopup(client, t); }
            if (next === 'Ready' && trim(t.customer_phone)) {
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

  /* PORTAL_POINTS_EARN_2026_10_30: ATR One member-multiplier hook.
   * Returns 1 for everyone today — no boost rate exists yet. It takes
   * the ticket (which carries customer_id) so a future member lookup
   * plugs in here and nowhere else. */
  function pointsMultiplierFor(t) {
    return 1;
  }

  /* Short display name for the points note: "Janae Saunders" -> "Janae S." */
  function pointsNameLabel(t) {
    var parts = trim(t.customer_name || '').split(/\s+/).filter(function (x) { return x !== ''; });
    if (!parts.length) return 'the customer';
    return parts.length > 1 ? parts[0] + ' ' + parts[1].charAt(0).toUpperCase() + '.' : parts[0];
  }

  /* PORTAL_POINTS_EARN_2026_10_30: award loyalty points when a ticket
   * reaches Job Complete. Amount: floor(ticket total) x
   * POINTS_PER_DOLLAR x pointsMultiplierFor(t), where the ticket total
   * is the charges subtotal from chargeTotals() — the same figure the
   * receipt is built from — read fresh from ticket_charges at
   * completion time. Deposit credits are payments toward that subtotal,
   * so they are not added on top of it.
   * Exactly once per ticket: the award is claimed atomically by
   * stamping tickets.points_awarded (added by
   * award-points-migration.sql) only where it is still NULL. If the
   * stamp errors or claims no row, nothing is credited — so toggling
   * the status, reopening, or re-saving the drawer can never award
   * twice. If the column does not exist yet (this code published
   * before the SQL ran) the stamp errors and the award is skipped
   * silently: no crash, no points. If the rewards credit itself fails
   * after a successful claim, the claim is released (best effort) so a
   * later completion can retry instead of losing the points.
   * onAwarded(pts), when given, fires only after the credit lands. */
  function awardPointsOnComplete(client, t, onAwarded) {
    if (!t || !t.customer_id) return;
    client.from('ticket_charges').select('*').eq('ticket_id', t.id).then(function (res) {
      if (res.error) return;
      var wholeDollars = Math.floor(chargeTotals(res.data || []).subtotal);
      var pts = Math.floor(wholeDollars * POINTS_PER_DOLLAR * pointsMultiplierFor(t));
      if (!(pts > 0)) return;
      client.from('tickets').update({ points_awarded: pts }).eq('id', t.id).is('points_awarded', null).select('id').then(function (claim) {
        if (claim.error || !claim.data || !claim.data.length) return;
        t.points_awarded = pts;
        function rollback() {
          client.from('tickets').update({ points_awarded: null }).eq('id', t.id).eq('points_awarded', pts).then(function () {}).catch(function () {});
        }
        client.from('rewards').select('points').eq('customer_id', t.customer_id).limit(1).then(function (r) {
          if (r.error) { rollback(); return; }
          var rows = r.data || [];
          if (rows.length) {
            var next = (Number(rows[0].points) || 0) + pts;
            client.from('rewards').update({ points: next }).eq('customer_id', t.customer_id).then(function (u) {
              if (u.error) { rollback(); return; }
              if (onAwarded) onAwarded(pts);
            }).catch(function () { rollback(); });
          } else {
            client.from('rewards').insert({ customer_id: t.customer_id, points: pts }).then(function (ins) {
              if (ins.error) { rollback(); return; }
              if (onAwarded) onAwarded(pts);
            }).catch(function () { rollback(); });
          }
        }).catch(function () { rollback(); });
      }).catch(function () {});
    }).catch(function () {});
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

  var CARRIERS = ['FedEx', 'UPS', 'USPS', 'Other'];
  function carrierOptions(sel) {
    return '<option value="">Carrier</option>' + CARRIERS.map(function (c) {
      return '<option value="' + c + '"' + (sel === c ? ' selected' : '') + '>' + c + '</option>';
    }).join('');
  }
  function trackingUrl(carrier, num) {
    if (!num) return null;
    var n = encodeURIComponent(String(num).trim());
    if (carrier === 'FedEx') return 'https://www.fedex.com/fedextrack/?trknbr=' + n;
    if (carrier === 'UPS') return 'https://www.ups.com/track?tracknum=' + n;
    if (carrier === 'USPS') return 'https://tools.usps.com/go/TrackConfirmAction?tLabels=' + n;
    return null;
  }
  function trackingHtml(p) {
    if (!p.tracking_number) return '';
    var url = trackingUrl(p.carrier, p.tracking_number);
    if (url) return ' <a href="' + url + '" target="_blank" rel="noopener">' + esc(p.tracking_number) + '</a>';
    return ' <span class="portal-muted portal-small">' + esc(p.tracking_number) + '</span>';
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
        (p.carrier ? ' · ' + esc(p.carrier) : '') +
        (p.order_number ? ' · order #' + esc(p.order_number) : '') +
        (p.received_at ? ' · received ' + esc(fmtDate(p.received_at)) : '') + '</span>' + trackingHtml(p) + '</div>' +
        '<select class="p2-part-status" data-part-id="' + esc(p.id) + '" aria-label="Part status">' + statusOpts + '</select>' +
        '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-part-label="' + esc(p.id) + '"><i class="fas fa-tag"></i> Label</button>' +
        '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-part-track="' + esc(p.id) + '"><i class="fas fa-truck"></i> Tracking</button>' +
        '<button class="p2-x" type="button" data-part-del="' + esc(p.id) + '" aria-label="Remove part order">&times;</button></div>' +
        '<div class="p2-track-edit" data-part-track-edit="' + esc(p.id) + '" hidden>' +
        '<div class="p2-form-row"><select data-track-carrier aria-label="Carrier">' + carrierOptions(p.carrier) + '</select>' +
        '<input type="text" data-track-number placeholder="Tracking number" maxlength="80" aria-label="Tracking number" value="' + esc(p.tracking_number || '') + '" />' +
        '<input type="text" data-track-order placeholder="Order number" maxlength="80" aria-label="Order number" value="' + esc(p.order_number || '') + '" /></div>' +
        '<button class="portal-btn portal-btn-primary portal-btn-sm" type="button" data-part-track-save="' + esc(p.id) + '">Save tracking</button> ' +
        '<span class="portal-muted portal-small" data-track-msg></span></div>';
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
    box.querySelectorAll('[data-part-track]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var ed = box.querySelector('[data-part-track-edit="' + btn.getAttribute('data-part-track') + '"]');
        if (ed) ed.hidden = !ed.hidden;
      });
    });
    box.querySelectorAll('[data-part-track-save]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-part-track-save');
        var ed = box.querySelector('[data-part-track-edit="' + id + '"]');
        if (!ed) return;
        var msg = ed.querySelector('[data-track-msg]');
        if (msg) msg.textContent = 'Saving\u2026';
        var patch = {
          carrier: ed.querySelector('[data-track-carrier]').value || null,
          tracking_number: trim(ed.querySelector('[data-track-number]').value) || null,
          order_number: trim(ed.querySelector('[data-track-order]').value) || null
        };
        withClient(function (client) {
          client.from('part_orders').update(patch).eq('id', id).then(function (res) {
            if (res.error) { if (msg) msg.textContent = 'Couldn\u2019t save \u2014 try again.'; return; }
            loadParts(client, t);
          }).catch(function () { if (msg) msg.textContent = 'Couldn\u2019t save \u2014 try again.'; });
        });
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

  /* Awaiting Parts popup: when a ticket is set to Awaiting Parts, ask for the
   * newest part's carrier / tracking number / order number right then.
   * N.A. closes it saving nothing — tracking can be added later from the
   * part's Tracking button. Never blocks the status change itself. */
  /* ================= TICKET DOCUMENTS =================
   * PORTAL_DOCUMENTS_2026_10_30 (Austin, Oct 30, 2026): signed
   * documents file themselves on the customer's ticket. A Documents
   * section on the ticket drawer lists what is filed (private
   * 'ticket-documents' storage bucket + ticket_documents table; see
   * documents.sql), opens each through a short-lived signed URL, and
   * offers two actions: sign the Repair Authorization in a popup
   * (terms + signature pad + printed name), or attach a document
   * (photo / scan / PDF) with a type. A signed authorization — drawn
   * here or attached as one — also sets terms_accepted and
   * work_auth_accepted on the ticket. The terms text below is the
   * Repair Authorization & Service Agreement exactly as published on
   * austinstechrepairgroup.com (extracted from the live page Oct 30,
   * 2026); if the site's agreement changes, refresh this copy.
   * PORTAL_COPY_SYNC_2026_10_30 (Oct 30, 2026): AUTH_TERMS_TEXT
   * and TERMS_CONDITIONS_TEXT below were synced to the site's
   * current copy \u2014 environmental replaced-parts sentence and
   * the Square card processing fee bullet added (see
   * portal-copy-sync-2026-10-30/NOTES.md). */
  var DOC_BUCKET = 'ticket-documents';
  var DOC_TYPE_LABELS = { repair_authorization: 'Repair authorization', receipt: 'Receipt', other: 'Other document' };
  var AUTH_TERMS_TEXT = "Repair Authorization & Service Agreement\nAustin's Tech Repair Group \u2014 State of Ohio, USA \u2014 Last updated October 23, 2026\nPLEASE READ THIS DOCUMENT CAREFULLY. By scheduling an appointment, submitting a repair request, or handing us your device, you (\"Customer,\" \"you\") authorize the services below and agree to these terms with Austin's Tech Repair Group (\"Company,\" \"we,\" \"us,\" \"our\"), a sole proprietorship operating in the State of Ohio.\n1. Authorization to Perform Services\nBy requesting service, you authorize Austin's Tech Repair Group to:\nReceive, handle, open, disassemble, diagnose, test, and repair your device;\nOrder and install the replacement parts you approve;\nRun software diagnostics and updates, and access device functions \u2014 using any passcode you provide \u2014 only as needed to complete and verify the repair;\nTake the device to our bench for advanced work (such as board-level repair) when on-site repair is not possible, and return it when finished.\nYou confirm that you own the device or have the owner's permission to authorize service on it. We service consumer and business electronics only; we do not service medical devices or equipment.\n2. Fees, Parts & Payment\nHouse-call fee: A $35.00 house-call fee applies to every mobile visit, covering travel and a full diagnosis. It is non-refundable in all cases, is due at scheduling, is charged separately from the repair price, and is never credited toward a repair. ATR One members pay no house-call fee for devices covered under their subscription.\nDiagnostics: Estimates are free. A full diagnosis \u2014 including disassembly or deep board-level diagnostics when required \u2014 is included in the house-call fee.\nFlat-rate repairs: Common repairs (screens, batteries, charging ports, back glass) are quoted at one flat rate \u2014 parts and labor included. No hourly billing.\nCustom repairs: Repairs outside the standard list are quoted individually as one flat price and begin only with your approval.\nParts: Parts for your job are ordered by us through our suppliers and delivered to us. Because parts are ordered for your specific job, the parts cost is paid upfront before we order. If you cancel after parts are ordered, we keep the part and refund what you paid for the part.\nReplaced parts: Parts we remove during a repair are taken with us and disposed of properly to protect the environment. Some original manufacturer parts must be returned to the manufacturer.\nParts you supply: If you supply your own part, we will install it as-is; our 1-Year Limited Warranty does not cover customer-supplied parts.\nContact about your repair: You agree we may call and text you at the number you provide about your repair \u2014 scheduling, status updates, and completion.\nEstimate approval: We confirm your price before beginning work. If hidden damage, corrosion, or additional failures are found during disassembly, we notify you and obtain your approval before proceeding with any extra work.\nPayment due: The balance is due upon completion, before the device is released. We accept Visa, Mastercard, American Express, Discover, Apple Pay, Google Pay, Samsung Pay, Cash App Pay, PayPal, Venmo, and cash.\nCard processing fee: If you pay by credit or debit card, a processing fee is added to your total. Card payments are processed through Square, and the fee is exactly what Square charges for the transaction \u2014 passed through at Square's actual rate, never more than Square charges.\n3. Repair Risks You Accept\nData: Diagnostics and repair can result in data loss or corruption. Back up your device before service. We are not responsible for lost data, files, photos, accounts, or settings.\nPre-existing damage: Devices with prior liquid exposure, corrosion, structural damage, or earlier repair attempts are fragile and can fail during normal handling. We are not responsible for a device that stops working because of a pre-existing condition.\nAlready-cracked parts: Removing a cracked screen or back glass can cause it to break further. If a damaged part cannot survive disassembly, replacing it becomes part of the repair and is quoted to you before we proceed.\nCosmetics: Minor marks from opening a device are a normal risk of repair work.\nManufacturer warranties & seals: Third-party repair can affect a manufacturer's warranty; unless the manufacturer explicitly states that opening the device does not void the warranty, our work may void it. A device's water-resistance rating cannot be guaranteed after any repair.\n4. Liability Waiver\nExcept in cases of gross negligence or willful misconduct, you release Austin's Tech Repair Group, its owner, and its representatives from liability for claims or damages arising from the repair services, and you agree that our total liability is limited to the amount you paid for the service. We are not liable for incidental, indirect, or consequential damages, including loss of data, loss of use, or loss of business.\n5. Warranty\nStandard repairs include a one (1) year limited warranty on the parts installed and labor performed, under our Warranty Policy.\nThe warranty is void for the affected repair if the device later suffers physical damage, liquid exposure, or is opened or repaired by another party.\nWarranty service requires your original repair invoice or receipt.\n6. Unclaimed Devices\nWe will notify you when your repair is complete. Equipment left unclaimed for more than sixty (60) days after that notice will be considered abandoned and may be disposed of, recycled, or sold to recover costs, as permitted by Ohio law.\n7. Governing Law & Entire Agreement\nThis Agreement is governed by the laws of the State of Ohio. Disputes will first be addressed through good-faith negotiation; if unresolved, they will be submitted to a court of competent jurisdiction in Greene County, Ohio. This document is the entire agreement between you and Austin's Tech Repair Group for repair services. If any provision is found unenforceable, the rest remain in effect.\nAustin's Tech Repair Group\nAustin Tyler Caudill, Owner\nState of Ohio, USA \u2014 (937) 280-6243";

  function docStamp() { return new Date().toISOString().replace(/[:.]/g, '-'); }
  function safeFileName(name) {
    var s = String(name || 'document').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
    return s || 'document';
  }
  function docMsg(text) {
    var m = $('p4-doc-msg');
    if (!m) return;
    if (text) { m.textContent = text; m.hidden = false; }
    else { m.hidden = true; m.textContent = ''; }
  }

  function loadDocuments(client, t) {
    var box = $('p4-docs');
    if (!box) return;
    client.from('ticket_documents').select('*').eq('ticket_id', t.id).order('created_at', { ascending: false }).then(function (res) {
      if (res.error) { box.innerHTML = '<p class="portal-muted">Documents are not set up for this portal yet.</p>'; return; }
      var rows = res.data || [];
      if (!rows.length) { box.innerHTML = '<p class="portal-muted">No documents on this ticket yet. Sign the repair authorization or attach one below.</p>'; return; }
      box.innerHTML = rows.map(function (d) {
        var when = d.signed_at || d.created_at;
        var meta = esc(fmtDateTime(when));
        if (d.signer_name) meta += ' &middot; Signed by ' + esc(d.signer_name);
        if (d.file_name) meta += ' &middot; ' + esc(d.file_name);
        if (d.note) meta += ' &middot; ' + esc(d.note);
        return '<div class="p2-line"><div class="p2-line-main"><span class="p2-kind">' + esc(DOC_TYPE_LABELS[d.doc_type] || 'Document') + '</span>' +
          '<span class="portal-muted portal-small">' + meta + '</span></div>' +
          '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-p4-view="' + esc(d.storage_path) + '" data-p4-view-name="' + esc(d.file_name || '') + '"><i class="fas fa-eye"></i> View</button></div>';
      }).join('');
      var btns = box.querySelectorAll('[data-p4-view]');
      for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener('click', function () { viewDocument(client, this.getAttribute('data-p4-view'), this.getAttribute('data-p4-view-name')); });
      }
    }).catch(function () { box.innerHTML = '<p class="portal-muted">Documents could not be loaded.</p>'; });
  }

  /* PORTAL_DOCVIEW_2026_10_30 (Austin, Oct 30, 2026): HTML documents
   * (every signed Repair Authorization is filed as a self-contained
   * .html file) opened as raw source when the storage signed URL was
   * opened directly — the file came back unformatted, tags visible,
   * on iPhone Safari and desktop alike. HTML documents now open in
   * an in-portal preview: the file is fetched through the same
   * signed URL and rendered in an iframe (srcdoc), with an
   * Open-in-new-tab option (Blob URL, text/html) and a Close that
   * returns to the ticket. Non-HTML documents (photos, PDF receipts)
   * keep opening the signed URL directly, exactly as before. If the
   * fetch fails, the preview closes and the signed URL opens
   * directly — the old behavior — rather than dead-ending. */
  function docNameIsHtml(name) {
    var s = String(name || '').split('?')[0].split('#')[0];
    return /\.html?$/i.test(s);
  }
  function docIsHtml(path, fileName) { return docNameIsHtml(path) || docNameIsHtml(fileName); }

  function viewStoredDocument(client, path, fileName, fail) {
    if (!path) return;
    client.storage.from(DOC_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS).then(function (res) {
      if (res.error || !res.data || !res.data.signedUrl) { fail(); return; }
      if (docIsHtml(path, fileName)) previewHtmlDocument(res.data.signedUrl);
      else window.open(res.data.signedUrl, '_blank');
    }).catch(fail);
  }

  function viewDocument(client, path, fileName) {
    viewStoredDocument(client, path, fileName, function () { docMsg('Could not open that document — try again.'); });
  }

  function previewHtmlDocument(signedUrl) {
    var old = document.getElementById('doc-preview-modal');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var wrap = document.createElement('div');
    wrap.id = 'doc-preview-modal';
    wrap.setAttribute('style', 'position:fixed;inset:0;background:rgba(44,35,26,0.55);z-index:3000;display:flex;align-items:center;justify-content:center;padding:1rem;');
    wrap.innerHTML = '<div style="background:#FAF6EE;color:#2C231A;border-radius:14px;max-width:860px;width:100%;height:92vh;display:flex;flex-direction:column;padding:1rem;box-shadow:0 18px 50px rgba(0,0,0,0.35);">' +
      '<div class="p2-actions" style="margin:0 0 0.75rem;">' +
      '<span class="p2-kind" style="margin-right:auto;">Document</span>' +
      '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" id="doc-preview-open" disabled>Open in new tab</button> ' +
      '<button class="portal-btn portal-btn-primary portal-btn-sm" type="button" id="doc-preview-close">Close</button></div>' +
      '<div id="doc-preview-loading" class="portal-muted" style="flex:1;display:flex;align-items:center;justify-content:center;">Loading&hellip;</div>' +
      '<iframe id="doc-preview-frame" title="Document preview" sandbox="" style="flex:1;width:100%;border:1px solid #E6D9C0;border-radius:8px;background:#fff;display:none;"></iframe>' +
      '</div>';
    document.body.appendChild(wrap);
    function close() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    wrap.querySelector('#doc-preview-close').addEventListener('click', close);
    var loadedHtml = null;
    var openBtn = wrap.querySelector('#doc-preview-open');
    openBtn.addEventListener('click', function () {
      if (loadedHtml == null) return;
      var url = URL.createObjectURL(new Blob([loadedHtml], { type: 'text/html' }));
      window.open(url, '_blank');
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    });
    fetch(signedUrl).then(function (r) {
      if (!r.ok) throw new Error('document fetch failed');
      return r.text();
    }).then(function (html) {
      if (!wrap.parentNode) return; /* closed while loading */
      loadedHtml = html;
      var loading = wrap.querySelector('#doc-preview-loading');
      var frame = wrap.querySelector('#doc-preview-frame');
      frame.srcdoc = html;
      if (loading) loading.style.display = 'none';
      frame.style.display = 'block';
      openBtn.disabled = false;
    }).catch(function () {
      close();
      window.open(signedUrl, '_blank');
    });
  }

  function markAuthorizationAccepted(client, t) {
    return client.from('tickets').update({ terms_accepted: true, work_auth_accepted: true }).eq('id', t.id);
  }

  function wireDocuments(client, t) {
    var signBtn = $('p4-sign-btn');
    if (signBtn) signBtn.addEventListener('click', function () { openSignModal(client, t); });
    /* PORTAL_MEDIA_RELEASE_2026_10_30: the media release signs from
     * the same Documents section, on the spot, when photos are
     * planned for this job. */
    var mediaBtn = $('p4-media-btn');
    if (mediaBtn) mediaBtn.addEventListener('click', function () { openMediaSignModal(client, t); });
    var fileInput = $('p4-attach-file');
    var attachBtn = $('p4-attach-btn');
    if (attachBtn && fileInput) attachBtn.addEventListener('click', function () { fileInput.click(); });
    if (fileInput) fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (f) attachDocument(client, t, f);
    });
    var existingBtn = $('p4-existing-btn');
    if (existingBtn) existingBtn.addEventListener('click', function () { toggleExistingPicker(client, t); });
  }

  function attachDocument(client, t, file) {
    docMsg('');
    var typeSel = $('p4-attach-type');
    var type = typeSel ? typeSel.value : 'other';
    if (DOC_TYPE_LABELS[type] === undefined) type = 'other';
    if (file.size > 15 * 1024 * 1024) { docMsg('That file is over 15 MB — try a smaller scan or photo.'); return; }
    var attachBtn = $('p4-attach-btn');
    if (attachBtn) { attachBtn.disabled = true; attachBtn.textContent = 'Attaching…'; }
    var path = t.id + '/' + type + '-' + docStamp() + '-' + safeFileName(file.name);
    client.storage.from(DOC_BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false }).then(function (up) {
      if (up.error) { if (attachBtn) { attachBtn.disabled = false; attachBtn.textContent = 'Attach document'; } docMsg('Upload failed — check the connection and try again.'); return; }
      var row = {
        ticket_id: t.id, doc_type: type, storage_path: path, file_name: file.name,
        signed_at: type === 'repair_authorization' ? new Date().toISOString() : null
      };
      client.from('ticket_documents').insert(row).then(function (res) {
        if (attachBtn) { attachBtn.disabled = false; attachBtn.textContent = 'Attach document'; }
        if (res.error) { docMsg('The file uploaded but could not be filed on the ticket — try again.'); return; }
        if (type === 'repair_authorization') {
          markAuthorizationAccepted(client, t).then(function () { openTicket(t.id); }).catch(function () { openTicket(t.id); });
        } else {
          loadDocuments(client, t);
        }
      }).catch(function () { if (attachBtn) { attachBtn.disabled = false; attachBtn.textContent = 'Attach document'; } docMsg('The file uploaded but could not be filed on the ticket — try again.'); });
    }).catch(function () { if (attachBtn) { attachBtn.disabled = false; attachBtn.textContent = 'Attach document'; } docMsg('Upload failed — check the connection and try again.'); });
  }

  /* PORTAL_ATTACH_EXISTING_2026_10_30 (Austin, Oct 30, 2026): from
   * inside a ticket, file a document that is already in the system
   * but unattached onto THIS ticket — the mirror of the Documents
   * tab's Attach-to-repair picker, for when you are already standing
   * in the repair. The list is the unattached set (see
   * loadUnattachedDocuments); picking one sets its ticket_id through
   * fileExistingDocumentOnTicket, the shared attach — a move, never
   * a copy. Nothing is uploaded and no consent flags change.
   * PORTAL_DRAWER_DOCS_2026_10_30 (Austin, Oct 30, 2026): the picker
   * is NO LONGER a <select> dropdown — on Austin's iPad the dropdown
   * sat on "Loading documents…" forever and read as broken. Tapping
   * "Attach an existing document" now expands an inline list in
   * place: a plain Loading line while it fetches, one row per
   * unattached document (type, date, file name) with its own Attach
   * button, the empty sentence when there is nothing to attach, and
   * a plainly shown error with a Try again button when the load
   * fails. A successful attach removes the row and refreshes the
   * ticket's Documents list. */
  function toggleExistingPicker(client, t) {
    var picker = $('p4-existing-picker');
    if (!picker) return;
    if (!picker.hidden) { picker.hidden = true; return; }
    picker.hidden = false;
    loadExistingList(client, t);
  }

  function loadExistingList(client, t) {
    var list = $('p4-existing-list');
    if (!list) return;
    list.innerHTML = '<p class="portal-muted portal-small">Loading documents&hellip;</p>';
    loadUnattachedDocuments(client, function (rows) {
      if (!rows) {
        list.innerHTML = '<p class="portal-error">Documents could not be loaded \u2014 check the connection and try again.</p>' +
          '<div class="p2-actions"><button class="portal-btn portal-btn-outline portal-btn-sm" type="button" id="p4-existing-retry">Try again</button></div>';
        var retry = $('p4-existing-retry');
        if (retry) retry.addEventListener('click', function () { loadExistingList(client, t); });
        return;
      }
      if (!rows.length) {
        list.innerHTML = '<p class="portal-muted portal-small">No unattached documents to attach. A document uploaded in the Documents tab before its ticket exists will show up here.</p>';
        return;
      }
      list.innerHTML = rows.map(function (d) {
        var meta = fmtDateTime(d.signed_at || d.created_at);
        if (d.signer_name) meta += ' \u00b7 Signed by ' + d.signer_name;
        if (d.file_name) meta += ' \u00b7 ' + d.file_name;
        return '<div class="p2-line"><div class="p2-line-main"><span class="p2-kind">' + esc(DOC_TYPE_LABELS[d.doc_type] || 'Document') + '</span>' +
          '<span class="portal-muted portal-small">' + esc(meta) + '</span></div>' +
          '<button class="portal-btn portal-btn-primary portal-btn-sm" type="button" data-p4-attach-existing="' + esc(d.id) + '">Attach</button></div>';
      }).join('');
      var btns = list.querySelectorAll('[data-p4-attach-existing]');
      for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener('click', function () {
          var btn = this;
          var docId = btn.getAttribute('data-p4-attach-existing');
          btn.disabled = true;
          btn.textContent = 'Attaching\u2026';
          fileExistingDocumentOnTicket(client, docId, t.id, function (errText) {
            if (errText) { btn.disabled = false; btn.textContent = 'Attach'; docMsg(errText); return; }
            docMsg('');
            var row = btn.closest ? btn.closest('.p2-line') : null;
            if (row && row.parentNode) row.parentNode.removeChild(row);
            if (!list.querySelector('[data-p4-attach-existing]')) {
              list.innerHTML = '<p class="portal-muted portal-small">No unattached documents to attach. A document uploaded in the Documents tab before its ticket exists will show up here.</p>';
            }
            loadDocuments(client, t);
          });
        });
      }
    });
  }

  /* PORTAL_SIGNEDDOC_2026_10_30 (Austin, Oct 30, 2026): a signed Repair
   * Authorization now files as the COMPLETE document — the full
   * agreement text (AUTH_TERMS_TEXT, the same copy the signature popup
   * shows) with the customer's signature affixed in a signature block —
   * composed as one self-contained HTML file. Before this, the filing
   * was the bare signature PNG alone: opening it showed a squiggle on
   * a blank page, which proves nothing. The signature image is embedded
   * in the document as a data URI so the HTML stands on its own. If
   * composition ever fails, the filing falls back to the bare PNG so a
   * captured signature is never lost. */
  function blobToDataUrl(blob, cb) {
    try {
      var reader = new FileReader();
      reader.onload = function () { cb(String(reader.result || '')); };
      reader.onerror = function () { cb(''); };
      reader.readAsDataURL(blob);
    } catch (e) { cb(''); }
  }

  function signedAuthorizationHtml(meta, signerName, signatureDataUrl, signedAtIso) {
    var lines = [
      ['Customer', meta.customerName],
      ['Phone', meta.phone],
      ['Device', meta.device]
    ].filter(function (r) { return trim(r[1]) !== ''; }).map(function (r) {
      return '<tr><th style="text-align:left;padding:0.3rem 0.9rem 0.3rem 0;color:#6B5B43;font-weight:600;vertical-align:top;">' + esc(r[0]) + '</th>' +
        '<td style="padding:0.3rem 0;">' + esc(r[1]) + '</td></tr>';
    }).join('');
    return '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>Repair Authorization \u2014 Austin\u2019s Tech Repair Group</title></head>' +
      '<body style="margin:0;background:#F3EDE0;color:#2C231A;font-family:Georgia,\'Times New Roman\',serif;">' +
      '<div style="max-width:760px;margin:0 auto;padding:2rem 1.25rem 3rem;background:#FFFDF8;">' +
      '<div style="text-align:center;border-bottom:3px solid #C96A1E;padding-bottom:1rem;margin-bottom:1.25rem;">' +
      '<div style="font-size:1.55rem;font-weight:bold;letter-spacing:0.02em;">Austin\u2019s Tech Repair Group</div>' +
      '<div style="margin-top:0.3rem;font-size:0.95rem;">(937) 280-6243</div></div>' +
      '<h1 style="font-size:1.3rem;margin:0 0 1rem;">Repair Authorization</h1>' +
      (lines ? '<table style="border-collapse:collapse;margin-bottom:1.25rem;font-size:0.98rem;"><tbody>' + lines + '</tbody></table>' : '') +
      '<div style="white-space:pre-wrap;font-size:0.92rem;line-height:1.5;border:1px solid #E6D9C0;border-radius:8px;padding:1rem;background:#FFFDF8;">' + esc(AUTH_TERMS_TEXT) + '</div>' +
      '<h2 style="font-size:1.1rem;margin:1.75rem 0 0.5rem;">Signature</h2>' +
      '<div style="border:1px solid #E6D9C0;border-radius:8px;padding:1rem;background:#fff;">' +
      '<img alt="Customer signature" src="' + signatureDataUrl + '" style="display:block;max-width:100%;width:420px;height:auto;">' +
      '<div style="border-top:2px solid #2C231A;margin-top:0.4rem;padding-top:0.5rem;font-size:0.95rem;">Signed by: ' + esc(signerName || '') + '</div>' +
      '<div style="font-size:0.95rem;margin-top:0.25rem;">Date: ' + esc(fmtDateTime(signedAtIso)) + '</div>' +
      '</div>' +
      '<p style="font-size:0.8rem;color:#6B5B43;margin-top:1.5rem;">Signed electronically and filed on the customer\u2019s repair ticket by Austin\u2019s Tech Repair Group.</p>' +
      '</div></body></html>';
  }

  /* Shared filing for a drawn signature (PORTAL_CHECKIN_CONSENT_2026_10_30
   * refactored this out of the drawer flow so check-in files a signature
   * identically): compose the signed document
   * (PORTAL_SIGNEDDOC_2026_10_30), upload it, file the
   * ticket_documents row, and set the ticket's consent flags via
   * markAuthorizationAccepted — the exact steps the drawer sign flow
   * has always done. meta carries the customer name / phone / device
   * printed at the top of the document. done(errText): errText is null
   * on success. */
  function fileSignedAuthorization(client, ticketId, blob, signerName, done, meta) {
    var signedAt = new Date().toISOString();
    function fileArtifact(path, content, contentType, fileName) {
      client.storage.from(DOC_BUCKET).upload(path, content, { contentType: contentType, upsert: false }).then(function (up) {
        if (up.error) { done('Saving failed \u2014 check the connection and try again.'); return; }
        var row = { ticket_id: ticketId, doc_type: 'repair_authorization', storage_path: path, signer_name: signerName, signed_at: signedAt };
        if (fileName) row.file_name = fileName;
        client.from('ticket_documents').insert(row).then(function (res) {
          if (res.error) { done('The signature saved but could not be filed \u2014 try again.'); return; }
          markAuthorizationAccepted(client, { id: ticketId }).then(function () { done(null); }).catch(function () { done(null); });
        }).catch(function () { done('The signature saved but could not be filed \u2014 try again.'); });
      }).catch(function () { done('Saving failed \u2014 check the connection and try again.'); });
    }
    function filePngFallback() {
      fileArtifact(ticketId + '/repair_authorization-' + docStamp() + '.png', blob, 'image/png', null);
    }
    blobToDataUrl(blob, function (dataUrl) {
      if (!dataUrl) { filePngFallback(); return; }
      var html = null;
      try { html = signedAuthorizationHtml(meta || {}, signerName, dataUrl, signedAt); } catch (e) { html = null; }
      if (!html) { filePngFallback(); return; }
      var fileName = 'Repair Authorization \u2014 signed ' + fmtDate(signedAt) + '.html';
      fileArtifact(ticketId + '/repair_authorization-' + docStamp() + '.html', new Blob([html], { type: 'text/html' }), 'text/html', fileName);
    });
  }

  /* The signature popup itself (agreement text + printed name + pad),
   * shared by the ticket drawer and by check-in consent \u2014 one
   * implementation, two callers; not a second copy. onCapture(blob,
   * signerName, finish): the caller does whatever it needs with the
   * captured signature, then calls finish() to close the popup, or
   * finish(errText) to show the error and keep the popup open. */
  function openSignatureCapture(initialName, onCapture, opts) {
    /* PORTAL_MEDIA_RELEASE_2026_10_30: the optional opts (title /
     * intro / docText / saveLabel) let the Media Release reuse this
     * one popup with its own document. Callers that pass no opts —
     * the drawer authorization and check-in consent — get the Repair
     * Authorization popup, unchanged in every detail, including the
     * backdrop-tap protection below (PORTAL_DEADEND_2026_10_30). */
    var sigOpts = opts || {};
    var sigTitle = sigOpts.title || 'Repair Authorization & Service Agreement';
    var sigIntro = sigOpts.intro || 'Read the agreement, type your name, and sign in the box. Signing files this document on the ticket and marks Terms accepted and Work authorized.';
    var sigDocText = sigOpts.docText || AUTH_TERMS_TEXT;
    var sigSaveLabel = sigOpts.saveLabel || 'Sign & save';
    var old = document.getElementById('p4-sign-modal');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var wrap = document.createElement('div');
    wrap.id = 'p4-sign-modal';
    wrap.setAttribute('style', 'position:fixed;inset:0;background:rgba(44,35,26,0.55);z-index:3000;display:flex;align-items:center;justify-content:center;padding:1rem;');
    wrap.innerHTML = '<div style="background:#FAF6EE;color:#2C231A;border-radius:14px;max-width:600px;width:100%;max-height:92vh;overflow:auto;padding:1.25rem;box-shadow:0 18px 50px rgba(0,0,0,0.35);">' +
      '<h3 style="margin:0 0 0.5rem;">' + esc(sigTitle) + '</h3>' +
      '<p class="portal-muted portal-small" style="margin:0 0 0.75rem;">' + esc(sigIntro) + '</p>' +
      '<div style="max-height:36vh;overflow:auto;border:1px solid #E6D9C0;border-radius:8px;padding:0.75rem;background:#FFFDF8;white-space:pre-wrap;font-size:0.85rem;line-height:1.45;">' + esc(sigDocText) + '</div>' +
      '<div class="portal-field" style="margin-top:0.75rem;"><label for="p4-sign-name">Printed name</label><input type="text" id="p4-sign-name" maxlength="120" value="' + esc(initialName || '') + '" /></div>' +
      '<div class="portal-field"><label for="p4-pad">Signature</label>' +
      '<canvas id="p4-pad" width="560" height="200" style="width:100%;height:auto;display:block;background:#fff;border:2px solid #d8cbb6;border-radius:8px;touch-action:none;"></canvas></div>' +
      '<div class="p2-actions" style="margin-top:0.75rem;">' +
      '<button class="portal-btn portal-btn-primary portal-btn-sm" type="button" id="p4-sign-save">' + esc(sigSaveLabel) + '</button> ' +
      '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" id="p4-sign-clear">Clear</button> ' +
      '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" id="p4-sign-cancel">Cancel</button>' +
      '<span class="portal-muted portal-small" id="p4-sign-msg"></span></div></div>';
    document.body.appendChild(wrap);
    function close() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    wrap.addEventListener('click', function (e) {
      /* PORTAL_DEADEND_2026_10_30: a stray backdrop tap must not throw
         away a drawn signature — confirm first when the pad has been
         used; an untouched pad still closes instantly. The Cancel
         button and Clear button keep their existing behavior. */
      if (e.target !== wrap) return;
      if (hasDrawn && !window.confirm('Discard this signature? It will be lost.')) return;
      close();
    });
    wrap.querySelector('#p4-sign-cancel').addEventListener('click', close);

    var canvas = wrap.querySelector('#p4-pad');
    var ctx = canvas.getContext('2d');
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#2C231A';
    var drawing = false, hasDrawn = false, last = null;
    function pos(e) {
      var r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) };
    }
    canvas.addEventListener('pointerdown', function (e) {
      drawing = true; hasDrawn = true; last = pos(e);
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!drawing) return;
      var p = pos(e);
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p;
    });
    function endStroke() { drawing = false; }
    canvas.addEventListener('pointerup', endStroke);
    canvas.addEventListener('pointercancel', endStroke);
    wrap.querySelector('#p4-sign-clear').addEventListener('click', function () {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasDrawn = false;
    });

    wrap.querySelector('#p4-sign-save').addEventListener('click', function () {
      var msg = wrap.querySelector('#p4-sign-msg');
      var name = trim(wrap.querySelector('#p4-sign-name').value);
      if (!name) { if (msg) msg.textContent = 'Type the printed name first.'; return; }
      if (!hasDrawn) { if (msg) msg.textContent = 'Sign in the box first.'; return; }
      var saveBtn = wrap.querySelector('#p4-sign-save');
      if (saveBtn) saveBtn.disabled = true;
      if (msg) msg.textContent = 'Saving\u2026';
      function gotBlob(blob) {
        if (!blob) { if (saveBtn) saveBtn.disabled = false; if (msg) msg.textContent = 'Could not capture the signature \u2014 try again.'; return; }
        onCapture(blob, name, function (errText) {
          if (errText) { if (saveBtn) saveBtn.disabled = false; if (msg) msg.textContent = errText; return; }
          close();
        });
      }
      if (canvas.toBlob) { canvas.toBlob(gotBlob, 'image/png'); }
      else {
        var parts = String(canvas.toDataURL('image/png')).split(',');
        var bin = window.atob(parts[1]);
        var arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        gotBlob(new Blob([arr], { type: 'image/png' }));
      }
    });
  }

  function openSignModal(client, t) {
    openSignatureCapture(t.customer_name || '', function (blob, name, finish) {
      fileSignedAuthorization(client, t.id, blob, name, function (errText) {
        if (errText) { finish(errText); return; }
        finish();
        openTicket(t.id);
      }, { customerName: t.customer_name, phone: t.customer_phone, device: deviceLabel(t) });
    });
  }

  /* ================= MEDIA RELEASE =================
   * PORTAL_MEDIA_RELEASE_2026_10_30 (Austin, Oct 30, 2026): a
   * standalone Media Release joins the portal's documents. It is NOT
   * part of check-in and NOT part of the Repair Authorization: it is
   * a document staff pull up on a job, only when Austin decides to
   * take photos, and ask the customer to sign on the spot — ATRG
   * never photographs inside a customer's home without this signed
   * permission. The text is listed with the blank documents on the
   * Documents tab (BLANK_DOCS) and signed through the SAME signature
   * popup as the authorization (openSignatureCapture with opts, one
   * implementation). A signed release composes as one self-contained
   * HTML document in the signedAuthorizationHtml pattern and files on
   * the ticket with doc_type 'other' (the ticket_documents check
   * constraint allows only repair_authorization / receipt / other),
   * so filed copies open through the same DOCVIEW overlay as every
   * signed document. Signing a media release changes NO consent
   * flags: it is not the repair authorization, so
   * markAuthorizationAccepted is deliberately never called here. */
  var MEDIA_RELEASE_TEXT = "Media Release\nAustin's Tech Repair Group \u2014 \u201CEvery technology, big or small \u2014 we tackle them all.\u201D\n\nI give Austin's Tech Repair Group permission to take photographs and short video clips of my device and of the repair work while it is being done.\n\nAustin's Tech Repair Group may use these photographs and clips on its website, its social media pages, and in its advertising and portfolio, to show the kind of work it does.\n\nPhotographs and clips focus on the device and the work area. Photographs of people are taken only with their own agreement.\n\nSigning is always the customer's choice. Service, pricing, and warranty are the same either way. A customer may take back this permission at any time with a written note or email, and Austin's Tech Repair Group will stop using the photographs and clips from that point on.\n\nThe customer signing below confirms they own the device, or are authorized by its owner, and agrees to the terms above.";
  var MEDIA_SIGN_OPTS = {
    title: 'Media Release',
    intro: 'Read the release, type your name, and sign in the box. Signing files this media release on the ticket. It covers photos and short clips of the device and the repair work only.',
    docText: MEDIA_RELEASE_TEXT,
    saveLabel: 'Sign & save'
  };

  function signedMediaReleaseHtml(meta, signerName, signatureDataUrl, signedAtIso) {
    var lines = [
      ['Customer', meta.customerName],
      ['Phone', meta.phone],
      ['Device', meta.device]
    ].filter(function (r) { return trim(r[1]) !== ''; }).map(function (r) {
      return '<tr><th style="text-align:left;padding:0.3rem 0.9rem 0.3rem 0;color:#6B5B43;font-weight:600;vertical-align:top;">' + esc(r[0]) + '</th>' +
        '<td style="padding:0.3rem 0;">' + esc(r[1]) + '</td></tr>';
    }).join('');
    return '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>Media Release \u2014 Austin\u2019s Tech Repair Group</title></head>' +
      '<body style="margin:0;background:#F3EDE0;color:#2C231A;font-family:Georgia,\'Times New Roman\',serif;">' +
      '<div style="max-width:760px;margin:0 auto;padding:2rem 1.25rem 3rem;background:#FFFDF8;">' +
      '<div style="text-align:center;border-bottom:3px solid #C96A1E;padding-bottom:1rem;margin-bottom:1.25rem;">' +
      '<div style="font-size:1.55rem;font-weight:bold;letter-spacing:0.02em;">Austin\u2019s Tech Repair Group</div>' +
      '<div style="margin-top:0.3rem;font-size:0.95rem;">(937) 280-6243</div></div>' +
      '<h1 style="font-size:1.3rem;margin:0 0 1rem;">Media Release</h1>' +
      (lines ? '<table style="border-collapse:collapse;margin-bottom:1.25rem;font-size:0.98rem;"><tbody>' + lines + '</tbody></table>' : '') +
      '<div style="white-space:pre-wrap;font-size:0.92rem;line-height:1.5;border:1px solid #E6D9C0;border-radius:8px;padding:1rem;background:#FFFDF8;">' + esc(MEDIA_RELEASE_TEXT) + '</div>' +
      '<h2 style="font-size:1.1rem;margin:1.75rem 0 0.5rem;">Signature</h2>' +
      '<div style="border:1px solid #E6D9C0;border-radius:8px;padding:1rem;background:#fff;">' +
      '<img alt="Customer signature" src="' + signatureDataUrl + '" style="display:block;max-width:100%;width:420px;height:auto;">' +
      '<div style="border-top:2px solid #2C231A;margin-top:0.4rem;padding-top:0.5rem;font-size:0.95rem;">Signed by: ' + esc(signerName || '') + '</div>' +
      '<div style="font-size:0.95rem;margin-top:0.25rem;">Date: ' + esc(fmtDateTime(signedAtIso)) + '</div>' +
      '</div>' +
      '<p style="font-size:0.8rem;color:#6B5B43;margin-top:1.5rem;">Signed electronically and filed on the customer\u2019s repair ticket by Austin\u2019s Tech Repair Group.</p>' +
      '</div></body></html>';
  }

  /* Filing for a signed media release — the fileSignedAuthorization
   * shape (compose, upload, file the ticket_documents row), with the
   * two differences the document calls for: doc_type 'other', and no
   * consent-flag side effects. If composition ever fails, the filing
   * falls back to the bare PNG so a captured signature is never lost,
   * exactly like the authorization flow. done(errText): errText is
   * null on success. */
  function fileSignedMediaRelease(client, ticketId, blob, signerName, done, meta) {
    var signedAt = new Date().toISOString();
    function fileArtifact(path, content, contentType, fileName) {
      client.storage.from(DOC_BUCKET).upload(path, content, { contentType: contentType, upsert: false }).then(function (up) {
        if (up.error) { done('Saving failed \u2014 check the connection and try again.'); return; }
        var row = { ticket_id: ticketId, doc_type: 'other', storage_path: path, signer_name: signerName, signed_at: signedAt, note: 'Media release \u2014 permission for photos and clips of the device and the repair work' };
        if (fileName) row.file_name = fileName;
        client.from('ticket_documents').insert(row).then(function (res) {
          if (res.error) { done('The signature saved but could not be filed \u2014 try again.'); return; }
          done(null);
        }).catch(function () { done('The signature saved but could not be filed \u2014 try again.'); });
      }).catch(function () { done('Saving failed \u2014 check the connection and try again.'); });
    }
    function filePngFallback() {
      fileArtifact(ticketId + '/media_release-' + docStamp() + '.png', blob, 'image/png', null);
    }
    blobToDataUrl(blob, function (dataUrl) {
      if (!dataUrl) { filePngFallback(); return; }
      var html = null;
      try { html = signedMediaReleaseHtml(meta || {}, signerName, dataUrl, signedAt); } catch (e) { html = null; }
      if (!html) { filePngFallback(); return; }
      var fileName = 'Media Release \u2014 signed ' + fmtDate(signedAt) + '.html';
      fileArtifact(ticketId + '/media_release-' + docStamp() + '.html', new Blob([html], { type: 'text/html' }), 'text/html', fileName);
    });
  }

  function openMediaSignModal(client, t, after) {
    openSignatureCapture(t.customer_name || '', function (blob, name, finish) {
      fileSignedMediaRelease(client, t.id, blob, name, function (errText) {
        if (errText) { finish(errText); return; }
        finish();
        if (after) after();
        else openTicket(t.id);
      }, { customerName: t.customer_name, phone: t.customer_phone, device: deviceLabel(t) });
    }, MEDIA_SIGN_OPTS);
  }

  /* ============ SIGN ANY BLANK DOCUMENT ============
   * PORTAL_SIGN_ALL_DOCS_2026_10_30 (Austin, Oct 30, 2026): the
   * Media Release's Documents-tab Sign button worked so well that
   * every blank document gets one. The pieces below are the shared
   * path all four documents sign through from the Documents tab —
   * a parameterized signed-document composer and filer for the
   * doc_type 'other' documents (the signedAuthorizationHtml /
   * fileSignedMediaRelease pattern, generalized), one sign modal,
   * and one ticket picker — driven per document by the DOC_SIGNERS
   * configs (further below, beside BLANK_DOCS). The Repair
   * Authorization does NOT use the generic filer: its config
   * points at fileSignedAuthorization itself, so a signature
   * started here composes the identical document and sets the
   * identical consent flags as the drawer's own flow. */

  /* The signedMediaReleaseHtml pattern, parameterized by document:
   * one self-contained HTML file — business header, the
   * Customer/Phone/Device table, the document's full text in a
   * panel, and the signature block with the signature image
   * embedded as a data URI — so a filed copy opens through the
   * DOCVIEW overlay as a formatted document, never raw code. */
  function signedOtherDocumentHtml(docTitle, bodyText, meta, signerName, signatureDataUrl, signedAtIso) {
    var lines = [
      ['Customer', meta.customerName],
      ['Phone', meta.phone],
      ['Device', meta.device]
    ].filter(function (r) { return trim(r[1]) !== ''; }).map(function (r) {
      return '<tr><th style="text-align:left;padding:0.3rem 0.9rem 0.3rem 0;color:#6B5B43;font-weight:600;vertical-align:top;">' + esc(r[0]) + '</th>' +
        '<td style="padding:0.3rem 0;">' + esc(r[1]) + '</td></tr>';
    }).join('');
    return '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + esc(docTitle) + ' \u2014 Austin\u2019s Tech Repair Group</title></head>' +
      '<body style="margin:0;background:#F3EDE0;color:#2C231A;font-family:Georgia,\'Times New Roman\',serif;">' +
      '<div style="max-width:760px;margin:0 auto;padding:2rem 1.25rem 3rem;background:#FFFDF8;">' +
      '<div style="text-align:center;border-bottom:3px solid #C96A1E;padding-bottom:1rem;margin-bottom:1.25rem;">' +
      '<div style="font-size:1.55rem;font-weight:bold;letter-spacing:0.02em;">Austin\u2019s Tech Repair Group</div>' +
      '<div style="margin-top:0.3rem;font-size:0.95rem;">(937) 280-6243</div></div>' +
      '<h1 style="font-size:1.3rem;margin:0 0 1rem;">' + esc(docTitle) + '</h1>' +
      (lines ? '<table style="border-collapse:collapse;margin-bottom:1.25rem;font-size:0.98rem;"><tbody>' + lines + '</tbody></table>' : '') +
      '<div style="white-space:pre-wrap;font-size:0.92rem;line-height:1.5;border:1px solid #E6D9C0;border-radius:8px;padding:1rem;background:#FFFDF8;">' + esc(bodyText) + '</div>' +
      '<h2 style="font-size:1.1rem;margin:1.75rem 0 0.5rem;">Signature</h2>' +
      '<div style="border:1px solid #E6D9C0;border-radius:8px;padding:1rem;background:#fff;">' +
      '<img alt="Customer signature" src="' + signatureDataUrl + '" style="display:block;max-width:100%;width:420px;height:auto;">' +
      '<div style="border-top:2px solid #2C231A;margin-top:0.4rem;padding-top:0.5rem;font-size:0.95rem;">Signed by: ' + esc(signerName || '') + '</div>' +
      '<div style="font-size:0.95rem;margin-top:0.25rem;">Date: ' + esc(fmtDateTime(signedAtIso)) + '</div>' +
      '</div>' +
      '<p style="font-size:0.8rem;color:#6B5B43;margin-top:1.5rem;">Signed electronically and filed on the customer\u2019s repair ticket by Austin\u2019s Tech Repair Group.</p>' +
      '</div></body></html>';
  }

  /* Where each generic-filed document lands: its storage path
   * prefix, the label its filed copy is named with ("<label> —
   * signed <date>.html"), the note on its ticket_documents row,
   * and how its signed HTML composes. The text constants are read
   * when a signature is captured, not when this file loads. */
  var WARRANTY_FILE_SPEC = {
    pathPrefix: 'warranty', fileNameLabel: 'Warranty',
    note: 'Warranty \u2014 signed copy of the 1-Year Limited Warranty',
    compose: function (meta, signerName, dataUrl, signedAt) { return signedOtherDocumentHtml('1-Year Limited Warranty', WARRANTY_TEXT, meta, signerName, dataUrl, signedAt); }
  };
  var TERMS_FILE_SPEC = {
    pathPrefix: 'terms_of_service', fileNameLabel: 'Terms of Service',
    note: 'Terms of Service \u2014 signed copy of the Terms & Conditions of Service',
    compose: function (meta, signerName, dataUrl, signedAt) { return signedOtherDocumentHtml('Terms & Conditions of Service', TERMS_CONDITIONS_TEXT, meta, signerName, dataUrl, signedAt); }
  };

  /* Filing for a signed doc_type 'other' document — the
   * fileSignedMediaRelease shape (compose, upload, file the
   * ticket_documents row), parameterized by the document's file
   * spec, with NO consent-flag side effects: these documents are
   * not the repair authorization, so markAuthorizationAccepted is
   * deliberately never called here. If composition ever fails, the
   * filing falls back to the bare PNG so a captured signature is
   * never lost, exactly like the flows it mirrors. done(errText):
   * errText is null on success. */
  function fileSignedOtherDocument(client, ticketId, blob, signerName, done, meta, spec) {
    var signedAt = new Date().toISOString();
    function fileArtifact(path, content, contentType, fileName) {
      client.storage.from(DOC_BUCKET).upload(path, content, { contentType: contentType, upsert: false }).then(function (up) {
        if (up.error) { done('Saving failed \u2014 check the connection and try again.'); return; }
        var row = { ticket_id: ticketId, doc_type: 'other', storage_path: path, signer_name: signerName, signed_at: signedAt, note: spec.note };
        if (fileName) row.file_name = fileName;
        client.from('ticket_documents').insert(row).then(function (res) {
          if (res.error) { done('The signature saved but could not be filed \u2014 try again.'); return; }
          done(null);
        }).catch(function () { done('The signature saved but could not be filed \u2014 try again.'); });
      }).catch(function () { done('Saving failed \u2014 check the connection and try again.'); });
    }
    function filePngFallback() {
      fileArtifact(ticketId + '/' + spec.pathPrefix + '-' + docStamp() + '.png', blob, 'image/png', null);
    }
    blobToDataUrl(blob, function (dataUrl) {
      if (!dataUrl) { filePngFallback(); return; }
      var html = null;
      try { html = spec.compose(meta || {}, signerName, dataUrl, signedAt); } catch (e) { html = null; }
      if (!html) { filePngFallback(); return; }
      var fileName = spec.fileNameLabel + ' \u2014 signed ' + fmtDate(signedAt) + '.html';
      fileArtifact(ticketId + '/' + spec.pathPrefix + '-' + docStamp() + '.html', new Blob([html], { type: 'text/html' }), 'text/html', fileName);
    });
  }

  /* The shared sign modal for the Documents tab path: the same
   * signature popup as everywhere else — the config's opts pick the
   * document it shows, and a null opts gives the popup's built-in
   * Repair Authorization presentation — then the config's filer
   * files the capture. The Documents tab passes an `after` that
   * refreshes its signed list; without one, the ticket drawer
   * reopens, exactly as after the drawer's own sign buttons. */
  function openDocSignModal(client, t, signer, after) {
    openSignatureCapture(t.customer_name || '', function (blob, name, finish) {
      signer.file(client, t.id, blob, name, function (errText) {
        if (errText) { finish(errText); return; }
        finish();
        if (after) after();
        else openTicket(t.id);
      }, { customerName: t.customer_name, phone: t.customer_phone, device: deviceLabel(t) });
    }, signer.opts || undefined);
  }

  /* PORTAL_SIGN_ALL_DOCS_2026_10_30: the Documents tab entry point,
   * generalized from the media release picker — pick the ticket the
   * document belongs to, then the shared signature popup
   * (openDocSignModal) driven by that document's signer config.
   * The signed document files on that ticket and the tab's list
   * refreshes. */
  function openDocSignPicker(doc) {
    withClient(function (client) {
      if (!client) return;
      var old = document.getElementById('p4-doc-pick-modal');
      if (old && old.parentNode) old.parentNode.removeChild(old);
      var wrap = document.createElement('div');
      wrap.id = 'p4-doc-pick-modal';
      wrap.setAttribute('style', 'position:fixed;inset:0;background:rgba(44,35,26,0.55);z-index:3000;display:flex;align-items:center;justify-content:center;padding:1rem;');
      wrap.innerHTML = '<div style="background:#FAF6EE;color:#2C231A;border-radius:14px;max-width:520px;width:100%;max-height:92vh;overflow:auto;padding:1.25rem;box-shadow:0 18px 50px rgba(0,0,0,0.35);">' +
        '<h3 style="margin:0 0 0.5rem;">' + esc(doc.signer.pickTitle) + '</h3>' +
        '<p class="portal-muted portal-small" style="margin:0 0 0.75rem;">' + esc(doc.signer.pickBlurb) + '</p>' +
        '<div class="portal-field"><label for="p4-doc-pick-select">Ticket</label><select id="p4-doc-pick-select"><option value="">Loading tickets&hellip;</option></select></div>' +
        '<div class="p2-actions" style="margin-top:0.75rem;">' +
        '<button class="portal-btn portal-btn-primary portal-btn-sm" type="button" id="p4-doc-pick-go">Continue to signature</button> ' +
        '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" id="p4-doc-pick-cancel">Cancel</button>' +
        '<span class="portal-muted portal-small" id="p4-doc-pick-msg"></span></div></div>';
      document.body.appendChild(wrap);
      function close() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
      wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
      wrap.querySelector('#p4-doc-pick-cancel').addEventListener('click', close);
      var tickets = [];
      var sel = wrap.querySelector('#p4-doc-pick-select');
      client.from('tickets').select('id, customer_name, customer_phone, device_type, brand, model, status').order('created_at', { ascending: false }).limit(200).then(function (res) {
        tickets = res.error ? [] : (res.data || []);
        if (!tickets.length) { sel.innerHTML = '<option value="">No tickets found</option>'; return; }
        sel.innerHTML = tickets.map(function (tk) {
          return '<option value="' + esc(tk.id) + '">' + esc((tk.customer_name || 'No name') + ' \u00B7 ' + deviceLabel(tk) + ' \u00B7 ' + (tk.status || '')) + '</option>';
        }).join('');
      }).catch(function () { sel.innerHTML = '<option value="">Could not load tickets</option>'; });
      wrap.querySelector('#p4-doc-pick-go').addEventListener('click', function () {
        var msg = wrap.querySelector('#p4-doc-pick-msg');
        var chosen = null;
        tickets.forEach(function (tk) { if (tk.id === sel.value) chosen = tk; });
        if (!chosen) { if (msg) msg.textContent = 'Pick a ticket first.'; return; }
        close();
        openDocSignModal(client, chosen, doc.signer, function () { loadDocTabList(client); });
      });
    });
  }

  /* ================= DOCUMENTS TAB =================
   * PORTAL_DOCUMENTS_TAB_2026_10_30 (Phase 3, Austin, Oct 30, 2026):
   * the top-level Documents tab is the home for every document.
   * Blank documents are the business's unsigned agreements, shown
   * from the same canonical texts published on the website
   * (extracted from the live page Oct 30, 2026, like AUTH_TERMS_TEXT;
   * refresh these copies if the site's legal text changes). Signed &
   * filed documents come from ticket_documents across all tickets,
   * searchable by customer. Staff can upload a document that lands
   * unattached (ticket_id NULL) and file it onto a ticket from here;
   * filing a signed authorization sets that ticket's terms_accepted
   * and work_auth_accepted, same as the drawer flow, and the document
   * then also shows in that ticket's Documents section. */
  var TERMS_CONDITIONS_TEXT = "Terms & Conditions of Service\nLast updated October 23, 2026\nThese Terms & Conditions govern repair services and website use for Austin's Tech Repair Group (\"Company,\" \"we,\" \"us,\" or \"our\"), a sole proprietorship operating in the State of Ohio. By scheduling an appointment, submitting a repair request, or using this website, you (\"Customer,\" \"you\") agree to these terms.\n1. Who We Are & What We Do\nMobile service: We come to you. Most repairs are completed at your home or office in the Miami Valley (Xenia, Dayton, and surrounding areas). Some advanced repairs, such as board-level work, may require us to take the device with your permission and return it when the work is complete.\nWhat we repair: Phones, tablets, computers & laptops, game consoles, smartwatches, and websites.\nWhat we do not repair: Automotive electronics and instrument clusters, vintage radios and tube equipment, home stereo and sound systems, and major appliances.\n2. Estimates & Pricing\nFlat-rate pricing: Common repairs are quoted at one flat rate \u2014 parts and labor included. There is no hourly billing.\nDiagnostics: Estimates are free. A full diagnosis of the problem \u2014 including disassembly or deep board-level work when required \u2014 is included in the $35.00 house-call fee, charged separately from the repair price.\nOnline estimator: Prices shown by the online estimator are starting prices for the most common models. Your final flat price is confirmed for your exact model before you book, and the price we confirm is the price you pay.\nCustom repairs: One-of-a-kind or unusual repairs are quoted individually as one flat price \u2014 and are always approved by you before work begins.\nHidden damage: If disassembly reveals additional damage or failed components beyond the original estimate, we stop, notify you, and get your approval before doing any extra work.\n3. House-Call Fee\nA $35.00 house-call fee applies to every mobile visit. It covers travel to your location and a full diagnosis of the problem, and it is due at scheduling.\nATR One members: Members pay no house-call fee for devices covered under their subscription.\nThe house-call fee is non-refundable in all cases and is charged separately from the repair price. It is never credited toward a repair.\n4. Parts & Payment\nParts you supply: You\u2019re welcome to supply everyday parts you can buy at retail \u2014 hard drives, memory, accessories. Our 1-year warranty covers only parts we supply; customer-supplied parts are installed as-is, with no warranty on the part.\nParts are paid upfront: Because parts are ordered for your specific job, the parts cost is due before we order. We order parts through our suppliers and they are delivered to us; we bring them to your install visit. If you cancel after parts are ordered, we keep the part and refund what you paid for the part.\nReplaced parts: Parts we remove during a repair are taken with us and disposed of properly to protect the environment. Some original manufacturer parts must be returned to the manufacturer.\nParts you supply: If you supply your own part, we will install it as-is; our 1-Year Limited Warranty does not cover customer-supplied parts.\nContact about your repair: You agree we may call and text you at the number you provide about your repair \u2014 scheduling, status updates, and completion.\nBalance due: The remaining balance (labor) is due upon completion of the repair, before the device is released back to you.\nAccepted payments: Visa, Mastercard, American Express, Discover, Apple Pay, Google Pay, Samsung Pay, Cash App Pay, PayPal, Venmo, and cash.\nCard processing fee: If you pay by credit or debit card, a processing fee is added to your total. Card payments are processed through Square, and the fee is exactly what Square charges for the transaction \u2014 passed through at Square's actual rate, never more than Square charges.\n5. Cancellations\nYou may cancel or reschedule before your appointment at no charge beyond the house-call fee, which is non-refundable once the appointment is booked.\nIf we arrive and you decline the confirmed repair, only the house-call fee is owed.\n6. Your Data\nData loss or corruption can occur during diagnostics or repair. You are responsible for backing up your device before service. We are not liable for lost data, files, photos, or settings. See the Repair Authorization for full details.\n7. Warranty\nStandard repairs are covered by our 1-Year Limited Warranty on the parts installed and the labor performed. Full terms and the claim process are in the Warranty Policy on this site.\n8. Limitation of Liability\nTo the fullest extent permitted by Ohio law, our total liability for any claim connected to a service is limited to the amount you paid for that service. We are not liable for incidental, indirect, or consequential damages, including loss of data, loss of use, or loss of business.\n9. Website Use\nYou must be 18 or using this site with a parent or guardian. Use the site only for lawful purposes; no scraping, data mining, malware, or attempts to gain unauthorized access.\nSite content (text, graphics, logos, and code) belongs to Austin's Tech Repair Group and may not be reproduced or commercially used without written permission.\nThe website is provided \"as is\" without warranties of any kind. We are not responsible for third-party websites linked from this site.\n10. Changes, Governing Law & Contact\nWe may update these terms; the version posted on this site when you book governs your service.\nThese terms are governed by the laws of the State of Ohio. Disputes will be addressed first through good-faith negotiation, then in a court of competent jurisdiction in Greene County, Ohio.\nQuestions: Austin's Tech Repair Group \u2014 Austin Tyler Caudill, Owner \u2014 Spring Valley, Ohio \u2014 (937) 280-6243 \u2014 austin.caudill@austinstechrepairgroup.com\nLegal";
  var WARRANTY_TEXT = "1-Year Limited Warranty & Claims\nLast updated October 20, 2026\nAustin's Tech Repair Group stands behind its work. Every standard repair includes a 1-Year Limited Warranty on the parts we install and the labor we perform, under the terms below.\n1. What This Warranty Covers\nReplacement parts we installed (screens, batteries, charging ports, and other components) that fail due to a defect in the part itself.\nThe labor and workmanship of the specific repair on your invoice.\n2. Warranty Period\nCoverage runs for one year (365 days) from the date the repair was completed.\nThe warranty applies to the original customer and the device listed on the repair invoice. Please keep your invoice or receipt \u2014 it is your proof of coverage.\n3. What This Warranty Does Not Cover\nNew physical damage: Drops, impacts, cracks, pressure damage, or bent frames after the repair.\nParts supplied by the customer \u2014 this warranty covers only parts we supply.\nLiquid damage: Exposure to water, moisture, or steam after the repair.\nTampering: Devices opened, modified, or repaired by anyone other than Austin's Tech Repair Group after our service.\nSoftware problems: Viruses, malware, operating-system corruption, or issues caused by rooting, jailbreaking, or other modifications.\nUnrelated failures: Problems in parts or systems that were not part of the original repair, including pre-existing conditions.\nNormal wear: Gradual battery capacity fade over time and minor cosmetic wear that does not affect function.\n4. How to File a Warranty Claim\nStep 1 \u2014 Contact us: Call or text (937) 280-6243 or email austin.caudill@austinstechrepairgroup.com and describe the problem.\nStep 2 \u2014 Show your invoice: Present your original repair invoice or receipt so we can verify coverage.\nStep 3 \u2014 Inspection: We inspect and test the device to confirm the failure is a covered defect in the part or our workmanship.\nStep 4 \u2014 Remedy: If the claim is covered, we will repair or replace the defective part at no charge for parts or labor. If the part cannot be repaired or replaced, we will refund the price of that part.\nWarranty inspections are diagnostic visits; no house-call fee applies to a covered warranty claim.\n5. Limits\nThis warranty is limited to the repair, replacement, or refund described above. We are not liable for incidental or consequential damages, including loss of data or loss of use of the device during evaluation or repair.\nSome states do not allow limits on implied warranties or consequential damages, so parts of this section may not apply to you. This warranty gives you specific legal rights, and you may have other rights that vary by state.\nAustin's Tech Repair Group\nAustin Tyler Caudill, Owner\nSpring Valley, Ohio \u2014 (937) 280-6243";
  /* PORTAL_SIGN_ALL_DOCS_2026_10_30 (Austin, Oct 30, 2026): the
   * per-document signer configs behind the Documents tab's Sign
   * buttons. Each config carries everything the shared signing path
   * (openDocSignPicker -> openDocSignModal -> the config's filer)
   * needs for its document: the document's full text, the ticket
   * picker's heading and blurb, the signature popup's opts (null =
   * the shared popup's built-in Repair Authorization presentation),
   * and the filer that composes, uploads, and files the signed
   * copy. Only the Repair Authorization's filer touches consent
   * flags — and it is fileSignedAuthorization itself, the drawer's
   * own, so its document and side effects are identical whichever
   * button starts the signing. Defined here, after the document
   * texts above, so every config reads the final constants. */
  var DOC_SIGNERS = {
    authorization: {
      text: AUTH_TERMS_TEXT,
      pickTitle: 'Sign a repair authorization',
      pickBlurb: 'Pick the repair this authorization belongs to. The customer signs on the next screen, and the signed authorization files itself on that ticket.',
      opts: null,
      file: fileSignedAuthorization
    },
    warranty: {
      text: WARRANTY_TEXT,
      pickTitle: 'Sign a warranty',
      pickBlurb: 'Pick the repair this warranty belongs to. The customer signs on the next screen, and the signed warranty files itself on that ticket.',
      opts: {
        title: '1-Year Limited Warranty',
        intro: 'Read the warranty, type your name, and sign in the box. Signing files this signed copy of the warranty on the ticket.',
        docText: WARRANTY_TEXT,
        saveLabel: 'Sign & save'
      },
      file: function (client, ticketId, blob, signerName, done, meta) {
        fileSignedOtherDocument(client, ticketId, blob, signerName, done, meta, WARRANTY_FILE_SPEC);
      }
    },
    terms: {
      text: TERMS_CONDITIONS_TEXT,
      pickTitle: 'Sign the terms of service',
      pickBlurb: 'Pick the repair these terms belong to. The customer signs on the next screen, and the signed terms file themselves on that ticket.',
      opts: {
        title: 'Terms & Conditions of Service',
        intro: 'Read the terms, type your name, and sign in the box. Signing files this signed copy of the terms on the ticket.',
        docText: TERMS_CONDITIONS_TEXT,
        saveLabel: 'Sign & save'
      },
      file: function (client, ticketId, blob, signerName, done, meta) {
        fileSignedOtherDocument(client, ticketId, blob, signerName, done, meta, TERMS_FILE_SPEC);
      }
    },
    media: {
      text: MEDIA_RELEASE_TEXT,
      pickTitle: 'Sign a media release',
      pickBlurb: 'Pick the repair this release belongs to. The customer signs on the next screen, and the signed release files itself on that ticket.',
      opts: MEDIA_SIGN_OPTS,
      file: fileSignedMediaRelease
    }
  };
  /* PORTAL_SIGN_ALL_DOCS_2026_10_30: each blank document carries its
   * signer config, which is what puts the Sign button on its
   * Documents tab row (renderBlankDocs). */
  var BLANK_DOCS = [
    { title: 'Repair Authorization & Service Agreement', text: AUTH_TERMS_TEXT, signer: DOC_SIGNERS.authorization },
    { title: '1-Year Limited Warranty', text: WARRANTY_TEXT, signer: DOC_SIGNERS.warranty },
    { title: 'Terms & Conditions of Service', text: TERMS_CONDITIONS_TEXT, signer: DOC_SIGNERS.terms },
    /* PORTAL_MEDIA_RELEASE_2026_10_30: the Media Release lists with
     * the blank documents so it can be pulled up and read any time.
     * The mediaRelease flag keeps it OUT of the check-in agreements
     * popup (showAllAgreements) — it is signed on a job, never at
     * check-in. Its Sign button comes from its signer config, like
     * every blank document's (PORTAL_SIGN_ALL_DOCS_2026_10_30). */
    { title: 'Media Release', text: MEDIA_RELEASE_TEXT, mediaRelease: true, signer: DOC_SIGNERS.media }
  ];
  var docTabRows = null, docTabWired = false, docTicketOptions = null;

  function showTextModal(title, text) {
    var old = document.getElementById('p4-text-modal');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var wrap = document.createElement('div');
    wrap.id = 'p4-text-modal';
    wrap.setAttribute('style', 'position:fixed;inset:0;background:rgba(44,35,26,0.55);z-index:3000;display:flex;align-items:center;justify-content:center;padding:1rem;');
    wrap.innerHTML = '<div style="background:#FAF6EE;color:#2C231A;border-radius:14px;max-width:600px;width:100%;max-height:92vh;overflow:auto;padding:1.25rem;box-shadow:0 18px 50px rgba(0,0,0,0.35);">' +
      '<h3 style="margin:0 0 0.75rem;">' + esc(title) + '</h3>' +
      '<div style="max-height:62vh;overflow:auto;border:1px solid #E6D9C0;border-radius:8px;padding:0.75rem;background:#FFFDF8;white-space:pre-wrap;font-size:0.88rem;line-height:1.5;">' + esc(text) + '</div>' +
      '<div class="p2-actions" style="margin-top:0.75rem;"><button class="portal-btn portal-btn-primary portal-btn-sm" type="button" id="p4-text-close">Close</button></div></div>';
    document.body.appendChild(wrap);
    function close() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    wrap.querySelector('#p4-text-close').addEventListener('click', close);
  }

  function loadDocumentsTab(force) {
    withClient(function (client) {
      var listBox = $('portal-docs-list');
      if (!client) { if (listBox) listBox.innerHTML = '<p class="portal-error">Couldn&rsquo;t reach the database. Reload the page to try again.</p>'; return; }
      renderBlankDocs();
      wireDocTab(client);
      loadDocTabList(client);
    });
  }

  /* PORTAL_SIGN_ALL_DOCS_2026_10_30: every blank document carries
   * a signer config, so every row renders a Sign button beside its
   * View button; the button opens the shared ticket picker for
   * that document (openDocSignPicker). */
  function renderBlankDocs() {
    var box = $('portal-docs-blanks');
    if (!box) return;
    box.innerHTML = BLANK_DOCS.map(function (d, i) {
      return '<div class="p2-line"><div class="p2-line-main"><span class="p2-line-amt">' + esc(d.title) + '</span></div>' +
        (d.signer ? '<button class="portal-btn portal-btn-primary portal-btn-sm" type="button" data-blank-sign="' + i + '"><i class="fas fa-pen-nib"></i> Sign</button> ' : '') +
        '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-blank-doc="' + i + '"><i class="fas fa-eye"></i> View</button></div>';
    }).join('');
    var btns = box.querySelectorAll('[data-blank-doc]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        var d = BLANK_DOCS[Number(this.getAttribute('data-blank-doc'))];
        if (d) showTextModal(d.title, d.text);
      });
    }
    var signBtns = box.querySelectorAll('[data-blank-sign]');
    for (var s = 0; s < signBtns.length; s++) {
      signBtns[s].addEventListener('click', function () {
        var d = BLANK_DOCS[Number(this.getAttribute('data-blank-sign'))];
        if (d && d.signer) openDocSignPicker(d);
      });
    }
  }

  function docTabListMsg(text) {
    var m = $('portal-docs-list-msg');
    if (!m) return;
    if (text) { m.textContent = text; m.hidden = false; }
    else { m.hidden = true; m.textContent = ''; }
  }

  function loadDocTabList(client) {
    var box = $('portal-docs-list');
    if (!box) return;
    function fallback() {
      client.from('ticket_documents').select('*').order('created_at', { ascending: false }).limit(300).then(function (res2) {
        docTabRows = res2.error ? [] : (res2.data || []);
        renderDocTabList(client);
      }).catch(function () { docTabRows = []; renderDocTabList(client); });
    }
    client.from('ticket_documents').select('*, tickets(customer_name, device_type, brand, model)').order('created_at', { ascending: false }).limit(300).then(function (res) {
      if (res.error) { fallback(); return; }
      docTabRows = res.data || [];
      renderDocTabList(client);
    }).catch(function () { fallback(); });
  }

  function renderDocTabList(client) {
    var box = $('portal-docs-list');
    if (!box) return;
    var rows = docTabRows || [];
    var q = '';
    var search = $('portal-docs-search');
    if (search) q = trim(search.value).toLowerCase();
    var shown = rows.filter(function (d) {
      if (!q) return true;
      var cust = d.tickets && d.tickets.customer_name ? d.tickets.customer_name : '';
      var hay = (cust + ' ' + (d.file_name || '') + ' ' + (d.signer_name || '')).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
    if (!rows.length) { box.innerHTML = '<p class="portal-muted">No documents filed yet. Signed authorizations and attachments from tickets will show up here.</p>'; return; }
    if (!shown.length) { box.innerHTML = '<p class="portal-muted">No documents match that search.</p>'; return; }
    box.innerHTML = shown.map(function (d) {
      var cust = d.tickets && d.tickets.customer_name ? esc(d.tickets.customer_name) : null;
      var dev = d.tickets ? esc(deviceLabel(d.tickets)) : '';
      var head = cust ? '<span class="p2-line-amt">' + cust + '</span>' : '<span class="p2-kind">Unattached</span>';
      var meta = esc(fmtDateTime(d.signed_at || d.created_at));
      if (dev) meta += ' &middot; ' + dev;
      if (d.signer_name) meta += ' &middot; Signed by ' + esc(d.signer_name);
      if (d.file_name) meta += ' &middot; ' + esc(d.file_name);
      var html = '<div class="p2-line"><div class="p2-line-main"><span class="p2-kind">' + esc(DOC_TYPE_LABELS[d.doc_type] || 'Document') + '</span>' + head +
        '<br /><span class="portal-muted portal-small">' + meta + '</span></div>' +
        '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-doc-view="' + esc(d.storage_path) + '" data-doc-view-name="' + esc(d.file_name || '') + '"><i class="fas fa-eye"></i> View</button>';
      if (!d.ticket_id) {
        html += ' <button class="portal-btn portal-btn-primary portal-btn-sm" type="button" data-doc-attach="' + esc(d.id) + '"><i class="fas fa-paperclip"></i> Attach</button>';
      }
      html += '</div>';
      if (!d.ticket_id) {
        html += '<div class="p2-form" id="picker-' + esc(d.id) + '" hidden><div class="p2-form-row">' +
          '<select data-pick-select="' + esc(d.id) + '" aria-label="Choose the ticket for this document"><option value="">Loading tickets&hellip;</option></select>' +
          '<button class="portal-btn portal-btn-primary portal-btn-sm" type="button" data-attach-confirm="' + esc(d.id) + '">Attach to this ticket</button></div></div>';
      }
      return html;
    }).join('');
    var views = box.querySelectorAll('[data-doc-view]');
    for (var i = 0; i < views.length; i++) {
      views[i].addEventListener('click', function () { viewDocTab(client, this.getAttribute('data-doc-view'), this.getAttribute('data-doc-view-name')); });
    }
    var attaches = box.querySelectorAll('[data-doc-attach]');
    for (var j = 0; j < attaches.length; j++) {
      attaches[j].addEventListener('click', function () { toggleDocPicker(client, this.getAttribute('data-doc-attach')); });
    }
    var confirms = box.querySelectorAll('[data-attach-confirm]');
    for (var k = 0; k < confirms.length; k++) {
      confirms[k].addEventListener('click', function () { confirmDocAttach(client, this.getAttribute('data-attach-confirm')); });
    }
  }

  function viewDocTab(client, path, fileName) {
    if (!path) return;
    docTabListMsg('');
    viewStoredDocument(client, path, fileName, function () { docTabListMsg('Could not open that document — try again.'); });
  }

  function toggleDocPicker(client, docId) {
    var picker = document.getElementById('picker-' + docId);
    if (!picker) return;
    if (!picker.hidden) { picker.hidden = true; return; }
    picker.hidden = false;
    var sel = picker.querySelector('select');
    function fill(tickets) {
      if (!tickets.length) { sel.innerHTML = '<option value="">No tickets found</option>'; return; }
      sel.innerHTML = tickets.map(function (tk) {
        return '<option value="' + esc(tk.id) + '">' + esc((tk.customer_name || 'No name') + ' · ' + deviceLabel(tk) + ' · ' + (tk.status || '')) + '</option>';
      }).join('');
    }
    if (docTicketOptions) { fill(docTicketOptions); return; }
    client.from('tickets').select('id, customer_name, device_type, brand, model, status').order('created_at', { ascending: false }).limit(200).then(function (res) {
      docTicketOptions = res.error ? [] : (res.data || []);
      fill(docTicketOptions);
    }).catch(function () { docTicketOptions = []; fill(docTicketOptions); });
  }

  /* The unattached documents: ticket_documents rows with ticket_id
   * NULL — the same set the Documents tab presents as unattached
   * (its list loads every row; these are the ones with no ticket).
   * done(rows): rows is null when the query failed, so callers can
   * tell "none waiting" apart from "could not load". */
  function loadUnattachedDocuments(client, done) {
    client.from('ticket_documents').select('*').is('ticket_id', null).order('created_at', { ascending: false }).then(function (res) {
      done(res.error ? null : (res.data || []));
    }).catch(function () { done(null); });
  }

  /* Shared attach (PORTAL_ATTACH_EXISTING_2026_10_30): file an
   * existing, unattached document onto a ticket. This is the ONE
   * implementation of that move — the Documents tab picker
   * (confirmDocAttach, below) and the ticket drawer's "Attach an
   * existing document" list (loadExistingList) both call it.
   * It sets ONLY ticket_id: a move, never a copy, and it changes no
   * consent flags by itself — flag side-effects stay with the
   * calling flow (the tab's picker still marks a signed
   * authorization accepted after a successful attach, exactly as it
   * did before this update was shared out). done(errText): errText
   * is null on success. */
  function fileExistingDocumentOnTicket(client, docId, ticketId, done) {
    client.from('ticket_documents').update({ ticket_id: ticketId }).eq('id', docId).then(function (res) {
      if (res.error) { done('Could not attach that document — try again.'); return; }
      done(null);
    }).catch(function () { done('Could not attach that document — try again.'); });
  }

  function confirmDocAttach(client, docId) {
    var picker = document.getElementById('picker-' + docId);
    if (!picker) return;
    var sel = picker.querySelector('select');
    var ticketId = sel ? sel.value : '';
    if (!ticketId) { docTabListMsg('Pick a ticket for that document first.'); return; }
    docTabListMsg('');
    var docRow = null;
    (docTabRows || []).forEach(function (d) { if (d.id === docId) docRow = d; });
    fileExistingDocumentOnTicket(client, docId, ticketId, function (errText) {
      if (errText) { docTabListMsg(errText); return; }
      function done() { loadDocTabList(client); }
      if (docRow && docRow.doc_type === 'repair_authorization') {
        markAuthorizationAccepted(client, { id: ticketId }).then(done).catch(done);
      } else { done(); }
    });
  }

  function wireDocTab(client) {
    if (docTabWired) return;
    docTabWired = true;
    var search = $('portal-docs-search');
    if (search) search.addEventListener('input', function () { renderDocTabList(client); });
    var upBtn = $('portal-docs-up-btn');
    if (upBtn) upBtn.addEventListener('click', function () { uploadUnattached(client); });
  }

  function uploadUnattached(client) {
    var msg = $('portal-docs-up-msg');
    function fail(text) { if (msg) { msg.textContent = text; msg.hidden = false; } }
    if (msg) { msg.hidden = true; msg.textContent = ''; }
    var fileInput = $('portal-docs-up-file');
    var file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) { fail('Choose a file first.'); return; }
    if (file.size > 15 * 1024 * 1024) { fail('That file is over 15 MB — try a smaller scan or photo.'); return; }
    var typeSel = $('portal-docs-up-type');
    var type = typeSel ? typeSel.value : 'other';
    if (DOC_TYPE_LABELS[type] === undefined) type = 'other';
    var signerEl = $('portal-docs-up-signer');
    var signer = signerEl ? trim(signerEl.value) : '';
    var btn = $('portal-docs-up-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Uploading…'; }
    var path = 'unattached/' + type + '-' + docStamp() + '-' + safeFileName(file.name);
    client.storage.from(DOC_BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false }).then(function (up) {
      if (up.error) { if (btn) { btn.disabled = false; btn.textContent = 'Upload'; } fail('Upload failed — check the connection and try again.'); return; }
      var row = {
        ticket_id: null, doc_type: type, storage_path: path, file_name: file.name,
        signer_name: signer || null,
        signed_at: type === 'repair_authorization' ? new Date().toISOString() : null
      };
      client.from('ticket_documents').insert(row).then(function (res) {
        if (btn) { btn.disabled = false; btn.textContent = 'Upload'; }
        if (res.error) { fail('The file uploaded but could not be filed — try again.'); return; }
        if (fileInput) fileInput.value = '';
        if (signerEl) signerEl.value = '';
        loadDocTabList(client);
      }).catch(function () { if (btn) { btn.disabled = false; btn.textContent = 'Upload'; } fail('The file uploaded but could not be filed — try again.'); });
    }).catch(function () { if (btn) { btn.disabled = false; btn.textContent = 'Upload'; } fail('Upload failed — check the connection and try again.'); });
  }

  function showTrackingPopup(client, t) {
    client.from('part_orders').select('*').eq('ticket_id', t.id).order('created_at', { ascending: false }).limit(1).then(function (res) {
      var part = (!res.error && res.data && res.data[0]) || null;
      buildTrackingPopup(client, t, part);
    }).catch(function () { buildTrackingPopup(client, t, null); });
  }

  function buildTrackingPopup(client, t, part) {
    var old = document.getElementById('p2-track-popup');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var wrap = document.createElement('div');
    wrap.id = 'p2-track-popup';
    wrap.setAttribute('style', 'position:fixed;inset:0;background:rgba(44,35,26,0.55);z-index:3000;display:flex;align-items:center;justify-content:center;padding:1rem;');
    var card = '<div style="background:#FAF6EE;color:#2C231A;border-radius:14px;max-width:430px;width:100%;padding:1.25rem;box-shadow:0 18px 50px rgba(0,0,0,0.35);">' +
      '<h3 style="margin:0 0 0.5rem;">Part tracking</h3>';
    if (part) {
      card += '<p class="portal-muted portal-small" style="margin:0 0 0.75rem;">This ticket is now Awaiting Parts. Add the shipping details for <strong>' + esc(part.description) + '</strong> and the customer can follow the package. No tracking yet? Tap N.A. and add it later from the part&rsquo;s Tracking button.</p>' +
        '<div class="portal-field"><label for="p2-pop-carrier">Carrier</label><select id="p2-pop-carrier">' + carrierOptions(part.carrier) + '</select></div>' +
        '<div class="portal-field"><label for="p2-pop-number">Tracking number</label><input type="text" id="p2-pop-number" maxlength="80" value="' + esc(part.tracking_number || '') + '" /></div>' +
        '<div class="portal-field"><label for="p2-pop-order">Order number</label><input type="text" id="p2-pop-order" maxlength="80" value="' + esc(part.order_number || '') + '" /></div>';
    } else {
      card += '<p class="portal-muted portal-small" style="margin:0 0 0.75rem;">This ticket is now Awaiting Parts, but no part has been added to it yet. Add the part in the Parts section, then use its Tracking button to enter the carrier, tracking number, and order number when you have them.</p>';
    }
    card += '<div class="p2-actions" style="margin-top:0.75rem;">' +
      (part ? '<button class="portal-btn portal-btn-primary portal-btn-sm" type="button" id="p2-pop-save">Save tracking</button> ' : '') +
      '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" id="p2-pop-na">' + (part ? 'N.A.' : 'N.A. &mdash; add the part first') + '</button>' +
      '<span class="portal-muted portal-small" id="p2-pop-msg"></span></div></div>';
    wrap.innerHTML = card;
    document.body.appendChild(wrap);
    function close() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    var na = wrap.querySelector('#p2-pop-na');
    if (na) na.addEventListener('click', close);
    var save = wrap.querySelector('#p2-pop-save');
    if (save && part) save.addEventListener('click', function () {
      var msg = wrap.querySelector('#p2-pop-msg');
      if (msg) msg.textContent = 'Saving\u2026';
      var patch = {
        carrier: wrap.querySelector('#p2-pop-carrier').value || null,
        tracking_number: trim(wrap.querySelector('#p2-pop-number').value) || null,
        order_number: trim(wrap.querySelector('#p2-pop-order').value) || null
      };
      client.from('part_orders').update(patch).eq('id', part.id).then(function (res) {
        if (res.error) { if (msg) msg.textContent = 'Couldn\u2019t save \u2014 try again.'; return; }
        close();
        loadParts(client, t);
      }).catch(function () { if (msg) msg.textContent = 'Couldn\u2019t save \u2014 try again.'; });
    });
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

  /* PORTAL_SIGNED_RECEIPT_2026_10_30 (Austin, Oct 30, 2026): the
   * uBreakiFix-style signed receipt. When the ticket has a signed
   * Repair Authorization on file, the receipt prints the customer's
   * signature itself, a link the customer can open to view the full
   * signed document, and a short basic-terms summary (the "terms on
   * the back of the receipt"). No signed authorization (verbal
   * consent or none) — the receipt simply omits the signature and
   * the link; the terms block always prints. Printing never waits
   * on this lookup for long and never fails because of it: any
   * error, or a 6-second timeout, prints the receipt without the
   * signature extras.
   *
   * The signature comes out of the filed authorization document
   * itself: for the normal .html filing, fetch the document text
   * through a signed URL and pull the composited signature image
   * (the data:image in the document's signature block). The PNG
   * fallback filing IS the bare signature image, so its signed URL
   * is printed directly (and there is no full document to link to,
   * so no link). The view link expires after one year
   * (RECEIPT_AUTH_URL_SECONDS) and goes through view-doc.html,
   * because storage serves these HTML files as raw text — the
   * viewer page fetches and renders the document properly. */
  var RECEIPT_TERMS_SUMMARY = [
    'Repairs include a 1-year limited warranty on parts installed and labor performed.',
    'The $35 house-call fee is non-refundable.',
    'Balance is due on completion, before the device is released.',
    'Back up your device before service — we are not responsible for lost data.',
    'Devices left unclaimed more than 60 days after completion notice may be treated as abandoned under Ohio law.',
    'Card payments carry a processing fee at Square&rsquo;s actual rate.'
  ];

  function fetchReceiptAuthorization(client, t, cb) {
    var settled = false;
    var timer = setTimeout(function () { finish(null); }, 6000);
    function finish(auth) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cb(auth);
    }
    try {
      client.from('ticket_documents').select('*').eq('ticket_id', t.id).eq('doc_type', 'repair_authorization')
        .order('created_at', { ascending: false }).limit(1).then(function (res) {
          if (res.error || !res.data || !res.data.length) { finish(null); return; }
          var row = res.data[0];
          var auth = { signerName: row.signer_name || '', signedAt: row.signed_at || row.created_at || '', sigSrc: '', viewerUrl: '' };
          client.storage.from(DOC_BUCKET).createSignedUrl(row.storage_path, RECEIPT_AUTH_URL_SECONDS).then(function (r) {
            if (r.error || !r.data || !r.data.signedUrl) { finish(null); return; }
            var url = r.data.signedUrl;
            var path = String(row.storage_path || '');
            if (/\.html?$/i.test(path)) {
              auth.viewerUrl = DOC_VIEWER_URL + encodeURIComponent(url);
              fetch(url).then(function (resp) { return resp.text(); }).then(function (text) {
                var m = String(text || '').match(/alt="Customer signature"\s+src="(data:image\/[^"]+)"/);
                if (m) auth.sigSrc = m[1];
                finish(auth);
              }).catch(function () { finish(auth); });
            } else if (/\.(png|jpe?g)$/i.test(path)) {
              auth.sigSrc = url;
              finish(auth);
            } else {
              finish(null);
            }
          }).catch(function () { finish(null); });
        }).catch(function () { finish(null); });
    } catch (e) { finish(null); }
  }

  function printReceipt(client, t) {
    fetchReceiptAuthorization(client, t, function (auth) {
      var rows = t._charges || [];
      var tot = chargeTotals(rows);
      var lines = rows.map(function (c) {
        var amt = Number(c.qty || 0) * Number(c.unit_price || 0);
        var label = c.kind === 'deposit_credit' ? esc(c.description) + ' (deposit)' : esc(c.description);
        var sign = c.kind === 'deposit_credit' ? '&minus;' : '';
        return '<tr><td>' + label + '</td><td class="rc-num">' + esc(c.qty) + '</td><td class="rc-num">' + sign + fmtMoney(Math.abs(amt)) + '</td></tr>';
      }).join('');
      if (!rows.length) lines = '<tr><td colspan="3">No charges recorded.</td></tr>';
      var sigHtml = '';
      if (auth && (auth.sigSrc || auth.viewerUrl)) {
        sigHtml = '<div class="rc-sig">' +
          (auth.sigSrc ? '<p class="rc-sig-head">Customer signature</p><img class="rc-sig-img" src="' + esc(auth.sigSrc) + '" alt="Customer signature"/>' : '') +
          (auth.signerName || auth.signedAt ? '<p class="rc-sig-cap">Signed by ' + esc(auth.signerName) + (auth.signedAt ? ' &middot; ' + esc(fmtDateTime(auth.signedAt)) : '') + '</p>' : '') +
          (auth.viewerUrl ? '<p class="rc-auth"><a href="' + esc(auth.viewerUrl) + '">View your signed Repair Authorization</a><br/><span class="rc-auth-url">' + esc(auth.viewerUrl) + '</span></p>' : '') +
          '</div>';
      }
      var termsHtml = '<div class="rc-terms"><p class="rc-terms-head">Basic terms</p><ul>' +
        RECEIPT_TERMS_SUMMARY.map(function (line) { return '<li>' + line + '</li>'; }).join('') +
        '</ul></div>';
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
        sigHtml +
        termsHtml +
        '<p class="rc-foot">Repairs are backed by our 1-Year Limited Warranty (parts &amp; labor). The $35 house-call fee is non-refundable. Thank you for your business!</p>' +
        '</div>';
      printArea(html, 'receipt');
    });
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
    if (receiptBtn) receiptBtn.addEventListener('click', function () { printReceipt(client, t); });

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

    /* ---------- Barcode scan: attach a part from its packaging code ---------- */
    var scanStream = null, scanTimer = null, scanReader = null;
    function stopScan() {
      if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
      if (scanReader && scanReader.reset) { try { scanReader.reset(); } catch (e) {} scanReader = null; }
      if (scanStream) { scanStream.getTracks().forEach(function (tr) { tr.stop(); }); scanStream = null; }
      var v = $('p2-scan-video'); if (v) v.srcObject = null;
      var box = $('p2-scan-box'); if (box) box.hidden = true;
    }
    function applyScannedCode(code, client) {
      code = String(code || '').trim();
      if (!code) return;
      stopScan();
      var msg = $('p2-scan-msg'); if (msg) msg.textContent = 'Scanned: ' + code + ' — looking it up…';
      $('p2-part-sku').value = code;
      if (!$('p2-part-supplier').value) $('p2-part-supplier').value = 'Mobile Sentrix';
      /* Match order: stock first, then a part already ordered on another ticket. */
      client.from('inventory').select('*').eq('supplier_sku', code).maybeSingle().then(function (res) {
        if (res.data) {
          var it = res.data;
          if (!$('p2-part-desc').value) $('p2-part-desc').value = it.product_name || '';
          if (it.cost != null) $('p2-part-cost').value = it.cost;
          if (it.retail_price != null) $('p2-part-retail').value = it.retail_price;
          if (msg) msg.textContent = 'Matched stock: ' + (it.product_name || code) + ' — tap Add part order to attach it.';
          return;
        }
        return client.from('part_orders').select('*').eq('supplier_sku', code).order('created_at', { ascending: false }).limit(1).maybeSingle();
      }).then(function (res) {
        if (res && res.data) {
          var po = res.data;
          if (!$('p2-part-desc').value) $('p2-part-desc').value = po.description || '';
          if (po.supplier) $('p2-part-supplier').value = po.supplier;
          if (po.our_cost != null) $('p2-part-cost').value = po.our_cost;
          if (po.retail_price != null) $('p2-part-retail').value = po.retail_price;
          if (msg) msg.textContent = 'Matched an earlier part order: ' + (po.description || code) + ' — tap Add part order to attach it.';
        } else if (msg && msg.textContent.indexOf('Matched') !== 0) {
          msg.textContent = 'No match on file for ' + code + ' — code and supplier are filled in, add the description and price, then tap Add part order. It will match next time.';
        }
      }).catch(function () {
        if (msg) msg.textContent = 'Code filled in as ' + code + ' — add the description and price, then tap Add part order.';
      });
    }
    var scanBtn = $('p2-scan-btn');
    if (scanBtn) scanBtn.addEventListener('click', function () {
      var box = $('p2-scan-box'); if (!box) return;
      box.hidden = false;
      var status = $('p2-scan-status');
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (status) status.textContent = 'This device cannot open the camera here — type the code below instead.';
        return;
      }
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function (stream) {
        scanStream = stream;
        var v = $('p2-scan-video'); v.srcObject = stream; v.play();
        if (status) status.textContent = 'Point the camera at the barcode…';
        if (window.BarcodeDetector) {
          var det = new BarcodeDetector({ formats: ['upc_a', 'upc_e', 'ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code'] });
          scanTimer = setInterval(function () {
            det.detect(v).then(function (codes) {
              if (codes && codes.length) applyScannedCode(codes[0].rawValue, client);
            }).catch(function () {});
          }, 500);
        } else if (window.ZXing) {
          try {
            scanReader = new ZXing.BrowserMultiFormatReader();
            scanReader.decodeFromVideoDevice(null, v, function (result) {
              if (result) applyScannedCode(result.getText(), client);
            });
          } catch (e) {
            if (status) status.textContent = 'Camera opened but barcode reading is not available here — type the code below instead.';
          }
        } else {
          var s = document.createElement('script');
          s.src = 'https://unpkg.com/@zxing/browser@0.1.5/umd/index.min.js';
          s.onload = function () {
            if (!window.ZXing) { if (status) status.textContent = 'Barcode reading could not load — type the code below instead.'; return; }
            try {
              scanReader = new ZXing.BrowserMultiFormatReader();
              scanReader.decodeFromVideoDevice(null, v, function (result) {
                if (result) applyScannedCode(result.getText(), client);
              });
            } catch (e) {}
          };
          s.onerror = function () { if (status) status.textContent = 'Barcode reading could not load — type the code below instead.'; };
          document.head.appendChild(s);
        }
      }).catch(function () {
        if (status) status.textContent = 'Camera permission was denied — type the code below instead.';
      });
    });
    var scanStop = $('p2-scan-stop');
    if (scanStop) scanStop.addEventListener('click', stopScan);
    var scanUse = $('p2-scan-use');
    if (scanUse) scanUse.addEventListener('click', function () {
      var code = $('p2-scan-manual') ? $('p2-scan-manual').value : '';
      applyScannedCode(code, client);
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
        carrier: trim($('p2-part-carrier').value) || null,
        tracking_number: trim($('p2-part-tracking').value) || null,
        order_number: trim($('p2-part-ordernum').value) || null,
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

  /* ================= ATR ONE ON THE TICKET =================
   * PORTAL_ATRONE_TICKET_2026_10_30 (Austin, Oct 30, 2026): everything
   * for a job lives in the ticket. When a customer signs up for ATR
   * One during a visit, staff record it here by hand — the sale itself
   * runs through the Square signup links, but the portal record does
   * not depend on Square. The membership belongs to the CUSTOMER
   * (customer_memberships table, see memberships.sql); this drawer
   * block, placed right above Charges where the house-call fee
   * decision happens, shows it and writes it.
   * Adding a membership ALSO files a charge line on THIS ticket —
   * kind 'one_off' (a kind Financials already counts as revenue),
   * qty 1 at the tier's monthly price, description naming the
   * signup — so the sale is billed revenue on the ticket, shows in
   * the drawer's Charges and on the receipt, and lands in Financials
   * exactly like any other billed line. The money itself is recorded
   * through the normal Payment section when it comes in, same as
   * every other charge; nothing is marked paid automatically.
   * Cancelling sets status 'cancelled' with cancelled_on set — the
   * row and the signup charge stay on file, nothing is deleted.
   * Member benefit is DISPLAY ONLY in v1: the block states the
   * standing rule (no $35 house-call fee on covered devices); no
   * charge math changes automatically. */
  var ATRONE_TIERS = {
    single: { name: 'Single', price: 9.99 },
    family: { name: 'Family', price: 19.99 },
    business_plus: { name: 'Business Plus', price: 39.99 },
    business_pro: { name: 'Business Pro', price: 49.99 }
  };
  var ATRONE_BENEFIT_LINE = 'Member benefit: ATR One members pay no $35 house-call fee for devices covered under their subscription. Do not add the house-call fee for a covered device.';

  function atroneTierName(key) {
    var tr = ATRONE_TIERS[key];
    return tr ? tr.name : String(key || '');
  }

  function todayDateOnly() {
    var d = new Date();
    var mm = d.getMonth() + 1, dd = d.getDate();
    return d.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
  }

  function atrMsg(text) {
    var m = $('p5-atr-msg');
    if (!m) return;
    if (text) { m.textContent = text; m.hidden = false; }
    else { m.hidden = true; m.textContent = ''; }
  }

  function loadMembership(client, t, afterMsg) {
    var box = $('p5-atrone');
    if (!box) return;
    if (!t.customer_id) {
      box.innerHTML = '<p class="portal-muted">This ticket is not linked to a customer account yet (web submission), so an ATR One membership can&rsquo;t be recorded on it. Memberships live on the customer record.</p>';
      return;
    }
    client.from('customer_memberships').select('*').eq('customer_id', t.customer_id).eq('status', 'active')
      .order('started_on', { ascending: false }).limit(1).then(function (res) {
        if (res.error) { box.innerHTML = '<p class="portal-muted">Memberships are not set up for this portal yet.</p>'; return; }
        renderMembership(client, t, (res.data && res.data[0]) || null);
        if (afterMsg) atrMsg(afterMsg);
      }).catch(function () { box.innerHTML = '<p class="portal-muted">Membership could not be loaded.</p>'; });
  }

  function renderMembership(client, t, m) {
    var box = $('p5-atrone');
    if (!box) return;
    atrMsg('');
    if (m) {
      var tier = ATRONE_TIERS[m.tier] || null;
      box.innerHTML =
        '<p style="margin:0 0 .35rem"><span class="portal-badge portal-badge-atrone"><i class="fas fa-star"></i> ATR One member</span></p>' +
        '<p style="margin:.2rem 0"><strong>' + esc(atroneTierName(m.tier)) + '</strong>' +
        (tier ? ' &middot; ' + fmtMoney(tier.price) + '/mo' : '') +
        ' &middot; member since ' + esc(fmtJobDate(m.started_on) || fmtDate(m.started_on)) + '</p>' +
        (m.note ? '<p class="portal-muted portal-small" style="margin:.2rem 0">' + esc(m.note) + '</p>' : '') +
        '<p class="portal-muted portal-small" style="margin:.35rem 0">' + ATRONE_BENEFIT_LINE + '</p>' +
        '<div class="p2-actions"><button class="portal-btn portal-btn-outline portal-btn-sm" type="button" id="p5-atr-cancel">Cancel membership</button></div>' +
        '<div id="p5-atr-cancel-confirm" hidden><p class="portal-error">Cancel this ATR One membership? The membership record and its signup charge stay on file; the member benefits stop. Normally this matches a cancellation in Square too.</p>' +
        '<button class="portal-btn p2-btn-danger portal-btn-sm" type="button" id="p5-atr-cancel-yes">Yes, cancel membership</button> ' +
        '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" id="p5-atr-cancel-no">Keep membership</button></div>';
      var cancelBtn = $('p5-atr-cancel'), confirmBox = $('p5-atr-cancel-confirm');
      if (cancelBtn && confirmBox) {
        cancelBtn.addEventListener('click', function () { confirmBox.hidden = false; cancelBtn.hidden = true; });
        $('p5-atr-cancel-no').addEventListener('click', function () { confirmBox.hidden = true; cancelBtn.hidden = false; });
        $('p5-atr-cancel-yes').addEventListener('click', function () {
          atrMsg('');
          client.from('customer_memberships').update({ status: 'cancelled', cancelled_on: todayDateOnly() }).eq('id', m.id).then(function (res) {
            if (res.error) { atrMsg('Could not cancel — try again.'); return; }
            loadMembership(client, t, 'Membership cancelled and recorded. The signup charge stays on the ticket.');
          }).catch(function () { atrMsg('Could not cancel — try again.'); });
        });
      }
      return;
    }
    var opts = Object.keys(ATRONE_TIERS).map(function (k) {
      var tr = ATRONE_TIERS[k];
      return '<option value="' + k + '">' + esc(tr.name) + ' — ' + fmtMoney(tr.price) + '/mo</option>';
    }).join('');
    box.innerHTML =
      '<p class="portal-muted" style="margin-top:0">No ATR One membership on this customer. If they sign up during this visit (through the Square signup links), record it here so it lives on the ticket.</p>' +
      '<div class="p2-form-row"><select id="p5-atr-tier" aria-label="ATR One tier">' + opts + '</select>' +
      '<input id="p5-atr-note" type="text" placeholder="Note (optional)" maxlength="200" aria-label="Membership note" /></div>' +
      '<div class="p2-actions" style="margin-top:.5rem"><button class="portal-btn portal-btn-primary portal-btn-sm" type="button" id="p5-atr-add"><i class="fas fa-plus"></i> Add ATR One membership</button></div>' +
      '<p class="portal-muted portal-small">Adding files the signup as a charge line on this ticket at the tier price, so it shows in Charges and counts in Financials. Record the payment itself in the Payment section when it comes in.</p>';
    var addBtn = $('p5-atr-add');
    if (addBtn) addBtn.addEventListener('click', function () {
      atrMsg('');
      var tierKey = $('p5-atr-tier').value;
      var tier = ATRONE_TIERS[tierKey] || null;
      if (!tier) { atrMsg('Pick a tier first.'); return; }
      var note = trim($('p5-atr-note').value) || null;
      addBtn.disabled = true; addBtn.textContent = 'Adding…';
      client.from('customer_memberships').insert({
        customer_id: t.customer_id, tier: tierKey, status: 'active',
        started_on: todayDateOnly(), note: note
      }).then(function (res) {
        if (res.error) {
          addBtn.disabled = false; addBtn.textContent = 'Add ATR One membership';
          atrMsg(res.error && res.error.code === '23505'
            ? 'This customer already has an active ATR One membership on file.'
            : 'Could not save the membership — try again.');
          return;
        }
        var desc = 'ATR One membership signup — ' + tier.name + ' (' + fmtMoney(tier.price) + '/mo)';
        var handMsg = 'Membership saved, but the signup charge line could not be added. Add it by hand in Charges below: Other charge, "' + desc + '", ' + fmtMoney(tier.price) + '.';
        client.from('ticket_charges').insert({
          ticket_id: t.id, kind: 'one_off', description: desc,
          qty: 1, unit_price: tier.price, unit_cost: null
        }).then(function (res2) {
          loadCharges(client, t);
          loadMembership(client, t, res2.error ? handMsg : 'Membership recorded on this customer, and the signup charge is on this ticket.');
        }).catch(function () {
          loadMembership(client, t, handMsg);
        });
      }).catch(function () {
        addBtn.disabled = false; addBtn.textContent = 'Add ATR One membership';
        atrMsg('Could not save the membership — try again.');
      });
    });
  }

  /* ================= FINANCIALS =================
   * PORTAL_FINANCIALS_2026_10_30 (Austin, Oct 30, 2026): the money
   * picture, from the shop's own records only — nothing seeded,
   * nothing estimated. Fields used:
   *   ticket_charges: kind, qty, unit_price, ticket_id, created_at.
   *     Revenue   = every line that is NOT a deposit_credit
   *                 (qty x unit_price — what tickets billed).
   *     Collected = deposit_credit lines (payments are recorded on
   *                 the ticket itself as "Deposit received (credit)"
   *                 lines, e.g. the cash button's "Paid in cash").
   *   part_orders: our_cost, qty, status, ticket_id, created_at.
   *     Parts cost = our_cost x qty — OUR cost, never retail_price
   *     (the customer price). Cancelled orders are excluded; an
   *     order with no cost recorded counts as $0.
   *   tickets: id, job_date — every row is bucketed by its ticket's
   *   job_date so a job counts in the month the work was done;
   *   rows whose ticket is gone fall back to their created_at. */
  var finPeriod = 'all';
  var finCache = null;
  var finWired = false;

  function finRowDate(row, jobByTicket) {
    var jd = row.ticket_id ? jobByTicket[row.ticket_id] : null;
    if (jd) {
      var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(jd));
      if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
    if (row.created_at) {
      var d = new Date(row.created_at);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  }

  function finInPeriod(d) {
    if (finPeriod === 'all') return true;
    if (!d) return false;
    var now = new Date();
    if (finPeriod === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    if (finPeriod === '30d') {
      var start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      var day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      return day >= start && day <= now;
    }
    return true;
  }

  function finSum(charges, parts, jobByTicket, inPeriod) {
    var revenue = 0, collected = 0, partsCost = 0;
    charges.forEach(function (c) {
      var d = finRowDate(c, jobByTicket);
      if (inPeriod && !finInPeriod(d)) return;
      var amt = Number(c.qty || 0) * Number(c.unit_price || 0);
      if (c.kind === 'deposit_credit') collected += amt; else revenue += amt;
    });
    parts.forEach(function (p) {
      if (p.status === 'Cancelled') return;
      var d = finRowDate(p, jobByTicket);
      if (inPeriod && !finInPeriod(d)) return;
      partsCost += (Number(p.our_cost) || 0) * (Number(p.qty) || 0);
    });
    return { revenue: revenue, collected: collected, partsCost: partsCost, gross: revenue - partsCost };
  }

  function finMonthKey(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); }

  function finMonths(charges, parts, jobByTicket) {
    var keys = [], byKey = {}, now = new Date(), i, d, k;
    for (i = 5; i >= 0; i--) {
      d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      k = finMonthKey(d);
      keys.push({ key: k, label: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) });
      byKey[k] = { revenue: 0, partsCost: 0 };
    }
    charges.forEach(function (c) {
      if (c.kind === 'deposit_credit') return;
      var dt = finRowDate(c, jobByTicket); if (!dt) return;
      var b = byKey[finMonthKey(dt)]; if (!b) return;
      b.revenue += Number(c.qty || 0) * Number(c.unit_price || 0);
    });
    parts.forEach(function (p) {
      if (p.status === 'Cancelled') return;
      var dt = finRowDate(p, jobByTicket); if (!dt) return;
      var b = byKey[finMonthKey(dt)]; if (!b) return;
      b.partsCost += (Number(p.our_cost) || 0) * (Number(p.qty) || 0);
    });
    return keys.map(function (kk) {
      var v = byKey[kk.key];
      return { label: kk.label, revenue: v.revenue, partsCost: v.partsCost };
    });
  }

  function finDonut(revenue, partsCost, gross) {
    var C = 2 * Math.PI * 80;
    var ORANGE = '#D9540D', INK = '#2C231A', CREAM = '#EFE3CC';
    var slices = '';
    if (revenue > 0 && gross >= 0) {
      var pf = Math.min(1, partsCost / revenue);
      slices =
        '<circle cx="100" cy="100" r="80" fill="none" stroke="' + ORANGE + '" stroke-width="34" stroke-dasharray="' + ((1 - pf) * C).toFixed(1) + ' ' + C.toFixed(1) + '" stroke-dashoffset="' + (-pf * C).toFixed(1) + '" transform="rotate(-90 100 100)"/>' +
        '<circle cx="100" cy="100" r="80" fill="none" stroke="' + INK + '" stroke-width="34" stroke-dasharray="' + (pf * C).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 100 100)"/>';
    } else if (revenue > 0 && gross < 0) {
      slices = '<circle cx="100" cy="100" r="80" fill="none" stroke="' + INK + '" stroke-width="34"/>';
    }
    return '<svg viewBox="0 0 200 200" width="190" height="190" role="img" aria-label="Donut chart of revenue split between parts cost and gross profit">' +
      '<circle cx="100" cy="100" r="80" fill="none" stroke="' + CREAM + '" stroke-width="34"/>' + slices +
      '<text x="100" y="93" text-anchor="middle" class="fin-donut-label">Revenue</text>' +
      '<text x="100" y="119" text-anchor="middle" class="fin-donut-value">' + esc(fmtMoney(revenue)) + '</text></svg>';
  }

  function finCard(label, value) {
    return '<div class="fin-card"><p class="fin-card-label">' + label + '</p><p class="fin-card-value">' + esc(fmtMoney(value)) + '</p></div>';
  }

  function renderFinancials() {
    var body = $('portal-financials-body');
    if (!body || !finCache) return;
    var t = finSum(finCache.charges, finCache.parts, finCache.jobByTicket, true);
    var margin = t.revenue > 0 ? (t.gross / t.revenue * 100) : null;
    var html = '';
    if (!finCache.charges.length && !finCache.parts.length) {
      html += '<p class="portal-muted">Nothing recorded yet. As tickets get charges and part orders, the money picture fills in here.</p>';
    }
    html += '<div class="fin-cards">' +
      finCard('Revenue (billed)', t.revenue) +
      finCard('Collected (paid)', t.collected) +
      finCard('Parts cost (ours)', t.partsCost) +
      finCard('Gross profit', t.gross) +
      '<div class="fin-card"><p class="fin-card-label">Margin</p><p class="fin-card-value">' + (margin == null ? '&mdash;' : margin.toFixed(1) + '%') + '</p></div>' +
      '</div>';
    html += '<div class="fin-chart-wrap">' + finDonut(t.revenue, t.partsCost, t.gross) +
      '<div class="fin-legend">' +
      '<p><span class="fin-dot" style="background:#D9540D"></span>Gross profit &mdash; <strong>' + esc(fmtMoney(t.gross)) + '</strong>' + (t.revenue > 0 ? ' (' + Math.round(t.gross / t.revenue * 100) + '%)' : '') + '</p>' +
      '<p><span class="fin-dot" style="background:#2C231A"></span>Parts cost &mdash; <strong>' + esc(fmtMoney(t.partsCost)) + '</strong>' + (t.revenue > 0 ? ' (' + Math.round(t.partsCost / t.revenue * 100) + '%)' : '') + '</p>' +
      (t.gross < 0 ? '<p class="portal-error">Parts cost more than revenue in this period.</p>' : '') +
      '<p class="portal-muted portal-small">Collected so far: ' + esc(fmtMoney(t.collected)) + ' of ' + esc(fmtMoney(t.revenue)) + ' billed.</p>' +
      '</div></div>';
    var months = finMonths(finCache.charges, finCache.parts, finCache.jobByTicket);
    html += '<div class="portal-panel-head portal-subhead"><h3 class="portal-h3">Last 6 months</h3></div>' +
      '<div class="portal-table-wrap"><table class="portal-table"><thead><tr><th>Month</th><th>Revenue</th><th>Parts cost</th><th>Gross profit</th></tr></thead><tbody>' +
      months.map(function (m) {
        return '<tr><td>' + esc(m.label) + '</td><td>' + esc(fmtMoney(m.revenue)) + '</td><td>' + esc(fmtMoney(m.partsCost)) + '</td><td>' + esc(fmtMoney(m.revenue - m.partsCost)) + '</td></tr>';
      }).join('') +
      '</tbody></table></div>';
    html += '<p class="portal-muted portal-small">Counted by each ticket&rsquo;s job date. Part orders with no cost recorded count as $0; cancelled part orders are left out.</p>';
    body.innerHTML = html;
  }

  function loadFinancials(force) {
    var body = $('portal-financials-body');
    if (!finWired) {
      finWired = true;
      document.querySelectorAll('[data-fin-period]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          finPeriod = btn.getAttribute('data-fin-period') || 'all';
          document.querySelectorAll('[data-fin-period]').forEach(function (b) { b.classList.toggle('active', b === btn); });
          renderFinancials();
        });
      });
    }
    if (body) body.innerHTML = '<p class="portal-muted">Loading financials&hellip;</p>';
    withClient(function (client) {
      if (!client) { if (body) body.innerHTML = '<p class="portal-error">Couldn&rsquo;t load financials.</p>'; return; }
      var got = { charges: null, parts: null, tickets: null }, failed = false;
      function fail() {
        if (failed) return;
        failed = true;
        if (body) body.innerHTML = '<p class="portal-error">Couldn&rsquo;t load financials. Try Refresh.</p>';
      }
      function done() {
        if (failed || !got.charges || !got.parts || !got.tickets) return;
        var jobByTicket = {};
        got.tickets.forEach(function (tk) { jobByTicket[tk.id] = tk.job_date || null; });
        finCache = { charges: got.charges, parts: got.parts, jobByTicket: jobByTicket };
        state.loaded.financials = true;
        renderFinancials();
      }
      client.from('ticket_charges').select('ticket_id, kind, qty, unit_price, created_at')
        .then(function (res) { if (res.error) { fail(); return; } got.charges = res.data || []; done(); }).catch(fail);
      client.from('part_orders').select('ticket_id, our_cost, qty, status, created_at')
        .then(function (res) { if (res.error) { fail(); return; } got.parts = res.data || []; done(); }).catch(fail);
      client.from('tickets').select('id, job_date')
        .then(function (res) { if (res.error) { fail(); return; } got.tickets = res.data || []; done(); }).catch(fail);
    });
  }

  /* ================= CUSTOMERS ================= */
  function renderCustomers(rows) {
    var list = $('portal-customer-list');
    if (!rows.length) { emptyState(list, 'No customers match. Customer accounts from the website will show up here.'); return; }
    list.innerHTML = rows.map(function (c) {
      return '<article class="portal-card">' +
        '<div class="portal-card-top"><p class="portal-card-title">' + esc(c.name || 'Customer') + '</p>' +
        '<span class="portal-badge portal-st-reviewed"><i class="fas fa-coins"></i> ' + esc(String(c.points)) + ' pts</span>' +
        (c.membershipTier ? '<span class="portal-badge portal-badge-atrone"><i class="fas fa-star"></i> ATR One · ' + esc(atroneTierName(c.membershipTier)) + '</span>' : '') + '</div>' +
        '<p class="portal-card-meta"><i class="fas fa-envelope"></i> ' + esc(c.email || '—') +
        (c.phone ? ' · <i class="fas fa-phone"></i> ' + esc(c.phone) : '') + '</p>' +
        '<p class="portal-card-meta"><i class="fas fa-cake-candles"></i> Birthday (month and day only): ' +
        bdaySelects(c) + ' ' +
        '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-bday-save="' + esc(c.id) + '">Save</button> ' +
        '<span class="portal-muted portal-small" data-bday-msg="' + esc(c.id) + '"></span></p>' +
        '<p class="portal-card-meta">' + esc(String(c.orderCount)) + ' shop order' + (c.orderCount === 1 ? '' : 's') +
        ' · Customer since ' + esc(fmtDate(c.created_at)) + '</p>' +
        '<p><button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-cust-delete="' + esc(c.id) + '">Delete customer</button> ' +
        '<span class="portal-muted portal-small" data-cust-delete-msg="' + esc(c.id) + '"></span></p>' +
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
          var membershipsByCustomer = {};
          var pending = 3;
          function finish() {
            pending--;
            if (pending > 0) return;
            var rows = customers.map(function (c) {
              return {
                id: c.id, name: c.name, email: c.email, phone: c.phone, created_at: c.created_at, birthday: c.birthday,
                points: pointsByCustomer[c.id] || 0,
                orderCount: ordersByCustomer[c.id] || 0,
                membershipTier: membershipsByCustomer[c.id] || null
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
          /* PORTAL_ATRONE_TICKET_2026_10_30: active ATR One tier per
           * customer, for the badge on the customer card. If the
           * memberships table is not set up yet the query just errors
           * and no badges render — the tab still loads. */
          client.from('customer_memberships').select('customer_id, tier').eq('status', 'active').then(function (r) {
            if (!r.error) (r.data || []).forEach(function (row) {
              if (row.customer_id && !membershipsByCustomer[row.customer_id]) membershipsByCustomer[row.customer_id] = row.tier;
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

  function bdaySelects(c) {
    var parts = String(c.birthday || '').split('-');
    var mm = parts.length === 3 ? parts[1] : parts[0] || '';
    var dd = parts.length === 3 ? parts[2] : parts[1] || '';
    var months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
    var mo = months.map(function (m) { return '<option value="' + m + '"' + (m === mm ? ' selected' : '') + '>' + m + '</option>'; }).join('');
    var dy = '';
    for (var d = 1; d <= 31; d++) { var v = d < 10 ? '0' + d : String(d); dy += '<option value="' + v + '"' + (v === dd ? ' selected' : '') + '>' + d + '</option>'; }
    return '<select data-bday-month="' + esc(c.id) + '" aria-label="Birth month"><option value="">Month</option>' + mo + '</select> ' +
      '<select data-bday-day="' + esc(c.id) + '" aria-label="Birth day"><option value="">Day</option>' + dy + '</select>';
  }

  function deleteCustomer(customerId) {
    var row = null;
    state.customersCache.forEach(function (c) { if (c.id === customerId) row = c; });
    var name = row ? (row.name || 'this customer') : 'this customer';
    if (!window.confirm('Delete ' + name + ' from Customers? This cannot be undone. If this customer has tickets or orders linked, the delete will be blocked.')) return;
    var msg = document.querySelector('[data-cust-delete-msg="' + customerId + '"]');
    if (msg) msg.textContent = 'Deleting\u2026';
    withClient(function (client) {
      if (!client) { if (msg) msg.textContent = 'Could not delete \u2014 try again.'; return; }
      client.from('customers').delete().eq('id', customerId).then(function (res) {
        if (res.error) { if (msg) msg.textContent = 'Could not delete \u2014 this customer may have tickets or orders linked.'; return; }
        state.customersCache = state.customersCache.filter(function (c) { return c.id !== customerId; });
        applyCustomerSearch();
      }).catch(function () { if (msg) msg.textContent = 'Could not delete \u2014 try again.'; });
    });
  }

  function saveBirthday(customerId) {
    var mo = document.querySelector('[data-bday-month="' + customerId + '"]');
    var dy = document.querySelector('[data-bday-day="' + customerId + '"]');
    var msg = document.querySelector('[data-bday-msg="' + customerId + '"]');
    if (!mo || !dy) return;
    var val = (mo.value && dy.value) ? (mo.value + '-' + dy.value) : null;
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
          var del = t.getAttribute('data-cust-delete');
          if (del) { deleteCustomer(del); return; }
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
    initAuth(); initPasswordReset();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

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
    saveActiveTab(name);
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

  /* ================= CHECK-IN CONSENT =================
   * PORTAL_CHECKIN_CONSENT_2026_10_30 (Austin, Oct 30, 2026): the
   * Check-In form captures the customer's agreement to ALL the legal
   * documents in one act. In person, the customer signs on the iPad
   * or phone right there \u2014 the same signature popup the ticket
   * drawer uses (openSignatureCapture, shared, not a copy). Over the
   * phone \u2014 most check-ins \u2014 staff read CI_CONSENT_SCRIPT
   * aloud, the customer verbally agrees, and staff tick the
   * attestation box; that "virtually signs" the customer to the
   * Repair Authorization, the Terms & Conditions, and the 1-Year
   * Warranty. Either way, when the ticket is created the agreement
   * files itself on the ticket exactly like a drawer signing does: a
   * ticket_documents row plus the consent flags, via
   * fileSignedAuthorization / markAuthorizationAccepted. Skipping is
   * supported \u2014 the ticket is created as before and consent can
   * still be taken later in the drawer's Documents section.
   * PORTAL_COPY_SYNC_2026_10_30 (Oct 30, 2026): the script's
   * replaced-parts and card-fee sentences updated to Austin's
   * Oct 30, 2026 wording (parts taken with us and disposed of
   * properly for the environment, some manufacturer parts
   * returned; fee stated for credit or debit card). */
  var CI_CONSENT_SCRIPT = "Before we book your repair, I need to go over our terms \u2014 it only takes a moment. By agreeing, you accept our Repair Authorization, our Terms of Service, and our warranty terms. There is a $35 house-call fee due when we schedule your visit; it covers the trip and a full diagnosis, and it is non-refundable. You are giving us permission to diagnose your device, including taking it apart when that is needed to find the problem. Please make sure your device is backed up before we work on it: you are responsible for your data, and we are not liable if data is lost during a repair. The parts we supply and our labor are covered by a 1-year warranty. We take the parts we remove with us after your repair and dispose of them properly to protect the environment, and some original manufacturer parts have to be returned to the manufacturer. If your device is left unclaimed for more than 60 days after we tell you it is ready, it may be disposed of. And if you pay by credit or debit card, the total includes a processing fee equal to what Square charges us. Do you agree to these terms?";
  var ciConsent = null;

  function ciConsentStatus() {
    var status = $('ci-consent-status');
    var clearBtn = $('ci-consent-clear');
    var verbal = $('ci-verbal-check');
    if (verbal) {
      var shouldCheck = !!(ciConsent && ciConsent.mode === 'verbal');
      if (verbal.checked !== shouldCheck) verbal.checked = shouldCheck;
    }
    if (clearBtn) clearBtn.hidden = !ciConsent;
    if (!status) return;
    if (!ciConsent) {
      status.textContent = 'No agreement captured yet \u2014 the ticket can still be created, and the signature can be taken later from the ticket\u2019s Documents section.';
    } else if (ciConsent.mode === 'signed') {
      status.textContent = 'Signature captured from ' + ciConsent.signerName + ' \u2014 it files itself on this ticket when you create it.';
    } else {
      status.textContent = 'Verbal agreement recorded \u2014 a consent record files itself on this ticket when you create it.';
    }
  }

  function ciConsentReset() {
    ciConsent = null;
    ciConsentStatus();
  }

  /* "Read the full terms": one popup with the FULL existing legal
   * texts \u2014 the same BLANK_DOCS strings the Documents tab shows
   * (AUTH_TERMS_TEXT / WARRANTY_TEXT / TERMS_CONDITIONS_TEXT),
   * reused verbatim, no new legal copy. */
  function showAllAgreements() {
    var old = document.getElementById('ci-terms-modal');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var wrap = document.createElement('div');
    wrap.id = 'ci-terms-modal';
    wrap.setAttribute('style', 'position:fixed;inset:0;background:rgba(44,35,26,0.55);z-index:3000;display:flex;align-items:center;justify-content:center;padding:1rem;');
    /* PORTAL_MEDIA_RELEASE_2026_10_30: the Media Release sits in
     * BLANK_DOCS for the Documents tab, but it is NOT a check-in
     * agreement — filter it out so this popup keeps showing exactly
     * the three legal texts it always has. */
    var docs = BLANK_DOCS.filter(function (d) { return !d.mediaRelease; }).map(function (d) {
      return '<h4 style="margin:1rem 0 0.4rem;">' + esc(d.title) + '</h4>' +
        '<div style="border:1px solid #E6D9C0;border-radius:8px;padding:0.75rem;background:#FFFDF8;white-space:pre-wrap;font-size:0.85rem;line-height:1.45;">' + esc(d.text) + '</div>';
    }).join('');
    wrap.innerHTML = '<div style="background:#FAF6EE;color:#2C231A;border-radius:14px;max-width:640px;width:100%;max-height:92vh;overflow:auto;padding:1.25rem;box-shadow:0 18px 50px rgba(0,0,0,0.35);">' +
      '<h3 style="margin:0 0 0.5rem;">Agreements &mdash; full text</h3>' +
      '<p class="portal-muted portal-small" style="margin:0;">The Repair Authorization, the 1-Year Limited Warranty, and the Terms &amp; Conditions \u2014 the same texts as the Documents tab, exactly as published.</p>' +
      docs +
      '<div class="p2-actions" style="margin-top:0.75rem;"><button class="portal-btn portal-btn-primary portal-btn-sm" type="button" id="ci-terms-close">Close</button></div></div>';
    document.body.appendChild(wrap);
    function close() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    wrap.querySelector('#ci-terms-close').addEventListener('click', close);
  }

  function wireCiConsent() {
    var scriptBox = $('ci-consent-script');
    if (scriptBox && !trim(scriptBox.textContent)) scriptBox.textContent = CI_CONSENT_SCRIPT;
    var termsBtn = $('ci-terms-btn');
    if (termsBtn && !termsBtn.getAttribute('data-wired')) {
      termsBtn.setAttribute('data-wired', '1');
      termsBtn.addEventListener('click', showAllAgreements);
    }
    var signBtn = $('ci-sign-btn');
    if (signBtn && !signBtn.getAttribute('data-wired')) {
      signBtn.setAttribute('data-wired', '1');
      signBtn.addEventListener('click', function () {
        var nameEl = $('ci-name');
        openSignatureCapture(nameEl ? nameEl.value : '', function (blob, name, finish) {
          ciConsent = { mode: 'signed', blob: blob, signerName: name };
          ciConsentStatus();
          finish();
        });
      });
    }
    var verbal = $('ci-verbal-check');
    if (verbal && !verbal.getAttribute('data-wired')) {
      verbal.setAttribute('data-wired', '1');
      verbal.addEventListener('change', function () {
        if (verbal.checked) ciConsent = { mode: 'verbal' };
        else if (ciConsent && ciConsent.mode === 'verbal') ciConsent = null;
        ciConsentStatus();
      });
    }
    var clearBtn = $('ci-consent-clear');
    if (clearBtn && !clearBtn.getAttribute('data-wired')) {
      clearBtn.setAttribute('data-wired', '1');
      clearBtn.addEventListener('click', function () { ciConsentReset(); });
    }
    ciConsentStatus();
  }

  /* File the check-in consent on the just-created ticket. Signed:
   * the shared drawer filing (signed document + repair_authorization
   * row + consent flags). Verbal: a generated text record naming the
   * customer, the ticket, the staff member, and the date/time, with
   * the exact statement that was read \u2014 filed as an 'other'
   * document labeled as the verbal consent record, then the same
   * consent flags via markAuthorizationAccepted. Because the rows and
   * storage paths match the drawer flow's shape, the drawer's
   * Documents section lists them exactly like a drawer-signed
   * document. done(errText): errText is null on success. */
  function fileCiConsent(client, ticketId, row, consent, done) {
    if (!consent) { done(null); return; }
    if (consent.mode === 'signed') {
      fileSignedAuthorization(client, ticketId, consent.blob, consent.signerName, done,
        { customerName: row.customer_name, phone: row.customer_phone, device: deviceLabel(row) });
      return;
    }
    var when = new Date();
    var staff = (state.profile && state.profile.name) || (state.user && state.user.email) || 'Staff';
    var text = [
      'Verbal Consent Record',
      "Austin's Tech Repair Group",
      '',
      'Customer: ' + (row.customer_name || ''),
      'Phone: ' + (row.customer_phone || ''),
      'Ticket ID: ' + ticketId,
      'Device: ' + deviceLabel(row),
      'Date and time: ' + when.toLocaleString() + ' (' + when.toISOString() + ')',
      'Recorded by: ' + staff,
      '',
      'How this consent was taken: the staff member named above read the statement below aloud to the customer by phone, and the customer verbally agreed to it. By that agreement, the customer agreed to the Repair Authorization & Service Agreement, the Terms & Conditions of Service, and the 1-Year Limited Warranty of Austin\u2019s Tech Repair Group, in full.',
      '',
      'Statement read to the customer:',
      '\u201C' + CI_CONSENT_SCRIPT + '\u201D'
    ].join('\n');
    var blob = new Blob([text], { type: 'text/plain' });
    var path = ticketId + '/verbal-consent-' + docStamp() + '.txt';
    client.storage.from(DOC_BUCKET).upload(path, blob, { contentType: 'text/plain', upsert: false }).then(function (up) {
      if (up.error) { done('The ticket was created, but the verbal consent record could not be saved \u2014 take the signature from the ticket\u2019s Documents section.'); return; }
      var docRow = {
        ticket_id: ticketId, doc_type: 'other', storage_path: path,
        file_name: 'Verbal consent record.txt', signer_name: null,
        signed_at: when.toISOString(),
        note: 'Verbal agreement by phone at check-in \u2014 read-aloud statement agreed'
      };
      client.from('ticket_documents').insert(docRow).then(function (res) {
        if (res.error) { done('The ticket was created, but the verbal consent record could not be filed \u2014 take the signature from the ticket\u2019s Documents section.'); return; }
        markAuthorizationAccepted(client, { id: ticketId }).then(function () { done(null); }).catch(function () { done(null); });
      }).catch(function () { done('The ticket was created, but the verbal consent record could not be filed \u2014 take the signature from the ticket\u2019s Documents section.'); });
    }).catch(function () { done('The ticket was created, but the verbal consent record could not be saved \u2014 take the signature from the ticket\u2019s Documents section.'); });
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
    var atrSel = $('ci-atrone');
    if (atrSel && !atrSel.getAttribute('data-wired')) {
      atrSel.setAttribute('data-wired', '1');
      atrSel.addEventListener('change', function () {
        var box = $('ci-atrone-signup');
        if (box) box.hidden = atrSel.value !== 'signup';
      });
    }
    /* PORTAL_ISSUE_TILES_2026_10_30: issue picker tiles toggle .on */
    document.querySelectorAll('#ci-reasons .ci-tile').forEach(function (tile) {
      tile.addEventListener('click', function () {
        var on = tile.classList.toggle('on');
        tile.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    });
    wireCiConsent();
    /* PORTAL_DEADEND_MINORS_2026_10_30: "Clear check-in" — abandon a
     * half-finished check-in and start over without hand-clearing every
     * field. Mirrors the post-submit reset below (form.reset, customer
     * link, tiles off, consent reset) plus the search results box, the
     * error line, and the ATR One signup reveal. Confirms first when
     * anything has been entered; instant when the form is untouched
     * (field state is compared against a snapshot taken at wire time,
     * when the form is pristine). */
    var ciPristine = ciFieldSnapshot();
    function ciFieldSnapshot() {
      var snap = [], fields = $('ci-form').elements;
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        snap.push((f.type === 'checkbox' || f.type === 'radio') ? (f.checked ? '1' : '0') : (f.value || ''));
      }
      return snap.join('|');
    }
    function ciFormDirty() {
      if (ciCustomerId || ciConsent) return true;
      if (document.querySelector('#ci-reasons .ci-tile.on')) return true;
      return ciFieldSnapshot() !== ciPristine;
    }
    function ciResetForm() {
      $('ci-form').reset();
      ciCustomerId = null;
      document.querySelectorAll('#ci-reasons .ci-tile.on').forEach(function (c) { c.classList.remove('on'); c.setAttribute('aria-pressed', 'false'); });
      var res = $('ci-results'); if (res) res.innerHTML = '';
      var err = $('ci-error'); if (err) { err.textContent = ''; err.hidden = true; }
      var signup = $('ci-atrone-signup'), atr = $('ci-atrone');
      if (signup && atr) signup.hidden = atr.value !== 'signup';
      ciConsentReset();
    }
    var ciClearBtn = $('ci-clear');
    if (ciClearBtn && !ciClearBtn.getAttribute('data-wired')) {
      ciClearBtn.setAttribute('data-wired', '1');
      ciClearBtn.addEventListener('click', function () {
        if (ciFormDirty() && !window.confirm('Clear this check-in and start over? Everything entered here will be discarded.')) return;
        ciResetForm();
      });
    }
    $('ci-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('ci-error'); err.hidden = true;
      var reasons = Array.prototype.map.call(document.querySelectorAll('#ci-reasons .ci-tile.on'), function (c) { return c.getAttribute('data-label') || c.textContent.trim(); }).join(', ');
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
        issue: (function () {
          /* PORTAL_ISSUE_TILES_2026_10_30: picked issue labels lead the
           * issue text, followed by " — " + the notes when notes were
           * typed; tiles only → just the labels; no tiles → the notes
           * alone, exactly as before. ATR One prefixes still lead. */
          var notes = $('ci-notes').value.trim();
          var text = reasons ? (notes ? reasons + ' — ' + notes : reasons) : notes;
          var atr = $('ci-atrone') ? $('ci-atrone').value : '';
          if (atr === 'member') return '[ATR One member] ' + text;
          if (atr === 'signup') return '[Wants ATR One signup] ' + text;
          return text;
        })(),
        triage_volts: $('ci-volts').value.trim() || null,
        triage_amps: $('ci-amps').value.trim() || null,
        power_on: $('ci-power').value || null,
        backed_up: $('ci-backup').value || null,
        prior_repair: $('ci-prior').value || null,
        warranty_status: $('ci-warranty').value || null,
        source: 'check-in',
        status: 'Awaiting Diagnostics',
        terms_accepted: true,
        dispatch_acknowledged: true,
        work_auth_accepted: false,
        marketing_opt_in: false
      };
      if (!row.customer_name || !row.customer_phone || !row.issue) {
        err.textContent = 'Name, phone, and an issue are required — tap an issue tile or write check-in notes.'; err.hidden = false; return;
      }
      var btn = $('ci-submit'); btn.disabled = true;
      var consent = ciConsent;
      withClient(function (client) {
        if (!client) { btn.disabled = false; return; }
        client.from('tickets').insert(row).select('id').single().then(function (res) {
          if (res.error) { btn.disabled = false; err.textContent = 'Could not create the ticket — try again.'; err.hidden = false; return; }
          var newId = res.data && res.data.id;
          var proceed = function (consentFailed) {
            btn.disabled = false;
            $('ci-form').reset(); ciCustomerId = null;
            document.querySelectorAll('#ci-reasons .ci-tile.on').forEach(function (c) { c.classList.remove('on'); c.setAttribute('aria-pressed', 'false'); });
            ciConsentReset();
            state.loaded.tickets = false;
            activateTab('tickets');
            loadTickets(true);
            if (newId) setTimeout(function () { openTicket(newId); }, 450);
            if (consentFailed) setTimeout(function () { docMsg('The ticket was created, but the check-in agreement could not be filed — take the signature here in Documents.'); }, 900);
          };
          /* PORTAL_CHECKIN_CONSENT_2026_10_30: consent captured on the
           * form files itself on the new ticket, in the drawer flow's
           * order (create ticket → upload + file → set flags);
           * no consent → the ticket is created exactly as before. */
          if (consent && newId) {
            fileCiConsent(client, newId, row, consent, function (fileErr) { proceed(!!fileErr); });
          } else {
            proceed(!!consent);
          }
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
})();
