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
  var TICKET_STATUSES = ['Waiting', 'In Progress', 'Waiting for Parts', 'Ready for Pickup', 'Completed'];
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
    customersCache: []
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
    feedback: loadFeedback, customers: loadCustomers, inventory: loadInventory
  };

  function activateTab(name) {
    var tabs = document.querySelectorAll('.portal-tab');
    tabs.forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-tab') === name); });
    ['tickets', 'applications', 'investors', 'feedback', 'customers', 'inventory'].forEach(function (n) {
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

  function renderTickets(rows) {
    var list = $('portal-ticket-list');
    if (!rows.length) { emptyState(list, 'No tickets match. New service requests from the website will show up here.'); return; }
    list.innerHTML = rows.map(function (t) {
      var appt = t.appointment_at ? '<p class="portal-card-meta"><i class="fas fa-calendar-check"></i> Appointment: ' + esc(fmtDateTime(t.appointment_at)) + '</p>' : '';
      var src = t.source ? ' <span class="portal-badge portal-badge-source">' + esc(t.source) + '</span>' : '';
      var phone = trim(t.customer_phone);
      var phoneHtml = phone ? ' · <a href="tel:' + esc(phone.replace(/[^0-9+]/g, '')) + '">' + esc(phone) + '</a>' : '';
      var email = trim(t.customer_email);
      var emailHtml = email ? '<p class="portal-card-meta"><i class="fas fa-envelope"></i> ' + esc(email) + '</p>' : '';
      return '<article class="portal-card">' +
        '<div class="portal-card-top"><p class="portal-card-title">' + esc(deviceLabel(t)) + '</p>' + badge(t.status) + '</div>' +
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
        var body =
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

        $('portal-ticket-status-save').addEventListener('click', function () {
          var next = $('portal-ticket-status').value;
          var msg = $('portal-ticket-status-msg');
          msg.textContent = 'Saving…';
          client.from('tickets').update({ status: next }).eq('id', t.id).then(function (res2) {
            if (res2.error) { msg.textContent = 'Couldn&rsquo;t save — try again.'; return; }
            msg.textContent = 'Saved.';
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
                id: c.id, name: c.name, email: c.email, phone: c.phone, created_at: c.created_at,
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

  /* ================= INVENTORY + PURCHASE ORDERS (read-only) ================= */
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
    if (!rows.length) { emptyState(list, 'No inventory products yet.'); return; }
    var html = '<div class="portal-table-wrap"><table class="portal-table"><thead><tr>' +
      '<th>Product</th><th>Category</th><th>Supplier</th><th>SKU</th><th>Cost</th><th>Retail</th><th>Stock</th>' +
      '</tr></thead><tbody>';
    html += rows.map(function (p) {
      var threshold = (typeof p.reorder_point === 'number') ? p.reorder_point : 5;
      var low = typeof p.stock_qty === 'number' && p.stock_qty <= threshold;
      return '<tr><td>' + esc(p.product_name || '—') + '</td><td>' + esc(p.category || '—') + '</td><td>' +
        esc(p.supplier || '—') + '</td><td>' + esc(p.supplier_sku || '—') + '</td><td>' + esc(fmtMoney(p.cost)) +
        '</td><td>' + esc(fmtMoney(p.retail_price)) + '</td><td class="' + (low ? 'portal-stock-low' : 'portal-stock-ok') + '">' +
        esc(String(p.stock_qty == null ? '—' : p.stock_qty)) + (low ? ' (low)' : '') + '</td></tr>';
    }).join('');
    list.innerHTML = html + '</tbody></table></div>';
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
          renderInventory(res.data || []);
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
        }
        t = t.parentNode;
      }
    });

    $('portal-ticket-filter').addEventListener('change', function () {
      state.loaded.tickets = false;
      loadTickets(true);
    });
    $('portal-cust-search').addEventListener('input', applyCustomerSearch);
  }

  /* ================= INIT ================= */
  function init() {
    initTabs();
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
