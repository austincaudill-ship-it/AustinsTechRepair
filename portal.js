/* =====================================================================
 * ATRG Associate Hub — staff-only interface over the Supabase database
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
   * without updating the database constraint first.
   * PORTAL_TIER_SET_FINISH_2026_11_02: 'Awaiting Repair' added
   * directly after 'Awaiting Parts' on Austin's Nov 2, 2026 word
   * (parts are in; the job waits for the repair itself). The staged
   * widening SQL tickets-status-awaiting-repair.sql sits beside
   * this build — STAGED ONLY, not run; run it before or with this
   * set's publish if the live constraint does not already allow
   * the new value. */
  var TICKET_STATUSES = ['Awaiting Estimate', 'Awaiting Diagnostics', 'Awaiting Customer Response', 'Awaiting Parts', 'Awaiting Repair', 'En Route to Customer', 'In Progress', 'Quality Control', 'Ready', 'Job Complete'];
  var APPLICATION_STATUSES = ['New', 'Reviewed', 'Contacted', 'Rejected'];
  var INVESTOR_STATUSES = ['New', 'Reviewed', 'Contacted', 'Closed'];

  /* ---------------- Supabase client bootstrap ----------------
   * Same lazy-load pattern as atr-forms.js: portal.html already loads
   * supabase-js v2 from the jsDelivr CDN, so window.supabase normally
   * exists; load it lazily if it somehow does not. */
  var sb = null;
  var sbWaiters = [];

  /* PORTAL_RECEIPT_SESSION_FIX_2026_11_03: the portal client gets
   * its OWN auth storage key. Until now it used the supabase-js
   * default key — the same localStorage slot the public website's
   * customer sign-in uses (same origin, same project) — so signing
   * in or out on the website silently replaced or destroyed the
   * staff session, and the next portal load signed the staffer out
   * at the employee gate. The options below are the library
   * defaults (persist in localStorage, auto-refresh) made explicit;
   * only the key changes behavior. Migration: if this browser still
   * holds a session under the old default key and the portal key is
   * empty, copy it across once (the old key is left in place — the
   * website still uses it) so nobody is signed out by the fix
   * itself. */
  var PORTAL_AUTH_STORAGE_KEY = 'sb-atrg-portal-auth-token';
  function migrateLegacyAuthStorage() {
    try {
      if (!window.localStorage.getItem(PORTAL_AUTH_STORAGE_KEY)) {
        var legacy = window.localStorage.getItem('sb-lyujxpuicarblpkdzuuc-auth-token');
        if (legacy) window.localStorage.setItem(PORTAL_AUTH_STORAGE_KEY, legacy);
      }
    } catch (e) {}
  }

  function createClient() {
    if (sb) return sb;
    if (window.supabase && window.supabase.createClient) {
      try {
        migrateLegacyAuthStorage();
        sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { storageKey: PORTAL_AUTH_STORAGE_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
      }
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
      awaitingrepair: 'portal-st-waitingparts',
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
    loaded: { tickets: false, applications: false, investors: false, feedback: false, customers: false, members: false, inventory: false, financials: false, associateaccounts: false }, /* ASSOCIATE_ACCOUNTS_2026_11_03: one loaded flag for the merged panel (was 'associates' + the Account Controls loads) */
    customersCache: [], inventoryCache: []
  };

  function setCount(id, n) {
    var el = $(id);
    if (!el) return;
    if (n > 0) { el.textContent = String(n); el.hidden = false; }
    else { el.hidden = true; el.textContent = ''; }
  }

  /* ================= AUTH ================= */
  var resetSuccessMessage = null; function isRecoveryHash() { var h = window.location.hash || ""; var q = window.location.search || ""; return h.indexOf("type=recovery") !== -1 || q.indexOf("type=recovery") !== -1; } function showResetView(msg) { var dv = $("portal-dash-view"); if (dv) { dv.hidden = true; } var lv = $("portal-login-view"); if (lv) { lv.hidden = false; } var rf = $("portal-login-form"); if (rf) { rf.hidden = true; } var rv = $("portal-reset-view"); if (rv) { rv.hidden = false; } var mv2 = $("portal-mfa-view"); if (mv2) { mv2.hidden = true; } /* PORTAL_MFA_2026_11_02: recovery view never shares the card with the two-step check. */ var re = $("portal-reset-error"); if (re) { if (msg) { re.textContent = msg; re.hidden = false; } else { re.hidden = true; re.textContent = ""; } } var fm2 = $("portal-forgot-msg"); if (fm2) { fm2.hidden = true; } } function initPasswordReset() { withClient(function (client) { if (!client) { return; } var fb = $("portal-forgot-btn"); if (fb) { fb.addEventListener("click", function () { var em = $("portal-login-email"); var email = em ? trim(em.value) : ""; var mg = $("portal-forgot-msg"); if (!email) { if (mg) { mg.textContent = "Enter your employee email first"; mg.hidden = false; } return; } client.auth.resetPasswordForEmail(email, { redirectTo: "https://austinstechrepairgroup.com/portal.html" }).then(function (res) { if (mg) { if (res.error) { mg.textContent = res.error.message || "Could not send the reset email. Try again."; } else { mg.textContent = "Check your email for a password reset link"; } mg.hidden = false; } }).catch(function (err) { if (mg) { mg.textContent = (err && err.message) || "Could not send the reset email. Try again."; mg.hidden = false; } }); }); } /* PORTAL_DEADEND_2026_10_30: "Back to sign in" exits the recovery view and restores the normal sign-in form. */ var bb = $("portal-reset-back-btn"); if (bb) { bb.addEventListener("click", function () { /* PORTAL_DEVICE_TRUST_2026_11_02: during a forced 30-day rotation, Back is the only exit and it must close the session - landing on the plain form with a live session would bounce straight back to the forced step. signOut fires SIGNED_OUT, whose handler shows the sign-in form. */ if (pwGateState.forced) { pwGateState.forced = false; var _pn = $("portal-reset-note"); if (_pn) { _pn.hidden = true; } client.auth.signOut(); return; } showLogin(null); }); } var rb = $("portal-reset-btn"); if (rb) { rb.addEventListener("click", function () { var pwEl = $("portal-reset-password"); var cfEl = $("portal-reset-confirm"); var er = $("portal-reset-error"); var pw = pwEl ? pwEl.value : ""; var cf = cfEl ? cfEl.value : ""; if (er) { er.hidden = true; er.textContent = ""; } if (pw !== cf) { if (er) { er.textContent = "Passwords do not match"; er.hidden = false; } return; } if (pw.length < 8) { if (er) { er.textContent = "Password must be at least 8 characters"; er.hidden = false; } return; } client.auth.updateUser({ password: pw }).then(function (res) { if (res.error) { if (er) { er.textContent = res.error.message || "Could not update the password. Try again."; er.hidden = false; } return; } /* PORTAL_DEVICE_TRUST_2026_11_02: any successful set through this view restarts the 30-day password clock (best-effort stamp, see stampPasswordChanged). A forced rotation then continues straight to the dashboard - password and authenticator both already passed, and the factor is untouched. The email-link recovery path keeps its original sign-out ending below. */ stampPasswordChanged(client, function () { if (pwGateState.forced) { pwGateState.forced = false; var _pn2 = $("portal-reset-note"); if (_pn2) { _pn2.hidden = true; } if (state.profile) { state.profile.password_changed_at = new Date().toISOString(); } proceedToDashboard(); return; } var doneMsg = "Password updated. Sign in with your new password."; resetSuccessMessage = doneMsg; client.auth.signOut().then(function () { showLogin(doneMsg); }); }); }).catch(function (err) { if (er) { er.textContent = (err && err.message) || "Could not update the password. Try again."; er.hidden = false; } }); }); } }); } function showLogin(errorMsg) {
    $('portal-dash-view').hidden = true;
    $('portal-login-view').hidden = false;
    var _rf = $("portal-login-form"); if (_rf) { _rf.hidden = false; }
    var _rv = $("portal-reset-view"); if (_rv) { _rv.hidden = true; }
    /* PORTAL_MFA_2026_11_02: sign-in screen also clears the two-step
     * check and the enrollment view, so every route back here (sign
     * out, MFA cancel, recovery exit) lands on the plain form. */
    var _mv = $("portal-mfa-view"); if (_mv) { _mv.hidden = true; }
    var _ev = $("portal-mfa-enroll-view"); if (_ev) { _ev.hidden = true; }
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
    /* PORTAL_ROSTER_DETAIL_2026_11_02: display-only role label —
     * roleLabel() maps the stored 'owner' to "Admin" for rendering;
     * state.profile.role itself is never rewritten, so every check
     * downstream keeps reading the stored value. */
    roleEl.textContent = roleLabel(state.profile.role);
    roleEl.style.display = state.profile.role ? '' : 'none';
    /* PORTAL_TAB_MEMORY_2026_10_30: reopen on the tab Austin last used.
     * Clicking the saved tab's button replays exactly what a tap does,
     * whichever script handles that tab. No saved tab (or a stale one
     * with no matching button) keeps the old behavior: Repair Queue. */
    /* PORTAL_LOCATION_2026_11_02: geofencing consent check + the
     * login snapshot, once the dashboard is up. Fully guarded —
     * it can never block or delay the sign-in flow. */
    try { geoInitAfterLogin(); } catch (e) {}
    var startTab = savedTab();
    /* ASSOCIATE_ACCOUNTS_2026_11_03: a tab remembered from before the
     * merge names a panel that no longer exists — land on the merged
     * Associate Accounts panel instead of falling back to the queue. */
    if (startTab === 'associates' || startTab === 'accountcontrols') startTab = 'associateaccounts';
    var startBtn = startTab ? $('portal-tab-' + startTab) : null;
    if (startBtn && startTab !== 'tickets') { startBtn.click(); }
    else { activateTab('tickets'); }
  }

  /* The employee gate: signed-in is NOT enough — the auth user's id
   * must have a row in employee_profiles. Anyone else (e.g. a customer
   * account) is signed back out immediately. */
  function verifyEmployee(client, user, done) {
    /* PORTAL_DEVICE_TRUST_2026_11_02: the profile read also loads
     * password_changed_at for the 30-day rotation gate. If that
     * column does not exist yet (portal files published before the
     * SQL ran), fall back to the original select so nobody is locked
     * out over deploy order; the age gate then sees no date and lets
     * this sign-in through unrotated. */
    /* PORTAL_RECEIPT_SESSION_FIX_2026_11_03: done(profile, readFailed).
     * A read that FAILS (offline blip on a hotspot, request error)
     * is not the same as a read that succeeds and finds no row.
     * Only the second means "not an employee". Reporting a failure
     * as done(null) made enterIfEmployee sign the staffer out over
     * a network hiccup — the stored session itself was still valid.
     * Failures now report readFailed=true and keep the session. */
    client.from('employee_profiles').select('id, name, role, password_changed_at').eq('id', user.id).maybeSingle()
      .then(function (res) {
        if (res.error) {
          return client.from('employee_profiles').select('id, name, role').eq('id', user.id).maybeSingle()
            .then(function (res2) {
              if (res2.error) { done(null, true); return; }
              if (!res2.data) { done(null, false); return; }
              done(res2.data, false);
            })
            .catch(function () { done(null, true); });
        }
        if (!res.data) { done(null, false); return; }
        done(res.data, false);
      })
      .catch(function () { done(null, true); });
  }

  function enterIfEmployee(client, user) {
    verifyEmployee(client, user, function (profile, readFailed) {
      if (!profile && readFailed) {
        /* PORTAL_RECEIPT_SESSION_FIX_2026_11_03: the profile could
         * not be read at all — keep the session (do NOT signOut:
         * the stored session is still good) and say what happened.
         * Reloading once the connection is back re-runs this gate
         * and lands on the dashboard; signing in again on the form
         * below also works — it mints a fresh session that passes
         * through this same gate. */
        state.user = null; state.profile = null;
        showLogin('You are signed in, but the portal could not check your employee profile — this is usually a connection hiccup. Check your connection, then reload the page.');
        return;
      }
      if (!profile) {
        client.auth.signOut().then(function () {
          state.user = null; state.profile = null;
          showLogin('That account isn’t an employee account. This portal is employee access only — customers, please use the customer area on the main site instead.');
        });
        return;
      }
      state.user = user;
      state.profile = profile;
      /* PORTAL_MFA_2026_11_02: the employee gate passed — hand off to
       * the MFA gate, which either challenges (verified factor,
       * session still AAL1), or loads the dashboard (AAL2 already, or
       * no factor yet — dashboard plus the setup prompt). */
      mfaGate(client);
    });
  }

  /* ================= MFA — TOTP authenticator app =================
   * PORTAL_MFA_2026_11_02: two-step sign-in on top of the password,
   * using Supabase Auth MFA (TOTP factors): auth.mfa.enroll /
   * challenge / verify, and getAuthenticatorAssuranceLevel (AAL).
   *
   * Where it hooks in: enterIfEmployee still runs first and is
   * unchanged — the employee_profiles gate decides WHO gets in.
   * mfaGate then decides the second step:
   *   - verified TOTP factor + session still at AAL1 -> the challenge
   *     view; the dashboard loads only after mfa.verify succeeds and
   *     the session reaches AAL2.
   *   - session already at AAL2 -> straight to the dashboard.
   *   - no verified factor -> straight to the dashboard, plus a
   *     dismissible setup prompt on it. Enrollment is encouraged,
   *     NOT required in this build (see CHANGES.md for the later
   *     enforcement flip).
   * Enrollment runs while signed in at AAL1: mfa.enroll returns a QR
   * code (SVG data URI) plus a manual key; the first code is proven
   * with challenge+verify, which activates the factor. Cancelling
   * enrollment unenrolls the pending factor so no half-finished
   * factor is left behind. */
  var mfaState = {
    hasFactor: false,
    factorId: null,
    challengeId: null,
    enrollId: null
  };
  var MFA_NAG_KEY = 'atrg-portal-mfa-nag-dismissed';

  function mfaNagDismissed() {
    try { return window.sessionStorage.getItem(MFA_NAG_KEY) === '1'; }
    catch (e) { return false; }
  }

  function mfaDismissNag() {
    try { window.sessionStorage.setItem(MFA_NAG_KEY, '1'); } catch (e) {}
    var b = $('portal-mfa-banner');
    if (b) b.hidden = true;
  }

  function refreshMfaBanner() {
    var banner = $('portal-mfa-banner');
    if (banner) banner.hidden = !!mfaState.hasFactor || mfaNagDismissed();
  }

  function pickVerifiedTotp(listData) {
    var all = (listData && (listData.all || listData.totp)) || [];
    var i;
    for (i = 0; i < all.length; i++) {
      if (all[i] && all[i].factor_type === 'totp' && all[i].status === 'verified') return all[i];
    }
    /* listFactors().totp already holds only verified TOTP factors on
     * current supabase-js; if status fields are absent, trust it. */
    var totp = (listData && listData.totp) || [];
    return totp.length ? totp[0] : null;
  }

  function proceedToDashboard() {
    showDashboard();
    refreshMfaBanner();
  }

  function showMfaView(errorMsg) {
    var dv = $('portal-dash-view'); if (dv) dv.hidden = true;
    var lv = $('portal-login-view'); if (lv) lv.hidden = false;
    var lf = $('portal-login-form'); if (lf) lf.hidden = true;
    var rv = $('portal-reset-view'); if (rv) rv.hidden = true;
    var fm = $('portal-forgot-msg'); if (fm) fm.hidden = true;
    var mv = $('portal-mfa-view'); if (mv) mv.hidden = false;
    var err = $('portal-mfa-error');
    if (err) {
      if (errorMsg) { err.textContent = errorMsg; err.hidden = false; }
      else { err.hidden = true; err.textContent = ''; }
    }
    var code = $('portal-mfa-code');
    if (code) { code.value = ''; if (code.focus) code.focus(); }
  }

  function mfaGate(client) {
    if (!client.auth.mfa) { mfaState.hasFactor = false; afterMfaGate(client); return; }
    client.auth.mfa.getAuthenticatorAssuranceLevel()
      .then(function (res) {
        var d = (res && res.data) || {};
        if (d.nextLevel === 'aal2' && d.currentLevel === 'aal2') {
          mfaState.hasFactor = true;
          afterMfaGate(client);
          return;
        }
        if (d.nextLevel === 'aal2') {
          /* A verified factor exists but this session is only AAL1:
           * the code check is required before the dashboard loads -
           * unless this device is inside its 30-day trust window
           * (PORTAL_DEVICE_TRUST_2026_11_02), which trustOrChallenge
           * checks first. */
          mfaState.hasFactor = true;
          trustOrChallenge(client);
          return;
        }
        mfaState.hasFactor = false;
        afterMfaGate(client);
      })
      .catch(function () {
        /* AAL lookup failed (offline hiccup, older client): fall back
         * to the factor list so a staffer WITH a factor is still
         * challenged. If that fails too, let them in - availability
         * first in this build; the enforcement pass can revisit. */
        client.auth.mfa.listFactors()
          .then(function (res) {
            var f = pickVerifiedTotp(res && res.data);
            if (f) { mfaState.hasFactor = true; trustOrChallenge(client); }
            else { mfaState.hasFactor = false; afterMfaGate(client); }
          })
          .catch(function () { mfaState.hasFactor = false; afterMfaGate(client); });
      });
  }

  function beginMfaChallenge(client) {
    client.auth.mfa.listFactors()
      .then(function (res) {
        var f = pickVerifiedTotp(res && res.data);
        if (!f) { mfaState.hasFactor = false; afterMfaGate(client); return null; }
        mfaState.factorId = f.id;
        return client.auth.mfa.challenge({ factorId: f.id });
      })
      .then(function (cres) {
        if (!cres) return;
        if (cres.error || !cres.data) {
          mfaState.challengeId = null;
          showMfaView('Could not start the security check. Go back to sign in and try again.');
          return;
        }
        mfaState.challengeId = cres.data.id;
        showMfaView(null);
      })
      .catch(function () {
        mfaState.challengeId = null;
        showMfaView('Could not start the security check. Check your connection, or go back to sign in.');
      });
  }

  function submitMfaCode(client) {
    var err = $('portal-mfa-error');
    var codeEl = $('portal-mfa-code');
    var code = codeEl ? trim(codeEl.value).replace(/\s+/g, '') : '';
    function fail(msg) { if (err) { err.textContent = msg; err.hidden = false; } }
    if (!mfaState.factorId || !mfaState.challengeId) {
      fail('This check is no longer active. Tap "Start a new check", or go back to sign in.');
      return;
    }
    if (!/^\d{6}$/.test(code)) { fail('Enter the 6-digit code from your authenticator app.'); return; }
    var btn = $('portal-mfa-verify-btn');
    if (btn) btn.disabled = true;
    client.auth.mfa.verify({ factorId: mfaState.factorId, challengeId: mfaState.challengeId, code: code })
      .then(function (res) {
        if (btn) btn.disabled = false;
        if (res.error) {
          fail('That code did not match, or the check timed out. Enter the newest code from the app — if it keeps failing, tap "Start a new check".');
          return;
        }
        mfaState.challengeId = null;
        if (codeEl) codeEl.value = '';
        /* PORTAL_DEVICE_TRUST_2026_11_02: the authenticator just
         * passed on this device - remember the device for 30 days,
         * then continue through the post-MFA gates. */
        createDeviceTrust(client);
        afterMfaGate(client);
      })
      .catch(function () {
        if (btn) btn.disabled = false;
        fail('Could not verify the code. Check your connection and try again.');
      });
  }

  function cancelMfaChallenge(client) {
    mfaState.factorId = null;
    mfaState.challengeId = null;
    var codeEl = $('portal-mfa-code');
    if (codeEl) codeEl.value = '';
    /* Signing out fires SIGNED_OUT, whose handler shows the plain
     * sign-in form — a clean return with the session fully closed,
     * never a half-signed-in dashboard. */
    client.auth.signOut();
  }

  function showMfaEnrollView() {
    var dv = $('portal-dash-view'); if (dv) dv.hidden = true;
    var lv = $('portal-login-view'); if (lv) lv.hidden = true;
    var ev = $('portal-mfa-enroll-view'); if (ev) ev.hidden = false;
    var main = $('portal-mfa-enroll-main'); if (main) main.hidden = false;
    var done = $('portal-mfa-enroll-done'); if (done) done.hidden = true;
  }

  function hideMfaEnrollView() {
    var ev = $('portal-mfa-enroll-view'); if (ev) ev.hidden = true;
    showDashboard();
    refreshMfaBanner();
  }

  /* PORTAL_MFA_ENROLL_FIX_2026_11_02: GoTrue rejects a second factor
   * with the same friendly name. That error means a factor already
   * exists for this staffer — it is the already-set-up case, not a
   * failure to report raw. */
  function mfaDupNameError(e) {
    var m = (e && e.message) || '';
    return /friendly name/i.test(m) && /already exists/i.test(m);
  }

  /* PORTAL_MFA_ENROLL_FIX_2026_11_02: land a staffer who already has
   * a verified factor back on a clean dashboard: enrollment card
   * closed, setup prompt hidden, one plain note. */
  function mfaAlreadySetUp() {
    mfaState.hasFactor = true;
    mfaState.enrollId = null;
    hideMfaEnrollView();
    showDashError('Your authenticator is already set up.');
  }

  function startMfaEnroll(client) {
    function startFailed() {
      /* PORTAL_MFA_ENROLL_FIX_2026_11_02: any setup failure leaves a
       * clean UI — enrollment card closed (it only ever opens after
       * a successful enroll, below), dashboard normal, friendly text
       * only, never the raw server message. */
      var ev = $('portal-mfa-enroll-view'); if (ev) ev.hidden = true;
      var lv = $('portal-login-view'); if (lv) lv.hidden = true;
      var dv = $('portal-dash-view'); if (dv) dv.hidden = false;
      showDashError('Could not start authenticator setup. Reload the page and try again.');
    }
    /* PORTAL_MFA_ENROLL_FIX_2026_11_02: read the factor list BEFORE
     * enrolling. A verified TOTP factor means setup is already done;
     * enrolling again would only hit the duplicate friendly-name
     * error. Half-finished (unverified) factors are still removed
     * first, as before, so a cancelled setup never blocks a retry.
     * If the list cannot be read, fall through and try the enroll —
     * the duplicate-name guard in the result handler still catches
     * the already-set-up case. */
    client.auth.mfa.listFactors()
      .then(function (res) {
        var data = (res && res.data) || null;
        if (data && pickVerifiedTotp(data)) return 'already';
        var all = (data && data.all) || [];
        var chain = Promise.resolve();
        all.forEach(function (f) {
          if (f && f.factor_type === 'totp' && f.status !== 'verified') {
            chain = chain.then(function () { return client.auth.mfa.unenroll({ factorId: f.id }); });
          }
        });
        return chain.then(function () { return 'go'; });
      })
      .catch(function () { return 'go'; })
      .then(function (step) {
        if (step === 'already') { mfaAlreadySetUp(); return null; }
        return client.auth.mfa.enroll({
          factorType: 'totp',
          issuer: "Austin's Tech Repair Group",
          friendlyName: 'Authenticator app'
        });
      })
      .then(function (res) {
        if (!res) return;
        if (res.error || !res.data || !res.data.totp) {
          if (mfaDupNameError(res.error)) { mfaAlreadySetUp(); return; }
          startFailed();
          return;
        }
        mfaState.enrollId = res.data.id;
        var qr = $('portal-mfa-enroll-qr');
        if (qr) qr.src = res.data.totp.qr_code;
        var sec = $('portal-mfa-enroll-secret');
        if (sec) sec.textContent = res.data.totp.secret;
        var codeEl = $('portal-mfa-enroll-code');
        if (codeEl) codeEl.value = '';
        var e2 = $('portal-mfa-enroll-error');
        if (e2) { e2.hidden = true; e2.textContent = ''; }
        showDashError(null);
        showMfaEnrollView();
      })
      .catch(function (err2) {
        if (mfaDupNameError(err2)) { mfaAlreadySetUp(); return; }
        startFailed();
      });
  }

  function submitMfaEnrollCode(client) {
    var err = $('portal-mfa-enroll-error');
    var codeEl = $('portal-mfa-enroll-code');
    var code = codeEl ? trim(codeEl.value).replace(/\s+/g, '') : '';
    function fail(msg) { if (err) { err.textContent = msg; err.hidden = false; } }
    if (!mfaState.enrollId) { fail('Setup is no longer active. Cancel and start again.'); return; }
    if (!/^\d{6}$/.test(code)) { fail('Enter the 6-digit code the app shows for this account.'); return; }
    var btn = $('portal-mfa-enroll-verify-btn');
    if (btn) btn.disabled = true;
    client.auth.mfa.challenge({ factorId: mfaState.enrollId })
      .then(function (cres) {
        if (!cres || cres.error || !cres.data) { throw new Error('challenge'); }
        return client.auth.mfa.verify({ factorId: mfaState.enrollId, challengeId: cres.data.id, code: code });
      })
      .then(function (res) {
        if (btn) btn.disabled = false;
        if (!res || res.error) {
          fail('That code did not match. Wait for a fresh code in the app and try again.');
          return;
        }
        mfaState.hasFactor = true;
        mfaState.enrollId = null;
        /* PORTAL_MFA_ENROLL_FIX_2026_11_02: refresh the setup prompt
         * the moment the first code verifies, so the banner state is
         * already correct when the dashboard comes back — it no
         * longer waits for Back / Cancel / a reload to catch up. */
        refreshMfaBanner();
        /* PORTAL_DEVICE_TRUST_2026_11_02: proving a fresh factor's
         * first code counts as passing the authenticator on this
         * device, so it earns the same 30-day trust. */
        createDeviceTrust(client);
        var main = $('portal-mfa-enroll-main'); if (main) main.hidden = true;
        var done = $('portal-mfa-enroll-done'); if (done) done.hidden = false;
      })
      .catch(function () {
        if (btn) btn.disabled = false;
        fail('Could not finish setup. Check your connection and try again.');
      });
  }

  function cancelMfaEnroll(client) {
    var fid = mfaState.enrollId;
    mfaState.enrollId = null;
    /* PORTAL_MFA_ENROLL_FIX_2026_11_02: the pending factor is only
     * unenrolled when a pending id actually exists, and closing the
     * card is unconditional — hideMfaEnrollView runs no matter what
     * the best-effort unenroll does, so Cancel always lands on the
     * clean dashboard. */
    try {
      if (fid && client.auth.mfa) {
        client.auth.mfa.unenroll({ factorId: fid }).catch(function () {});
      }
    } catch (e) {}
    hideMfaEnrollView();
  }

  function initMfa(client) {
    if (!client || !client.auth || !client.auth.mfa) return;
    var vb = $('portal-mfa-verify-btn');
    if (vb) vb.addEventListener('click', function () { submitMfaCode(client); });
    var ci = $('portal-mfa-code');
    if (ci) ci.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submitMfaCode(client); }
    });
    var nb = $('portal-mfa-newcheck-btn');
    if (nb) nb.addEventListener('click', function () { beginMfaChallenge(client); });
    var bb = $('portal-mfa-back-btn');
    if (bb) bb.addEventListener('click', function () { cancelMfaChallenge(client); });
    var bs = $('portal-mfa-banner-setup');
    if (bs) bs.addEventListener('click', function () { startMfaEnroll(client); });
    var bd = $('portal-mfa-banner-dismiss');
    if (bd) bd.addEventListener('click', function () { mfaDismissNag(); });
    var evb = $('portal-mfa-enroll-verify-btn');
    if (evb) evb.addEventListener('click', function () { submitMfaEnrollCode(client); });
    var ec = $('portal-mfa-enroll-code');
    if (ec) ec.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submitMfaEnrollCode(client); }
    });
    var cb = $('portal-mfa-enroll-cancel-btn');
    if (cb) cb.addEventListener('click', function () { cancelMfaEnroll(client); });
    var dn = $('portal-mfa-enroll-done-btn');
    if (dn) dn.addEventListener('click', function () { hideMfaEnrollView(); });
  }

  /* ================= DEVICE TRUST + PASSWORD AGE =================
   * PORTAL_DEVICE_TRUST_2026_11_02 (Austin's policy, Nov 2, 2026):
   *
   * 1) REMEMBER THIS DEVICE FOR 30 DAYS. When a staffer passes the
   *    authenticator check (the sign-in challenge, or a fresh
   *    enrollment's first verify), the device-trust Edge Function
   *    issues a random trust token; only its SHA-256 hash is stored
   *    server-side (public.portal_trusted_devices, 30-day expiry).
   *    The raw token lives in this device's localStorage. On a later
   *    sign-in, trustOrChallenge presents the token BEFORE any
   *    challenge starts: a live, unexpired row for this staffer
   *    skips the code prompt; anything else falls through to the
   *    normal challenge. Signing out does NOT clear the token -
   *    remembering the device is the point. A trusted skip leaves
   *    the Auth session at AAL1; the portal treats it as
   *    MFA-satisfied, the same posture as the rest of this
   *    client-side gate (see this build's CHANGES.md).
   *
   * 2) PASSWORD RESET EVERY 30 DAYS. verifyEmployee loads
   *    employee_profiles.password_changed_at with the profile.
   *    afterMfaGate runs at the end of EVERY sign-in gate pass
   *    (AAL2 session, trusted device, challenge verify, no factor):
   *    a password 30+ days old routes to the existing
   *    set-a-new-password view in forced mode - the same updateUser
   *    plumbing as the email recovery, except a successful set
   *    stamps the clock and continues to the dashboard instead of
   *    signing out, and Back signs out fully. A password change
   *    never touches MFA enrollment.
   */
  var TRUST_TOKEN_KEY = 'atrg-portal-trusted-device';
  var PASSWORD_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
  var pwGateState = { forced: false };
  /* PORTAL_SIGNIN_LAYOUT_2026_11_03: state for the visible
   * "Remember this device for 30 days" checkbox on the sign-in
   * card (portal.html, directly under Forgot your password —
   * Austin's layout, Nov 3, 2026). wanted = the box was checked
   * when the sign-in form was submitted (snapshotted by
   * noteSignInTrustChoice in the submit handler, before
   * signInWithPassword runs). applied = a trust token has
   * already been issued for this sign-in by ANY path (the
   * checkbox path in afterMfaGate, or the pre-existing
   * authenticator-verify / enrollment calls to
   * createDeviceTrust, which set it), so a sign-in never issues
   * two tokens. Both start false on every page load, so a
   * restored session (no form submit) never creates trust. */
  var signInTrustState = { wanted: false, applied: false };

  function readTrustToken() {
    try { return window.localStorage.getItem(TRUST_TOKEN_KEY) || ''; }
    catch (e) { return ''; }
  }

  function storeTrustToken(token) {
    try { if (token) window.localStorage.setItem(TRUST_TOKEN_KEY, token); }
    catch (e) {}
  }

  function clearTrustToken() {
    try { window.localStorage.removeItem(TRUST_TOKEN_KEY); } catch (e) {}
  }

  /* Same fetch shape as the track-shipment call: the caller's own
   * session JWT plus the anon key, JSON in, JSON out. Any transport
   * failure reports null - callers read that as "not trusted / not
   * stored", never as a hard stop. */
  function callDeviceTrust(client, payload, done) {
    var finished = false;
    function finish(out) { if (!finished) { finished = true; done(out); } }
    try {
      client.auth.getSession().then(function (sres) {
        var token = sres && sres.data && sres.data.session ? sres.data.session.access_token : '';
        if (!token) { finish(null); return null; }
        return fetch(SUPABASE_URL + '/functions/v1/device-trust', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'apikey': SUPABASE_ANON_KEY },
          body: JSON.stringify(payload)
        });
      }).then(function (r) {
        if (!r) { finish(null); return null; }
        return r.json();
      }).then(function (out) { finish(out || null); })
      .catch(function () { finish(null); });
    } catch (e) { finish(null); }
  }

  function checkDeviceTrust(client, done) {
    var token = readTrustToken();
    if (!token) { done(false); return; }
    callDeviceTrust(client, { action: 'check', token: token }, function (out) {
      if (out && out.trusted === true) { done(true); return; }
      /* A definitive not-trusted answer (expired, revoked, or never
       * issued) retires the stored token so this device stops
       * offering it. No answer at all (offline, function down)
       * keeps the token - the staffer just does the code check
       * this time. */
      if (out && out.trusted === false) clearTrustToken();
      done(false);
    });
  }

  function createDeviceTrust(client) {
    /* PORTAL_SIGNIN_LAYOUT_2026_11_03: any trust issuance marks
     * this sign-in's remember choice as handled, so the checkbox
     * path in afterMfaGate never issues a second token on top of
     * the authenticator-verify / enrollment issuance below. */
    signInTrustState.applied = true;
    var label = '';
    try { label = window.navigator.userAgent || ''; } catch (e) {}
    callDeviceTrust(client, { action: 'create', label: label }, function (out) {
      if (out && out.token) storeTrustToken(out.token);
    });
  }

  /* PORTAL_SIGNIN_LAYOUT_2026_11_03: read the visible checkbox.
   * Called by the sign-in submit handler BEFORE
   * signInWithPassword, so the state reflects the box exactly as
   * it stood for THIS sign-in attempt. An absent element (older
   * cached portal.html) reads as unchecked — the pre-checkbox
   * behavior, never an error. */
  function noteSignInTrustChoice() {
    var box = $('portal-remember-device');
    signInTrustState.wanted = !!(box && box.checked);
    signInTrustState.applied = false;
  }

  /* PORTAL_SIGNIN_LAYOUT_2026_11_03: honor the checkbox once the
   * sign-in has fully passed its gates. Called at the top of
   * afterMfaGate — the one function every completed sign-in
   * passes through (no factor, trusted device, AAL2 session,
   * challenge verify). Checked + not yet issued -> create the
   * same 30-day trust the authenticator path creates, reusing
   * createDeviceTrust unchanged (same Edge Function, same
   * hashed-token row in portal_trusted_devices, same localStorage
   * token). Unchecked -> nothing happens: no trust is created,
   * and an existing token on this device is left exactly as it
   * was (never silently deleted). Best-effort like every trust
   * call: a failure changes nothing about the sign-in itself. */
  function applySignInTrustChoice(client) {
    if (!signInTrustState.wanted || signInTrustState.applied) return;
    createDeviceTrust(client);
  }

  /* The challenge fork in mfaGate: trust first, challenge second.
   * This ordering is the whole feature - with a valid trust, the
   * challenge view is never shown. */
  function trustOrChallenge(client) {
    checkDeviceTrust(client, function (trusted) {
      if (trusted) { afterMfaGate(client); return; }
      beginMfaChallenge(client);
    });
  }

  function passwordIsStale() {
    var raw = state.profile && state.profile.password_changed_at;
    if (!raw) return false;
    var t = new Date(raw).getTime();
    if (isNaN(t)) return false;
    return (Date.now() - t) >= PASSWORD_MAX_AGE_MS;
  }

  /* Post-MFA routing for every sign-in path. Only a stale password
   * diverts, into the forced set-a-new-password step; everyone else
   * lands exactly where they landed before this build. */
  function afterMfaGate(client) {
    /* PORTAL_SIGNIN_LAYOUT_2026_11_03: the sign-in's gates have
     * all passed — honor the "Remember this device" checkbox
     * before the (possibly diverting) password-age check, so a
     * forced rotation does not eat the choice. */
    applySignInTrustChoice(client);
    if (passwordIsStale()) { showForcedPasswordChange(); return; }
    proceedToDashboard();
  }

  function showForcedPasswordChange() {
    pwGateState.forced = true;
    showResetView(null);
    var note = $('portal-reset-note');
    if (note) note.hidden = false;
    var pw = $('portal-reset-password');
    if (pw && pw.focus) pw.focus();
  }

  /* Best-effort stamp of the 30-day clock after a successful
   * updateUser in the reset view - the same own-row update shape
   * the portal already uses for the profile birthday. Never blocks
   * the flow it rides on: every failure path still calls done. */
  function stampPasswordChanged(client, done) {
    var finished = false;
    function finish() { if (!finished) { finished = true; if (done) done(); } }
    try {
      client.auth.getUser().then(function (res) {
        var u = res && res.data && res.data.user;
        if (!u) { finish(); return null; }
        return client.from('employee_profiles')
          .update({ password_changed_at: new Date().toISOString() })
          .eq('id', u.id)
          .then(function () { finish(); })
          .catch(function () { finish(); });
      }).catch(function () { finish(); });
    } catch (e) { finish(); }
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

      /* LOC_SETTINGS_2026_11_03: show/hide password eye toggles —
       * the sign-in field plus the reset view's two fields, which
       * share the same .portal-field + .pw-wrap markup pattern.
       * The buttons are type="button" (they never submit), the
       * icon and aria-label always describe the action's result,
       * and focus returns to the field after a tap. */
      function wirePwEye(btnId, inputId) {
        var btn = $(btnId), input = $(inputId);
        if (!btn || !input) return;
        btn.addEventListener('click', function () {
          var show = input.type === 'password';
          input.type = show ? 'text' : 'password';
          btn.innerHTML = '<i class="fas ' + (show ? 'fa-eye-slash' : 'fa-eye') + '"></i>';
          btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
          try { input.focus(); } catch (e) {}
        });
      }
      wirePwEye('portal-login-pw-eye', 'portal-login-password');
      wirePwEye('portal-reset-pw-eye', 'portal-reset-password');
      wirePwEye('portal-reset-confirm-pw-eye', 'portal-reset-confirm');

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
        /* PORTAL_SIGNIN_LAYOUT_2026_11_03: snapshot the visible
         * "Remember this device for 30 days" checkbox for this
         * attempt before the password goes out; if the sign-in
         * fails, the gates never run and the snapshot is simply
         * never used. */
        noteSignInTrustChoice();
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

      /* PORTAL_MFA_2026_11_02: wire the two-step check, the setup
       * prompt, and the enrollment view to this same client. */
      initMfa(client);
    });
  }

  /* ================= TABS ================= */
  var LOADERS = {
    tickets: loadTickets, applications: loadApplications, investors: loadInvestors,
    feedback: loadFeedback, customers: loadCustomers, members: loadAtrOneMembers, inventory: loadInventory,
    documents: loadDocumentsTab, financials: loadFinancials,
    /* PAYROLL_SPLIT_2026_11_03: Payroll is its own tab now (see loadPayroll). */
    payroll: loadPayroll,
    /* ASSOCIATE_ACCOUNTS_2026_11_03: the merged Associate Accounts panel
     * (Admin group) — one loader where PORTAL_SIDEBAR_ROSTER_2026_11_02's
     * roster and ACCOUNT_CONTROLS_2026_11_03's Account Controls used to
     * register separately. */
    associateaccounts: loadAssociateAccounts,
    /* TEAMCHAT_2026_11_03: the internal Team Chat panel. */
    teamchat: loadTeamChat,
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
    ['tickets', 'applications', 'investors', 'feedback', 'customers', 'members', 'inventory', 'timeclock', 'links', 'square', 'checkin', 'requests', 'prices', 'documents', 'financials', 'payroll', 'mileage', 'teamchat', 'associateaccounts'].forEach(function (n) { /* PORTAL_MILEAGE_2026_11_02: the Mileage panel hides and shows with the rest; PAYROLL_SPLIT_2026_11_03: 'payroll' hides and shows with the rest too; TEAMCHAT_2026_11_03: 'teamchat' hides and shows with the rest too; ASSOCIATE_ACCOUNTS_2026_11_03: 'associateaccounts' hides and shows with the rest too (it absorbed ACCOUNT_CONTROLS_2026_11_03's 'accountcontrols' and the roster's 'associates') */
      $('portal-panel-' + n).hidden = n !== name;
    });
    closeDrawer();
    /* TEAMCHAT_2026_11_03: reopening Team Chat restarts its refresh
     * poll and pulls anything new; switching to any other tab stops
     * the poll so a closed panel is never polled. */
    if (name === 'teamchat') resumeTeamChat(); else stopTeamChatPoll();
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
  /* PORTAL_DRAWER_SCROLL_LOCK_2026_11_02 (Austin, Nov 2, 2026): while
   * the drawer is open, the page behind it must not scroll at all —
   * Austin: scrolling with ticket details up still moved the back
   * screen, and the whole page sometimes shifted. openDrawer and
   * closeDrawer are the choke points every portal.js open/close path
   * funnels through (ticket/application/investor openers, close
   * button, overlay tap, Escape, tab switches). lockBodyScroll freezes
   * the body (portal.css .portal-scroll-locked sets position:fixed —
   * overflow:hidden alone does not stop iPad Safari) and
   * unlockBodyScroll restores the exact pre-open scroll position.
   * Both are idempotent: a second open keeps the first saved
   * position, and a close with no lock held is a no-op. */
  var drawerScrollY = null;
  function lockBodyScroll() {
    if (drawerScrollY !== null) return;
    drawerScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.top = (-drawerScrollY) + 'px';
    document.body.classList.add('portal-scroll-locked');
  }
  function unlockBodyScroll() {
    if (drawerScrollY === null) return;
    var y = drawerScrollY;
    drawerScrollY = null;
    document.body.classList.remove('portal-scroll-locked');
    document.body.style.top = '';
    window.scrollTo(0, y);
  }
  /* end PORTAL_DRAWER_SCROLL_LOCK_2026_11_02 */

  function openDrawer(title) {
    $('portal-drawer-title').textContent = title;
    $('portal-drawer-overlay').hidden = false;
    var d = $('portal-drawer');
    d.classList.add('open');
    d.setAttribute('aria-hidden', 'false');
    lockBodyScroll(); /* PORTAL_DRAWER_SCROLL_LOCK_2026_11_02 */
  }

  function closeDrawer() {
    $('portal-drawer-overlay').hidden = true;
    var d = $('portal-drawer');
    d.classList.remove('open');
    d.setAttribute('aria-hidden', 'true');
    unlockBodyScroll(); /* PORTAL_DRAWER_SCROLL_LOCK_2026_11_02 */
  }

  function initDrawer() {
    $('portal-drawer-close').addEventListener('click', closeDrawer);
    $('portal-drawer-overlay').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });
    /* PORTAL_DRAWER_SCROLL_LOCK_2026_11_02: safety net — three inline
     * portal.html sections (Onboarding/Team Docs, Guides, Requests)
     * hide the drawer through their own closeDrawerInline() copies
     * instead of closeDrawer(), which would strand the scroll lock.
     * Every close path performs the same two DOM mutations (overlay
     * hidden, .open removed), so watch those two signals and keep the
     * lock in sync with the drawer's real state. */
    if (window.MutationObserver) {
      var ov = $('portal-drawer-overlay');
      var dr = $('portal-drawer');
      if (ov && dr) {
        var lockObserver = new MutationObserver(function () {
          var isOpen = !ov.hidden && dr.classList.contains('open');
          if (isOpen) lockBodyScroll(); else unlockBodyScroll();
        });
        lockObserver.observe(ov, { attributes: true, attributeFilter: ['hidden'] });
        lockObserver.observe(dr, { attributes: true, attributeFilter: ['class'] });
      }
    }
    /* end PORTAL_DRAWER_SCROLL_LOCK_2026_11_02 */
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

  var QCLASS = { 'Awaiting Diagnostics': 'q-red', 'Awaiting Estimate': 'q-red', 'Awaiting Customer Response': 'q-yellow', 'Awaiting Parts': 'q-orange', 'Awaiting Repair': 'q-orange', 'En Route to Customer': 'q-yellow', 'In Progress': 'q-yellow', 'Quality Control': 'q-lime', 'Ready': 'q-green', 'Job Complete': 'q-done' };
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

  /* ================= PORTAL_GV_TEXTS_2026_11_02 =================
   * Google Voice texting relay (Austin, Nov 2, 2026): "figure out
   * how to back end the Google Voice and basically plug that into
   * the website." Google Voice has no official SMS API (see
   * CHANGES.md), so a portal message that is also texted is queued
   * as a row in public.outbound_texts and a signed-in browser relay
   * at voice.google.com sends it from the business number
   * (937) 280-6243 (RELAY.md). This block owns: the phone helpers,
   * the per-message text status line in the thread, and the queue
   * insert on send. Everything GV lives between the
   * PORTAL_GV_TEXTS_2026_11_02 markers so the merge with the MFA
   * email-backup and Portal Mail builds stays mechanical. */

  /* Dialable form for Voice: 10 digits -> +1XXXXXXXXXX, 11 digits
   * starting with 1 -> +1..., anything else passes through trimmed
   * (the relay reports the on-screen failure if Voice rejects it). */
  function gvNormalizePhone(raw) {
    var v = trim(raw || '');
    if (!v) return '';
    var d = v.replace(/\D/g, '');
    if (d.length === 10) return '+1' + d;
    if (d.length === 11 && d.charAt(0) === '1') return '+' + d;
    return v;
  }

  /* The small status line under a texted thread message. outbound
   * rows are keyed by message_id; the newest row for a message
   * wins (loadTicketThread orders ascending and overwrites). */
  function gvTextStatusHtml(o) {
    if (!o) return '';
    var label = '';
    if (o.status === 'queued') label = 'Text: Queued';
    else if (o.status === 'sending') label = 'Text: Sending\u2026';
    else if (o.status === 'sent') label = 'Text sent' + (o.sent_at ? ' \u00b7 ' + fmtDateTime(o.sent_at) : '');
    else if (o.status === 'failed') label = 'Text failed' + (o.error ? ' \u2014 ' + o.error : '');
    else label = 'Text: ' + o.status;
    return '<span class="portal-muted portal-small" style="display:block;margin-top:0.3rem;">' +
      '<i class="fas fa-comment-sms" aria-hidden="true"></i> ' + esc(label) + '</span>';
  }

  function renderTicketThread(messages, outboundByMessage) {
    var box = $('portal-thread');
    if (!box) return;
    if (!messages.length) {
      box.innerHTML = '<p class="portal-muted">No messages on this ticket yet.</p>';
      return;
    }
    box.innerHTML = messages.map(function (m) {
      var who = m.sender === 'tech' ? 'Tech' : 'Customer';
      var gv = (m.sender === 'tech' && outboundByMessage) ? gvTextStatusHtml(outboundByMessage[m.id]) : '';
      return '<div class="portal-msg portal-msg-' + (m.sender === 'tech' ? 'tech' : 'customer') + '">' +
        esc(m.message) + gv +
        '<span class="portal-msg-meta">' + who + ' · ' + esc(fmtDateTime(m.created_at)) + '</span></div>';
    }).join('');
    box.scrollTop = box.scrollHeight;
  }

  /* Keep the checkbox + note in the Message customer block honest
   * about the number that will be texted. t._gvPhone is the resolved
   * destination (customer profile phone first, ticket phone as the
   * fallback -- see resolveGvPhone). */
  function gvSyncTextControls(t) {
    var check = $('portal-gv-text-check');
    var note = $('portal-gv-text-note');
    var phone = t && t._gvPhone ? t._gvPhone : '';
    if (check) {
      if (phone) { check.disabled = false; if (!check.getAttribute('data-gv-touched')) check.checked = true; }
      else { check.disabled = true; check.checked = false; }
    }
    if (note) {
      note.textContent = phone
        ? 'Texts go from the business number (937) 280-6243 to ' + phone + ' via the Google Voice relay.'
        : 'No phone number on file for this customer \u2014 texting unavailable.';
    }
  }

  /* Resolve the texting number from the customer's profile
   * (public.customers.phone for t.customer_id); the phone snapshot
   * on the ticket itself is the fallback and the starting value, so
   * the controls render correctly before this returns. */
  function resolveGvPhone(client, t) {
    t._gvPhone = gvNormalizePhone(t.customer_phone || '');
    gvSyncTextControls(t);
    if (!t.customer_id) return;
    client.from('customers').select('phone').eq('id', t.customer_id).maybeSingle().then(function (res) {
      if (res.error || !res.data) return;
      var p = gvNormalizePhone(res.data.phone || '');
      if (p) { t._gvPhone = p; gvSyncTextControls(t); }
    }).catch(function () {});
  }
  /* ================= /PORTAL_GV_TEXTS_2026_11_02 ================= */

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
      tkAccSetHint('timer', running ? 'Timer running' : ''); /* PORTAL_TICKET_ACCORDION_2026_11_02: a running timer shows on the closed Job timer header. */
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
        var msgs = res.error ? [] : (res.data || []);
        /* PORTAL_GV_TEXTS_2026_11_02: overlay each tech message with
         * its outbound text status. If outbound_texts does not exist
         * yet (its SQL has not run), the query errors and the thread
         * renders exactly as before -- no status lines, no breakage. */
        client.from('outbound_texts').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true })
          .then(function (ores) {
            var map = {};
            if (!ores.error) (ores.data || []).forEach(function (o) { if (o.message_id) map[o.message_id] = o; });
            renderTicketThread(msgs, map);
          })
          .catch(function () { renderTicketThread(msgs, {}); });
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

  /* ================= TICKET DRAWER ACCORDION =================
   * PORTAL_TICKET_ACCORDION_2026_11_02 (Austin, Nov 2, 2026): the
   * ticket drawer stacked every section open at once — "very hard
   * to read... very overwhelming for a technician" (his words,
   * reading Patrick's ticket). Every section below the always-
   * visible header + Status now sits behind a tappable header row
   * (chevron, generous iPad tap target): tap to open, tap to hide.
   * Nothing inside a section changed — same markup, same wiring —
   * only a header button and a body wrapper were added around it.
   * Open/closed choices live in tkAccState (in-memory, this
   * session) so moving between tickets keeps the tech's layout.
   * Default open: Message customer + Repair log — the two sections
   * a tech works in during a job (talk to the customer, log the
   * work), and the pair Austin's approved order already joins.
   * PORTAL_TICKET_DETAILS_COLLAPSE_2026_11_03: Ticket details uses
   * this same accordion and is deliberately absent from the default
   * list below, so it starts collapsed while Status stays visible.
   * A closed header can carry a right-side hint (tkAccSetHint),
   * fed by the section's own loader — balance due, tracking
   * status, an unsigned authorization, a running timer — so
   * closed never means invisible. */
  var TK_ACC_DEFAULT_OPEN = { message: true, repairlog: true };
  var tkAccState = {};
  function tkAccOpen(key) {
    return Object.prototype.hasOwnProperty.call(tkAccState, key) ? tkAccState[key] : !!TK_ACC_DEFAULT_OPEN[key];
  }
  function tkAccHead(key, title) {
    var open = tkAccOpen(key);
    return '<button type="button" class="tk-acc-head' + (open ? ' tk-acc-open' : '') + '" data-acc-toggle="' + key + '" aria-expanded="' + (open ? 'true' : 'false') + '">' +
      '<span class="tk-acc-title">' + title + '</span>' +
      '<span class="tk-acc-hint" data-acc-hint="' + key + '"></span>' +
      '<i class="fas fa-chevron-down tk-acc-chev" aria-hidden="true"></i></button>';
  }
  function tkAccBodyOpen(key) {
    return '<div class="tk-acc-body" data-acc-body="' + key + '"' + (tkAccOpen(key) ? '' : ' hidden') + '>';
  }
  function tkAccSetHint(key, text) {
    var body = $('portal-drawer-body');
    if (!body) return;
    var el = body.querySelector('[data-acc-hint="' + key + '"]');
    if (el) el.textContent = text || '';
  }
  function wireTicketAccordion() {
    var body = $('portal-drawer-body');
    if (!body) return;
    body.querySelectorAll('[data-acc-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-acc-toggle');
        var open = !tkAccOpen(key);
        tkAccState[key] = open;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.classList.toggle('tk-acc-open', open);
        var panel = body.querySelector('[data-acc-body="' + key + '"]');
        if (!panel) return;
        if (open) {
          panel.hidden = false;
          var target = panel.scrollHeight;
          panel.style.height = '0px';
          void panel.offsetHeight;
          panel.style.height = target + 'px';
          setTimeout(function () { if (tkAccOpen(key)) panel.style.height = ''; }, 260);
        } else {
          panel.style.height = panel.scrollHeight + 'px';
          void panel.offsetHeight;
          panel.style.height = '0px';
          setTimeout(function () { if (!tkAccOpen(key)) { panel.hidden = true; panel.style.height = ''; } }, 260);
        }
      });
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
          /* PORTAL_TICKET_DRAWER_2026_11_02 (Austin, Nov 2, 2026):
           * drawer section order — the Status control opens the
           * drawer, first thing under the Ticket details heading
           * (it used to sit below Parts), and Message customer
           * sits directly above the Repair log (see below). Every
           * section's markup and wiring are unchanged; only the
           * order moved. */
          '<div class="portal-drawer-section"><h3>Status</h3>' +
          '<div class="portal-status-row"><select id="portal-ticket-status" aria-label="Ticket status">' +
          statusOptions(TICKET_STATUSES, t.status) + '</select>' +
          '<button class="portal-btn portal-btn-primary portal-btn-sm" type="button" id="portal-ticket-status-save">Save status</button>' +
          '<span class="portal-muted portal-small" id="portal-ticket-status-msg"></span></div>' +
          /* AVATARS_2026_11_03: who is on this job. The assignee is
           * the person the customer sees in their repair view —
           * picture + name as "Your technician" (ticket_technician
           * in avatars.sql). Options load in loadTicketAssignees. */
          '<div class="portal-status-row"><label for="portal-ticket-assignee">Assigned to</label>' +
          '<select id="portal-ticket-assignee" aria-label="Assigned technician"><option value="">Unassigned</option></select>' +
          '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" id="portal-ticket-assignee-save">Save assignment</button>' +
          '<span class="portal-muted portal-small" id="portal-ticket-assignee-msg"></span></div></div>' +
          /* PORTAL_TICKET_DETAILS_COLLAPSE_2026_11_03: Ticket details
           * is an accordion section like Edit details and Documents;
           * it is not in TK_ACC_DEFAULT_OPEN, so it starts collapsed. */
          '<div class="portal-drawer-section tk-acc" data-acc="details">' + tkAccHead('details', 'Ticket details') + tkAccBodyOpen('details') +
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
          '</div></div>' + /* PORTAL_TICKET_DETAILS_COLLAPSE_2026_11_03: close the Ticket details accordion body and section. */
          '<div class="portal-drawer-section tk-acc" data-acc="edit">' + tkAccHead('edit', 'Edit details') + tkAccBodyOpen('edit') +
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
          '<span class="portal-muted portal-small" id="p2-edit-msg"></span></div></div>' +
          '<div class="portal-drawer-section p2-actions"><button class="portal-btn portal-btn-primary portal-btn-sm" type="button" id="p2-receipt-btn"><i class="fas fa-receipt"></i> Print receipt</button>' +
          /* PORTAL_RECEIPT_TOP_2026_11_03: the receipt actions live
           * together at the top of the ticket, beside Print receipt —
           * Generate / Download / Email moved up here out of Charges
           * (Austin, Nov 3, 2026). Same IDs, same handlers, same
           * status line beside the buttons; only the location moved. */
          '<button class="portal-btn portal-btn-primary portal-btn-sm" type="button" id="p2-gen-receipt-btn"><i class="fas fa-file"></i> Generate receipt</button>' +
          '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" id="p2-download-receipt-btn"><i class="fas fa-download"></i> Download receipt</button>' +
          '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" id="p2-email-receipt-btn"><i class="fas fa-envelope"></i> Email receipt</button>' +
          '<span class="portal-muted portal-small" id="p2-gen-receipt-msg"></span>' +
          '<button class="portal-btn p2-btn-danger portal-btn-sm" type="button" id="p2-delete-btn"><i class="fas fa-trash"></i> Delete ticket</button>' +
          '<span class="portal-muted portal-small" id="p2-action-msg"></span>' +
          '<div id="p2-delete-confirm" hidden><p class="portal-error">Permanently delete this ticket? Its charges and messages go with it. Part orders stay on file but detach from the ticket. This cannot be undone.</p>' +
          '<button class="portal-btn p2-btn-danger portal-btn-sm" type="button" id="p2-delete-yes">Yes, delete it</button> ' +
          '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" id="p2-delete-no">Keep ticket</button></div></div>' +
          '<div class="portal-drawer-section tk-acc" data-acc="documents">' + tkAccHead('documents', 'Documents') + tkAccBodyOpen('documents') +
          '<div id="p4-docs"><p class="portal-muted">Loading documents&hellip;</p></div>' +
          '<div class="p2-actions"><button class="portal-btn portal-btn-primary portal-btn-sm" type="button" id="p4-sign-btn"><i class="fas fa-pen-nib"></i> Sign repair authorization</button>' +
          '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" id="p4-media-btn"><i class="fas fa-camera"></i> Sign media release</button>' +
          '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" id="p4-attach-btn"><i class="fas fa-paperclip"></i> Attach document</button>' +
          '<select id="p4-attach-type" aria-label="Attach as document type" style="padding:0.4rem;border:2px solid var(--line, #d8cbb6);border-radius:8px;background:var(--bg, #fff);color:var(--ink, #2c231a);"><option value="receipt">Receipt</option><option value="part_order">Part order</option><option value="repair_authorization">Signed authorization</option><option value="other">Other</option></select>' +
          '<input type="file" id="p4-attach-file" accept="image/*,application/pdf" hidden />' +
          '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" id="p4-existing-btn"><i class="fas fa-link"></i> Attach an existing document</button></div>' +
          '<div class="p2-form" id="p4-existing-picker" hidden>' +
          '<div id="p4-existing-list"><p class="portal-muted portal-small">Loading documents&hellip;</p></div></div>' +
          '<p class="portal-muted portal-small">Documents file themselves on this ticket. Signing the repair authorization here, or attaching one as a signed authorization, also marks Terms accepted and Work authorized on the ticket. The media release is separate: sign it only when the customer agrees to photos or clips of the device and the repair work.</p>' +
          '<p class="portal-error" id="p4-doc-msg" hidden></p></div></div>' +
          '<div class="portal-drawer-section tk-acc" data-acc="message">' + tkAccHead('message', 'Message customer') + tkAccBodyOpen('message') +
          '<div class="portal-thread" id="portal-thread"><p class="portal-muted">Loading messages&hellip;</p></div>' +
          '<form id="portal-note-form"><div class="portal-note-row">' +
          '<textarea id="portal-note-input" placeholder="Add a note to this ticket&hellip;" maxlength="2000" aria-label="Add a note to this ticket"></textarea>' +
          '<button class="portal-btn portal-btn-primary" type="submit"><i class="fas fa-paper-plane"></i></button></div>' +
          /* PORTAL_GV_TEXTS_2026_11_02: the texting option. Default
           * ON when the customer has a phone number on file (the
           * checked/disabled state is set from t.customer_phone
           * here and re-synced from the customer profile by
           * resolveGvPhone / gvSyncTextControls); with no number it
           * renders disabled and the note says why, in plain words. */
          '<label class="p2-check"><input type="checkbox" id="portal-gv-text-check"' + (trim(t.customer_phone || '') ? ' checked' : ' disabled') + ' /> Also text this to the customer</label>' +
          '<p class="portal-muted portal-small" id="portal-gv-text-note">' + (trim(t.customer_phone || '') ? 'Texts go from the business number (937) 280-6243 via the Google Voice relay.' : 'No phone number on file for this customer &mdash; texting unavailable.') + '</p>' +
          '<p class="portal-muted portal-small" id="portal-gv-text-msg"></p>' +
          '<p class="portal-muted portal-small">Notes are saved to this ticket&rsquo;s message thread as Tech.</p>' +
          '<p class="portal-error" id="portal-note-error" hidden></p></form></div></div>' +
          /* PORTAL_DRAWER_DOCS_2026_10_30: the Repair Log section
           * renders high in the drawer, before ATR One and Charges —
           * it used to be appended at the very bottom of the drawer.
           * Log markup is unchanged; the proof-photo strip and
           * Attach a photo control at the end of the section are new
           * (same change).
           * PORTAL_TICKET_DRAWER_2026_11_02: Message customer now
           * sits directly above the Repair Log (it used to close the
           * drawer, below Job timer), per Austin, Nov 2, 2026. */
          '<div class="portal-drawer-section tk-acc" data-acc="repairlog">' + tkAccHead('repairlog', 'Repair log') + tkAccBodyOpen('repairlog') +
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
          '<p class="portal-error" id="portal-repair-log-photo-error" hidden></p></div></div>' +
          '<div class="portal-drawer-section tk-acc" data-acc="atrone">' + tkAccHead('atrone', 'ATR One') + tkAccBodyOpen('atrone') +
          '<div id="p5-atrone"><p class="portal-muted">Loading membership&hellip;</p></div>' +
          '<p class="portal-error" id="p5-atr-msg" hidden></p></div></div>' +
          '<div class="portal-drawer-section tk-acc" data-acc="charges">' + tkAccHead('charges', 'Charges') + tkAccBodyOpen('charges') +
          '<div id="p2-charges"><p class="portal-muted">Loading charges&hellip;</p></div>' +
          '<form id="p2-charge-form" class="p2-form">' +
          /* PORTAL_TIP_2026_11_02 (Austin, Nov 2, 2026): "Add a tip
           * button" — Tip is a first-class charge kind in this select
           * (it used to be hand-typed as an Other charge; that is how
           * Patrick's $10 tip got in). The rest of this PORTAL_TIP
           * change: the kind-change handler below auto-fills the
           * description "Tip" and disables/hides Our cost for tips,
           * the submit handler never saves a cost on a tip, and the
           * Charges row label map reads TIP. A tip is otherwise an
           * ordinary charge line: every reader splits only on
           * kind === 'deposit_credit', so a tip counts into the
           * subtotal and balance due, lands in Financials as revenue,
           * and prints on the receipt from its description, "Tip". */
          '<select id="p2-charge-kind" aria-label="Charge type"><option value="part">Part</option><option value="labor">Labor</option><option value="one_off">Other charge</option><option value="dispatch">House-call fee</option><option value="tip">Tip</option><option value="deposit_credit">Deposit received (credit)</option></select>' +
          '<input id="p2-charge-desc" type="text" placeholder="Description" maxlength="200" aria-label="Charge description" />' +
          '<div class="p2-form-row"><input id="p2-charge-qty" type="number" step="0.5" min="0" value="1" aria-label="Quantity" />' +
          '<input id="p2-charge-price" type="number" step="0.01" min="0" placeholder="Price $" aria-label="Unit price" />' +
          '<input id="p2-charge-cost" type="number" step="0.01" min="0" placeholder="Our cost $ (optional)" aria-label="Unit cost" /></div>' +
          /* PORTAL_CHARGE_DEDUCTOR_2026_11_02: one control that deducts — waive the charge being added instead of adding a second credit line. */
          '<label class="p2-check"><input type="checkbox" id="p2-charge-waive" /> Waive this charge &mdash; show it as waived, counting $0</label>' +
          '<button class="portal-btn portal-btn-primary portal-btn-sm" type="submit">Add charge</button>' +
          '<p class="portal-error" id="p2-charge-error" hidden></p></form>' +
          /* PORTAL_RECEIPT_TOP_2026_11_03: the Generate / Download /
           * Email receipt row that used to sit here moved to the top
           * of the ticket, beside Print receipt (Austin, Nov 3, 2026).
           * The help paragraph stays with the charges it explains. */
          '<p class="portal-muted portal-small">Generate receipt files a receipt built from these charges into Documents. If the charges change afterwards, generate again and it replaces the filed copy. Download receipt saves that same receipt as a PDF file. Email receipt sends the PDF to the customer&rsquo;s email on file &mdash; the fallback when a portal message or text does not reach them.</p></div></div>' +
          '<div class="portal-drawer-section tk-acc" data-acc="payment">' + tkAccHead('payment', 'Payment') + tkAccBodyOpen('payment') +
          '<div class="p2-actions"><button class="portal-btn portal-btn-primary portal-btn-sm" type="button" id="p3-checkout-btn"><i class="fas fa-credit-card"></i> Charge / Check out</button>' +
          '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" id="p3-cash-btn"><i class="fas fa-money-bill-wave"></i> Mark paid — cash</button>' +
          '<span class="portal-muted portal-small" id="p3-pay-msg"></span></div>' +
          '<div id="p3-checkout-link" hidden></div></div></div>' +
          '<div class="portal-drawer-section tk-acc" data-acc="parts">' + tkAccHead('parts', 'Parts on this ticket') + tkAccBodyOpen('parts') +
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
          '<p class="portal-error" id="p2-part-error" hidden></p></form></div></div>' +
          '<div class="portal-drawer-section tk-acc" data-acc="timer">' + tkAccHead('timer', 'Job timer') + tkAccBodyOpen('timer') +
          '<p class="portal-muted" id="portal-timer-total">Loading time on this job&hellip;</p>' +
          '<div class="portal-status-row"><button class="portal-btn portal-btn-primary portal-btn-sm" type="button" id="portal-timer-btn">Start timer</button>' +
          '<span class="portal-muted portal-small" id="portal-timer-msg"></span></div>' +
          '<div id="portal-timer-list"></div></div></div>';

        $('portal-drawer-body').innerHTML = body;
        wireTicketAccordion(); /* PORTAL_TICKET_ACCORDION_2026_11_02 */
        loadTicketThread(client, t.id); resolveGvPhone(client, t); /* PORTAL_GV_TEXTS_2026_11_02 */ loadRepairLog(client, t.id); loadRepairLogPhotos(client, t); wireRepairLogPhotos(client, t); var repairForm = $("portal-repair-log-form"); if (repairForm) { repairForm.addEventListener("submit", function (e) { e.preventDefault(); var input = $("portal-repair-log-input"); var err = $("portal-repair-log-error"); if (err) { err.hidden = true; err.textContent = ""; } var text = input ? trim(input.value) : ""; if (!text) { return; } client.from("ticket_notes").insert({ ticket_id: t.id, author: (state.profile && state.profile.name) || null, note: text }).then(function (res2) { if (res2.error) { if (err) { err.textContent = "Could not save that update. Try again."; err.hidden = false; } return; } if (input) { input.value = ""; } loadRepairLog(client, t.id); }).catch(function () { if (err) { err.textContent = "Could not save that update. Try again."; err.hidden = false; } }); }); } 
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
        var gvCheckEl = $('portal-gv-text-check');
        if (gvCheckEl) gvCheckEl.addEventListener('change', function () { gvCheckEl.setAttribute('data-gv-touched', '1'); });
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

        /* AVATARS_2026_11_03: the Assigned to picker beside the
         * status control — options from the staff directory, the
         * write is the plain ticket update the drawer already uses. */
        loadTicketAssignees(client, t);
        var asgSave = $('portal-ticket-assignee-save');
        if (asgSave) asgSave.addEventListener('click', function () {
          var sel = $('portal-ticket-assignee');
          var msg = $('portal-ticket-assignee-msg');
          if (!sel) return;
          var val = sel.value || null;
          if (msg) msg.textContent = 'Saving…';
          client.from('tickets').update({ assigned_to: val }).eq('id', t.id).then(function (res2) {
            if (res2.error) { if (msg) msg.textContent = 'Couldn’t save — try again.'; return; }
            t.assigned_to = val;
            if (msg) msg.textContent = val ? 'Saved.' : 'Saved — nobody assigned.';
          }).catch(function () { if (msg) msg.textContent = 'Couldn’t save — try again.'; });
        });

        $('portal-note-form').addEventListener('submit', function (e) {
          e.preventDefault();
          var text = trim($('portal-note-input').value);
          var err = $('portal-note-error');
          err.hidden = true;
          if (!text) return;
          /* PORTAL_GV_TEXTS_2026_11_02: capture the texting intent
           * and destination BEFORE the async save. The thread insert
           * now returns its row (.select(), the job_timers pattern)
           * so the queued text can link back to its message. */
          var gvCheck = $('portal-gv-text-check');
          var gvMsg = $('portal-gv-text-msg');
          var wantsText = !!(gvCheck && gvCheck.checked && !gvCheck.disabled);
          var gvTo = t._gvPhone || gvNormalizePhone(t.customer_phone || '');
          if (gvMsg) gvMsg.textContent = '';
          client.from('messages').insert({ ticket_id: t.id, sender: 'tech', message: text }).select().then(function (res2) {
            if (res2.error) { err.textContent = 'Couldn&rsquo;t save that note. Try again.'; err.hidden = false; return; }
            var msgRow = res2.data && res2.data[0] ? res2.data[0] : null;
            $('portal-note-input').value = '';
            if (!wantsText || !gvTo) { loadTicketThread(client, t.id); return; }
            var outRow = {
              ticket_id: t.id,
              customer_id: t.customer_id || null,
              message_id: msgRow ? msgRow.id : null,
              to_number: gvTo,
              body: text,
              status: 'queued',
              created_by: state.user ? state.user.id : null
            };
            client.from('outbound_texts').insert(outRow).then(function (ores) {
              if (ores.error) {
                /* The portal message saved fine; only the text
                 * queue failed (e.g. outbound_texts SQL not run
                 * yet). Say so next to the checkbox -- never lose
                 * the message over a failed text. */
                if (gvMsg) gvMsg.textContent = 'Saved to the thread, but the text could not be queued. The message is on the ticket; text the customer from Google Voice for now.';
              }
              loadTicketThread(client, t.id);
            }).catch(function () {
              if (gvMsg) gvMsg.textContent = 'Saved to the thread, but the text could not be queued. The message is on the ticket; text the customer from Google Voice for now.';
              loadTicketThread(client, t.id);
            });
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

  /* PORTAL_CHARGE_DEDUCTOR_2026_11_02 (Austin, Nov 2, 2026): a
   * waived charge is ONE ticket_charges row — the kind the staffer
   * picked, unit_price 0, and the waived face amount (the line total
   * that was waived) carried at the end of the description as the
   * marker " [waived $35.00]". Every reader of ticket_charges sums
   * qty x unit_price and splits only on kind === 'deposit_credit'
   * (chargeTotals above, finSum / finMonths in Financials, the
   * customer profile's Repair investments total, the receipt
   * composer, the checkout balance, the points award), so a $0 row
   * of an ordinary kind contributes exactly $0 everywhere with no
   * reader changes — and because it is NOT a deposit_credit, a
   * waiver never inflates Collected or Repair investments: a waiver
   * is not a payment. The marker exists only so the ticket and the
   * receipt can show what was waived. A deposit_credit row is never
   * treated as waived (deposits are payments, handled as before). */
  var WAIVED_MARK_RE = /^(.*) \[waived \$([0-9]+(?:\.[0-9]{1,2})?)\]$/;
  function waivedFace(c) {
    if (!c || c.kind === 'deposit_credit') return null;
    var m = String(c.description || '').match(WAIVED_MARK_RE);
    return m ? parseFloat(m[2]) : null;
  }
  function waivedName(c) {
    var m = String((c && c.description) || '').match(WAIVED_MARK_RE);
    return m ? m[1] : String((c && c.description) || '');
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
        /* PORTAL_TIP_2026_11_02: tip rows carry the TIP pill. */
        var kindLabel = { part: 'Part', labor: 'Labor', one_off: 'Other', dispatch: 'House-call fee', tip: 'Tip', deposit_credit: 'Deposit' }[c.kind] || c.kind;
        var sign = c.kind === 'deposit_credit' ? '&minus;' : '';
        /* PORTAL_CHARGE_DEDUCTOR_2026_11_02: a waived line shows its
         * face amount struck through beside the $0 it counts. The
         * delete button is the same one every line gets. */
        var face = waivedFace(c);
        if (face != null) {
          return '<div class="p2-line"><div class="p2-line-main"><span class="p2-kind">' + esc(kindLabel) + '</span> ' + esc(waivedName(c)) +
            '<span class="portal-muted portal-small"> &times;' + esc(c.qty) + ' &mdash; was ' + fmtMoney(face) + ' &mdash; waived' +
            (c.unit_cost != null ? ' (our cost ' + fmtMoney(c.unit_cost) + ')' : '') + '</span></div>' +
            '<div class="p2-line-amt"><s class="p2-waived-face">' + fmtMoney(face) + '</s> ' + fmtMoney(0) + '</div>' +
            '<button class="p2-x" type="button" data-charge-del="' + esc(c.id) + '" aria-label="Remove charge">&times;</button></div>';
        }
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
    /* PORTAL_TICKET_ACCORDION_2026_11_02: the closed Charges header
     * carries the balance, so a due amount is never hidden. */
    var accTot = chargeTotals(rows);
    tkAccSetHint('charges', rows.length ? (accTot.balance > 0 ? fmtMoney(accTot.balance) + ' due' : 'Paid in full') : '');
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

  /* PORTAL_LIVE_TRACKING_2026_11_01: the little Live tracking box under
   * each part that has a tracking number — status plus the time it was
   * updated, right on the ticket, no trip to the carrier's site. Status
   * comes from the track-shipment Edge Function (each carrier's official
   * developer API, auto-detected) and is cached back onto the part row so it
   * is still there the next time the ticket opens. */
  var ltBusy = {};
  function liveTrackHtml(p) {
    if (!p.tracking_number) return '';
    var status = p.tracking_status
      ? '<strong>' + esc(p.tracking_status) + '</strong>' + (p.tracking_detail ? ' &middot; ' + esc(p.tracking_detail) : '')
      : '<span class="portal-muted">Not checked yet</span>';
    var meta = [];
    if (p.tracking_eta) meta.push('Arriving ' + esc(fmtDate(p.tracking_eta)));
    if (p.tracking_checked_at) meta.push('Updated ' + esc(fmtDateTime(p.tracking_checked_at)));
    return '<div class="p2-live-track" data-live-track="' + esc(p.id) + '">' +
      '<div class="p2-lt-head"><span class="p2-lt-dot" aria-hidden="true"></span><span class="p2-lt-title">Live tracking</span>' +
      '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-lt-refresh="' + esc(p.id) + '"><i class="fas fa-rotate"></i> Refresh</button></div>' +
      '<div class="p2-lt-status" data-lt-status>' + status + '</div>' +
      '<div class="portal-muted portal-small" data-lt-meta>' + meta.join(' &middot; ') + '</div></div>';
  }
  function ltRender(box, p, note) {
    if (!box) return;
    var st = box.querySelector('[data-lt-status]');
    var mt = box.querySelector('[data-lt-meta]');
    if (st) st.innerHTML = note
      ? '<span class="portal-muted">' + esc(note) + '</span>'
      : '<strong>' + esc(p.tracking_status || '') + '</strong>' + (p.tracking_detail ? ' &middot; ' + esc(p.tracking_detail) : '');
    if (mt) {
      var meta = [];
      if (p.tracking_eta) meta.push('Arriving ' + fmtDate(p.tracking_eta));
      if (p.tracking_checked_at) meta.push('Updated ' + fmtDateTime(p.tracking_checked_at));
      mt.textContent = meta.join(' \u00b7 ');
    }
  }
  function refreshLiveTrack(client, part, box) {
    if (!part.tracking_number || ltBusy[part.id]) return;
    ltBusy[part.id] = true;
    if (box) ltRender(box, part, 'Checking live status\u2026');
    client.auth.getSession().then(function (sres) {
      var token = sres && sres.data && sres.data.session ? sres.data.session.access_token : '';
      return fetch(SUPABASE_URL + '/functions/v1/track-shipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'apikey': SUPABASE_ANON_KEY },
        body: JSON.stringify({ tracking_number: part.tracking_number, carrier: part.carrier || '' })
      });
    }).then(function (r) { return r.json(); }).then(function (out) {
      ltBusy[part.id] = false;
      if (!out || !out.ok) { if (box) ltRender(box, part, 'Couldn\u2019t get live status \u2014 try Refresh.'); return; }
      if (!out.connected) { if (box) ltRender(box, part, 'Live tracking for ' + (out.carrier || 'this carrier') + ' turns on once its developer keys are added.'); return; }
      part.tracking_status = out.status || '';
      part.tracking_detail = out.detail || '';
      part.tracking_eta = out.eta || null;
      part.tracking_checked_at = new Date().toISOString();
      if (box) ltRender(box, part);
      client.from('part_orders').update({
        tracking_status: part.tracking_status,
        tracking_detail: part.tracking_detail,
        tracking_eta: part.tracking_eta,
        tracking_checked_at: part.tracking_checked_at
      }).eq('id', part.id).then(function () {}).catch(function () {});
    }).catch(function () {
      ltBusy[part.id] = false;
      if (box) ltRender(box, part, 'Couldn\u2019t get live status \u2014 try Refresh.');
    });
  }

  /* PORTAL_PARTS_TO_INVENTORY_2026_11_02: one-tap Reorder link on a
   * ticket part row, shown only when the part is linked to an inventory
   * item that carries a saved reorder_url (t._invById is filled by
   * loadParts). Renders nothing otherwise. */
  function partReorderHtml(t, p) {
    if (!p || !p.inventory_id || !t || !t._invById) return '';
    var inv = t._invById[p.inventory_id];
    if (!inv || !trim(inv.reorder_url || '')) return '';
    return '<a class="portal-btn portal-btn-outline portal-btn-sm" href="' + esc(inv.reorder_url) + '" target="_blank" rel="noopener"><i class="fas fa-cart-shopping"></i> Reorder</a>';
  }

  function renderParts(t, rows) {
    var box = $('p2-parts');
    if (!box) return;
    if (!rows.length) {
      box.innerHTML = '<p class="portal-muted">No parts ordered for this ticket yet.</p>';
      tkAccSetHint('parts', ''); /* PORTAL_TICKET_ACCORDION_2026_11_02 */
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
        /* PORTAL_PARTS_TO_INVENTORY_2026_11_02 */ partReorderHtml(t, p) +
        '<button class="p2-x" type="button" data-part-del="' + esc(p.id) + '" aria-label="Remove part order">&times;</button></div>' +
        liveTrackHtml(p) +
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
    box.querySelectorAll('[data-lt-refresh]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var part = null;
        rows.forEach(function (r) { if (r.id === btn.getAttribute('data-lt-refresh')) part = r; });
        if (!part) return;
        var ltBox = box.querySelector('[data-live-track="' + part.id + '"]');
        withClient(function (client) { refreshLiveTrack(client, part, ltBox); });
      });
    });
    /* Auto-check when the ticket opens if the saved status is stale
       (over 15 minutes old) or missing, and the part is not in hand. */
    rows.forEach(function (p) {
      if (!p.tracking_number || p.status === 'Received' || p.tracking_status === 'Delivered') return;
      var stale = !p.tracking_checked_at || (Date.now() - new Date(p.tracking_checked_at).getTime() > 15 * 60 * 1000);
      if (!stale) return;
      var ltBox = box.querySelector('[data-live-track="' + p.id + '"]');
      withClient(function (client) { refreshLiveTrack(client, p, ltBox); });
    });
    /* PORTAL_TICKET_ACCORDION_2026_11_02: the closed Parts header
     * carries the freshest tracking word for parts still out, so a
     * shipment update is never hidden behind the fold. */
    var accOpenParts = rows.filter(function (p) { return p.status !== 'Received' && p.status !== 'Cancelled'; });
    var accTracked = accOpenParts.filter(function (p) { return !!p.tracking_status; });
    tkAccSetHint('parts', accTracked.length ? accTracked[0].tracking_status :
      (accOpenParts.length ? accOpenParts.length + (accOpenParts.length === 1 ? ' part on the way' : ' parts on the way') :
      (rows.some(function (p) { return p.status === 'Received'; }) ? 'All received' : '')));
  }

  function loadParts(client, t) {
    client.from('part_orders').select('*').eq('ticket_id', t.id).order('created_at', { ascending: true }).then(function (res) {
      if (res.error) { var b = $('p2-parts'); if (b) b.innerHTML = '<p class="portal-error">Couldn&rsquo;t load parts.</p>'; return; }
      t._parts = res.data || [];
      /* PORTAL_PARTS_TO_INVENTORY_2026_11_02: fetch the linked inventory
       * rows so part rows can show a Reorder link where one is saved.
       * A failed fetch just renders the parts without links. */
      var invIds = [];
      t._parts.forEach(function (p) { if (p.inventory_id && invIds.indexOf(p.inventory_id) === -1) invIds.push(p.inventory_id); });
      if (!invIds.length) { t._invById = {}; renderParts(t, t._parts); return; }
      client.from('inventory').select('id, reorder_url').in('id', invIds).then(function (ires) {
        t._invById = {};
        if (!ires.error) (ires.data || []).forEach(function (r) { t._invById[r.id] = r; });
        renderParts(t, t._parts);
      }).catch(function () { t._invById = {}; renderParts(t, t._parts); });
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
  /* PORTAL_TICKET_DRAWER_2026_11_02 (Austin, Nov 2, 2026): a
   * distinct 'part_order' type for SUPPLIER order documents (a
   * Sentrix order confirmation, say). "Receipt" is reserved for
   * ATRG-generated customer receipts — the supplier's paperwork is
   * not our receipt. The ticket_documents check constraint gains
   * 'part_order' through the runbook SQL in this build's
   * CHANGES.md; until that SQL runs, filing a Part order fails the
   * insert exactly like any other bad type, so run the SQL first. */
  var DOC_TYPE_LABELS = { repair_authorization: 'Repair authorization', receipt: 'Receipt', part_order: 'Part order', other: 'Other document' };
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
      if (!rows.length) { box.innerHTML = '<p class="portal-muted">No documents on this ticket yet. Sign the repair authorization or attach one below.</p>'; tkAccSetHint('documents', 'Authorization not signed'); return; }
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
      /* PORTAL_TICKET_ACCORDION_2026_11_02: an unsigned repair
       * authorization flags itself on the closed Documents header. */
      tkAccSetHint('documents', rows.some(function (d) { return d.doc_type === 'repair_authorization'; }) ? '' : 'Authorization not signed');
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
   * constraint allows only repair_authorization / receipt /
   * part_order / other — part_order joined the set with
   * PORTAL_TICKET_DRAWER_2026_11_02),
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

  /* PORTAL_ATRONE_PER_TIER_2026_11_02 (Austin, Nov 2, 2026): one
   * file spec per tier agreement — same shape as the warranty and
   * terms specs above, so each tier's signed copy composes,
   * uploads, and files as doc_type 'other' exactly like theirs. The
   * four specs are assembled with the agreement texts further down
   * (ATRONE_AGREEMENTS). */
  function atrOneFileSpec(pathPrefix, title, text) {
    return {
      pathPrefix: pathPrefix, fileNameLabel: title,
      note: title + ' \u2014 signed copy of the ' + title,
      compose: function (meta, signerName, dataUrl, signedAt) { return signedOtherDocumentHtml(title, text, meta, signerName, dataUrl, signedAt); }
    };
  }

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

  /* PORTAL_ATRONE_DOC_2026_11_02 (Austin, Nov 2, 2026): the unsigned
   * counterpart of signedOtherDocumentHtml — the same formatted page
   * (business header, the Customer/Phone/Device table, the document's
   * full text in a panel) with blank signature lines in place of a
   * captured signature, so a document filed before signing opens as
   * the same readable page the customer will sign, never raw text. */
  function unsignedAtrOneAgreementHtml(meta, bodyText, title) {
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
      '<title>' + esc(title) + ' \u2014 Austin\u2019s Tech Repair Group</title></head>' +
      '<body style="margin:0;background:#F3EDE0;color:#2C231A;font-family:Georgia,\'Times New Roman\',serif;">' +
      '<div style="max-width:760px;margin:0 auto;padding:2rem 1.25rem 3rem;background:#FFFDF8;">' +
      '<div style="text-align:center;border-bottom:3px solid #C96A1E;padding-bottom:1rem;margin-bottom:1.25rem;">' +
      '<div style="font-size:1.55rem;font-weight:bold;letter-spacing:0.02em;">Austin\u2019s Tech Repair Group</div>' +
      '<div style="margin-top:0.3rem;font-size:0.95rem;">(937) 280-6243</div></div>' +
      '<h1 style="font-size:1.3rem;margin:0 0 1rem;">' + esc(title) + '</h1>' +
      (lines ? '<table style="border-collapse:collapse;margin-bottom:1.25rem;font-size:0.98rem;"><tbody>' + lines + '</tbody></table>' : '') +
      '<div style="white-space:pre-wrap;font-size:0.92rem;line-height:1.5;border:1px solid #E6D9C0;border-radius:8px;padding:1rem;background:#FFFDF8;">' + esc(bodyText) + '</div>' +
      '<h2 style="font-size:1.1rem;margin:1.75rem 0 0.5rem;">Signature</h2>' +
      '<div style="border:1px solid #E6D9C0;border-radius:8px;padding:1rem;background:#fff;">' +
      '<div style="border-bottom:2px solid #2C231A;height:3.2rem;"></div>' +
      '<div style="font-size:0.95rem;margin-top:0.4rem;">Signed by:</div>' +
      '<div style="border-bottom:2px solid #2C231A;height:2.2rem;margin-top:1rem;"></div>' +
      '<div style="font-size:0.95rem;margin-top:0.4rem;">Date:</div>' +
      '</div>' +
      '<p style="font-size:0.8rem;color:#6B5B43;margin-top:1.5rem;">Attached to this ticket at check-in \u2014 awaiting the customer\u2019s signature.</p>' +
      '</div></body></html>';
  }

  /* PORTAL_ATRONE_PER_TIER_2026_11_02 (Austin, Nov 2, 2026): the
   * check-in auto-attach. When a check-in is created with "Wants to
   * sign up for ATR One", the agreement for the tier the customer
   * picked at check-in (ciAtroneTier, recorded when a tier card in
   * the signup box is tapped) files itself on the new ticket in its
   * pending state — an unsigned copy with signer_name and
   * signed_at empty, the same pending state the Documents upload
   * path uses for unsigned documents — so it sits on the ticket
   * ready to view and to sign on the job through that agreement's
   * own Sign flow (DOC_SIGNERS). Signing files the signed copy on
   * the same ticket beside this one. When NO tier was picked,
   * nothing is attached rather than guessing a tier, and that is
   * not an error. done(errText): errText is null on success. The
   * ticket exists either way; an attach failure never blocks it. */
  function attachAtrOneAgreementAtCheckin(client, ticketId, row, done, tierKey) {
    var agreement = tierKey ? ATRONE_AGREEMENTS[tierKey] : null;
    if (!agreement) { done(null); return; }
    var meta = { customerName: row.customer_name, phone: row.customer_phone, device: deviceLabel(row) };
    var html = unsignedAtrOneAgreementHtml(meta, agreement.text, agreement.title);
    var path = ticketId + '/' + agreement.spec.pathPrefix + '-' + docStamp() + '.html';
    client.storage.from(DOC_BUCKET).upload(path, new Blob([html], { type: 'text/html' }), { contentType: 'text/html', upsert: false }).then(function (up) {
      if (up.error) { done('The ATR One membership agreement could not be attached.'); return; }
      var docRow = {
        ticket_id: ticketId, doc_type: 'other', storage_path: path,
        file_name: agreement.title + ' \u2014 awaiting signature.html',
        signer_name: null, signed_at: null,
        note: agreement.title + ' \u2014 attached at check-in (customer wants to sign up for ATR One); awaiting signature'
      };
      client.from('ticket_documents').insert(docRow).then(function (res) {
        if (res.error) { done('The ATR One membership agreement could not be attached.'); return; }
        done(null);
      }).catch(function () { done('The ATR One membership agreement could not be attached.'); });
    }).catch(function () { done('The ATR One membership agreement could not be attached.'); });
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
  /* PORTAL_ATRONE_PER_TIER_2026_11_02 (Austin, Nov 2, 2026): ONE
   * agreement per tier — the combined all-tiers text read as chop
   * suey, so each plan now has its own agreement covering only its
   * own tier: its price, its discounts, its coverage, plus the
   * shared settled terms (points, wholesale parts, no house-call
   * fee and free diagnostics on covered devices, priority parts
   * shipping, priority queue, free remote service, the 90-day
   * accessory exchange/return, the screen-protector term, the
   * Section 4 cancel/refund rules, the Section 7 Square billing
   * signature, warranty kept separate). Every line is the combined
   * text's own wording, verbatim or tier-scoped; the business
   * agreements alone carry the EIN-at-signup line and the
   * point-of-sale setup wording (ATRG sets Square, cash drawers,
   * and systems up; ATRG is not a payment processing company). The
   * two [AUSTIN TO DECIDE] flags stay open in every text, exactly
   * as written. Discounts per tier (PORTAL_ATRONE_TIERS_2026_11_02):
   * Individual and Family 20% off repairs / 25% off accessories;
   * Business 45% / 55%; Business Pro 50% / 65%. Display names:
   * Individual (database tier single) and Family (database tier
   * family) — prices, coverage counts, Square links, and the
   * database tier values do not change. Source of truth: the four
   * atr-one-*-membership-agreement.txt files beside this build. */
  var ATRONE_INDIVIDUAL_TEXT = "ATR One Individual Membership Agreement\nAustin's Tech Repair Group — State of Ohio, USA — Last updated November 2, 2026\nPLEASE READ THIS DOCUMENT CAREFULLY. By joining ATR One, you (\"Member,\" \"you\") agree to these terms with Austin's Tech Repair Group (\"Company,\" \"we,\" \"us,\" \"our\"), a sole proprietorship operating in the State of Ohio. This agreement covers your ATR One Individual membership. Repair work itself is authorized and warranted under our Repair Authorization & Service Agreement and our 1-Year Limited Warranty, which are separate documents.\n1. Membership Plans\nFree membership: Anyone may join ATR One free. Free members earn rewards points — 1 point for every $1 spent with us — and 100 points take $5 off a future purchase or repair. Free membership does not include the paid plan benefits in Section 2.\nYour plan: ATR One Individual — $9.99 per month. Covers 1 device.\nCovered devices: Plan benefits apply only to the devices covered under your plan. Your membership, your plan, and your covered devices are recorded on your customer account with us.\n2. Member Benefits — Paid Plans\nWhile your paid membership is active, you receive the following on your covered devices:\nIndividual: 20% off repairs and 25% off accessories.\nWholesale parts pricing: Paid members pay our wholesale cost for parts on covered repairs — the cost we pay, with no markup added.\nHouse-call fee: Paid members pay no $35.00 house-call fee for covered devices.\nDiagnostics: Diagnostics on covered devices are free.\nParts shipping: Free priority shipping on parts ordered for covered devices.\nPriority queue: Member work is scheduled ahead of non-member work.\nRemote support: Free remote customer service.\nAccessory returns: Accessories you purchase from us can be exchanged or returned within 90 days of purchase.\nWallet card: After signup, you receive your ATR One member card to add to Apple Wallet or Google Wallet.\nScreen protector: When we repair a covered device, a screen protector for that device is included free and installed at that repair. The free screen protector is part of a repair we perform on a device we repaired — it is not available on its own.\n3. Billing & Renewal\nPaid plans are billed monthly through Square. Your plan renews each month and continues until you cancel it.\n[AUSTIN TO DECIDE: price changes — whether plan prices may change, and how far ahead members are told.]\n[AUSTIN TO DECIDE: past-due payments — what happens when a monthly payment fails, including any grace period and when benefits pause.]\n4. Cancellation\nYou may cancel at any time. To stop the next monthly charge, cancel at least 3 days before your next billing date. If a monthly payment has already gone through and you cancel within 3 days of that payment, that payment is refunded in full. Your benefits continue to the end of the current billing period.\n5. Warranty\nThis membership does not change our repair warranty. Every repair we perform carries our 1-Year Limited Warranty on the parts we install and the labor we perform, under that warranty's own terms. Membership neither extends nor limits the warranty, and the warranty neither extends nor limits this membership.\n6. Governing Law & Entire Agreement\nThis Agreement is governed by the laws of the State of Ohio. Disputes will first be addressed through good-faith negotiation; if unresolved, they will be submitted to a court of competent jurisdiction in Greene County, Ohio. This document is the entire agreement between you and Austin's Tech Repair Group for the ATR One membership. If any provision is found unenforceable, the rest remain in effect.\n7. Your Signature\nBy signing this agreement, you agree to be billed monthly through Square for the plan you select, and you confirm that you understand ATR One is a monthly subscription that renews each month until you cancel it.\nAustin's Tech Repair Group\nAustin Tyler Caudill, Owner\nState of Ohio, USA — (937) 280-6243";
  var ATRONE_FAMILY_TEXT = "ATR One Family Membership Agreement\nAustin's Tech Repair Group — State of Ohio, USA — Last updated November 2, 2026\nPLEASE READ THIS DOCUMENT CAREFULLY. By joining ATR One, you (\"Member,\" \"you\") agree to these terms with Austin's Tech Repair Group (\"Company,\" \"we,\" \"us,\" \"our\"), a sole proprietorship operating in the State of Ohio. This agreement covers your ATR One Family membership. Repair work itself is authorized and warranted under our Repair Authorization & Service Agreement and our 1-Year Limited Warranty, which are separate documents.\n1. Membership Plans\nFree membership: Anyone may join ATR One free. Free members earn rewards points — 1 point for every $1 spent with us — and 100 points take $5 off a future purchase or repair. Free membership does not include the paid plan benefits in Section 2.\nYour plan: ATR One Family — $19.99 per month. Covers up to 5 devices.\nCovered devices: Plan benefits apply only to the devices covered under your plan. Your membership, your plan, and your covered devices are recorded on your customer account with us.\n2. Member Benefits — Paid Plans\nWhile your paid membership is active, you receive the following on your covered devices:\nFamily: 20% off repairs and 25% off accessories.\nWholesale parts pricing: Paid members pay our wholesale cost for parts on covered repairs — the cost we pay, with no markup added.\nHouse-call fee: Paid members pay no $35.00 house-call fee for covered devices.\nDiagnostics: Diagnostics on covered devices are free.\nParts shipping: Free priority shipping on parts ordered for covered devices.\nPriority queue: Member work is scheduled ahead of non-member work.\nRemote support: Free remote customer service.\nAccessory returns: Accessories you purchase from us can be exchanged or returned within 90 days of purchase.\nWallet card: After signup, you receive your ATR One member card to add to Apple Wallet or Google Wallet.\nScreen protector: When we repair a covered device, a screen protector for that device is included free and installed at that repair. The free screen protector is part of a repair we perform on a device we repaired — it is not available on its own.\n3. Billing & Renewal\nPaid plans are billed monthly through Square. Your plan renews each month and continues until you cancel it.\n[AUSTIN TO DECIDE: price changes — whether plan prices may change, and how far ahead members are told.]\n[AUSTIN TO DECIDE: past-due payments — what happens when a monthly payment fails, including any grace period and when benefits pause.]\n4. Cancellation\nYou may cancel at any time. To stop the next monthly charge, cancel at least 3 days before your next billing date. If a monthly payment has already gone through and you cancel within 3 days of that payment, that payment is refunded in full. Your benefits continue to the end of the current billing period.\n5. Warranty\nThis membership does not change our repair warranty. Every repair we perform carries our 1-Year Limited Warranty on the parts we install and the labor we perform, under that warranty's own terms. Membership neither extends nor limits the warranty, and the warranty neither extends nor limits this membership.\n6. Governing Law & Entire Agreement\nThis Agreement is governed by the laws of the State of Ohio. Disputes will first be addressed through good-faith negotiation; if unresolved, they will be submitted to a court of competent jurisdiction in Greene County, Ohio. This document is the entire agreement between you and Austin's Tech Repair Group for the ATR One membership. If any provision is found unenforceable, the rest remain in effect.\n7. Your Signature\nBy signing this agreement, you agree to be billed monthly through Square for the plan you select, and you confirm that you understand ATR One is a monthly subscription that renews each month until you cancel it.\nAustin's Tech Repair Group\nAustin Tyler Caudill, Owner\nState of Ohio, USA — (937) 280-6243";
  var ATRONE_BUSINESS_TEXT = "ATR One Business Membership Agreement\nAustin's Tech Repair Group — State of Ohio, USA — Last updated November 2, 2026\nPLEASE READ THIS DOCUMENT CAREFULLY. By joining ATR One, you (\"Member,\" \"you\") agree to these terms with Austin's Tech Repair Group (\"Company,\" \"we,\" \"us,\" \"our\"), a sole proprietorship operating in the State of Ohio. This agreement covers your ATR One Business membership. Repair work itself is authorized and warranted under our Repair Authorization & Service Agreement and our 1-Year Limited Warranty, which are separate documents.\n1. Membership Plans\nFree membership: Anyone may join ATR One free. Free members earn rewards points — 1 point for every $1 spent with us — and 100 points take $5 off a future purchase or repair. Free membership does not include the paid plan benefits in Section 2.\nYour plan: ATR One Business — $49.99 per month. Covers business computers, printers, and cash drawers.\nBusiness membership requires the business's EIN at signup.\nBusiness setup: On a business plan, we can come out and set up your point of sale for you — we set up Square, cash drawers, and your systems. Austin's Tech Repair Group is not a payment processing company: we help you set it up, and we do not process payments.\nCovered devices: Plan benefits apply only to the devices covered under your plan. Your membership, your plan, and your covered devices are recorded on your customer account with us.\n2. Member Benefits — Paid Plans\nWhile your paid membership is active, you receive the following on your covered devices:\nBusiness: 45% off repairs and 55% off accessories.\nWholesale parts pricing: Paid members pay our wholesale cost for parts on covered repairs — the cost we pay, with no markup added.\nHouse-call fee: Paid members pay no $35.00 house-call fee for covered devices.\nDiagnostics: Diagnostics on covered devices are free.\nParts shipping: Free priority shipping on parts ordered for covered devices.\nPriority queue: Member work is scheduled ahead of non-member work.\nRemote support: Free remote customer service.\nAccessory returns: Accessories you purchase from us can be exchanged or returned within 90 days of purchase.\nWallet card: After signup, you receive your ATR One member card to add to Apple Wallet or Google Wallet.\nScreen protector: When we repair a covered device, a screen protector for that device is included free and installed at that repair. The free screen protector is part of a repair we perform on a device we repaired — it is not available on its own.\n3. Billing & Renewal\nPaid plans are billed monthly through Square. Your plan renews each month and continues until you cancel it.\n[AUSTIN TO DECIDE: price changes — whether plan prices may change, and how far ahead members are told.]\n[AUSTIN TO DECIDE: past-due payments — what happens when a monthly payment fails, including any grace period and when benefits pause.]\n4. Cancellation\nYou may cancel at any time. To stop the next monthly charge, cancel at least 3 days before your next billing date. If a monthly payment has already gone through and you cancel within 3 days of that payment, that payment is refunded in full. Your benefits continue to the end of the current billing period.\n5. Warranty\nThis membership does not change our repair warranty. Every repair we perform carries our 1-Year Limited Warranty on the parts we install and the labor we perform, under that warranty's own terms. Membership neither extends nor limits the warranty, and the warranty neither extends nor limits this membership.\n6. Governing Law & Entire Agreement\nThis Agreement is governed by the laws of the State of Ohio. Disputes will first be addressed through good-faith negotiation; if unresolved, they will be submitted to a court of competent jurisdiction in Greene County, Ohio. This document is the entire agreement between you and Austin's Tech Repair Group for the ATR One membership. If any provision is found unenforceable, the rest remain in effect.\n7. Your Signature\nBy signing this agreement, you agree to be billed monthly through Square for the plan you select, and you confirm that you understand ATR One is a monthly subscription that renews each month until you cancel it.\nAustin's Tech Repair Group\nAustin Tyler Caudill, Owner\nState of Ohio, USA — (937) 280-6243";
  var ATRONE_BUSINESS_PRO_TEXT = "ATR One Business Pro Membership Agreement\nAustin's Tech Repair Group — State of Ohio, USA — Last updated November 2, 2026\nPLEASE READ THIS DOCUMENT CAREFULLY. By joining ATR One, you (\"Member,\" \"you\") agree to these terms with Austin's Tech Repair Group (\"Company,\" \"we,\" \"us,\" \"our\"), a sole proprietorship operating in the State of Ohio. This agreement covers your ATR One Business Pro membership. Repair work itself is authorized and warranted under our Repair Authorization & Service Agreement and our 1-Year Limited Warranty, which are separate documents.\n1. Membership Plans\nFree membership: Anyone may join ATR One free. Free members earn rewards points — 1 point for every $1 spent with us — and 100 points take $5 off a future purchase or repair. Free membership does not include the paid plan benefits in Section 2.\nYour plan: ATR One Business Pro — $99.99 per month. Full IT management, including server setup.\nBusiness Pro membership requires the business's EIN at signup.\nBusiness setup: On a business plan, we can come out and set up your point of sale for you — we set up Square, cash drawers, and your systems. Austin's Tech Repair Group is not a payment processing company: we help you set it up, and we do not process payments.\nCovered devices: Plan benefits apply only to the devices covered under your plan. Your membership, your plan, and your covered devices are recorded on your customer account with us.\n2. Member Benefits — Paid Plans\nWhile your paid membership is active, you receive the following on your covered devices:\nBusiness Pro: 50% off repairs and 65% off accessories.\nWholesale parts pricing: Paid members pay our wholesale cost for parts on covered repairs — the cost we pay, with no markup added.\nHouse-call fee: Paid members pay no $35.00 house-call fee for covered devices.\nDiagnostics: Diagnostics on covered devices are free.\nParts shipping: Free priority shipping on parts ordered for covered devices.\nPriority queue: Member work is scheduled ahead of non-member work.\nRemote support: Free remote customer service.\nAccessory returns: Accessories you purchase from us can be exchanged or returned within 90 days of purchase.\nWallet card: After signup, you receive your ATR One member card to add to Apple Wallet or Google Wallet.\nScreen protector: When we repair a covered device, a screen protector for that device is included free and installed at that repair. The free screen protector is part of a repair we perform on a device we repaired — it is not available on its own.\n3. Billing & Renewal\nPaid plans are billed monthly through Square. Your plan renews each month and continues until you cancel it.\n[AUSTIN TO DECIDE: price changes — whether plan prices may change, and how far ahead members are told.]\n[AUSTIN TO DECIDE: past-due payments — what happens when a monthly payment fails, including any grace period and when benefits pause.]\n4. Cancellation\nYou may cancel at any time. To stop the next monthly charge, cancel at least 3 days before your next billing date. If a monthly payment has already gone through and you cancel within 3 days of that payment, that payment is refunded in full. Your benefits continue to the end of the current billing period.\n5. Warranty\nThis membership does not change our repair warranty. Every repair we perform carries our 1-Year Limited Warranty on the parts we install and the labor we perform, under that warranty's own terms. Membership neither extends nor limits the warranty, and the warranty neither extends nor limits this membership.\n6. Governing Law & Entire Agreement\nThis Agreement is governed by the laws of the State of Ohio. Disputes will first be addressed through good-faith negotiation; if unresolved, they will be submitted to a court of competent jurisdiction in Greene County, Ohio. This document is the entire agreement between you and Austin's Tech Repair Group for the ATR One membership. If any provision is found unenforceable, the rest remain in effect.\n7. Your Signature\nBy signing this agreement, you agree to be billed monthly through Square for the plan you select, and you confirm that you understand ATR One is a monthly subscription that renews each month until you cancel it.\nAustin's Tech Repair Group\nAustin Tyler Caudill, Owner\nState of Ohio, USA — (937) 280-6243";
  /* The four agreements, keyed by database tier value: title,
   * display short name, text, and file spec. DOC_SIGNERS, the
   * Documents library (BLANK_DOCS), and the check-in auto-attach
   * all read from this one map. */
  var ATRONE_AGREEMENTS = {
    single: { title: 'ATR One Individual Membership Agreement', shortName: 'Individual', text: ATRONE_INDIVIDUAL_TEXT, spec: atrOneFileSpec('atr_one_individual', 'ATR One Individual Membership Agreement', ATRONE_INDIVIDUAL_TEXT) },
    family: { title: 'ATR One Family Membership Agreement', shortName: 'Family', text: ATRONE_FAMILY_TEXT, spec: atrOneFileSpec('atr_one_family', 'ATR One Family Membership Agreement', ATRONE_FAMILY_TEXT) },
    business_plus: { title: 'ATR One Business Membership Agreement', shortName: 'Business', text: ATRONE_BUSINESS_TEXT, spec: atrOneFileSpec('atr_one_business', 'ATR One Business Membership Agreement', ATRONE_BUSINESS_TEXT) },
    business_pro: { title: 'ATR One Business Pro Membership Agreement', shortName: 'Business Pro', text: ATRONE_BUSINESS_PRO_TEXT, spec: atrOneFileSpec('atr_one_business_pro', 'ATR One Business Pro Membership Agreement', ATRONE_BUSINESS_PRO_TEXT) }
  };
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
  /* PORTAL_ATRONE_PER_TIER_2026_11_02: each tier's agreement signs
   * through the same generic path as the warranty and the terms —
   * the shared picker, the shared popup, fileSignedOtherDocument —
   * with its own text and file spec from ATRONE_AGREEMENTS. */
  function atrOneSigner(tierKey) {
    var agreement = ATRONE_AGREEMENTS[tierKey];
    return {
      text: agreement.text,
      pickTitle: 'Sign an ATR One ' + agreement.shortName + ' membership agreement',
      pickBlurb: 'Pick the ticket this membership belongs to. The customer signs on the next screen, and the signed membership agreement files itself on that ticket.',
      opts: {
        title: agreement.title,
        intro: 'Read the agreement, type your name, and sign in the box. Signing files this signed copy of the membership agreement on the ticket.',
        docText: agreement.text,
        saveLabel: 'Sign & save'
      },
      file: function (client, ticketId, blob, signerName, done, meta) {
        fileSignedOtherDocument(client, ticketId, blob, signerName, done, meta, agreement.spec);
      }
    };
  }
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
    atrone_single: atrOneSigner('single'),
    atrone_family: atrOneSigner('family'),
    atrone_business: atrOneSigner('business_plus'),
    atrone_business_pro: atrOneSigner('business_pro'),
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
    { title: 'Media Release', text: MEDIA_RELEASE_TEXT, mediaRelease: true, signer: DOC_SIGNERS.media },
    /* PORTAL_ATRONE_PER_TIER_2026_11_02: the four ATR One
     * membership agreements list with the blank documents so each
     * can be pulled up and read any time, and signed from Documents
     * or on a job. Each carries the mediaRelease flag for the same
     * reason the Media Release does: in this file that flag is what
     * keeps a document OUT of the check-in agreements popup
     * (showAllAgreements) — a membership is never signed at
     * check-in. Each Sign button comes from its signer config, like
     * every blank document's. */
    { title: 'ATR One Individual Membership Agreement', text: ATRONE_AGREEMENTS.single.text, mediaRelease: true, signer: DOC_SIGNERS.atrone_single },
    { title: 'ATR One Family Membership Agreement', text: ATRONE_AGREEMENTS.family.text, mediaRelease: true, signer: DOC_SIGNERS.atrone_family },
    { title: 'ATR One Business Membership Agreement', text: ATRONE_AGREEMENTS.business_plus.text, mediaRelease: true, signer: DOC_SIGNERS.atrone_business },
    { title: 'ATR One Business Pro Membership Agreement', text: ATRONE_AGREEMENTS.business_pro.text, mediaRelease: true, signer: DOC_SIGNERS.atrone_business_pro }
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

  /* RECEIPT_SIG_FIX_2026_11_03 (Austin, Nov 3, 2026): the receipt
   * printed the signed authorization's viewer URL as visible text —
   * a one-year Supabase signed URL wrapped in the view-doc.html
   * query string, spread across seven lines of gibberish on
   * Patrick's printed receipt. A customer can neither read nor type
   * that. Three fixes, all in this receipt block:
   * 1. The raw URL NEVER renders as visible text again (the
   *    composer below keeps it only inside the link's href).
   * 2. Directly under the signature, a "What you signed" summary of
   *    the Repair Authorization & Service Agreement itself
   *    (RECEIPT_SIGNED_SUMMARY — a plain condensation of
   *    AUTH_TERMS_TEXT above, section by section; no new terms).
   * 3. One short, human-typeable route to the full document:
   *    austinstechrepairgroup.com/repair-authorization + an 8-letter
   *    document code (RECEIPT_SIG_FIX: the repair-authorization.html
   *    page and the doc-code Edge Function, staged beside this
   *    build). Codes live in public.doc_short_codes (staged SQL:
   *    doc-short-codes.sql — NOT run yet). Until that table exists,
   *    ensureReceiptDocCode quietly returns '' and the receipt
   *    simply omits the code line — the composer never blocks and
   *    never prints a code that cannot resolve. */
  var RECEIPT_SIGNED_SUMMARY = [
    'You authorized us to receive, open, disassemble, diagnose, test, and repair your device, and to order and install the replacement parts you approved.',
    'The $35 house-call fee covers travel and a full diagnosis; it is non-refundable, due at scheduling, charged separately from the repair price, and never credited toward a repair. ATR One members pay no house-call fee for covered devices.',
    'We confirm your price before work begins, and if hidden damage or extra failures are found, we get your approval before any extra work. Parts are ordered for your job and paid upfront; if you cancel after parts are ordered, we keep the part and refund what you paid for it.',
    'The balance is due on completion, before your device is released. Card payments carry a processing fee at Square&rsquo;s actual rate.',
    'Back up your device before service — diagnostics and repair can cause data loss, and we are not responsible for lost data, files, photos, accounts, or settings.',
    'Your repair carries a 1-year limited warranty on the parts installed and the labor performed.',
    'If your device is left unclaimed more than 60 days after we notify you it is ready, it may be treated as abandoned under Ohio law.'
  ];
  var DOC_SHORT_PATH = 'austinstechrepairgroup.com/repair-authorization';
  var DOC_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; /* no I, L, O, 0, 1 — nothing confusable when read off paper */

  function newDocCode() {
    var out = '';
    for (var i = 0; i < 8; i++) out += DOC_CODE_ALPHABET.charAt(Math.floor(Math.random() * DOC_CODE_ALPHABET.length));
    return out;
  }
  function fmtDocCode(code) {
    var c = String(code || '').toUpperCase();
    return c.length === 8 ? c.slice(0, 4) + '-' + c.slice(4) : c;
  }

  /* RECEIPT_SIG_FIX_2026_11_03: the document's short code, created
   * lazily the first time any receipt for the ticket is composed
   * (print, filed, downloaded, and emailed receipts all pass through
   * fetchReceiptAuthorization, so the code exists before it can ever
   * be printed). Best-effort under the receipt's never-block rule:
   * ANY failure — including doc_short_codes not existing yet —
   * finishes with '' and the receipt just omits the code line. */
  function ensureReceiptDocCode(client, row, done) {
    var settled = false;
    function fin(code) {
      if (settled) return;
      settled = true;
      try { done(code || ''); } catch (e) { /* never block the receipt */ }
    }
    try {
      client.from('doc_short_codes').select('code')
        .eq('ticket_id', row.ticket_id).eq('storage_path', row.storage_path || '')
        .limit(1).then(function (res) {
          if (res.error) { fin(''); return; }
          if (res.data && res.data.length && res.data[0].code) { fin(res.data[0].code); return; }
          var code = newDocCode();
          client.from('doc_short_codes').insert({
            code: code,
            ticket_id: row.ticket_id,
            storage_path: row.storage_path || '',
            doc_type: row.doc_type || 'repair_authorization'
          }).then(function (ins) {
            /* A unique-conflict here just means a parallel compose
             * won the race; the receipt still omits the code this
             * once and picks the stored code up next time. */
            fin(ins.error ? '' : code);
          }).catch(function () { fin(''); });
        }).catch(function () { fin(''); });
    } catch (e) { fin(''); }
  }

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
              /* RECEIPT_SIG_FIX_2026_11_03: resolve (or lazily
               * create) this document's short code on every exit
               * from the .html branch, so the receipt can print the
               * typeable repair-authorization path + code. Any
               * failure finishes with no code, per the never-block
               * rule above. */
              var finishWithCode = function () {
                ensureReceiptDocCode(client, row, function (code) {
                  if (code) auth.docCode = code;
                  finish(auth);
                });
              };
              fetch(url).then(function (resp) { return resp.text(); }).then(function (text) {
                var m = String(text || '').match(/alt="Customer signature"\s+src="(data:image\/[^"]+)"/);
                if (m) auth.sigSrc = m[1];
                finishWithCode();
              }).catch(function () { finishWithCode(); });
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

  /* PORTAL_TICKET_DRAWER_2026_11_02 (Austin, Nov 2, 2026): the
   * receipt markup now comes from ONE composer,
   * composeReceiptHtml, shared by Print receipt (printReceipt,
   * below) and Generate receipt (generateReceipt, further
   * below), so the printed receipt and the receipt filed in
   * Documents can never drift apart. The composed markup is
   * byte-for-byte what printReceipt built before this split. */
  function composeReceiptHtml(t, auth) {
    var rows = t._charges || [];
    var tot = chargeTotals(rows);
    var lines = rows.map(function (c) {
      var amt = Number(c.qty || 0) * Number(c.unit_price || 0);
      var label = c.kind === 'deposit_credit' ? esc(c.description) + ' (deposit)' : esc(c.description);
      var sign = c.kind === 'deposit_credit' ? '&minus;' : '';
      /* PORTAL_CHARGE_DEDUCTOR_2026_11_02: a waived line prints its
       * name followed by "— waived", its face amount struck through,
       * and the $0 it counts. The <s> element carries the strike in
       * both the print stylesheet and the filed receipt document, so
       * no receipt CSS change is needed anywhere. */
      var face = waivedFace(c);
      if (face != null) {
        return '<tr><td>' + esc(waivedName(c)) + ' &mdash; waived</td><td class="rc-num">' + esc(c.qty) + '</td><td class="rc-num"><s>' + fmtMoney(face) + '</s> ' + fmtMoney(0) + '</td></tr>';
      }
      return '<tr><td>' + label + '</td><td class="rc-num">' + esc(c.qty) + '</td><td class="rc-num">' + sign + fmtMoney(Math.abs(amt)) + '</td></tr>';
    }).join('');
    if (!rows.length) lines = '<tr><td colspan="3">No charges recorded.</td></tr>';
    var sigHtml = '';
    if (auth && (auth.sigSrc || auth.viewerUrl)) {
      /* RECEIPT_SIG_FIX_2026_11_03: the signed viewer URL lives ONLY
       * in the link's href (screen, filed, and PDF receipts all stay
       * clickable) — it is never concatenated as visible text again.
       * In its place: one short typeable line (path + document code,
       * shown only when a code exists) and the "What you signed"
       * summary of the authorization itself, directly under the
       * signature block. */
      var signedHtml = '<div class="rc-signed"><p class="rc-signed-head">What you signed</p>' +
        '<p class="rc-signed-intro">A plain summary of the Repair Authorization &amp; Service Agreement your signature accepted.</p><ul>' +
        RECEIPT_SIGNED_SUMMARY.map(function (line) { return '<li>' + line + '</li>'; }).join('') +
        '</ul></div>';
      sigHtml = '<div class="rc-sig">' +
        (auth.sigSrc ? '<p class="rc-sig-head">Customer signature</p><img class="rc-sig-img" src="' + esc(auth.sigSrc) + '" alt="Customer signature"/>' : '') +
        (auth.signerName || auth.signedAt ? '<p class="rc-sig-cap">Signed by ' + esc(auth.signerName) + (auth.signedAt ? ' &middot; ' + esc(fmtDateTime(auth.signedAt)) : '') + '</p>' : '') +
        (auth.viewerUrl ? '<p class="rc-auth"><a href="' + esc(auth.viewerUrl) + '">View your signed Repair Authorization</a></p>' : '') +
        (auth.viewerUrl && auth.docCode ? '<p class="rc-auth-short">To open it later, go to <strong>' + esc(DOC_SHORT_PATH) + '</strong> and enter code <strong>' + esc(fmtDocCode(auth.docCode)) + '</strong></p>' : '') +
        signedHtml +
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
    return html;
  }

  function printReceipt(client, t) {
    fetchReceiptAuthorization(client, t, function (auth) {
      printArea(composeReceiptHtml(t, auth), 'receipt');
    });
  }

  /* The styles of the filed receipt document: the same .rc rules
   * the print stylesheet in portal.html carries (PORTAL_SIGNED_
   * RECEIPT_2026_10_30), inlined so the filed .html stands on its
   * own in the DOCVIEW preview, like the signed authorization. */
  var RECEIPT_DOC_CSS =
    '.rc { color: #000; font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; }' +
    '.rc h1 { font-size: 20pt; margin: 0 0 2pt; }' +
    '.rc-sub { font-size: 10pt; color: #333; margin: 0 0 10pt; }' +
    '.rc-meta { font-size: 10.5pt; margin: 0 0 10pt; line-height: 1.45; }' +
    '.rc-table { width: 100%; border-collapse: collapse; font-size: 10.5pt; margin-bottom: 10pt; }' +
    '.rc-table th, .rc-table td { border-bottom: 1px solid #bbb; padding: 4pt 2pt; text-align: left; }' +
    '.rc-num { text-align: right !important; white-space: nowrap; }' +
    '.rc-totals td { border-bottom: none; }' +
    '.rc-grand td { border-top: 2px solid #000; font-weight: 800; font-size: 12pt; }' +
    '.rc-paid { font-weight: 800; font-size: 13pt; text-align: center; border: 2px solid #000; padding: 6pt; margin: 10pt 0; }' +
    '.rc-foot { font-size: 9pt; color: #333; margin-top: 14pt; line-height: 1.5; }' +
    '.rc-sig { margin-top: 12pt; border-top: 1px solid #bbb; padding-top: 8pt; }' +
    '.rc-sig-head { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #333; margin: 0 0 4pt; }' +
    '.rc-sig-img { display: block; max-width: 280px; max-height: 90px; border-bottom: 2px solid #000; padding-bottom: 2pt; }' +
    '.rc-sig-cap { font-size: 9.5pt; color: #333; margin: 3pt 0 0; }' +
    '.rc-auth { font-size: 9.5pt; margin: 7pt 0 0; line-height: 1.45; }' +
    /* RECEIPT_SIG_FIX_2026_11_03: .rc-auth-url is GONE (it styled the
     * raw signed URL printed as text). New: the short typeable line
     * and the "What you signed" summary block. */
    '.rc-auth-short { font-size: 9.5pt; margin: 3pt 0 0; line-height: 1.45; color: #333; }' +
    '.rc-signed { margin-top: 10pt; }' +
    '.rc-signed-head { font-size: 10pt; font-weight: 700; margin: 0 0 2pt; }' +
    '.rc-signed-intro { font-size: 9pt; color: #333; margin: 0 0 4pt; line-height: 1.45; }' +
    '.rc-signed ul { margin: 0; padding-left: 12pt; font-size: 9pt; color: #333; line-height: 1.45; }' +
    '.rc-signed li { margin-bottom: 2pt; }' +
    '.rc-terms { margin-top: 12pt; border-top: 1px solid #bbb; padding-top: 8pt; }' +
    '.rc-terms-head { font-size: 10pt; font-weight: 700; margin: 0 0 4pt; }' +
    '.rc-terms ul { margin: 0; padding-left: 12pt; font-size: 9pt; color: #333; line-height: 1.45; }' +
    '.rc-terms li { margin-bottom: 2pt; }';

  function receiptDocumentHtml(t, auth) {
    return '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>Receipt \u2014 Austin\u2019s Tech Repair Group</title>' +
      '<style>body { margin: 0; background: #fff; padding: 18pt 10pt; }' + RECEIPT_DOC_CSS + '</style></head>' +
      '<body>' + composeReceiptHtml(t, auth) + '</body></html>';
  }

  /* PORTAL_TICKET_DRAWER_2026_11_02 (Austin, Nov 2, 2026): Generate
   * receipt, in the Charges section — "charges should add and
   * generate the receipt and then that will go into documents."
   * Reads the charges fresh (the same figures Print receipt and
   * the points award use), composes the receipt through the shared
   * composer (signature, terms summary and signed-authorization
   * link included whenever a signed authorization is on file, via
   * fetchReceiptAuthorization's usual never-block rules), and files
   * it on the ticket as a doc_type 'receipt' document.
   * ONE live generated receipt per ticket: it always lives at the
   * fixed storage path below and files as a single
   * ticket_documents row. Generating again after the charges change
   * overwrites the stored file and refreshes that same row (new
   * file name and date), so copies never pile up. A receipt
   * ATTACHED by hand (a Square receipt scan, say) is a different
   * file and row and is never touched. */
  function generateReceipt(client, t, onFiled) {
    var btn = $('p2-gen-receipt-btn');
    var msg = $('p2-gen-receipt-msg');
    function note(text) { if (msg) msg.textContent = text; }
    /* PORTAL_RECEIPT_DOWNLOAD_V2_2026_11_03: optional completion
     * callback for downloadReceipt v2, which may need a receipt
     * filed before it can sign a URL for it: onFiled(false) on
     * any failure, onFiled(true) once the receipt is filed.
     * fail() here is the single funnel for every failure path
     * and filed() below the single funnel for success, so the
     * callback fires exactly once. The Generate button wiring
     * passes no callback — its behavior is unchanged. */
    var filedReported = false;
    function reportFiled(ok) {
      if (filedReported) return;
      filedReported = true;
      if (onFiled) { try { onFiled(ok); } catch (e) {} }
    }
    function fail(text) { if (btn) btn.disabled = false; note(text); reportFiled(false); }
    if (btn) btn.disabled = true;
    note('Building receipt\u2026');
    client.from('ticket_charges').select('*').eq('ticket_id', t.id).order('created_at', { ascending: true }).then(function (res) {
      if (res.error) { fail('Couldn\u2019t read the charges \u2014 try again.'); return; }
      t._charges = res.data || [];
      if (!t._charges.length) { fail('Add the charges first \u2014 the receipt is built from them.'); return; }
      fetchReceiptAuthorization(client, t, function (auth) {
        var path = t.id + '/receipt-generated.html';
        var html = receiptDocumentHtml(t, auth);
        client.storage.from(DOC_BUCKET).upload(path, html, { contentType: 'text/html', upsert: true }).then(function (up) {
          if (up.error) { fail('Saving the receipt failed \u2014 try again.'); return; }
          var fileName = 'Receipt \u2014 generated ' + fmtDate(new Date().toISOString()) + '.html';
          var noteText = 'Generated from the ticket charges \u2014 generating again after a charge change replaces this copy.';
          function filed() {
            if (btn) btn.disabled = false;
            note('Receipt saved to Documents.');
            loadDocuments(client, t);
            reportFiled(true); /* PORTAL_RECEIPT_DOWNLOAD_V2_2026_11_03 */
          }
          client.from('ticket_documents').select('id').eq('ticket_id', t.id).eq('storage_path', path).limit(1).then(function (q) {
            if (!q.error && q.data && q.data.length) {
              client.from('ticket_documents').update({ file_name: fileName, note: noteText, created_at: new Date().toISOString() }).eq('id', q.data[0].id).then(function (u) {
                if (u.error) { fail('The receipt file saved but could not be listed \u2014 try again.'); return; }
                filed();
              }).catch(function () { fail('The receipt file saved but could not be listed \u2014 try again.'); });
            } else {
              client.from('ticket_documents').insert({ ticket_id: t.id, doc_type: 'receipt', storage_path: path, file_name: fileName, note: noteText }).then(function (ins) {
                if (ins.error) { fail('The receipt file saved but could not be filed \u2014 try again.'); return; }
                filed();
              }).catch(function () { fail('The receipt file saved but could not be filed \u2014 try again.'); });
            }
          }).catch(function () { fail('Saving the receipt failed \u2014 try again.'); });
        }).catch(function () { fail('Saving the receipt failed \u2014 try again.'); });
      });
    }).catch(function () { fail('Couldn\u2019t read the charges \u2014 try again.'); });
  }

  /* PORTAL_RECEIPT_SEND_2026_11_02 (Austin, Nov 2, 2026: "give the
   * portal life outside the portal"): the receipt leaves the portal.
   * Download receipt turns the ticket's receipt into a real PDF
   * file; Email receipt sends that PDF to the customer's email on
   * file — the fallback when Message customer / the Google Voice
   * text does not reach them.
   *
   * Both start from the SAME freshly-read charges and the SAME
   * composer (composeReceiptHtml / receiptDocumentHtml) as Print
   * receipt and Generate receipt, so the PDF and the emailed copy
   * can never drift from the receipt on screen. The PDF renders
   * client-side with the vendored html2pdf bundle (html2canvas +
   * jsPDF; portal.html loads html2pdf.bundle.min.js — no service,
   * no per-use cost). The email itself is sent by the send-receipt
   * Edge Function: this page hands it ONLY the ticket id, and the
   * function resolves the customer's email server-side (the
   * notify-events rule — a browser never names a recipient),
   * attaches the PDF copy uploaded below, and sends it from the
   * no-reply system mailbox with replies routed to the service@
   * general inbox. */

  /* Reads the charges fresh — the exact read generateReceipt has
   * always done — so a download or an email is never built from
   * figures the tech has already changed. fail() receives the same
   * wording generateReceipt uses. */
  function loadFreshReceiptCharges(client, t, fail, done) {
    client.from('ticket_charges').select('*').eq('ticket_id', t.id).order('created_at', { ascending: true }).then(function (res) {
      if (res.error) { fail('Couldn\u2019t read the charges \u2014 try again.'); return; }
      t._charges = res.data || [];
      if (!t._charges.length) { fail('Add the charges first \u2014 the receipt is built from them.'); return; }
      fetchReceiptAuthorization(client, t, function (auth) { done(auth); });
    }).catch(function () { fail('Couldn\u2019t read the charges \u2014 try again.'); });
  }

  /* Renders the receipt into an off-screen box styled by
   * RECEIPT_DOC_CSS — the filed document's own styles — so the PDF
   * is the filed receipt, then hands the PDF Blob to done(). An
   * http(s) signature image (the PNG-fallback filing) is first
   * swapped for a data URL: html2canvas cannot always draw a
   * cross-origin image, and the receipt must never ship with the
   * signature missing. Any failure calls fail(). */
  function buildReceiptPdfBlob(t, auth, fail, done) {
    if (!window.html2pdf) { fail('The PDF maker did not load \u2014 use Print receipt and Save as PDF instead.'); return; }
    var finish = function (authNow) {
      var style = document.createElement('style');
      style.textContent = RECEIPT_DOC_CSS;
      var box = document.createElement('div');
      box.setAttribute('style', 'position:fixed;left:-10000px;top:0;width:600px;background:#fff;padding:24px;');
      box.innerHTML = composeReceiptHtml(t, authNow);
      document.body.appendChild(style);
      document.body.appendChild(box);
      var cleanup = function () {
        if (box.parentNode) box.parentNode.removeChild(box);
        if (style.parentNode) style.parentNode.removeChild(style);
      };
      var opt = {
        margin: [30, 30, 30, 30],
        filename: 'Receipt-' + shortCode(t) + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'pt', format: 'letter', orientation: 'portrait' }
      };
      window.html2pdf().set(opt).from(box).outputPdf('blob').then(function (blob) {
        cleanup();
        done(blob, opt.filename);
      }).catch(function () {
        cleanup();
        fail('Making the PDF failed \u2014 try again, or use Print receipt.');
      });
    };
    if (auth && auth.sigSrc && /^https?:\/\//i.test(auth.sigSrc)) {
      fetch(auth.sigSrc).then(function (r) { return r.blob(); }).then(function (blob) {
        var reader = new FileReader();
        reader.onload = function () {
          finish({ signerName: auth.signerName, signedAt: auth.signedAt, sigSrc: String(reader.result || ''), viewerUrl: auth.viewerUrl });
        };
        reader.onerror = function () { finish(auth); };
        reader.readAsDataURL(blob);
      }).catch(function () { finish(auth); });
    } else {
      finish(auth);
    }
  }

  function downloadReceipt(client, t) {
    var btn = $('p2-download-receipt-btn');
    var msg = $('p2-gen-receipt-msg');
    function note(text) { if (msg) msg.textContent = text; }
    function fail(text) { if (btn) btn.disabled = false; note(text); }
    if (btn) btn.disabled = true;
    note('Building receipt\u2026');
    /* PORTAL_RECEIPT_SESSION_FIX_2026_11_03: Safari (iPhone, iPad,
     * and desktop) does not honor the download attribute on a
     * blob-anchor click: it navigates to the blob URL instead —
     * and because the click below happens deep in async callbacks,
     * the old 800 ms revokeObjectURL destroyed the blob before the
     * new tab could render the PDF, so the owner got a blank page.
     * Fix: on those browsers, open the preview window NOW, inside
     * the tap's own call stack (popup blockers allow it here; they
     * would block a window opened after the async PDF build), then
     * point it at the finished blob. The blob lives for 60 s so the
     * preview can always load. Other browsers keep the exact anchor
     * download they had. */
    var ua = '';
    try { ua = window.navigator.userAgent || ''; } catch (e) {}
    var isIOSLike = /iP(hone|ad|od)/i.test(ua) || (/Macintosh/i.test(ua) && 'ontouchend' in document);
    var isSafariUA = /safari/i.test(ua) && !/chrome|chromium|android|edg/i.test(ua);
    var previewWin = null;
    if (isIOSLike || isSafariUA) {
      try { previewWin = window.open('', '_blank'); } catch (e) { previewWin = null; }
    }
    function failAndClose(text) {
      if (previewWin && !previewWin.closed) { try { previewWin.close(); } catch (e) {} }
      fail(text);
    }
    /* PORTAL_RECEIPT_DOWNLOAD_V2_2026_11_03: the v1 block above
     * fixed WHEN the tab opens, and on the owner's iPad the tab
     * now does open — but it stays blank, because what v1 pointed
     * it at was an html2canvas raster of a div parked at
     * left:-10000px (buildReceiptPdfBlob), which can come back as
     * an empty canvas, and a blank PDF in a tab gives the share
     * sheet nothing to act on. v2 takes html2canvas out of
     * Download receipt entirely: deliver the receipt that is
     * filed on the ticket — the generated HTML of record at the
     * fixed path below, generated on the spot through
     * generateReceipt when none is filed yet — through a signed
     * URL minted exactly like viewStoredDocument mints them.
     * SIGNED_URL_SECONDS (1 hour) is the right lifetime here:
     * delivery happens seconds after minting, while the one-year
     * RECEIPT_AUTH_URL_SECONDS exists only for links printed or
     * emailed to customers. On iOS/Safari the pre-opened window
     * is pointed at the signed URL through the site's
     * view-doc.html viewer (DOC_VIEWER_URL), never at storage
     * directly: storage serves these HTML files as raw text
     * (PORTAL_DOCVIEW_2026_10_30), and the viewer renders the
     * same file formatted, like the Documents preview does. On
     * other browsers the signed URL is requested with a download
     * filename, so storage answers with an attachment
     * disposition and the anchor click below saves the file — a
     * bare download attribute alone is ignored cross-origin.
     * Any failure closes the pre-opened window and reports on
     * the status line: a blank tab is never stranded.
     * buildReceiptPdfBlob is still used by Email receipt only. */
    var path = t.id + '/receipt-generated.html';
    var fileName = 'Receipt-' + shortCode(t) + '.html';
    function deliver() {
      var wantPreview = isIOSLike || isSafariUA;
      var signOpts = wantPreview ? undefined : { download: fileName };
      client.storage.from(DOC_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS, signOpts).then(function (res) {
        if (res.error || !res.data || !res.data.signedUrl) { failAndClose('Couldn\u2019t open the receipt \u2014 try again.'); return; }
        var signedUrl = res.data.signedUrl;
        if (wantPreview) {
          var target = DOC_VIEWER_URL + encodeURIComponent(signedUrl);
          var usedPreview = false;
          if (previewWin && !previewWin.closed) {
            try { previewWin.location.href = target; usedPreview = true; } catch (e) { usedPreview = false; }
          }
          if (!usedPreview) {
            var w = null;
            try { w = window.open(target, '_blank'); } catch (e) { w = null; }
            usedPreview = !!w;
          }
          if (btn) btn.disabled = false;
          note(usedPreview ? 'Receipt opened \u2014 use Share to save or print it.' : 'Receipt is ready in Documents \u2014 use View to open it.');
          return;
        }
        var a = document.createElement('a');
        a.href = signedUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
          if (a.parentNode) a.parentNode.removeChild(a);
        }, 800);
        if (btn) btn.disabled = false;
        note('Receipt downloaded.');
      }).catch(function () { failAndClose('Couldn\u2019t open the receipt \u2014 try again.'); });
    }
    client.from('ticket_documents').select('id').eq('ticket_id', t.id).eq('storage_path', path).limit(1).then(function (q) {
      if (!q.error && q.data && q.data.length) { deliver(); return; }
      /* No generated receipt filed yet: build and file one
       * through the Generate machinery, then deliver the copy it
       * filed. If that fails, generateReceipt has already put its
       * own error on this same status line — just close the
       * pre-opened window and re-enable, without overwriting it. */
      generateReceipt(client, t, function (ok) {
        if (!ok) {
          if (previewWin && !previewWin.closed) { try { previewWin.close(); } catch (e) {} }
          if (btn) btn.disabled = false;
          return;
        }
        deliver();
      });
    }).catch(function () { failAndClose('Couldn\u2019t open the receipt \u2014 try again.'); });
  }

  /* Files the receipt PDF beside the filed receipt HTML at a fixed
   * path — the send-receipt function attaches exactly this file, so
   * what was emailed is always retrievable, and re-sending after a
   * charge change re-uploads a fresh copy first (emailReceipt
   * always rebuilds before it sends). Deliberately NO
   * ticket_documents row: the filed HTML stays the one generated
   * receipt of record in Documents; the PDF is its send rendering. */
  function uploadReceiptPdf(client, t, blob, fail, done) {
    var path = t.id + '/receipt-generated.pdf';
    client.storage.from(DOC_BUCKET).upload(path, blob, { contentType: 'application/pdf', upsert: true }).then(function (up) {
      if (up.error) { fail('Saving the receipt PDF failed \u2014 try again.'); return; }
      done();
    }).catch(function () { fail('Saving the receipt PDF failed \u2014 try again.'); });
  }

  /* The send-receipt call: the same fetch shape as device-trust and
   * track-shipment — the caller's own session JWT plus the anon
   * key, JSON in, JSON out. The body carries ONLY the ticket id. */
  function callSendReceipt(client, ticketId, done) {
    var finished = false;
    function finish(out) { if (!finished) { finished = true; done(out); } }
    try {
      client.auth.getSession().then(function (sres) {
        var token = sres && sres.data && sres.data.session ? sres.data.session.access_token : '';
        if (!token) { finish(null); return null; }
        return fetch(SUPABASE_URL + '/functions/v1/send-receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'apikey': SUPABASE_ANON_KEY },
          body: JSON.stringify({ ticket_id: ticketId })
        });
      }).then(function (r) {
        if (!r) { finish(null); return null; }
        return r.json();
      }).then(function (out) { finish(out || null); })
      .catch(function () { finish(null); });
    } catch (e) { finish(null); }
  }

  /* PORTAL_EMAIL_RECEIPT_MAILTO_2026_11_03 (Austin, Nov 3, 2026:
   * "When you push the email receipt button, just have that open
   * the native emailer app that's on the device that you're using.
   * I will already have it signed in so email receipt attaches it
   * to email. Sends it that way."): Email receipt no longer sends
   * anything itself. The old flow built a PDF, uploaded it, and
   * called the send-receipt Edge Function, which has sat inert
   * since Nov 2 waiting on Zoho SMTP secrets and a mailbox app
   * password. That invocation is gone from this button. The
   * send-receipt function, callSendReceipt, uploadReceiptPdf and
   * buildReceiptPdfBlob are all left in place, untouched — nothing
   * server-side is deleted or changed; this button simply stops
   * calling them.
   *
   * The new flow hands the receipt to the DEVICE's own mail app,
   * which is already signed in as the staffer using the portal:
   * 1. Make sure the filed receipt of record exists (the same
   *    <ticket_id>/receipt-generated.html Download receipt v2
   *    delivers; generate one through generateReceipt first when
   *    none is filed).
   * 2. Mint a signed URL with RECEIPT_AUTH_URL_SECONDS (one
   *    year) — the same lifetime the receipt's printed customer
   *    link already uses — and wrap it in the view-doc.html
   *    viewer, because storage serves these HTML files as raw
   *    text and the viewer renders the receipt as a page. (The
   *    one-hour SIGNED_URL_SECONDS stays right for Download,
   *    where delivery happens seconds after minting; an emailed
   *    link has to outlive the inbox.)
   * 3. Re-read the charges directly (the same read generateReceipt
   *    does — no authorization fetch, so the handoff stays fast)
   *    and build a short plain summary from chargeTotals.
   * 4. Tier 1: where the browser can share files
   *    (navigator.canShare with files — iOS/iPadOS Safari and
   *    Android Chrome can), fetch the filed receipt through its
   *    signed URL, wrap the bytes as a File, and call
   *    navigator.share with the file attached, so the share sheet
   *    offers the device's Mail app with the receipt REALLY
   *    attached. The shared file is the filed HTML itself, never
   *    buildReceiptPdfBlob's html2canvas PDF, which the Download
   *    receipt v2 work proved blank on iOS.
   * 5. Tier 2 (fallback, everywhere else): open a mailto: link,
   *    To prefilled from the ticket's customer_email when one is
   *    on file and shaped like an address, subject "Your receipt
   *    from Austin's Tech Repair Group", body carrying the plain
   *    summary and the view link. A mailto cannot attach a file —
   *    that is a hard limit of the protocol, not a choice — so the
   *    link in the body is how the receipt rides along here.
   * A cancelled share sheet is not an error and never falls
   * through to mailto behind the staffer's back: it just reports
   * the cancellation. No customer email on file never blocks the
   * share tier, and on the mailto tier it only leaves To empty
   * with a status line saying the address needs adding — no
   * address is ever invented. */
  function emailReceipt(client, t) {
    var btn = $('p2-email-receipt-btn');
    var msg = $('p2-gen-receipt-msg');
    function note(text) { if (msg) msg.textContent = text; }
    function fail(text) { if (btn) btn.disabled = false; note(text); }
    function done(text) { if (btn) btn.disabled = false; note(text); }
    if (btn) btn.disabled = true;
    note('Preparing receipt\u2026');
    var path = t.id + '/receipt-generated.html';
    var fileName = 'Receipt-' + shortCode(t) + '.html';
    var subject = 'Your receipt from Austin\u2019s Tech Repair Group';

    /* PORTAL_EMAIL_RECEIPT_MAILTO_2026_11_03: step 2 — sign the
     * filed receipt for a year and wrap it in the viewer. */
    function signAndSummarize() {
      client.storage.from(DOC_BUCKET).createSignedUrl(path, RECEIPT_AUTH_URL_SECONDS).then(function (res) {
        if (res.error || !res.data || !res.data.signedUrl) { fail('Couldn\u2019t prepare the receipt \u2014 try again.'); return; }
        var signedUrl = res.data.signedUrl;
        var viewLink = DOC_VIEWER_URL + encodeURIComponent(signedUrl);
        client.from('ticket_charges').select('*').eq('ticket_id', t.id).order('created_at', { ascending: true }).then(function (cres) {
          if (cres.error) { fail('Couldn\u2019t read the charges \u2014 try again.'); return; }
          t._charges = cres.data || [];
          if (!t._charges.length) { fail('Add the charges first \u2014 the receipt is built from them.'); return; }
          handOff(signedUrl, viewLink);
        }).catch(function () { fail('Couldn\u2019t read the charges \u2014 try again.'); });
      }).catch(function () { fail('Couldn\u2019t prepare the receipt \u2014 try again.'); });
    }

    /* PORTAL_EMAIL_RECEIPT_MAILTO_2026_11_03: the plain summary
     * both tiers carry — the same chargeTotals figures the receipt
     * composer itself prints. */
    function summaryText(viewLink) {
      var tot = chargeTotals(t._charges || []);
      var lines = [
        'Your receipt from Austin\u2019s Tech Repair Group',
        '',
        'Ticket #' + shortCode(t),
        'Device: ' + deviceLabel(t),
        'Subtotal: ' + fmtMoney(tot.subtotal)
      ];
      if (tot.deposits) lines.push('Deposits received: -' + fmtMoney(tot.deposits));
      if (tot.balance <= 0 && tot.subtotal > 0) lines.push('Paid in full \u2014 thank you!');
      else lines.push('Balance due: ' + fmtMoney(tot.balance));
      lines.push('');
      lines.push('View or print your receipt:');
      lines.push(viewLink);
      lines.push('');
      lines.push('Thank you for your business!');
      lines.push('Austin\u2019s Tech Repair Group \u00b7 (937) 280-6243');
      return lines.join('\n');
    }

    function handOff(signedUrl, viewLink) {
      var body = summaryText(viewLink);
      /* PORTAL_EMAIL_RECEIPT_MAILTO_2026_11_03: tier 2 — the
       * mailto fallback. Opens through a programmatic anchor click
       * (the same delivery shape Download receipt uses); mailto
       * navigations are not popup-blocked the way window.open is,
       * and this runs right after the fast reads above. */
      function openMailto() {
        var to = trim(t.customer_email || '');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) to = '';
        var href = 'mailto:' + to +
          '?subject=' + encodeURIComponent(subject) +
          '&body=' + encodeURIComponent(body);
        var a = document.createElement('a');
        a.href = href;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { if (a.parentNode) a.parentNode.removeChild(a); }, 800);
        done(to
          ? 'Mail opened with your receipt \u2014 review it and send from your mail app.'
          : 'Mail opened \u2014 add the customer\u2019s email address in the To line (none on file for this ticket).');
      }
      /* PORTAL_EMAIL_RECEIPT_MAILTO_2026_11_03: tier 1 — share
       * the filed receipt as a real file where the browser
       * supports it, so the device's Mail app gets it attached. */
      var shareApis = false;
      try { shareApis = !!(navigator.share && navigator.canShare && typeof File !== 'undefined'); } catch (e) { shareApis = false; }
      if (!shareApis) { openMailto(); return; }
      fetch(signedUrl).then(function (r) { return r.blob(); }).then(function (blob) {
        var file = null;
        try { file = new File([blob], fileName, { type: 'text/html' }); } catch (e) { file = null; }
        var canFiles = false;
        if (file) { try { canFiles = !!navigator.canShare({ files: [file] }); } catch (e) { canFiles = false; } }
        if (!canFiles) { openMailto(); return; }
        var shareText = 'Your receipt from Austin\u2019s Tech Repair Group \u2014 Ticket #' + shortCode(t) + '. View it here: ' + viewLink;
        var p = null;
        try { p = navigator.share({ files: [file], title: subject, text: shareText }); } catch (e) { p = null; }
        if (p && p.then) {
          p.then(function () {
            done('Share sheet closed \u2014 if you picked Mail, send it from your mail app.');
          }, function (err) {
            if (err && err.name === 'AbortError') { done('Sharing cancelled \u2014 tap Email receipt to try again.'); return; }
            openMailto();
          });
        } else {
          done('Share sheet opened \u2014 pick Mail to send the receipt.');
        }
      }).catch(function () { openMailto(); });
    }

    /* Step 1: the filed receipt of record, generated on the spot
     * through the Generate machinery when none is filed yet — the
     * same pattern downloadReceipt v2 uses. If generation fails,
     * generateReceipt has already put its own error on this status
     * line; just re-enable without overwriting it. */
    client.from('ticket_documents').select('id').eq('ticket_id', t.id).eq('storage_path', path).limit(1).then(function (q) {
      if (!q.error && q.data && q.data.length) { signAndSummarize(); return; }
      generateReceipt(client, t, function (ok) {
        if (!ok) { if (btn) btn.disabled = false; return; }
        signAndSummarize();
      });
    }).catch(function () { fail('Couldn\u2019t prepare the receipt \u2014 try again.'); });
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

    /* PORTAL_TICKET_DRAWER_2026_11_02: Generate receipt lives in
     * the Charges section; it files the receipt into Documents
     * (see generateReceipt). Print receipt above is unchanged. */
    var genReceiptBtn = $('p2-gen-receipt-btn');
    if (genReceiptBtn) genReceiptBtn.addEventListener('click', function () { generateReceipt(client, t); });

    /* PORTAL_RECEIPT_SEND_2026_11_02: Download receipt (PDF) and
     * Email receipt, wired beside Generate receipt. */
    var dlReceiptBtn = $('p2-download-receipt-btn');
    if (dlReceiptBtn) dlReceiptBtn.addEventListener('click', function () { downloadReceipt(client, t); });
    var emailReceiptBtn = $('p2-email-receipt-btn');
    if (emailReceiptBtn) emailReceiptBtn.addEventListener('click', function () { emailReceipt(client, t); });

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
    /* PORTAL_TIP_2026_11_02: one sync for the kind select. Tip
     * auto-fills the description "Tip" (still editable, same pattern
     * as dispatch and deposit below) and takes Our cost out of play —
     * a tip has no cost, so the field is cleared, disabled, and
     * hidden; any other kind restores it. The submit handler calls
     * this again after its form reset so the cost field comes back
     * with the select. */
    function syncChargeKind() {
      if (!kindSel) return;
      var costEl = $('p2-charge-cost');
      var isTip = kindSel.value === 'tip';
      if (costEl) {
        costEl.disabled = isTip;
        costEl.style.display = isTip ? 'none' : '';
        if (isTip) costEl.value = '';
      }
      if (kindSel.value === 'dispatch') {
        if (!$('p2-charge-desc').value) $('p2-charge-desc').value = 'House-call fee (non-refundable)';
        if (!$('p2-charge-price').value) $('p2-charge-price').value = '35';
      }
      if (kindSel.value === 'deposit_credit' && !$('p2-charge-desc').value) {
        $('p2-charge-desc').value = 'Parts deposit received';
      }
      if (isTip && !$('p2-charge-desc').value) {
        $('p2-charge-desc').value = 'Tip';
      }
    }
    if (kindSel) kindSel.addEventListener('change', syncChargeKind);

    var chargeForm = $('p2-charge-form');
    if (chargeForm) chargeForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('p2-charge-error'); err.hidden = true;
      var desc = trim($('p2-charge-desc').value);
      var price = parseFloat($('p2-charge-price').value);
      var qty = parseFloat($('p2-charge-qty').value) || 1;
      /* PORTAL_CHARGE_DEDUCTOR_2026_11_02: "Waive this charge" is
       * the deductor — it saves ONE line (this kind, this name) at
       * $0 with the waived face amount in the description marker,
       * instead of a charge line plus a separate credit line. It
       * never applies to a deposit (a deposit is a payment, not a
       * fee), and it never blocks the save: with the toggle on, an
       * empty or $0 price just saves a plain $0 line. A typed $0
       * without the toggle saves exactly as it always has. */
      var waiveEl = $('p2-charge-waive');
      var waive = !!(waiveEl && waiveEl.checked) && kindSel.value !== 'deposit_credit';
      if (!desc) { err.textContent = 'Give the charge a description and a price.'; err.hidden = false; return; }
      if (isNaN(price)) {
        if (!waive) { err.textContent = 'Give the charge a description and a price.'; err.hidden = false; return; }
        price = 0;
      }
      var insertDesc = desc, insertPrice = price;
      if (waive && price > 0) {
        insertDesc = desc + ' [waived $' + (qty * price).toFixed(2) + ']';
        insertPrice = 0;
      } else if (waive) {
        insertPrice = 0;
      }
      /* PORTAL_TIP_2026_11_02: belt and braces — a tip row never
       * saves a unit_cost, even if the field somehow held a value. */
      var costRaw = kindSel.value === 'tip' ? '' : $('p2-charge-cost').value;
      client.from('ticket_charges').insert({
        ticket_id: t.id,
        kind: kindSel.value,
        description: insertDesc,
        qty: qty,
        unit_price: insertPrice,
        unit_cost: costRaw === '' ? null : parseFloat(costRaw)
      }).then(function (res) {
        if (res.error) { err.textContent = 'Couldn&rsquo;t add that charge. Try again.'; err.hidden = false; return; }
        chargeForm.reset(); $('p2-charge-qty').value = '1';
        /* PORTAL_TIP_2026_11_02: restore the Our cost field the
         * reset's return to Part leaves hidden/disabled otherwise. */
        syncChargeKind();
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
      /* PORTAL_PARTS_TO_INVENTORY_2026_11_02: .select() returns the saved
       * row so a hand-typed part can be linked to its inventory row. */
      client.from('part_orders').insert(part).select().then(function (res) {
        if (res.error) { err.textContent = 'Couldn&rsquo;t add that part. Try again.'; err.hidden = false; return; }
        if (stockItem) { adjustStock(client, stockItem.id, -qty); loadStockItems(client, t); }
        /* PORTAL_PARTS_TO_INVENTORY_2026_11_02: a part typed in by hand
         * (not picked from stock) also lands in the inventory database. */
        if (!stockItem && res.data && res.data[0]) landPartInInventory(client, res.data[0], part);
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

  /* ================= PORTAL_PARTS_TO_INVENTORY_2026_11_02 =================
   * Auto-land: a part typed onto a ticket by hand (not picked from stock)
   * also lands in the inventory database, so the parts list stays the
   * shop's catalog of everything it has ever ordered, each row ready to
   * carry a reorder link. Dedupe: supplier_sku first (case-insensitive
   * exact), else supplier + product name against the part description
   * (with no supplier given, the name match only counts rows that also
   * have no supplier). A found row gets its cost / retail refreshed only
   * from newer non-null ticket values, and the ticket part links to it.
   * Stock NEVER changes in this path — the part was ordered for that
   * ticket, not shelved. Every failure here is console-only: the part
   * itself is already saved, so staff never sees an error from this. */
  function landPartInInventory(client, savedPart, part) {
    try {
      var linkBack = function (invId) {
        if (!invId || !savedPart || !savedPart.id) return;
        client.from('part_orders').update({ inventory_id: invId }).eq('id', savedPart.id)
          .then(function () {}).catch(function () {});
      };
      var useFound = function (row) {
        var patch = {};
        if (part.our_cost != null) patch.cost = part.our_cost;
        if (part.retail_price != null) patch.retail_price = part.retail_price;
        if (!Object.keys(patch).length) { linkBack(row.id); return; }
        client.from('inventory').update(patch).eq('id', row.id)
          .then(function () { linkBack(row.id); })
          .catch(function () { linkBack(row.id); });
      };
      var createRow = function () {
        client.from('inventory').insert({
          product_name: part.description,
          supplier: part.supplier || null,
          supplier_sku: part.supplier_sku || null,
          cost: part.our_cost != null ? part.our_cost : null,
          retail_price: part.retail_price != null ? part.retail_price : null,
          stock_qty: 0,
          reorder_point: 5,
          location: ''
        }).select().then(function (res) {
          if (res.error) { if (window.console) console.warn('parts-to-inventory: inventory insert failed', res.error); return; }
          if (res.data && res.data[0]) linkBack(res.data[0].id);
        }).catch(function (e) { if (window.console) console.warn('parts-to-inventory: inventory insert failed', e); });
      };
      /* ilike with no wildcards in the value is a case-insensitive exact
       * match; the JS re-check below keeps it exact even if a typed SKU
       * or name happens to contain an ilike wildcard character. */
      var exactOnly = function (rows, key, val) {
        var want = String(val || '').toLowerCase();
        return (rows || []).filter(function (r) { return String(r[key] || '').toLowerCase() === want; });
      };
      if (part.supplier_sku) {
        client.from('inventory').select('*').ilike('supplier_sku', part.supplier_sku).then(function (res) {
          if (res.error) { if (window.console) console.warn('parts-to-inventory: SKU lookup failed', res.error); return; }
          var hits = exactOnly(res.data, 'supplier_sku', part.supplier_sku);
          if (hits.length) useFound(hits[0]); else createRow();
        }).catch(function (e) { if (window.console) console.warn('parts-to-inventory: SKU lookup failed', e); });
      } else {
        var q = client.from('inventory').select('*').ilike('product_name', part.description);
        if (part.supplier) q = q.ilike('supplier', part.supplier);
        q.then(function (res) {
          if (res.error) { if (window.console) console.warn('parts-to-inventory: name lookup failed', res.error); return; }
          var hits = exactOnly(res.data, 'product_name', part.description).filter(function (r) {
            if (part.supplier) return String(r.supplier || '').toLowerCase() === String(part.supplier).toLowerCase();
            return !trim(r.supplier || '');
          });
          if (hits.length) useFound(hits[0]); else createRow();
        }).catch(function (e) { if (window.console) console.warn('parts-to-inventory: name lookup failed', e); });
      }
    } catch (e) {
      if (window.console) console.warn('parts-to-inventory: skipped', e);
    }
  }

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
  /* PORTAL_ATRONE_TIERS_2026_11_02 + PORTAL_TIER_SET_FINISH_2026_11_02:
   * final display names and prices (Austin, Nov 2, 2026) — single
   * shows as Individual $9.99, family as Family $19.99,
   * business_plus as Business $49.99 (renamed and repriced from
   * $39.99), business_pro as Business Pro $99.99
   * (repriced from $49.99). Keys and stored tier values unchanged.
   * NOTE: Square still bills the old business prices until its
   * plans are updated — see CHANGES.md publish preconditions. */
  var ATRONE_TIERS = {
    single: { name: 'Individual', price: 9.99 },
    family: { name: 'Family', price: 19.99 },
    business_plus: { name: 'Business', price: 49.99 },
    business_pro: { name: 'Business Pro', price: 99.99 }
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

  /* ================= ATR ONE MEMBERS PANEL =================
   * PORTAL_MEMBERS_EDIT_2026_11_02 (Austin, Nov 2, 2026): the panel is now
   * EDITABLE, like the customer profiles. Each row carries a status
   * dot — GREEN when the recorded status is 'active' (good standing),
   * RED for anything else (cancelled/off) — and tapping a member opens
   * the member editor in the shared drawer (below). The OWNER turns
   * the membership off (status 'cancelled', cancelled_on = today) or
   * back on (status 'active', cancelled_on cleared) directly, and can
   * correct a wrongly recorded tier on the same save path. An
   * ASSOCIATE never writes customer_memberships: their turn off/on is
   * filed as a pending request the owner decides in Requests — see
   * the approval note at the editor block for how the existing
   * customer_edit_requests queue carries membership changes.
   * STATUS TRUTH: membership status is a MANUAL portal record. There
   * is no automatic Square payment feed; the dot reflects the recorded
   * status only and nothing here pretends a missed payment flips it.
   * TIER DISPLAY NAMES (Austin, Nov 2, 2026, final): the Members panel
   * and its editor show Individual / Family / Business / Business Pro
   * at $9.99 / $19.99 / $49.99 / $99.99 per month. That mapping lives in
   * ATRONE_DISPLAY_TIERS below and is used ONLY by this panel and its
   * editor: the shared ATRONE_TIERS map above still drives the ticket
   * drawer's signup flow and its charge lines, and its prices were
   * deliberately NOT changed here — they are what Square currently
   * bills, and repricing them is tied to updating Square first.
   * Database tier values (single/family/business_plus/business_pro)
   * never change.
   *
   * PORTAL_ATRONE_MEMBERS_2026_11_02 (Austin, Nov 2, 2026): a
   * dedicated "ATR One Members" action button under Customer (the
   * first sidebar group, renamed from Work the same day), so he can
   * just look and see who is a member — before this, memberships
   * were only visible one customer at a time (ticket drawer block,
   * Customers badge) or not at all. This panel is READ-ONLY: it
   * lists every row of the same customer_memberships table the
   * drawer writes (PORTAL_ATRONE_TICKET_2026_10_30), joined to
   * customers for the name. Adding and cancelling stay in the
   * ticket drawer, exactly as before — nothing here writes.
   * If the memberships table is not set up yet (memberships.sql
   * not run), the query errors and the panel says so plainly with
   * the same no-members wording instead of breaking — the pattern
   * the drawer block and the Customers badge already use. */
  var ATRONE_DISPLAY_TIERS = {
    single: { name: 'Individual', price: 9.99 },
    family: { name: 'Family', price: 19.99 },
    business_plus: { name: 'Business', price: 49.99 },
    business_pro: { name: 'Business Pro', price: 99.99 }
  };
  var atrMembersCache = [];   /* mapped member rows from the last panel load */

  function atroneDisplayTier(key) { return ATRONE_DISPLAY_TIERS[key] || null; }
  function atroneDisplayName(key) {
    var t = atroneDisplayTier(key);
    return t ? t.name : atroneTierName(key);
  }

  function loadAtrOneMembers(force) {
    var list = $('portal-members-list');
    if (!list) return;
    if (!force) list.innerHTML = '<p class="portal-muted">Loading members&hellip;</p>';
    withClient(function (client) {
      if (!client) { listError(list, 'members'); return; }
      client.from('customer_memberships')
        .select('id, customer_id, tier, status, started_on, cancelled_on, note')
        .order('started_on', { ascending: true }).limit(500)
        .then(function (res) {
          if (res.error) {
            list.innerHTML = '<p class="portal-muted">No ATR One members yet.</p>' +
              '<p class="portal-muted portal-small">Memberships are not set up for this portal yet.</p>';
            return;
          }
          var rows = res.data || [];
          if (!rows.length) { state.loaded.members = true; atrMembersCache = []; renderAtrOneMembers(list, []); return; }
          var ids = [];
          rows.forEach(function (r) { if (r.customer_id && ids.indexOf(r.customer_id) === -1) ids.push(r.customer_id); });
          client.from('customers').select('id, name').in('id', ids)
            .then(function (cres) {
              var names = {};
              if (!cres.error) (cres.data || []).forEach(function (c) { names[c.id] = c.name; });
              var members = rows.map(function (r) {
                return {
                  id: r.id, customerId: r.customer_id,
                  name: names[r.customer_id] || 'Customer',
                  tier: r.tier, status: r.status,
                  startedOn: r.started_on, cancelledOn: r.cancelled_on,
                  note: r.note
                };
              });
              /* Active members first, then by name — the order
               * Austin scans in. The database returns signup order;
               * the ranking is a display choice, so it lives here. */
              members.sort(function (a, b) {
                var as = a.status === 'active' ? 0 : 1, bs = b.status === 'active' ? 0 : 1;
                if (as !== bs) return as - bs;
                return String(a.name || '').localeCompare(String(b.name || ''));
              });
              state.loaded.members = true;
              atrMembersCache = members;
              renderAtrOneMembers(list, members);
            })
            .catch(function () { listError(list, 'members'); });
        })
        .catch(function () { listError(list, 'members'); });
    });
  }

  function renderAtrOneMembers(list, rows) {
    if (!rows.length) {
      emptyState(list, 'No ATR One members yet. When a customer signs up, record it on their ticket and they will show up here.');
      return;
    }
    var activeCount = 0;
    rows.forEach(function (m) { if (m.status === 'active') activeCount++; });
    var html = '<p class="portal-muted">' + activeCount + ' active member' + (activeCount === 1 ? '' : 's') + '</p>';
    html += rows.map(function (m) {
      var tier = atroneDisplayTier(m.tier);
      var tierLine = tier
        ? tier.name + ' &middot; ' + esc(fmtMoney(tier.price)) + '/mo'
        : esc(atroneDisplayName(m.tier));
      var statusLine = m.status === 'active'
        ? 'Member since ' + esc(fmtJobDate(m.startedOn) || '—')
        : 'Cancelled ' + esc(fmtJobDate(m.cancelledOn) || '') + ' &middot; member since ' + esc(fmtJobDate(m.startedOn) || '—');
      var active = m.status === 'active';
      var dot = '<span class="mem-status-dot ' + (active ? 'mem-dot-on' : 'mem-dot-off') + '" title="' +
        (active ? 'Active — good standing' : 'Not active') + '" aria-label="' + (active ? 'Active' : 'Not active') + '"></span>';
      return '<article class="portal-card mem-card" data-member-edit="' + esc(m.id) + '" title="Tap to view or edit this membership">' +
        '<div class="portal-card-top"><p class="portal-card-title">' + dot + esc(m.name || 'Customer') + '</p>' +
        (active
          ? '<span class="portal-badge portal-badge-atrone"><i class="fas fa-star"></i> ATR One &middot; ' + esc(tier ? tier.name : atroneDisplayName(m.tier)) + '</span>'
          : '<span class="portal-badge portal-st-cancelled">Cancelled</span>') + '</div>' +
        '<p class="portal-card-meta"><i class="fas fa-star"></i> ' + tierLine + '</p>' +
        '<p class="portal-card-meta">' + statusLine + '</p>' +
        (m.note ? '<p class="portal-card-meta"><i class="fas fa-note-sticky"></i> ' + esc(m.note) + '</p>' : '') +
        '<p class="portal-card-meta portal-muted">Tap to view or edit this membership</p>' +
        '</article>';
    }).join('');
    list.innerHTML = html;
  }

  /* ================= ATR ONE MEMBER EDITOR =================
   * PORTAL_MEMBERS_EDIT_2026_11_02: tapping a member card opens this editor in
   * the shared drawer (scroll lock included, same as the customer
   * profile). It shows the member, tier, recorded status, started /
   * cancelled dates, and note, with the actions for the current
   * status: Turn off (active -> cancelled, cancelled_on = today) or
   * Turn on (anything else -> active, cancelled_on cleared). The
   * OWNER saves straight to customer_memberships; tier correction is
   * owner-only and rides the same update. An ASSOCIATE's turn off/on
   * is a submission, never a write.
   *
   * APPROVAL PATH — reusing customer_edit_requests, deliberately:
   * the table stores (customer_id, submitted_by, changes jsonb,
   * status, decided_*), and a membership belongs to a customer, so a
   * membership change request fits the same row shape with the
   * changes payload discriminated by _kind:
   *   { _kind: 'membership', membership_id: <customer_memberships id>,
   *     _member_name: <snapshot for the Requests list>,
   *     status: 'cancelled'|'active', cancelled_on: <date|null>,
   *     tier: <only if a tier change were ever proposed> }
   * custChangeLines / renderCustEditPanel / decideCustEdit branch on
   * _kind (see the PORTAL_MEMBERS_EDIT_2026_11_02 notes there): approval applies
   * the payload to customer_memberships, NOT to customers. One queue,
   * one Requests landing spot, one approve/reject implementation —
   * no second approval system, and no new table or SQL. */
  var memEditCurrent = null;   /* mapped member row open in the drawer */
  var memEditNotice = '';      /* one-shot message for the editor */

  function memberById(memberId) {
    var row = null;
    atrMembersCache.forEach(function (m) { if (m.id === memberId) row = m; });
    return row;
  }

  function memPendingFor(membershipId) {
    return custEditRequests.filter(function (r) {
      return r.changes && r.changes._kind === 'membership' && r.changes.membership_id === membershipId;
    });
  }

  function openMemberEditor(memberId) {
    var m = memberById(memberId);
    if (!m) { loadAtrOneMembers(true); return; }
    memEditCurrent = m;
    drawerLoading(m.name || 'Member');
    loadCustEditRequests(function () {
      renderCustEditPanel();
      renderMemberEditor();
    });
  }

  function renderMemberEditor() {
    var body = $('portal-drawer-body');
    if (!body || !memEditCurrent) return;
    var m = memEditCurrent;
    $('portal-drawer-title').textContent = m.name || 'Member';
    var owner = isPortalOwner();
    var active = m.status === 'active';
    var tier = atroneDisplayTier(m.tier);
    var tierText = tier ? (tier.name + ' &middot; ' + fmtMoney(tier.price) + '/mo') : atroneDisplayName(m.tier);
    var dot = '<span class="mem-status-dot ' + (active ? 'mem-dot-on' : 'mem-dot-off') + '"></span>';
    var pending = memPendingFor(m.id);
    var html = '';

    html += '<div class="portal-drawer-section"><h3>Membership</h3>' + kvRows([
      ['Member', esc(m.name || 'Customer')],
      ['Tier', tierText],
      ['Status', dot + (active ? 'Active — good standing' : 'Off (' + esc(m.status || 'cancelled') + ')')],
      ['Member since', esc(fmtJobDate(m.startedOn) || '—')],
      ['Cancelled on', esc(fmtJobDate(m.cancelledOn) || '—')],
      ['Note', esc(m.note || '—')]
    ]) +
      '<p class="portal-muted portal-small">This status is the portal&rsquo;s own record. It changes only when someone changes it here.</p></div>';

    if (pending.length) {
      html += '<div class="portal-drawer-section"><h3>Changes waiting for approval</h3>' + pending.map(function (r) {
        return '<div class="cust-req-row">' + custChangeLines(r, null) +
          '<p class="portal-muted portal-small">Submitted by ' + esc(empNameCache[r.submitted_by] || 'an associate') + ' &middot; ' + esc(fmtDateTime(r.created_at)) + '</p>' +
          (owner
            ? '<p class="portal-muted portal-small">Approve or reject this in Requests — that is where membership updates are decided.</p>'
            : '<p class="portal-muted portal-small">Waiting on the owner to approve — the record above still shows the current status.</p>') +
          '</div>';
      }).join('') + '</div>';
    }

    html += '<div class="portal-drawer-section"><h3>' + (owner ? 'Edit membership' : 'Request a change') + '</h3>';
    if (owner) {
      var opts = Object.keys(ATRONE_DISPLAY_TIERS).map(function (k) {
        var tr = ATRONE_DISPLAY_TIERS[k];
        return '<option value="' + k + '"' + (k === m.tier ? ' selected' : '') + '>' + esc(tr.name) + ' — ' + fmtMoney(tr.price) + '/mo</option>';
      }).join('');
      if (!atroneDisplayTier(m.tier)) opts = '<option value="' + esc(m.tier) + '" selected>' + esc(atroneDisplayName(m.tier)) + '</option>' + opts;
      html += '<div class="portal-field"><label for="mem-edit-tier">Tier (correct it if it was recorded wrong)</label>' +
        '<select id="mem-edit-tier">' + opts + '</select></div>' +
        '<p><button class="portal-btn portal-btn-outline" type="button" data-mem-tier-save="' + esc(m.id) + '">Save tier correction</button></p>';
    } else {
      html += '<p class="portal-muted portal-small">Tier: <strong>' + esc(tierText) + '</strong> — tier corrections are owner-only.</p>';
    }
    html += '<p><button class="portal-btn ' + (active ? 'p2-btn-danger' : 'portal-btn-primary') + '" type="button" data-mem-toggle="' + esc(m.id) + '">' +
      (owner
        ? (active ? 'Turn off membership' : 'Turn on membership')
        : (active ? 'Submit turn-off for approval' : 'Submit turn-on for approval')) +
      '</button> ' +
      '<span class="portal-muted portal-small" id="mem-edit-msg">' + esc(memEditNotice) + '</span></p>' +
      '<p class="portal-muted portal-small">' + (owner
        ? (active
          ? 'Turning off records the membership as cancelled with today&rsquo;s date. The record stays on file; nothing is deleted.'
          : 'Turning on records the membership as active again and clears the cancelled date.')
        : 'Associates cannot change a membership directly. Your request goes to the owner in Requests, and the record only updates after he approves it.') + '</p>' +
      '</div>';
    memEditNotice = '';
    body.innerHTML = html;
  }

  function memApplyLocal(memberId, upd) {
    [memEditCurrent].concat(atrMembersCache).forEach(function (mm) {
      if (!mm || mm.id !== memberId) return;
      if (upd.status !== undefined) mm.status = upd.status;
      if (upd.cancelled_on !== undefined) mm.cancelledOn = upd.cancelled_on;
      if (upd.tier !== undefined) mm.tier = upd.tier;
    });
  }

  function saveMembershipTier(memberId) {
    if (!isPortalOwner()) return;
    var m = memEditCurrent;
    if (!m || m.id !== memberId) return;
    var sel = $('mem-edit-tier');
    var msg = $('mem-edit-msg');
    if (!sel) return;
    if (sel.value === m.tier) { if (msg) msg.textContent = 'That is already the recorded tier.'; return; }
    if (msg) msg.textContent = 'Saving…';
    withClient(function (client) {
      if (!client) { if (msg) msg.textContent = 'No connection.'; return; }
      client.from('customer_memberships').update({ tier: sel.value }).eq('id', m.id)
        .then(function (res) {
          if (res.error) { if (msg) msg.textContent = 'Couldn&rsquo;t save — try again.'; return; }
          memApplyLocal(m.id, { tier: sel.value });
          memEditNotice = 'Tier corrected to ' + atroneDisplayName(sel.value) + '.';
          loadAtrOneMembers(true);
          renderMemberEditor();
        })
        .catch(function () { if (msg) msg.textContent = 'Couldn&rsquo;t save — try again.'; });
    });
  }

  function saveMembershipToggle(memberId) {
    var m = memEditCurrent;
    if (!m || m.id !== memberId) return;
    var msg = $('mem-edit-msg');
    var turningOff = m.status === 'active';
    var change = turningOff
      ? { status: 'cancelled', cancelled_on: todayDateOnly() }
      : { status: 'active', cancelled_on: null };
    if (isPortalOwner()) {
      /* Owner: straight to the membership row. A tier correction
       * still sitting in the select rides along on the same save. */
      var sel = $('mem-edit-tier');
      if (sel && sel.value && sel.value !== m.tier) change.tier = sel.value;
      if (msg) msg.textContent = 'Saving…';
      withClient(function (client) {
        if (!client) { if (msg) msg.textContent = 'No connection.'; return; }
        client.from('customer_memberships').update(change).eq('id', m.id)
          .then(function (res) {
            if (res.error) { if (msg) msg.textContent = 'Couldn&rsquo;t save — try again.'; return; }
            memApplyLocal(m.id, change);
            memEditNotice = turningOff ? 'Membership turned off.' : 'Membership turned back on.';
            loadAtrOneMembers(true);
            renderMemberEditor();
          })
          .catch(function () { if (msg) msg.textContent = 'Couldn&rsquo;t save — try again.'; });
      });
      return;
    }
    /* Associate: file a membership change request in the same queue
     * as customer updates. customer_memberships is NOT touched — it
     * changes only when the owner approves in Requests. */
    if (msg) msg.textContent = 'Submitting…';
    withClient(function (client) {
      if (!client) { if (msg) msg.textContent = 'No connection.'; return; }
      var changes = {
        _kind: 'membership', membership_id: m.id, _member_name: m.name || 'Customer',
        status: change.status, cancelled_on: change.cancelled_on
      };
      client.from('customer_edit_requests').insert({
        customer_id: m.customerId, submitted_by: state.user.id,
        changes: changes, status: 'pending'
      })
        .then(function (res) {
          if (res.error) { if (msg) msg.textContent = 'Couldn&rsquo;t submit — change requests are not set up yet.'; return; }
          memEditNotice = 'Submitted for approval. The membership has not changed yet.';
          loadCustEditRequests(function () {
            renderCustEditPanel();
            renderMemberEditor();
          });
        })
        .catch(function () { if (msg) msg.textContent = 'Couldn&rsquo;t submit — try again.'; });
    });
  }
  /* end PORTAL_MEMBERS_EDIT_2026_11_02 (member editor) */

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
    /* PORTAL_FINANCIALS_2026_11_02: payroll, processing, and the
     * true bottom line (finBottomLineHtml, in the block below). */
    html += finBottomLineHtml(t);
    body.innerHTML = html;
    wireFinSettings(body);
    renderPayrollSummary(); /* PAYROLL_SPLIT_2026_11_03: the Payroll panel's totals ride the same render — same finCache, same figures */
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
      var got = { charges: null, parts: null, tickets: null, time: null, profiles: null, approvals: null }, failed = false;
      /* PORTAL_FINANCIALS_2026_11_02: the payroll sources settle
       * separately — a missing one degrades only its own section
       * of the bottom line instead of blanking the whole panel. */
      var payrollSettled = { time: false, profiles: false, approvals: false };
      function fail() {
        if (failed) return;
        failed = true;
        if (body) body.innerHTML = '<p class="portal-error">Couldn&rsquo;t load financials. Try Refresh.</p>';
      }
      function done() {
        if (failed || !got.charges || !got.parts || !got.tickets) return;
        if (!payrollSettled.time || !payrollSettled.profiles || !payrollSettled.approvals) return;
        var jobByTicket = {};
        got.tickets.forEach(function (tk) { jobByTicket[tk.id] = tk.job_date || null; });
        finCache = { charges: got.charges, parts: got.parts, jobByTicket: jobByTicket, timeEntries: got.time || [], profiles: got.profiles || [], approvals: got.approvals || [] };
        state.loaded.financials = true;
        renderFinancials();
      }
      /* PORTAL_FINANCIALS_2026_11_02: settlePayroll is called by
       * each payroll fetch below, on success or graceful fallback. */
      function settlePayroll() { if (payrollSettled.time && payrollSettled.profiles && payrollSettled.approvals) done(); }
      client.from('ticket_charges').select('ticket_id, kind, qty, unit_price, created_at, description') /* PORTAL_FINANCIALS_2026_11_02: description — the only place a payment's method is written down (finCardCollected) */
        .then(function (res) { if (res.error) { fail(); return; } got.charges = res.data || []; done(); }).catch(fail);
      client.from('part_orders').select('ticket_id, our_cost, qty, status, created_at')
        .then(function (res) { if (res.error) { fail(); return; } got.parts = res.data || []; done(); }).catch(fail);
      client.from('tickets').select('id, job_date')
        .then(function (res) { if (res.error) { fail(); return; } got.tickets = res.data || []; done(); }).catch(fail);
      /* PORTAL_FINANCIALS_2026_11_02: payroll sources. Time entries
       * are asked for with the type/miles columns first and fall
       * back to the plain columns (finTimeKnown flags which world
       * we are in); profiles fall back the same way the roster's
       * pay load does; approvals simply may not exist yet. */
      client.from('time_entries').select('employee_id, employee_name, clock_in, clock_out, entry_type, miles')
        .order('clock_in', { ascending: false }).limit(1000)
        .then(function (res) {
          if (res.error) {
            finTimeKnown = false;
            return client.from('time_entries').select('employee_id, employee_name, clock_in, clock_out')
              .order('clock_in', { ascending: false }).limit(1000)
              .then(function (res2) { got.time = res2.error ? [] : (res2.data || []); payrollSettled.time = true; settlePayroll(); })
              .catch(function () { got.time = []; payrollSettled.time = true; settlePayroll(); });
          }
          finTimeKnown = true;
          got.time = res.data || []; payrollSettled.time = true; settlePayroll();
        })
        .catch(function () { got.time = []; payrollSettled.time = true; settlePayroll(); });
      client.from('employee_profiles').select('id, name, role, pay_rate')
        .then(function (res) {
          if (res.error) {
            return client.from('employee_profiles').select('id, name, role')
              .then(function (res2) { got.profiles = res2.error ? [] : (res2.data || []); payrollSettled.profiles = true; settlePayroll(); })
              .catch(function () { got.profiles = []; payrollSettled.profiles = true; settlePayroll(); });
          }
          got.profiles = res.data || []; payrollSettled.profiles = true; settlePayroll();
        })
        .catch(function () { got.profiles = []; payrollSettled.profiles = true; settlePayroll(); });
      client.from('time_card_approvals').select('employee_id, week_start, approved_by, approved_at').limit(1000)
        .then(function (res) {
          finApprovalsKnown = !res.error;
          got.approvals = res.error ? [] : (res.data || []);
          payrollSettled.approvals = true; settlePayroll();
        })
        .catch(function () { finApprovalsKnown = false; got.approvals = []; payrollSettled.approvals = true; settlePayroll(); });
    });
  }

  /* ================= PORTAL_FINANCIALS_2026_11_02 =================
   * (Austin, Nov 2, 2026): "down the bottom where it says financials
   * we need to do like a pay payroll subtracted by process and all
   * that kind of stuff too" — the panel now carries a true bottom
   * line under the original cards/donut/months (which are untouched,
   * on their original definitions):
   *
   *   MONEY IN  = Collected (paid) — the panel's own collected
   *               figure (deposit_credit lines), labeled as such.
   *   PARTS     = NOT a bottom-line cost. FIN_GUESTPARTS_2026_11_03
   *               (Austin, Nov 3, 2026: "Guest pays for parts") —
   *               guests pay for their parts upfront, before ATRG
   *               orders, so parts money is a pass-through, never a
   *               business cost, and is NOT subtracted in the NET
   *               below. The parts-cost figure itself still shows up
   *               top with the cards/donut/months, on its original
   *               basis (part_orders.our_cost), as information only.
   *   PAYROLL   = time_entries hours x employee_profiles.pay_rate,
   *               computed with the time clock's own rules: closed
   *               entries only, duration = clock_out - clock_in,
   *               attributed to the day (and pay week) the shift
   *               STARTED. The owner is included at his own set rate
   *               exactly like any associate (his $25/hr is his own
   *               deliberate setting). Split into Approved (the
   *               associate's pay week has a time_card_approvals
   *               row — final, ready for Friday pay) and Awaiting
   *               approval (the rest). An associate with no rate set
   *               is listed with "rate not set"; their hours are
   *               shown but never priced or folded into any total.
   *   DRIVING   = (PORTAL_TIMECARDS_2026_11_02 types) a driving
   *               entry earns NO paid hours for anyone. Techs earn
   *               mileage instead: miles x the rate for the date
   *               driven — the IRS business standard mileage rate
   *               by default (2026: $0.725/mi Jan 1–Jun 30, $0.76/mi
   *               Jul 1–Dec 31), or Austin's own rate for ALL miles
   *               when he sets the override below. The owner's
   *               driving is unpaid entirely — no hourly, no
   *               mileage — and is shown labeled, never silent.
   *   PROCESSING= an owner-set fee % applied to CARD-collected
   *               revenue in the period, labeled an estimate.
   *               Processing fees are not recorded anywhere in the
   *               portal's data (verified — see REPORT.md): payments
   *               land as deposit_credit lines and the only method
   *               ever written down is the free-text description
   *               ('Paid in cash' from the cash button; Square-link
   *               payments are hand-recorded lines). Card payments
   *               are therefore identified by description keywords,
   *               and the base used is printed on the line itself.
   *   NET       = Collected − Payroll (approved + awaiting)
   *               − Processing. (Parts removed by
   *               FIN_GUESTPARTS_2026_11_03 — see PARTS above.)
   *
   * SETTINGS: the portal has no settings table or key-value store
   * anywhere (verified across portal.js and portal.html), so the
   * fee % and the mileage override live in localStorage through the
   * same try/catch pattern as the device-trust token and the
   * remembered tab — per-device, blank/0 until Austin sets them.
   * Everything below recalculates with the panel's existing period
   * buttons because renderFinancials rebuilds from finCache. */
  var FIN_FEE_KEY = 'atrg_fin_processing_pct';
  var FIN_MILES_KEY = 'atrg_fin_mileage_rate';
  var finTimeKnown = false;      /* time_entries answered with entry_type + miles */
  var finApprovalsKnown = false; /* time_card_approvals answered */

  function finStoredNumber(key) {
    try {
      var v = parseFloat(window.localStorage.getItem(key));
      return isFinite(v) && v > 0 ? v : 0;
    } catch (e) { return 0; }
  }
  function finStoreNumber(key, v) {
    try {
      if (v > 0) window.localStorage.setItem(key, String(v));
      else window.localStorage.removeItem(key);
    } catch (e) {}
  }
  function finFeePct() { return finStoredNumber(FIN_FEE_KEY); }
  function finMileageOverride() {
    var v = finStoredNumber(FIN_MILES_KEY);
    return v > 0 ? v : null;
  }
  /* The mileage rate for miles driven on date d: Austin's override
   * wins for all miles when set; otherwise the IRS business standard
   * mileage rate for 2026 (verified figures — 72.5 cents through
   * Jun 30, 76 cents from Jul 1). Dates outside 2026 use the nearest
   * 2026 figure until the table is updated; only 2026 is verified. */
  function mileageRateFor(d) {
    var ov = finMileageOverride();
    if (ov != null) return { rate: ov, owner: true };
    return { rate: d.getTime() >= new Date(2026, 6, 1).getTime() ? 0.76 : 0.725, owner: false };
  }
  /* The Monday of d's pay week as 'YYYY-MM-DD' — the same Monday
   * arithmetic as weekStart(), and the key time_card_approvals
   * stores in week_start. */
  function finWeekKey(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x.getFullYear() + '-' + ('0' + (x.getMonth() + 1)).slice(-2) + '-' + ('0' + x.getDate()).slice(-2);
  }
  var FIN_CARD_RE = /card|square|visa|mastercard|amex|discover|apple ?pay|google ?pay|samsung ?pay|credit|debit/i;
  function finCardCollected(charges, jobByTicket) {
    var sum = 0;
    charges.forEach(function (c) {
      if (c.kind !== 'deposit_credit') return;
      if (!finInPeriod(finRowDate(c, jobByTicket))) return;
      if (!FIN_CARD_RE.test(String(c.description || ''))) return;
      sum += Number(c.qty || 0) * Number(c.unit_price || 0);
    });
    return sum;
  }

  function finPayroll() {
    var profById = {};
    (finCache.profiles || []).forEach(function (p) { profById[p.id] = p; });
    var appr = {};
    (finCache.approvals || []).forEach(function (a) { appr[a.employee_id + '|' + String(a.week_start).slice(0, 10)] = a; });
    var byId = {}, rows = [];
    (finCache.timeEntries || []).forEach(function (r) {
      var ci = new Date(r.clock_in), co = r.clock_out ? new Date(r.clock_out) : null;
      if (!co || isNaN(ci.getTime()) || isNaN(co.getTime())) return;
      if (!finInPeriod(ci)) return;
      var id = r.employee_id || r.employee_name || 'tech';
      var g = byId[id];
      if (!g) {
        var p = profById[id] || null;
        var rate = null;
        if (p && p.pay_rate != null && p.pay_rate !== '' && !isNaN(Number(p.pay_rate))) rate = Number(p.pay_rate);
        g = byId[id] = {
          id: id, name: (p && p.name) || r.employee_name || 'Associate',
          isOwner: !!(p && trim(p.role).toLowerCase() === 'owner'),
          rate: rate, workMs: 0, apprWorkMs: 0, drivingMs: 0,
          miles: 0, milesAmt: 0, apprMilesAmt: 0, ownerMiles: 0
        };
        rows.push(g);
      }
      var dur = co - ci; if (dur < 0) dur = 0;
      var isAppr = finApprovalsKnown && !!appr[id + '|' + finWeekKey(ci)];
      if (finTimeKnown && r.entry_type === 'driving') {
        g.drivingMs += dur;
        var mi = Number(r.miles) || 0;
        if (g.isOwner) { g.ownerMiles += mi; return; }
        var amt = mi * mileageRateFor(ci).rate;
        g.miles += mi; g.milesAmt += amt;
        if (isAppr) g.apprMilesAmt += amt;
      } else {
        g.workMs += dur;
        if (isAppr) g.apprWorkMs += dur;
      }
    });
    var approved = 0, pending = 0, unsetMs = 0;
    rows.forEach(function (g) {
      g.workGross = g.rate == null ? null : (g.workMs / 3600000) * g.rate;
      g.apprGross = g.rate == null ? null : (g.apprWorkMs / 3600000) * g.rate;
      if (g.rate == null) { unsetMs += g.workMs; }
      else { approved += g.apprGross; pending += (g.workGross - g.apprGross); }
      approved += g.apprMilesAmt;
      pending += (g.milesAmt - g.apprMilesAmt);
    });
    return { rows: rows, approved: approved, pending: pending, total: approved + pending, unsetMs: unsetMs };
  }

  function finBottomLineHtml(t) {
    var pay = finPayroll();
    var pct = finFeePct();
    var cardBase = finCardCollected(finCache.charges, finCache.jobByTicket);
    var processing = Math.round(cardBase * pct) / 100;
    var net = t.collected - pay.total - processing; /* FIN_GUESTPARTS_2026_11_03: no parts subtraction — guests pay for parts (pass-through) */
    var html = '';
    /* PAYROLL_SPLIT_2026_11_03: the per-associate payroll table,
     * its explanatory notes, and the mileage-rate setting moved out
     * of Financials into the Payroll panel (finPayrollTableHtml,
     * below). Financials keeps ONLY the payroll summary figures its
     * bottom line subtracts — approved and awaiting totals — so
     * what-we-made and payroll are no longer the same screen. */
    html += '<p>Payroll — approved (final): <strong>' + esc(fmtMoney(pay.approved)) + '</strong> &middot; Payroll — awaiting approval: <strong>' + esc(fmtMoney(pay.pending)) + '</strong></p>';
    html += '<div class="portal-panel-head portal-subhead"><h3 class="portal-h3">Processing &amp; bottom line</h3></div>';
    html += '<div class="fin-settings">' +
      '<label>Card processing fee %<input type="number" id="fin-fee-pct" min="0" step="0.01" inputmode="decimal" placeholder="0" value="' + (pct > 0 ? esc(String(pct)) : '') + '"></label>' +
      '</div>' +
      '<p class="portal-muted portal-small">Your rate, kept on this device. The processing % is an estimate, applied to the card payments collected in the period — identified from the payment notes (' + esc(fmtMoney(cardBase)) + ' of card payments in this period), because the portal records how a payment was described, not a method field. The mileage rate lives in the Payroll panel now, with the rest of payroll.</p>';
    html += '<div class="portal-table-wrap"><table class="portal-table"><tbody>' +
      '<tr><td>Collected (paid)</td><td>' + esc(fmtMoney(t.collected)) + '</td></tr>' +
      '<tr><td>Payroll — approved</td><td>&minus;' + esc(fmtMoney(pay.approved)) + '</td></tr>' +
      '<tr><td>Payroll — awaiting approval</td><td>&minus;' + esc(fmtMoney(pay.pending)) + '</td></tr>' +
      '<tr><td>Processing (est.)</td><td>&minus;' + esc(fmtMoney(processing)) + '</td></tr>' +
      '</tbody></table></div>';
    html += '<div class="fin-cards"><div class="fin-card fin-net-card"><p class="fin-card-label">Net for this period</p><p class="fin-card-value fin-net-value">' + esc(fmtMoney(net)) + '</p></div></div>';
    html += '<p class="portal-muted portal-small">Net = collected &minus; payroll &minus; processing. Parts are not subtracted — guests pay for their parts. Billed-but-unpaid work is in the cards at the top, not down here — this is the money that actually moved.</p>';
    return html;
  }

  function wireFinSettings(body) {
    var fee = body.querySelector('#fin-fee-pct');
    if (fee) fee.addEventListener('change', function () {
      var v = parseFloat(fee.value);
      finStoreNumber(FIN_FEE_KEY, isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0);
      renderFinancials();
    });
    /* PAYROLL_SPLIT_2026_11_03: the mileage-rate input is wired by
     * wirePaySettings in the Payroll panel now — it no longer
     * renders inside this panel at all. */
  }

  /* ================= PAYROLL_SPLIT_2026_11_03 =================
   * (Austin, Nov 3, 2026): "right now you've got payroll and you've
   * got what we made in the same thing. Payroll needs to be its own
   * separate financial action button." The Payroll panel (sidebar,
   * Financials group, directly under Financials) now hosts ALL the
   * payroll work:
   *   - the per-associate payroll totals table below — the exact
   *     block that used to render inside the Financials bottom
   *     line, computed by the SAME finPayroll() pass over the SAME
   *     finCache loadFinancials fetches, so the table here and the
   *     approved / awaiting summary lines left in Financials are
   *     one set of figures, never two;
   *   - the time cards (week stepper + #tc-cards, moved out of the
   *     Time Clock panel in portal.html — ids unchanged, so
   *     renderTimeCards / the weekly approval / the owner's manual
   *     entry tools work untouched from their new home);
   *   - the mileage-rate setting, which prices payroll driving.
   * The totals follow the Financials period (finPeriod — the
   * period buttons on the Financials panel), and the table says so
   * on its face. Nothing here recomputes anything: finPayroll(),
   * mileageRateFor(), and the localStorage settings keys are the
   * same helpers Financials always used. */

  function finPayrollPeriodLabel() {
    return finPeriod === 'month' ? 'This month' : finPeriod === '30d' ? 'Last 30 days' : 'All time';
  }

  function finPayrollTableHtml(pay) {
    var ovr = finMileageOverride();
    var html = '';
    html += '<p class="portal-muted portal-small">Totals for the Financials period &mdash; currently ' + esc(finPayrollPeriodLabel()) + ' (change it with the period buttons on the Financials panel). These are the same figures the Financials bottom line subtracts.</p>';
    if (!pay.rows.length) {
      html += '<p class="portal-muted">No time logged in this period, so no payroll.</p>';
    } else {
      html += '<div class="portal-table-wrap"><table class="portal-table"><thead><tr><th>Associate</th><th>Work hours</th><th>Rate</th><th>Work pay</th><th>Driving</th><th>Miles</th><th>Mileage pay</th></tr></thead><tbody>' +
        pay.rows.map(function (g) {
          return '<tr><td>' + esc(g.name) + (g.isOwner ? ' (owner)' : '') + '</td>' +
            '<td>' + esc(fmtHours(g.workMs)) + '</td>' +
            '<td>' + (g.rate == null ? 'Rate not set' : esc(fmtMoney(g.rate)) + ' / hr') + '</td>' +
            '<td>' + (g.workGross == null ? '&mdash;' : esc(fmtMoney(g.workGross))) + '</td>' +
            '<td>' + (g.drivingMs > 0 ? esc(fmtHours(g.drivingMs)) : '&mdash;') + '</td>' +
            '<td>' + (g.isOwner ? (g.ownerMiles > 0 ? g.ownerMiles.toFixed(1) + ' mi' : '&mdash;') : (g.miles > 0 ? g.miles.toFixed(1) + ' mi' : '&mdash;')) + '</td>' +
            '<td>' + (g.isOwner ? '&mdash;' : (g.milesAmt > 0 ? esc(fmtMoney(g.milesAmt)) : '&mdash;')) + '</td></tr>';
        }).join('') +
        '</tbody></table></div>';
    }
    if (pay.unsetMs > 0) {
      html += '<p class="portal-error">' + esc(fmtHours(pay.unsetMs)) + ' of work time above has no pay rate set — it is NOT counted in payroll. Set rates on the Associates cards.</p>';
    }
    var ownerDrive = null;
    pay.rows.forEach(function (g) { if (g.isOwner && (g.drivingMs > 0 || g.ownerMiles > 0)) ownerDrive = g; });
    if (ownerDrive) {
      html += '<p class="portal-muted portal-small">Owner driving (' + esc(fmtHours(ownerDrive.drivingMs)) + (ownerDrive.ownerMiles > 0 ? ', ' + ownerDrive.ownerMiles.toFixed(1) + ' mi' : '') + ') is recorded but unpaid — no hourly and no mileage, per the house rule.</p>';
    }
    html += '<p class="portal-muted portal-small">' + (ovr != null
      ? 'Mileage is paid at your rate of ' + esc(fmtMoney(ovr)) + ' / mi for all miles.'
      : 'Mileage is paid at the IRS rate for the date driven — 72.5&cent; / mi through Jun 30, 2026, 76&cent; / mi from Jul 1, 2026 — unless you set your own rate below.') + '</p>';
    if (!finTimeKnown) {
      html += '<p class="portal-muted portal-small">Driving and mileage tracking turns on once the staged time-entries update runs — until then every entry counts as work time, the only kind there was.</p>';
    }
    if (!finApprovalsKnown) {
      html += '<p class="portal-muted portal-small">Week approvals are not set up yet (they arrive with the staged approvals table) — until then all payroll counts as awaiting approval.</p>';
    } else {
      html += '<p class="portal-muted portal-small">Approved payroll is final — ready for Friday pay. The rest is waiting on the Tuesday approval, on the Time cards below.</p>';
    }
    html += '<div class="fin-settings">' +
      '<label>Mileage rate $ / mi (blank = IRS)<input type="number" id="fin-miles-rate" min="0" step="0.01" inputmode="decimal" placeholder="IRS rate" value="' + (ovr != null ? esc(String(ovr)) : '') + '"></label>' +
      '</div>' +
      '<p class="portal-muted portal-small">Your mileage rate, kept on this device. It prices the driving entries here, on the time cards, and in the Financials totals.</p>';
    return html;
  }

  function renderPayrollSummary() {
    var wrap = $('portal-payroll-summary');
    if (!wrap || !finCache) return;
    wrap.innerHTML = finPayrollTableHtml(finPayroll());
    wirePaySettings(wrap);
  }

  function wirePaySettings(scope) {
    var mi = scope.querySelector('#fin-miles-rate');
    if (mi) mi.addEventListener('change', function () {
      var v = parseFloat(mi.value);
      finStoreNumber(FIN_MILES_KEY, isFinite(v) && v > 0 ? Math.round(v * 1000) / 1000 : 0);
      renderFinancials(); /* re-renders the Payroll summary too (renderPayrollSummary runs at its tail) */
    });
  }

  /* The Payroll panel loader: two halves, both borrowed machinery.
   * The time cards load through loadTimeCards — the same loader the
   * Time Clock panel uses — because the cards live here now. The
   * totals come from the Financials fetch: loadFinancials fills
   * finCache and renderFinancials re-renders the summary at its
   * tail; when Financials already loaded this session, the summary
   * renders straight from that cache. */
  function loadPayroll(force) {
    state.loaded.payroll = true;
    withClient(function (client) {
      if (!client || !state.user) return;
      tcClientRef = client;
      loadTimeCards(client);
    });
    if (force || !state.loaded.financials) loadFinancials(force);
    else renderPayrollSummary();
  }
  /* end PORTAL_FINANCIALS_2026_11_02 */

  /* ================= ASSOCIATES ROSTER =================
   * PORTAL_SIDEBAR_ROSTER_2026_11_02 (Austin, Nov 2, 2026): the
   * Associates sidebar group listed Requests, Time Clock, Employee
   * Onboarding, Documents and Job Applications — but no list of the
   * associates themselves. This panel is that list: every row of
   * public.employee_profiles (the portal's sign-in list — the same
   * table the employee gate reads at sign-in), name + role + active
   * status at a glance, in the portal-card style of the other lists.
   *
   * ACTIVE STATUS, honestly: employee_profiles has NO active/status
   * column anywhere in this codebase (every existing select reads
   * only id, name, role, birthday, password_changed_at). A profile
   * row existing IS what lets that person sign in — the gate signs
   * anyone without a row straight back out — so every row the query
   * returns is shown Active with the members build's green dot. No
   * column is queried or invented beyond the fields the record is
   * already known to hold.
   *
   * THE CARD TAP: there is NO employee-card surface for
   * employee_profiles to reuse. The portal's only employee cards are
   * the Employee Onboarding cards, and those are new_hires records
   * (renderNewHires / openHireDocs in portal.html, keyed by
   * new_hire_id) — a different table and id space; the Team Documents
   * Attach flow (tdAttach) targets those hire cards, not sign-in
   * profiles, so opening one for an employee_profiles row would file
   * documents against the wrong record. Per the fallback for exactly
   * this case, tapping a roster row EXPANDS it in place to every
   * profile field the record holds (name, role, birthday, status) —
   * nothing invented, nothing linked across tables.
   *
   * PORTAL_ROSTER_DETAIL_2026_11_02 (Austin, Nov 2, 2026): two
   * additions on this roster.
   *
   * ROLE LABELS: roleLabel() below is a DISPLAY-ONLY map — the
   * stored role 'owner' renders as "Admin" wherever a role label is
   * drawn (the header beside his name, this roster's badge, meta
   * line and expanded Role row). The stored value is never
   * rewritten: isPortalOwner(), isManager() and every other check
   * keep comparing the raw stored role, and RLS never sees a label.
   *
   * THE OWNER'S FULL RECORD: Austin — the Associates button "tells
   * me all the associates, their pay, their time clocks, all of
   * that stuff, but that's only visible to my account because it
   * says owner." So when the signed-in profile is the owner,
   * expanding a card adds an owner-only section with the
   * associate's pay rate, a time summary, and a View time card
   * jump. PAY: employee_profiles has NO pay/comp column anywhere
   * in this codebase (searched portal.js, portal.html, every
   * staged build folder, and the deployed schema record
   * supabase-employee-hub.sql — pay_rate exists only on new_hires,
   * the onboarding record). The roster therefore asks for pay_rate
   * ONLY on the owner's load and falls back to the plain select
   * when the column is not there yet (the staged migration
   * employee-profiles-pay-rate.sql adds it; until it runs, the pay
   * section simply does not render — no error, no empty box). A
   * non-owner's browser never requests the column, and the section
   * itself renders only when isPortalOwner() — a manager or
   * associate expanding a card gets exactly the fields the previous
   * build showed, and the pay/time markup never enters their DOM.
   * TIME: read from time_entries for that associate — on the clock
   * now (and since when) or off the clock, plus closed hours in
   * the current pay week, computed exactly like the time clock's
   * own "Closed time this week" (Monday-start weekStart(), closed
   * entries only). VIEW TIME CARD records the associate's id on
   * window.portalTcFocusEmployeeId and then opens the Time Clocks
   * panel the way its own Action Button does; when the
   * per-associate time-cards panel (portal-time-cards-2026-11-02,
   * earlier in the publish chain) exposes a way to select one
   * associate's card, the port wires the jump to it — until then
   * the panel simply opens on the tapped associate's behalf.
   * PAYROLL_SPLIT_2026_11_03: the jump now lands on the Payroll
   * panel (the time cards' post-split home), and the port is wired
   * the rest of the way — renderTimeCards highlights the tapped
   * associate's card and scrolls it into view.
   *
   * ASSOCIATE_ACCOUNTS_2026_11_03 (Austin, Nov 3, 2026): this roster
   * and Account Controls merged into ONE panel — Austin: they were
   * "kinda the same thing", the same people, one as profiles and one
   * as logins. renderAssociates below now draws the MERGED person
   * cards into the Associate Accounts panel (the list element is
   * portal-acct-list, the Account Controls panel's old list): the
   * roster card is the card, and its expansion carries this profile
   * half above the login half (assocLoginSection, in the Account
   * Controls section) rendered from the staff-admin cache. Profiles
   * still load through loadAssociates; the merged panel's loader,
   * loadAssociateAccounts, runs it together with loadAccountControls,
   * and every re-render goes through renderAssociates. */
  /* ================= AVATARS_2026_11_03 =================
   * Austin, Nov 3, 2026: Pepper asked for a profile picture through
   * Requests; Austin approved building it — and the picture also
   * faces the customer ("the customers can see what you look like —
   * who's arriving today... the customer can see who is coming to
   * their house"). employee_profiles.avatar_url holds the public
   * URL of the person's square portrait in the staff-avatars
   * storage bucket (avatars.sql in this build folder: public read;
   * each person writes ONLY the file named for their own auth
   * uid). Until someone uploads, every surface falls back to an
   * initials disc in brand colors — nobody is ever a broken image.
   * The surfaces: Team Chat (the "My picture" upload row, message
   * rows, find-someone, the group picker), the merged Associate
   * Accounts cards, the ticket drawer's Assigned to picker, and —
   * through the ticket_technician RPC in avatars.sql — the
   * customer's own repair view on the website. */
  var AVATAR_BUCKET = 'staff-avatars';

  function avatarInitials(name) {
    var parts = trim(name || '').split(/\s+/).filter(function (w) { return !!w; });
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  /* One person's portrait: their picture when a URL is set, an
   * initials disc otherwise. size is 'sm' | 'md' | 'lg'. */
  function avatarHtml(name, url, size) {
    var cls = 'avatar avatar-' + (size || 'md');
    if (url) return '<img class="' + cls + ' avatar-img" src="' + esc(url) + '" alt="" loading="lazy" />';
    return '<span class="' + cls + ' avatar-disc" aria-hidden="true">' + esc(avatarInitials(name)) + '</span>';
  }

  function teamChatDirPerson(id) {
    for (var i = 0; i < teamChatDirectory.length; i++) {
      if (teamChatDirectory[i].id === id) return teamChatDirectory[i];
    }
    return null;
  }

  /* The ticket drawer's Assigned to options: the staff directory
   * (team_directory view; the plain profiles select as fallback,
   * the fetchTeamDirectory shape). Selects t.assigned_to, and keeps
   * a saved assignee selectable even if the directory lost them. */
  function loadTicketAssignees(client, t) {
    var sel = $('portal-ticket-assignee');
    if (!sel) return;
    var fill = function (rows) {
      var cur = t.assigned_to || '';
      var seen = {};
      var html = '<option value="">Unassigned</option>';
      (rows || []).forEach(function (p) {
        seen[p.id] = true;
        html += '<option value="' + esc(p.id) + '"' + (p.id === cur ? ' selected' : '') + '>' + esc(p.name || 'Associate') + '</option>';
      });
      if (cur && !seen[cur]) html += '<option value="' + esc(cur) + '" selected>Assigned (not in directory)</option>';
      sel.innerHTML = html;
    };
    client.from('team_directory').select('id, name').order('name', { ascending: true }).limit(200)
      .then(function (res) { if (res.error) throw res.error; fill(res.data || []); })
      .catch(function () {
        client.from('employee_profiles').select('id, name').order('name', { ascending: true }).limit(200)
          .then(function (res) { fill(res.data || []); })
          .catch(function () { fill([]); });
      });
  }

  function roleLabel(role) {
    var r = trim(role);
    if (!r) return '';
    return r.toLowerCase() === 'owner' ? 'Admin' : r;
  }

  var associatesCache = [];
  var assocListLoaded = false;  /* ASSOCIATE_ACCOUNTS_2026_11_03: the profile half has landed */
  var assocExpandedId = null;
  var assocPayKnown = false;   /* the owner's load got pay_rate back (column exists) */
  var assocTimeCache = {};     /* employee id -> { loading:true } | { open:Date|null, weekMs:Number } */

  /* ASSOCIATE_ACCOUNTS_2026_11_03: one joined list of people for
   * the merged panel — profile rows (associatesCache) joined with
   * login rows (acctStaffCache) by id. Profiles set the order (the
   * roster query sorts by name); a login row with no profile row is
   * appended so nobody silently vanishes, and a profile with no
   * login row keeps its card with the login half noted as missing. */
  function mergedPeople() {
    var byId = {};
    acctStaffCache.forEach(function (s) { byId[s.id] = s; });
    var seen = {};
    var people = associatesCache.map(function (a) {
      seen[a.id] = true;
      return { profile: a, login: byId[a.id] || null };
    });
    acctStaffCache.forEach(function (s) {
      if (!seen[s.id]) people.push({ profile: null, login: s });
    });
    return people;
  }

  function renderAssociates() {
    var list = $('portal-acct-list');
    if (!list) return;
    if (!isPortalOwner()) { list.innerHTML = ''; return; }
    var people = mergedPeople();
    if (!people.length) {
      if (assocListLoaded && acctListLoaded) emptyState(list, 'No associate accounts yet. Add the first staff login with the form below.');
      return;
    }
    list.innerHTML = people.map(function (p) {
      var a = p.profile, s = p.login;
      var id = a ? a.id : s.id;
      var isSelf = !!(state.user && id === state.user.id);
      var banned = !!(s && s.banned);
      var role = (a && a.role) || (s && s.role) || '';
      var open = assocExpandedId === id;
      var detail = '';
      if (open) {
        detail = '<div class="assoc-detail">';
        /* The profile half — the roster's expansion fields, unchanged. */
        if (a) {
          detail += kvRows([
            ['Name', valOrDash(a.name)],
            ['Role', valOrDash(roleLabel(a.role))],
            ['Status', banned
              ? '<span class="mem-status-dot mem-dot-off"></span>Deactivated &mdash; their login is turned off (see Portal login below)'
              : '<span class="mem-status-dot mem-dot-on"></span>Active &mdash; sign-in profile on file'],
            ['Birthday', a.birthday ? esc(fmtJobDate(a.birthday) || fmtDate(a.birthday)) : '&mdash;'],
            /* AVATARS_2026_11_03: the portrait as the team and the
             * customers see it; the Remove control itself lives in
             * the owner section below (assocOwnerSection). */
            ['Profile picture', assocAvatarById[a.id] ? avatarHtml(a.name, assocAvatarById[a.id], 'lg') : '<span class="portal-muted">No picture yet &mdash; they add their own in Team Chat.</span>']
          ]);
          /* PORTAL_ROSTER_DETAIL_2026_11_02: the owner-only full record
           * (pay + home address + time + time-card jump) exists in the
           * markup ONLY for the owner — see the section comment above. */
          if (isPortalOwner()) detail += assocOwnerSection(a);
          detail +=
          '<p class="portal-muted portal-small">This is their portal sign-in profile. Onboarding paperwork (I-9, W-4, signed agreements) lives on their card in Employee Onboarding, under Documents.</p>';
        } else {
          detail += '<p class="portal-muted portal-small">No sign-in profile is on file for this login yet &mdash; the profile half of this card fills in once their employee profile exists.</p>';
        }
        /* The login half — Account Controls, inside the same card. */
        detail += assocLoginSection(p);
        detail += '</div>';
      }
      return '<article class="portal-card assoc-card' + (banned ? ' acct-card-off' : '') + '" data-assoc-toggle="' + esc(id) + '" style="cursor:pointer" title="Tap to ' + (open ? 'close' : 'view') + ' this associate&rsquo;s account">' +
        '<div class="portal-card-top"><p class="portal-card-title"><span class="assoc-card-id">' + avatarHtml((a && a.name) || (s && s.name) || 'Associate', a ? (assocAvatarById[a.id] || '') : '', 'md') + '<span><span class="mem-status-dot ' + (banned ? 'mem-dot-off' : 'mem-dot-on') + '" title="' + (banned ? 'Deactivated' : 'Active') + '" aria-label="' + (banned ? 'Deactivated' : 'Active') + '"></span>' + esc((a && a.name) || (s && s.name) || 'Associate') + (isSelf ? ' <span class="portal-muted portal-small">(you)</span>' : '') + '</span></span></p>' +
        '<span class="portal-card-topright">' +
        (role ? '<span class="portal-badge portal-badge-role">' + esc(roleLabel(role)) + '</span>' : '') +
        (banned
          ? '<span class="portal-badge portal-st-cancelled">Deactivated</span>'
          : '<span class="portal-badge portal-st-ready">Active</span>') + '</span></div>' +
        (s
          ? '<p class="portal-card-meta"><i class="fas fa-envelope"></i> ' + esc(s.email || 'No login email') + '</p>'
          : '<p class="portal-card-meta"><i class="fas fa-envelope"></i> ' + (acctListLoaded ? 'No login on file' : 'Loading login&hellip;') + '</p>') +
        '<p class="portal-card-meta portal-muted">' + (open ? 'Tap to close' : 'Tap to view') + '</p>' +
        detail +
        '</article>';
    }).join('');
    /* PORTAL_ROSTER_DETAIL_2026_11_02: an open owner card whose time
     * summary has not been fetched yet (first expansion, or a refresh
     * while a card is open) fetches it once; loadAssocTime re-renders
     * when the rows land. */
    if (assocExpandedId && isPortalOwner() && !assocTimeCache[assocExpandedId]) loadAssocTime(assocExpandedId);
  }

  function loadAssociates(force) {
    var list = $('portal-acct-list'); /* ASSOCIATE_ACCOUNTS_2026_11_03: the merged panel's one list */
    if (!list) return;
    if (!force) list.innerHTML = '<p class="portal-muted">Loading associates&hellip;</p>';
    withClient(function (client) {
      if (!client) { listError(list, 'associates'); return; }
      var finish = function (rows) {
        state.loaded.associateaccounts = true; /* ASSOCIATE_ACCOUNTS_2026_11_03 */
        assocListLoaded = true;
        associatesCache = rows;
        assocTimeCache = {};
        renderAssociates();
      };
      /* Only fields the record is known to hold (see the gate's own
       * selects at sign-in, and the team-birthdays select). Ordered
       * by name so the owner reads first only if the alphabet puts
       * him there — no special-casing. */
      var plain = function () {
        client.from('employee_profiles').select('id, name, role, birthday').order('name', { ascending: true }).limit(200)
          .then(function (res) {
            if (res.error) { listError(list, 'associates'); return; }
            assocPayKnown = false;
            finish(res.data || []);
          })
          .catch(function () { listError(list, 'associates'); });
      };
      if (!isPortalOwner()) { plain(); return; }
      loadAssocHome(client); /* PORTAL_MILEAGE_2026_11_02: independent home_address probe — never disturbs the pay fallback below */
      loadAssocAvatars(client); /* AVATARS_2026_11_03: independent avatar_url probe — same never-disturb rule */
      /* PORTAL_ROSTER_DETAIL_2026_11_02: the owner's load also asks
       * for pay_rate. If the column is not live yet the select
       * errors and the roster quietly loads without it — the same
       * fallback shape verifyEmployee uses for password_changed_at —
       * and the pay section then hides (assocPayKnown stays false). */
      client.from('employee_profiles').select('id, name, role, birthday, pay_rate').order('name', { ascending: true }).limit(200)
        .then(function (res) {
          if (res.error) { plain(); return; }
          assocPayKnown = true;
          finish(res.data || []);
        })
        .catch(function () { plain(); });
    });
  }

  function toggleAssociateCard(id) {
    assocExpandedId = assocExpandedId === id ? null : id;
    renderAssociates();
  }

  /* ASSOCIATE_ACCOUNTS_2026_11_03: the merged panel's loader — it
   * runs the loads both parent panels did (the roster's profile load
   * and Account Controls' staff-admin list, which also pulls the
   * Account activity trail) behind the panel's one Refresh. Both
   * sub-loaders render into the same list through renderAssociates
   * as their halves land. */
  function loadAssociateAccounts(force) {
    var list = $('portal-acct-list');
    if (!list) return;
    if (!isPortalOwner()) { list.innerHTML = ''; return; }
    state.loaded.associateaccounts = true;
    if (!force) list.innerHTML = '<p class="portal-muted">Loading associate accounts&hellip;</p>';
    loadAssociates(true);
    loadAccountControls(true);
  }

  /* ================= ACCOUNT_CONTROLS_2026_11_03: Account Controls =================
   * Austin, Nov 3, 2026: "I need a button to be able to change and
   * edit people logins — I need access to the backend on a front end
   * button. I can change login, deactivate, activate accounts and
   * all that."
   *
   * The panel (portal-panel-associateaccounts since the
   * ASSOCIATE_ACCOUNTS_2026_11_03 merge) sits in the ADMIN
   * sidebar group and lists every staff login: name, role, login
   * email, an Active / Deactivated chip, and Edit login / Set
   * password / Deactivate-or-Activate per row, plus an Add staff
   * login form. Nothing here touches auth directly: changing another
   * person's login needs the Auth Admin API and its service-role
   * key, which must never ship in client code. Every action is a
   * POST to the staff-admin Edge Function with the caller's own
   * session JWT (the callSendReceipt fetch shape); the function
   * re-checks the caller's employee_profiles role server-side and
   * refuses anyone who is not the owner. This render is ALSO guarded
   * by isPortalOwner(), so an associate session never even builds
   * the rows.
   *
   * Edit login and Set password open a small inline form inside the
   * row (no window.prompt anywhere). Every credential or destructive
   * action uses the portal's confirm-arm pattern (the inventory
   * delete shape): first tap arms the button ("Tap again to…"),
   * second tap runs it. The function's own error text is shown
   * as-is in the panel — nothing is dressed up as success.
   *
   * ACCOUNT_AUDIT_2026_11_03 (Austin, Nov 3, 2026): below the staff
   * list, an "Account activity" card signs every account change
   * like ticket work — who did it, what they did, to whom, when.
   * The function writes the rows (staff_admin_audit); this panel
   * only READS them, straight through the portal's own Supabase
   * client — the table's RLS lets owners read and nobody else, so
   * no function action exists for reads. loadAccountControls loads
   * the trail right after the staff list, and acctRun's reload
   * after any change brings the new row straight into view.
   *
   * ASSOCIATE_ACCOUNTS_2026_11_03 (Austin, Nov 3, 2026): this panel
   * merged with the Associates roster (see the roster section) into
   * Associate Accounts. loadAccountControls still runs the
   * staff-admin list (and the audit read below); the rows it used to
   * draw itself are now the login half of the merged person cards,
   * rendered by assocLoginSection inside renderAssociates. The old
   * standalone renderer is gone; the helpers below — callStaffAdmin,
   * the confirm-arm, the form toggles and saves, the Add staff login
   * action — are unchanged and serve the merged cards. */

  var acctStaffCache = [];
  var acctListLoaded = false;  /* ASSOCIATE_ACCOUNTS_2026_11_03: the login half has landed */
  var acctListFailed = false;  /* ASSOCIATE_ACCOUNTS_2026_11_03: the staff-admin list call failed */
  var acctExpand = null; /* { id, mode: 'email' | 'password' } | null */

  function acctNote(text) {
    var n = $('portal-acct-note');
    if (n) { n.textContent = text || ''; n.hidden = !text; }
  }

  function acctError(text) {
    var e = $('portal-acct-error');
    if (e) { e.textContent = text || ''; e.hidden = !text; }
  }

  /* The staff-admin call: the same fetch shape as callSendReceipt —
   * the caller's own session JWT plus the anon key, JSON in, JSON
   * out. done(out) gets the parsed body, or null when the call
   * itself failed (no session, network, non-JSON). */
  function callStaffAdmin(payload, done) {
    var finished = false;
    function finish(out) { if (!finished) { finished = true; done(out); } }
    withClient(function (client) {
      if (!client) { finish(null); return; }
      try {
        client.auth.getSession().then(function (sres) {
          var token = sres && sres.data && sres.data.session ? sres.data.session.access_token : '';
          if (!token) { finish(null); return null; }
          return fetch(SUPABASE_URL + '/functions/v1/staff-admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'apikey': SUPABASE_ANON_KEY },
            body: JSON.stringify(payload)
          });
        }).then(function (r) {
          if (!r) { finish(null); return null; }
          return r.json();
        }).then(function (out) { finish(out || null); })
        .catch(function () { finish(null); });
      } catch (e) { finish(null); }
    });
  }

  function loadAccountControls(force) {
    var list = $('portal-acct-list');
    if (!list) return;
    if (!isPortalOwner()) { list.innerHTML = ''; return; }
    /* ASSOCIATE_ACCOUNTS_2026_11_03: on its own (before the merge)
     * this loader painted its own "Loading staff logins" line; the
     * merged loader paints the panel's one loading line, and a
     * failed list call now marks the login half failed instead of
     * wiping the shared list — the profile cards stay up and the
     * login half says so (see assocLoginSection). */
    if (!force) list.innerHTML = '<p class="portal-muted">Loading staff logins&hellip;</p>';
    callStaffAdmin({ action: 'list' }, function (out) {
      if (!out) { acctListFailed = true; acctListLoaded = true; acctError('Could not load the staff logins — check the connection and try again.'); renderAssociates(); return; }
      if (!out.ok) { acctListFailed = true; acctListLoaded = true; acctError(out.error || 'Could not load the staff logins.'); renderAssociates(); return; }
      acctError('');
      acctListFailed = false;
      acctListLoaded = true;
      acctStaffCache = out.staff || [];
      renderAssociates();
      loadAccountAudit();
    });
  }

  /* ACCOUNT_AUDIT_2026_11_03: the activity trail. Read directly
   * from staff_admin_audit with the signed-in session — RLS on the
   * table answers owners only, and loadAccountControls has already
   * gated this whole panel on isPortalOwner(). */
  function loadAccountAudit() {
    var box = $('portal-acct-audit-list');
    if (!box) return;
    if (!isPortalOwner()) { box.innerHTML = ''; return; }
    withClient(function (client) {
      if (!client) { listError(box, 'account activity'); return; }
      client.from('staff_admin_audit')
        .select('id, actor_name, action, target_name, detail, created_at')
        .order('created_at', { ascending: false })
        .limit(20)
        .then(function (res) {
          if (res.error) { listError(box, 'account activity'); return; }
          renderAccountAudit(res.data || []);
        })
        .catch(function () { listError(box, 'account activity'); });
    });
  }

  /* One audit row in plain owner language. Every stored field goes
   * through esc() — names, emails and roles are data, never markup. */
  function acctAuditLine(r) {
    var actor = r.actor_name || 'The owner';
    var target = r.target_name || 'a staff account';
    switch (r.action) {
      case 'password_set':
        return actor + ' set a new password for ' + target;
      case 'login_email_changed':
        return actor + ' changed ' + target + '\u2019s login email' +
          (r.detail ? ' to ' + r.detail : '');
      case 'deactivated':
        return actor + ' deactivated ' + target;
      case 'activated':
        return actor + ' activated ' + target;
      case 'account_created':
        return actor + ' created the account for ' + target +
          (r.detail ? ' (' + roleLabel(r.detail) + ')' : '');
      default:
        return actor + ' updated ' + target;
    }
  }

  function renderAccountAudit(rows) {
    var box = $('portal-acct-audit-list');
    if (!box) return;
    if (!rows.length) { emptyState(box, 'No account changes recorded yet.'); return; }
    box.innerHTML = rows.map(function (r) {
      return '<p class="acct-audit-row"><span class="acct-audit-text">' + esc(acctAuditLine(r)) + '</span>' +
        '<span class="acct-audit-when portal-muted">' + esc(fmtDateTime(r.created_at)) + '</span></p>';
    }).join('');
  }

  /* ASSOCIATE_ACCOUNTS_2026_11_03: the login half of a merged
   * person card — what the Account Controls row used to draw as its
   * own card (login email, created date, Edit login / Set password /
   * Deactivate-or-Activate and the inline forms) now renders inside
   * the roster card's expansion. The markup, the data-acct-* hooks,
   * the confirm-arm flow and the self-row rules are the old row's,
   * unchanged: "(you)" rides the card title now (renderAssociates),
   * and the caller's own Deactivate stays disabled. A profile with
   * no login row — or a login whose list call failed — gets a plain
   * note instead of controls. */
  function assocLoginSection(p) {
    var out = '<div class="assoc-login-sec"><p class="assoc-login-head"><i class="fas fa-key"></i> Portal login</p>';
    var s = p.login;
    if (!s) {
      out += '<p class="portal-muted portal-small">' +
        (!acctListLoaded ? 'Loading login details&hellip;'
          : acctListFailed ? 'Login details could not be loaded — tap Refresh to try again.'
          : 'No portal login is on file for this profile — add one with the Add staff login form below.') +
        '</p>';
      return out + '</div>';
    }
    var isSelf = !!(state.user && s.id === state.user.id);
    var open = !!(acctExpand && acctExpand.id === s.id);
    var form = '';
    if (open && acctExpand.mode === 'email') {
      form = '<div class="acct-form"><div class="portal-field"><label for="acct-email-' + esc(s.id) + '">Login email</label>' +
        '<input type="email" id="acct-email-' + esc(s.id) + '" value="' + esc(s.email || '') + '" autocomplete="off" /></div>' +
        '<div class="portal-card-actions">' +
        '<button class="portal-btn portal-btn-primary portal-btn-sm" type="button" data-acct-email-save="' + esc(s.id) + '">Save login email</button>' +
        '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-acct-cancel="1">Cancel</button>' +
        '</div></div>';
    } else if (open && acctExpand.mode === 'password') {
      form = '<div class="acct-form"><div class="portal-field"><label for="acct-pass-' + esc(s.id) + '">New password</label>' +
        '<span class="pw-wrap"><input type="password" id="acct-pass-' + esc(s.id) + '" placeholder="At least 8 characters" autocomplete="new-password" />' +
        '<button class="pw-eye" type="button" data-acct-eye="acct-pass-' + esc(s.id) + '" aria-label="Show password"><i class="fas fa-eye"></i></button></span></div>' +
        '<div class="portal-card-actions">' +
        '<button class="portal-btn portal-btn-primary portal-btn-sm" type="button" data-acct-pass-save="' + esc(s.id) + '">Set password</button>' +
        '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-acct-cancel="1">Cancel</button>' +
        '</div></div>';
    }
    out += '<p class="portal-card-meta"><i class="fas fa-envelope"></i> ' + esc(s.email || 'No login email') + '</p>' +
      (s.created_at ? '<p class="portal-card-meta portal-muted">Login created ' + esc(fmtDate(s.created_at)) + '</p>' : '') +
      '<div class="portal-card-actions">' +
      '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-acct-edit="' + esc(s.id) + '"><i class="fas fa-pen"></i> Edit login</button>' +
      '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-acct-pass="' + esc(s.id) + '"><i class="fas fa-key"></i> Set password</button>' +
      (isSelf
        ? '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" disabled title="You cannot deactivate your own account">Deactivate</button>'
        : '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-acct-ban="' + esc(s.id) + '"><i class="fas fa-' + (s.banned ? 'circle-check' : 'ban') + '"></i> ' + (s.banned ? 'Activate' : 'Deactivate') + '</button>') +
      '</div>' + form;
    return out + '</div>';
  }

  /* Confirm-arm, the inventory-delete shape: the first tap arms the
   * button and relabels it; only the second tap runs the action. */
  function acctArm(btn, label) {
    if (btn.getAttribute('data-confirm') !== '1') {
      btn.setAttribute('data-confirm', '1');
      btn.textContent = label;
      return false;
    }
    return true;
  }

  function acctRun(btn, payload, successText, onOk) {
    btn.disabled = true;
    acctError('');
    callStaffAdmin(payload, function (out) {
      btn.disabled = false;
      if (!out) { acctError('That did not go through — check the connection and try again.'); return; }
      if (!out.ok) {
        btn.removeAttribute('data-confirm');
        acctError(out.error || 'That did not go through.');
        return;
      }
      acctExpand = null;
      acctNote(successText);
      if (onOk) onOk();
      /* ASSOCIATE_ACCOUNTS_2026_11_03: reload BOTH halves — a created
       * or changed login also changes the person's merged card. */
      state.loaded.associateaccounts = false;
      loadAssociateAccounts(true);
    });
  }

  function acctToggleForm(id, mode) {
    if (acctExpand && acctExpand.id === id && acctExpand.mode === mode) acctExpand = null;
    else acctExpand = { id: id, mode: mode };
    acctError('');
    renderAssociates(); /* ASSOCIATE_ACCOUNTS_2026_11_03: the merged renderer */
    if (acctExpand) {
      var input = $(mode === 'email' ? 'acct-email-' + id : 'acct-pass-' + id);
      if (input) { input.focus(); if (mode === 'email' && input.select) input.select(); }
    }
  }

  function acctToggleEye(btn) {
    var input = $(btn.getAttribute('data-acct-eye'));
    if (!input) return;
    var show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    btn.innerHTML = '<i class="fas fa-eye' + (show ? '-slash' : '') + '"></i>';
    input.focus();
  }

  function acctSaveEmail(btn, id) {
    var input = $('acct-email-' + id);
    var email = input ? trim(input.value) : '';
    if (!email) { acctError('Enter the new login email first.'); return; }
    if (!acctArm(btn, 'Tap again to save')) return;
    acctRun(btn, { action: 'update_email', user_id: id, email: email }, 'Login email updated.');
  }

  function acctSavePassword(btn, id) {
    var input = $('acct-pass-' + id);
    var pw = input ? input.value : '';
    if (!pw || pw.length < 8) { acctError('The new password must be at least 8 characters.'); return; }
    if (!acctArm(btn, 'Tap again to set it')) return;
    acctRun(btn, { action: 'set_password', user_id: id, password: pw }, 'Password updated — it works at their next sign-in.');
  }

  function acctToggleBan(btn, id) {
    var row = null;
    acctStaffCache.forEach(function (s) { if (s.id === id) row = s; });
    if (!row) return;
    var target = !row.banned;
    if (!acctArm(btn, target ? 'Confirm deactivate?' : 'Confirm activate?')) return;
    acctRun(btn, { action: 'set_ban', user_id: id, banned: target },
      target
        ? (row.name || 'That account') + ' is deactivated — they cannot sign in now.'
        : (row.name || 'That account') + ' is active again — they can sign in.');
  }

  function acctAddUser(btn) {
    var nameEl = $('portal-acct-add-name');
    var emailEl = $('portal-acct-add-email');
    var pwEl = $('portal-acct-add-password');
    var roleEl = $('portal-acct-add-role');
    var name = nameEl ? trim(nameEl.value) : '';
    var email = emailEl ? trim(emailEl.value) : '';
    var pw = pwEl ? pwEl.value : '';
    var role = roleEl ? roleEl.value : 'associate';
    if (!name) { acctError('Enter the new staff member\u2019s name first.'); return; }
    if (!email) { acctError('Enter a login email first.'); return; }
    if (!pw || pw.length < 8) { acctError('The password must be at least 8 characters.'); return; }
    if (!acctArm(btn, 'Tap again to add')) return;
    acctRun(btn, { action: 'create_user', email: email, password: pw, name: name, role: role },
      'Staff login added for ' + name + ' — they can sign in now.',
      function () {
        if (nameEl) nameEl.value = '';
        if (emailEl) emailEl.value = '';
        if (pwEl) pwEl.value = '';
        if (roleEl) roleEl.value = 'associate';
      });
  }

  /* ================= PORTAL_ROSTER_DETAIL_2026_11_02: the owner's full record =================
   * Everything below renders ONLY inside an expansion the owner
   * opened (renderAssociates gates on isPortalOwner() before any of
   * this markup exists), and the pay data behind it was only ever
   * requested on the owner's load. */

  function assocOwnerSection(a) {
    var out = '<div class="assoc-owner-sec"><p class="assoc-owner-head"><i class="fas fa-lock"></i> Owner only</p>';
    /* AVATARS_2026_11_03: owner moderation for the portrait.
     * Upload is self-service only (the storage policy lets a
     * person write just their own file); the owner's lever is
     * clearing avatar_url, which hides the picture on every
     * surface at once — see removeAssocAvatar. */
    if (assocAvatarKnown && assocAvatarById[a.id]) {
      out += '<div class="assoc-pay-row"><span class="assoc-pay-label">Profile picture<span class="assoc-pay-cur">Shown to the team and to customers</span></span>' +
        '<span class="assoc-pay-edit"><button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-assoc-avatar-remove="' + esc(a.id) + '">Remove picture</button></span></div>' +
        '<p class="portal-small assoc-pay-msg" data-assoc-avatar-msg="' + esc(a.id) + '"></p>';
    }
    if (assocPayKnown) {
      var has = a.pay_rate != null && a.pay_rate !== '' && !isNaN(Number(a.pay_rate));
      out += '<div class="assoc-pay-row"><span class="assoc-pay-label">Pay rate' +
        '<span class="assoc-pay-cur">' + (has ? esc(fmtMoney(a.pay_rate)) + ' / hr' : 'Not set') + '</span></span>' +
        '<span class="assoc-pay-edit"><input type="number" min="0" step="0.01" inputmode="decimal" placeholder="$ / hr" aria-label="Pay rate in dollars per hour" data-assoc-pay-input="' + esc(a.id) + '" value="' + (has ? esc(String(Number(a.pay_rate))) : '') + '">' +
        '<button class="portal-btn portal-btn-primary portal-btn-sm" type="button" data-assoc-pay-save="' + esc(a.id) + '">Save</button></span></div>' +
        '<p class="portal-small assoc-pay-msg" data-assoc-pay-msg="' + esc(a.id) + '"></p>';
    }
    /* PORTAL_MILEAGE_2026_11_02: the owner's home-address editor —
     * same owner-only section, independent column probe. */
    if (assocHomeKnown) {
      var homeVal = assocHomeById[a.id] || '';
      out += '<div class="assoc-pay-row"><span class="assoc-pay-label">Home address<span class="assoc-pay-cur">' + (homeVal ? esc(homeVal) : 'Not set') + '</span></span>' +
        '<span class="assoc-pay-edit"><input type="text" placeholder="Street, City, State ZIP" aria-label="Home address" data-assoc-home-input="' + esc(a.id) + '" value="' + esc(homeVal) + '">' +
        '<button class="portal-btn portal-btn-primary portal-btn-sm" type="button" data-assoc-home-save="' + esc(a.id) + '">Save</button></span></div>' +
        '<p class="portal-small assoc-pay-msg" data-assoc-home-msg="' + esc(a.id) + '"></p>';
    }
    var t = assocTimeCache[a.id];
    out += '<div class="assoc-time" data-assoc-time="' + esc(a.id) + '">' +
      (t && !t.loading ? assocTimeHtml(t) : '<p class="portal-muted portal-small">Loading time&hellip;</p>') + '</div>';
    out += '<p class="assoc-timecard-row"><button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-assoc-timecard="' + esc(a.id) + '"><i class="fas fa-clock"></i> View time card</button></p>';
    out += '</div>';
    return out;
  }

  function assocTimeHtml(t) {
    var line;
    if (t.open) {
      line = '<p class="assoc-time-line"><strong>On the clock</strong> since ' +
        esc(t.open.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })) + ' &middot; ' +
        esc(t.open.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) + '</p>';
    } else {
      line = '<p class="assoc-time-line">Off the clock</p>';
    }
    return line + '<p class="assoc-time-line">Hours this pay week: <strong>' + esc(fmtHours(t.weekMs)) + '</strong>' +
      (t.open ? ' <span class="portal-muted">(plus the shift in progress)</span>' : '') + '</p>';
  }

  /* One associate's time summary from time_entries: the open entry
   * (no clock_out), if any, and the closed hours inside the current
   * Monday-start pay week — weekStart() and the closed-only total
   * are the time clock's own math (loadTimeClock). */
  /* PAYRATE_FIX_2026_11_03: does the expanded card's owner section
   * hold typing that has not been saved yet? The pay box is compared
   * against the roster row's cached pay_rate, the home-address box
   * against assocHomeById — the same values the section renders
   * from, so a box the owner has not touched never reads dirty. */
  function assocOwnerInputsDirty(id) {
    var row = null;
    associatesCache.forEach(function (r) { if (r.id === id) row = r; });
    var payIn = document.querySelector('[data-assoc-pay-input="' + id + '"]');
    if (payIn) {
      var typed = trim(payIn.value);
      var saved = (row && row.pay_rate != null && row.pay_rate !== '' && !isNaN(Number(row.pay_rate))) ? Number(row.pay_rate) : null;
      if (typed === '') { if (saved !== null) return true; }
      else if (isNaN(Number(typed)) || Number(typed) !== saved) return true;
    }
    var homeIn = document.querySelector('[data-assoc-home-input="' + id + '"]');
    if (homeIn && trim(homeIn.value) !== trim(assocHomeById[id] || '')) return true;
    return false;
  }

  function loadAssocTime(id) {
    assocTimeCache[id] = { loading: true };
    withClient(function (client) {
      var settle = function (summary) {
        assocTimeCache[id] = summary;
        if (assocExpandedId !== id) return;
        /* PAYRATE_FIX_2026_11_03: this settle used to rebuild the
         * whole roster the moment the time summary landed, wiping
         * whatever the owner was mid-typing in the pay or
         * home-address box. With unsaved edits in either box, skip
         * this one rebuild — the summary is cached and shows on
         * the next render (the save's own re-render included). */
        if (assocOwnerInputsDirty(id)) return;
        renderAssociates();
      };
      if (!client) { settle({ open: null, weekMs: 0 }); return; }
      client.from('time_entries').select('*').eq('employee_id', id).order('clock_in', { ascending: false }).limit(100)
        .then(function (res) {
          var rows = (!res.error && res.data) || [];
          var open = null, weekMs = 0, ws = weekStart();
          rows.forEach(function (r) {
            var ci = new Date(r.clock_in), co = r.clock_out ? new Date(r.clock_out) : null;
            if (!co && !open) open = ci;
            if (co && ci >= ws) weekMs += (co - ci);
          });
          settle({ open: open, weekMs: weekMs });
        })
        .catch(function () { settle({ open: null, weekMs: 0 }); });
    });
  }

  /* Owner-only save. Writes the profile row's pay_rate (empty box
   * clears it back to Not set); any refusal — RLS included — lands
   * in the message line instead of failing silently. */
  function saveAssocPay(id) {
    var input = document.querySelector('[data-assoc-pay-input="' + id + '"]');
    var msg = document.querySelector('[data-assoc-pay-msg="' + id + '"]');
    if (!input) return;
    var raw = trim(input.value);
    var val = null;
    if (raw !== '') {
      val = Number(raw);
      if (isNaN(val) || !isFinite(val) || val < 0) {
        if (msg) msg.textContent = 'Enter a rate like 18.50, or clear the box to remove it.';
        return;
      }
      val = Math.round(val * 100) / 100;
    }
    if (msg) msg.textContent = 'Saving&hellip;';
    withClient(function (client) {
      if (!client) { if (msg) msg.textContent = 'Could not save. Try again.'; return; }
      /* PAYRATE_FIX_2026_11_03: .select() asks for the written row
       * back. Under RLS a policy-blocked update comes back as
       * success with zero rows affected — the old code read that
       * as "Saved." and patched the cache while nothing had
       * persisted, so the rate reverted to Not set on the next
       * fresh load. Zero rows back now means the save did not
       * land: say so, and leave the cache untouched. */
      client.from('employee_profiles').update({ pay_rate: val }).eq('id', id).select('id, pay_rate')
        .then(function (res) {
          if (res.error || !res.data || !res.data.length) { if (msg) msg.textContent = 'Could not save that rate.'; return; }
          var savedRate = res.data[0].pay_rate;
          associatesCache.forEach(function (r) { if (r.id === id) r.pay_rate = savedRate; });
          if (msg) msg.textContent = 'Saved.';
          setTimeout(function () { if (assocExpandedId === id) renderAssociates(); }, 900);
        })
        .catch(function () { if (msg) msg.textContent = 'Could not save. Try again.'; });
    });
  }

  /* Opens the panel that hosts the time cards, after recording
   * whose card the owner was looking at (see the section comment
   * for the port-forward wire). PAYROLL_SPLIT_2026_11_03: the time
   * cards live in the Payroll panel now, so the jump lands there —
   * and renderTimeCards now spends the focus id on a highlight +
   * scroll, completing the wire the original build left open. */
  function openAssocTimeCard(id) {
    window.portalTcFocusEmployeeId = id;
    var tab = $('portal-tab-payroll');
    if (tab) { tab.click(); return; }
    activateTab('payroll');
  }
  /* end PORTAL_SIDEBAR_ROSTER_2026_11_02 (associates roster) + PORTAL_ROSTER_DETAIL_2026_11_02 (owner's full record) */

  /* ================= TEAM CHAT =================
   * TEAMCHAT_2026_11_03 (Austin, Nov 3, 2026): "build the internal
   * team chat in associates action button." Alfred, Pepper and every
   * associate share one thread inside the portal (public.team_messages,
   * see team-chat.sql in this build folder), so staff talk never
   * rides a personal account. Wiring follows the house patterns:
   * LOADERS registration like Payroll, the repair-log insert shape
   * (client.from(...).insert carrying the signed-in profile's name),
   * esc() on every rendered field exactly like renderRepairLog,
   * emptyState()/listError() for the quiet and broken states, and a
   * start/stop poll pair shaped like the scanner timers. The poll
   * runs every 20 seconds ONLY while the panel is open: activateTab
   * stops it on any other tab, resumeTeamChat restarts it on return,
   * and the tick itself refuses to fetch for a hidden panel, so a
   * closed chat is never polled. Messages render oldest at top,
   * newest at bottom; a poll refresh keeps the reader's scroll place
   * unless they were already at the bottom. Every field is rendered
   * through esc() — a chat body can never carry HTML into the page. */
  var teamChatTimer = null;
  var teamChatClient = null;
  var teamChatWired = false;

  /* ================= TEAMCHAT_CHANNELS_2026_11_03 =================
   * Austin, Nov 3, 2026: "We need to be able to type an associate
   * name and it pulls it up and we can press chat and send messages
   * to each other" and "Make a group chat."
   *
   * The single office thread above grows channels (team-channels.sql
   * in this build folder): public.team_channels (office / dm / group)
   * + public.team_channel_members, and team_messages.channel_id says
   * which conversation a message belongs to. The panel now carries:
   *   - a channel bar: Office first, then my DM and group channels,
   *     most recent activity first — tapping one switches the view;
   *   - a find-someone search: type a name, tap Chat, and the DM
   *     channel for that pair is found or created (its dm_key is the
   *     two profile ids sorted and colon-joined, unique-indexed in
   *     the database, so a pair can only ever have one DM channel);
   *   - a New group form: a name plus a checkbox per associate.
   * Names come from public.team_directory — the id/name/role-only
   * view from the SQL — because employee_profiles itself is own-row
   * plus owner-only by policy (pay rates live there); if the view
   * is missing the code falls back to the plain profiles select,
   * which still serves the owner fully.
   * The message list, composer and 20-second poll now work per open
   * channel; the poll refreshes the channel bar too, so a brand new
   * DM or group shows up without reopening the panel. Everything
   * still renders through esc(), and history stays append-only. */
  var TEAM_OFFICE_ID = '00000000-0000-4000-8000-000000000001';
  var teamChatOpenId = TEAM_OFFICE_ID;
  var teamChatChannels = [];  /* [{id, kind, name, label, lastAt}] */
  var teamChatDirectory = []; /* [{id, name, role, avatar_url}] — everyone on staff (AVATARS_2026_11_03: avatar_url rides along) */

  function teamChatMsgHtml(m) {
    var mine = !!(state.user && m.author_id === state.user.id);
    /* AVATARS_2026_11_03: the author's portrait (or initials disc)
     * beside their words — the picture comes from the directory
     * entry for author_id; the name snapshot on the message is the
     * fallback identity when the author is not in the directory. */
    var person = teamChatDirPerson(m.author_id);
    var pic = avatarHtml(m.author_name || (person && person.name) || 'Associate', person ? person.avatar_url : '', 'sm');
    return '<div class="teamchat-msg' + (mine ? ' teamchat-msg-mine' : '') + '">' +
      '<span class="teamchat-msg-pic">' + pic + '</span>' +
      '<span class="teamchat-msg-main"><span class="teamchat-msg-meta">' + esc(m.author_name || 'Associate') + ' &middot; ' + esc(fmtDateTime(m.created_at)) + '</span>' +
      '<span class="teamchat-msg-body">' + esc(m.body || '') + '</span></span></div>';
  }

  function teamChatErr(text) {
    var err = $('portal-teamchat-error');
    if (err) { err.textContent = text || ''; err.hidden = !text; }
  }

  function teamChatDmKey(a, b) { return [a, b].sort().join(':'); }

  function teamChatDirName(id) {
    for (var i = 0; i < teamChatDirectory.length; i++) {
      if (teamChatDirectory[i].id === id) return teamChatDirectory[i].name || 'Associate';
    }
    return 'Associate';
  }

  function teamChatOpenChannel() {
    for (var i = 0; i < teamChatChannels.length; i++) {
      if (teamChatChannels[i].id === teamChatOpenId) return teamChatChannels[i];
    }
    return { id: TEAM_OFFICE_ID, kind: 'office', name: 'Office', label: 'Office', lastAt: '' };
  }

  function renderTeamChatChannels() {
    var bar = $('portal-teamchat-channels');
    if (!bar) return;
    if (!teamChatChannels.length) {
      bar.innerHTML = '<p class="portal-muted portal-small">Loading channels&hellip;</p>';
      return;
    }
    bar.innerHTML = teamChatChannels.map(function (ch) {
      var icon = ch.kind === 'office' ? 'fa-house' : (ch.kind === 'group' ? 'fa-users' : 'fa-user');
      return '<button class="teamchat-chan' + (ch.id === teamChatOpenId ? ' teamchat-chan-active' : '') + '" type="button" data-tc-open="' + esc(ch.id) + '">' +
        '<i class="fas ' + icon + '"></i> ' + esc(ch.label || ch.name || 'Chat') + '</button>';
    }).join('');
  }

  function updateTeamChatComposerLabel() {
    var label = $('portal-teamchat-input-label');
    if (label) label.textContent = 'Message ' + (teamChatOpenChannel().label || 'Office');
  }

  function openTeamChannel(id) {
    if (!id) return;
    teamChatOpenId = id;
    renderTeamChatChannels();
    updateTeamChatComposerLabel();
    fetchTeamChat(true);
  }

  /* The staff directory: names for the find-someone search, the
   * group picker, and DM channel labels. View first, profiles
   * fallback (see the block comment above). */
  function fetchTeamDirectory(done) {
    if (!teamChatClient || !state.user) { if (done) done(); return; }
    var apply = function (rows) {
      teamChatDirectory = rows || [];
      renderTeamChatGroupMembers();
      renderMyAvatarRow(); /* AVATARS_2026_11_03: my picture row reads the same directory */
      if (done) done();
    };
    /* AVATARS_2026_11_03: ask for avatar_url with the directory;
     * if that column is not live yet (SQL not run), fall back to
     * the plain directory, then to the plain profiles select —
     * names must never break over a missing picture column. */
    var plain = function () {
      teamChatClient.from('team_directory').select('id, name, role').order('name', { ascending: true }).limit(200)
        .then(function (res) {
          if (res.error) throw res.error;
          apply(res.data || []);
        })
        .catch(function () {
          teamChatClient.from('employee_profiles').select('id, name, role').order('name', { ascending: true }).limit(200)
            .then(function (res) { apply(res.data || []); })
            .catch(function () { apply([]); });
        });
    };
    teamChatClient.from('team_directory').select('id, name, role, avatar_url').order('name', { ascending: true }).limit(200)
      .then(function (res) {
        if (res.error) throw res.error;
        apply(res.data || []);
      })
      .catch(plain);
  }

  /* TEAMCHAT_CHANNELS_2026_11_03: rebuild the channel bar — the
   * office channel pinned first, then every channel I belong to,
   * most recent activity first. If the channels tables are not
   * there yet (SQL not run), the bar quietly keeps just Office and
   * fetchTeamChat shows the plain load error, like the first build. */
  function fetchTeamChannels(done) {
    if (!teamChatClient || !state.user) { if (done) done(); return; }
    var me = state.user.id;
    var settle = function () { if (done) done(); };
    teamChatClient.from('team_channel_members').select('channel_id').eq('employee_id', me)
      .then(function (res) {
        if (res.error) throw res.error;
        var ids = (res.data || []).map(function (r) { return r.channel_id; })
          .filter(function (id) { return id !== TEAM_OFFICE_ID; });
        if (!ids.length) { finishTeamChannels([], {}); settle(); return null; }
        return teamChatClient.from('team_channels').select('id, kind, name, dm_key, created_at').in('id', ids)
          .then(function (cres) {
            if (cres.error) throw cres.error;
            var chans = cres.data || [];
            var dmIds = chans.filter(function (c) { return c.kind === 'dm'; }).map(function (c) { return c.id; });
            var membersP = dmIds.length
              ? teamChatClient.from('team_channel_members').select('channel_id, employee_id').in('channel_id', dmIds)
              : Promise.resolve({ data: [] });
            return membersP.then(function (mres) {
              var others = {};
              (mres.data || []).forEach(function (m) { if (m.employee_id !== me) others[m.channel_id] = m.employee_id; });
              return teamChatClient.from('team_messages').select('channel_id, created_at')
                .in('channel_id', ids.concat([TEAM_OFFICE_ID]))
                .order('created_at', { ascending: false }).limit(300)
                .then(function (ares) {
                  var lastAt = {};
                  (ares.data || []).forEach(function (r) { if (!lastAt[r.channel_id]) lastAt[r.channel_id] = r.created_at; });
                  finishTeamChannels(chans.map(function (c) {
                    return {
                      id: c.id, kind: c.kind, name: c.name || '',
                      label: c.kind === 'dm' ? teamChatDirName(others[c.id]) : (c.name || 'Group'),
                      lastAt: lastAt[c.id] || c.created_at || ''
                    };
                  }), { officeAt: lastAt[TEAM_OFFICE_ID] || '' });
                  settle();
                });
            });
          });
      })
      .catch(function () { finishTeamChannels([], {}); settle(); });
  }

  function finishTeamChannels(rest, officeInfo) {
    var office = { id: TEAM_OFFICE_ID, kind: 'office', name: 'Office', label: 'Office', lastAt: (officeInfo && officeInfo.officeAt) || '' };
    rest.sort(function (a, b) { return String(b.lastAt || '').localeCompare(String(a.lastAt || '')); });
    teamChatChannels = [office].concat(rest);
    var stillThere = false;
    teamChatChannels.forEach(function (c) { if (c.id === teamChatOpenId) stillThere = true; });
    if (!stillThere) teamChatOpenId = TEAM_OFFICE_ID;
    renderTeamChatChannels();
    updateTeamChatComposerLabel();
  }

  function fetchTeamChat(stick) {
    if (!teamChatClient || !state.user) return;
    teamChatClient.from('team_messages').select('id, author_id, author_name, body, created_at')
      .eq('channel_id', teamChatOpenId)
      .order('created_at', { ascending: false }).limit(100)
      .then(function (res) {
        var box = $('portal-teamchat-list');
        if (!box) return;
        if (res.error) { listError(box, 'team chat'); stopTeamChatPoll(); return; }
        var rows = (res.data || []).slice().reverse(); /* newest last */
        if (!rows.length) {
          emptyState(box, teamChatOpenId === TEAM_OFFICE_ID
            ? 'No messages yet. Say hello to the team.'
            : 'No messages yet. Start the conversation.');
          return;
        }
        var prevTop = box.scrollTop;
        var wasNearBottom = (box.scrollHeight - prevTop - box.clientHeight) < 140;
        box.innerHTML = rows.map(teamChatMsgHtml).join('');
        box.scrollTop = (stick || wasNearBottom) ? box.scrollHeight : prevTop;
      })
      .catch(function () {
        var box = $('portal-teamchat-list');
        if (box) listError(box, 'team chat');
        stopTeamChatPoll();
      });
  }

  function startTeamChatPoll() {
    if (teamChatTimer) return;
    teamChatTimer = setInterval(function () {
      var panel = $('portal-panel-teamchat');
      if (!panel || panel.hidden) { stopTeamChatPoll(); return; }
      fetchTeamChannels();
      fetchTeamChat(false);
    }, 20000);
  }
  function stopTeamChatPoll() {
    if (teamChatTimer) { clearInterval(teamChatTimer); teamChatTimer = null; }
  }
  function resumeTeamChat() {
    if (teamChatClient && state.user) fetchTeamChannels();
    fetchTeamChat(true);
    startTeamChatPoll();
  }

  function sendTeamChat(client) {
    var input = $('portal-teamchat-input'), err = $('portal-teamchat-error'), btn = $('portal-teamchat-send');
    if (!input || !state.user) return;
    var text = trim(input.value);
    if (!text) return;
    if (err) { err.hidden = true; err.textContent = ''; }
    if (btn) btn.disabled = true;
    client.from('team_messages').insert({
      author_id: state.user.id,
      author_name: (state.profile && state.profile.name) || 'Associate',
      body: text,
      channel_id: teamChatOpenId
    }).then(function (res) {
      if (btn) btn.disabled = false;
      if (res.error) { if (err) { err.textContent = 'Could not send that message. Try again.'; err.hidden = false; } return; }
      input.value = '';
      fetchTeamChat(true);
      fetchTeamChannels();
    }).catch(function () {
      if (btn) btn.disabled = false;
      if (err) { err.textContent = 'Could not send that message. Try again.'; err.hidden = false; }
    });
  }

  /* Find-or-create the DM channel for a pair, then open it. The
   * dm_key unique index means the pair can only ever land on one
   * shared channel, whichever of the two creates it first. */
  function teamChatOpenDm(otherId) {
    if (!teamChatClient || !state.user || !otherId || otherId === state.user.id) return;
    var me = state.user.id;
    var key = teamChatDmKey(me, otherId);
    teamChatErr('');
    teamChatClient.from('team_channels').select('id').eq('dm_key', key).limit(1)
      .then(function (res) {
        if (res.error) throw res.error;
        if (res.data && res.data.length) {
          var existing = res.data[0].id;
          fetchTeamChannels(function () { openTeamChannel(existing); });
          return null;
        }
        return teamChatClient.from('team_channels')
          .insert({ kind: 'dm', name: null, dm_key: key, created_by: me }).select('id').single()
          .then(function (cres) {
            if (cres.error) throw cres.error;
            var cid = cres.data.id;
            return teamChatClient.from('team_channel_members').insert([
              { channel_id: cid, employee_id: me },
              { channel_id: cid, employee_id: otherId }
            ]).then(function (mres) {
              if (mres.error) throw mres.error;
              fetchTeamChannels(function () { openTeamChannel(cid); });
            });
          });
      })
      .catch(function () { teamChatErr('Could not open that chat. Try again.'); });
  }

  function renderTeamChatFind() {
    var box = $('portal-teamchat-find-results');
    var input = $('portal-teamchat-find');
    if (!box || !input) return;
    var q = trim(input.value).toLowerCase();
    if (!q) { box.innerHTML = ''; return; }
    var me = state.user ? state.user.id : '';
    var hits = teamChatDirectory.filter(function (p) {
      return p.id !== me && (p.name || '').toLowerCase().indexOf(q) !== -1;
    }).slice(0, 8);
    if (!hits.length) {
      box.innerHTML = '<p class="portal-muted portal-small">No associates match that name.</p>';
      return;
    }
    box.innerHTML = hits.map(function (p) {
      return '<div class="teamchat-person">' + avatarHtml(p.name, p.avatar_url, 'sm') + '<span class="teamchat-person-name">' + esc(p.name || 'Associate') + '</span>' +
        '<button class="portal-btn portal-btn-primary portal-btn-sm" type="button" data-tc-chat="' + esc(p.id) + '"><i class="fas fa-comment"></i> Chat</button></div>';
    }).join('');
  }

  function renderTeamChatGroupMembers() {
    var box = $('portal-teamchat-group-members');
    if (!box) return;
    var me = state.user ? state.user.id : '';
    var others = teamChatDirectory.filter(function (p) { return p.id !== me; });
    if (!others.length) {
      box.innerHTML = '<p class="portal-muted portal-small">No other associates yet.</p>';
      return;
    }
    box.innerHTML = others.map(function (p) {
      return '<label class="teamchat-group-member"><input type="checkbox" data-tc-member="' + esc(p.id) + '" /> ' + avatarHtml(p.name, p.avatar_url, 'sm') + ' ' + esc(p.name || 'Associate') + '</label>';
    }).join('');
  }

  function createTeamChatGroup() {
    if (!teamChatClient || !state.user) return;
    var nameInput = $('portal-teamchat-group-name');
    var name = nameInput ? trim(nameInput.value) : '';
    if (!name) { teamChatErr('Give the group a name first.'); return; }
    var ids = [];
    document.querySelectorAll('[data-tc-member]:checked').forEach(function (b) { ids.push(b.getAttribute('data-tc-member')); });
    if (!ids.length) { teamChatErr('Add at least one person to the group.'); return; }
    var me = state.user.id;
    var btn = $('portal-teamchat-group-create');
    if (btn) btn.disabled = true;
    teamChatErr('');
    teamChatClient.from('team_channels').insert({ kind: 'group', name: name, created_by: me }).select('id').single()
      .then(function (cres) {
        if (cres.error) throw cres.error;
        var cid = cres.data.id;
        var rows = [{ channel_id: cid, employee_id: me }]
          .concat(ids.map(function (id) { return { channel_id: cid, employee_id: id }; }));
        return teamChatClient.from('team_channel_members').insert(rows).then(function (mres) {
          if (mres.error) throw mres.error;
          if (btn) btn.disabled = false;
          if (nameInput) nameInput.value = '';
          var gform = $('portal-teamchat-group-form');
          if (gform) gform.hidden = true;
          renderTeamChatGroupMembers();
          fetchTeamChannels(function () { openTeamChannel(cid); });
        });
      })
      .catch(function () {
        if (btn) btn.disabled = false;
        teamChatErr('Could not create that group. Try again.');
      });
  }

  /* AVATARS_2026_11_03: "My picture" — every staff member manages
   * their OWN portrait in the Team Chat panel. The pick is squared
   * and shrunk in the browser (canvas, center-crop, max 512x512,
   * JPEG), uploaded to the staff-avatars bucket under the one file
   * name the storage policy lets this person write — their own
   * auth uid — and employee_profiles.avatar_url is pointed at the
   * public URL with a ?v= cache-buster, so the new face replaces
   * the old one everywhere at once instead of haunting a cache. */
  function renderMyAvatarRow() {
    var pic = $('portal-teamchat-me-pic'), name = $('portal-teamchat-me-name'), btn = $('portal-teamchat-me-btn');
    if (!pic || !state.user) return;
    var me = teamChatDirPerson(state.user.id);
    var url = (me && me.avatar_url) || '';
    var myName = (state.profile && state.profile.name) || (me && me.name) || 'My picture';
    pic.innerHTML = avatarHtml(myName, url, 'md');
    if (name) name.textContent = myName;
    if (btn) btn.textContent = url ? 'Change picture' : 'Upload picture';
  }

  function myAvatarMsg(text) {
    var msg = $('portal-teamchat-me-msg');
    if (msg) msg.textContent = text || '';
  }

  function processAvatarFile(file, done) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      try {
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        var side = Math.min(w, h);
        var out = Math.min(512, side);
        var canvas = document.createElement('canvas');
        canvas.width = out; canvas.height = out;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, out, out);
        URL.revokeObjectURL(url);
        if (canvas.toBlob) canvas.toBlob(function (b) { done(b); }, 'image/jpeg', 0.85);
        else done(null);
      } catch (e) { URL.revokeObjectURL(url); done(null); }
    };
    img.onerror = function () { URL.revokeObjectURL(url); done(null); };
    img.src = url;
  }

  function uploadMyAvatar(file) {
    if (!teamChatClient || !state.user || !file) return;
    myAvatarMsg('Preparing your picture…');
    processAvatarFile(file, function (blob) {
      if (!blob) { myAvatarMsg('That picture could not be read. Try another one.'); return; }
      myAvatarMsg('Uploading…');
      var path = state.user.id + '.jpg';
      teamChatClient.storage.from(AVATAR_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true })
        .then(function (up) {
          if (up.error) throw up.error;
          var pub = teamChatClient.storage.from(AVATAR_BUCKET).getPublicUrl(path);
          var base = pub && pub.data ? pub.data.publicUrl : '';
          if (!base) throw new Error('no public url');
          var fresh = base + '?v=' + Date.now();
          return teamChatClient.from('employee_profiles').update({ avatar_url: fresh }).eq('id', state.user.id).select('id')
            .then(function (res) {
              /* .select() for the written row: a policy-refused
               * update returns success with zero rows — that is a
               * failure here, not a saved picture. */
              if (res.error || !res.data || !res.data.length) throw res.error || new Error('profile update refused');
              var me = teamChatDirPerson(state.user.id);
              if (me) me.avatar_url = fresh;
              assocAvatarById[state.user.id] = fresh;
              renderMyAvatarRow();
              renderTeamChatGroupMembers();
              renderTeamChatFind();
              fetchTeamChat(true);
              myAvatarMsg('Picture updated — this is the face the team and your customers see.');
            });
        })
        .catch(function () { myAvatarMsg('Upload failed. Check your connection and try again.'); });
    });
  }

  function wireTeamChat(client) {
    if (teamChatWired) return;
    var form = $('portal-teamchat-form');
    if (!form) return;
    teamChatWired = true;
    form.addEventListener('submit', function (e) { e.preventDefault(); sendTeamChat(client); });
    /* Enter sends, Shift+Enter makes a new line (desktop nicety). */
    var input = $('portal-teamchat-input');
    if (input) input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTeamChat(client); }
    });
    /* TEAMCHAT_CHANNELS_2026_11_03: channel bar taps, find-someone
     * search + Chat buttons, and the New group form. Delegated
     * listeners, because the bar and results re-render constantly. */
    var bar = $('portal-teamchat-channels');
    if (bar) bar.addEventListener('click', function (e) {
      var el = e.target;
      while (el && el !== bar) {
        if (el.getAttribute && el.getAttribute('data-tc-open')) { openTeamChannel(el.getAttribute('data-tc-open')); return; }
        el = el.parentNode;
      }
    });
    var find = $('portal-teamchat-find');
    if (find) find.addEventListener('input', renderTeamChatFind);
    var results = $('portal-teamchat-find-results');
    if (results) results.addEventListener('click', function (e) {
      var el = e.target;
      while (el && el !== results) {
        if (el.getAttribute && el.getAttribute('data-tc-chat')) {
          var other = el.getAttribute('data-tc-chat');
          if (find) find.value = '';
          renderTeamChatFind();
          teamChatOpenDm(other);
          return;
        }
        el = el.parentNode;
      }
    });
    var toggle = $('portal-teamchat-group-toggle');
    var gform = $('portal-teamchat-group-form');
    if (toggle && gform) toggle.addEventListener('click', function () {
      gform.hidden = !gform.hidden;
      if (!gform.hidden) renderTeamChatGroupMembers();
    });
    if (gform) gform.addEventListener('submit', function (e) { e.preventDefault(); createTeamChatGroup(); });
    /* AVATARS_2026_11_03: the My picture file pick. The input is
     * reset after every pick so choosing the same photo twice in
     * a row still fires the change. */
    var meFile = $('portal-teamchat-me-file');
    if (meFile) meFile.addEventListener('change', function () {
      var f = meFile.files && meFile.files[0];
      meFile.value = '';
      if (f) uploadMyAvatar(f);
    });
  }

  function loadTeamChat(force) {
    state.loaded.teamchat = true;
    withClient(function (client) {
      if (!client || !state.user) return;
      teamChatClient = client;
      wireTeamChat(client);
      renderMyAvatarRow(); /* AVATARS_2026_11_03: paint my picture row now; the directory fetch below refreshes it with my stored picture */
      fetchTeamDirectory(function () { fetchTeamChannels(); });
      fetchTeamChat(true);
      startTeamChatPoll();
    });
  }
  /* end TEAMCHAT_2026_11_03 */

  /* ================= CUSTOMERS ================= */
  function renderCustomers(rows) {
    var list = $('portal-customer-list');
    if (!rows.length) { emptyState(list, 'No customers match. Customer accounts from the website will show up here.'); return; }
    list.innerHTML = rows.map(function (c) {
      return '<article class="portal-card">' +
        '<div class="portal-card-top"><p class="portal-card-title">' + esc(c.name || 'Customer') + '</p>' +
        '<span class="portal-badge portal-st-reviewed"><i class="fas fa-coins"></i> ' + esc(String(c.points)) + ' pts</span>' +
        (c.membershipTier ? '<span class="portal-badge portal-badge-atrone"><i class="fas fa-star"></i> ATR One · ' + esc(atroneTierName(c.membershipTier)) + '</span>' : '') +
        /* PORTAL_CUSTOMER_PROFILE_2026_11_02: chip when an associate's edit for this customer is waiting on the owner. */
        (custEditByCustomer[c.id] ? '<span class="portal-badge cust-badge-pending"><i class="fas fa-clock"></i> Edit waiting for approval</span>' : '') + '</div>' +
        '<p class="portal-card-meta"><i class="fas fa-envelope"></i> ' + esc(c.email || '—') +
        (c.phone ? ' · <i class="fas fa-phone"></i> ' + esc(c.phone) : '') + '</p>' +
        /* PORTAL_TIER_SET_FINISH_2026_11_02: the standalone birthday
         * editor is GONE from the card (Austin, Nov 2, 2026) —
         * birthday editing lives inside the profile's Edit details
         * form now (see renderCustProfile). */
        '<p class="portal-card-meta">' + esc(String(c.orderCount)) + ' shop order' + (c.orderCount === 1 ? '' : 's') +
        ' · Customer since ' + esc(fmtDate(c.created_at)) + '</p>' +
        /* PORTAL_TIER_SET_FINISH_2026_11_02: the card affordance reads
         * "View details" — the RepairQ pattern (the ticket card says
         * "View details", and inside, an "Edit details" button). */
        '<p><button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-cust-profile="' + esc(c.id) + '"><i class="fas fa-id-card"></i> View details</button> ' +
        '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-cust-delete="' + esc(c.id) + '">Delete customer</button> ' +
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
                /* PORTAL_CUSTOMER_PROFILE_2026_11_02: address rides in the cache so a pending change can show "old -> new" in the approvals section. */
                id: c.id, name: c.name, email: c.email, phone: c.phone, address: c.address, created_at: c.created_at, birthday: c.birthday,
                points: pointsByCustomer[c.id] || 0,
                orderCount: ordersByCustomer[c.id] || 0,
                membershipTier: membershipsByCustomer[c.id] || null
              };
            });
            state.customersCache = rows;
            state.loaded.customers = true;
            /* PORTAL_CUSTOMER_PROFILE_2026_11_02: pending change requests ride along with the customer list — the card chips and the Requests-panel approvals section both read from this load. */
            loadCustEditRequests(function () {
              applyCustomerSearch();
              renderCustEditPanel();
            });
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
    /* PORTAL_SIDEBAR_ROSTER_2026_11_02: display text only — the list this delete runs from is labeled "Guest" now (Austin's word for customers). Behavior is unchanged. */
    if (!window.confirm('Delete ' + name + ' from Guest? This cannot be undone. If this customer has tickets or orders linked, the delete will be blocked.')) return;
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

  /* PORTAL_TIER_SET_FINISH_2026_11_02: the standalone card birthday
   * saver that used to live here is removed — birthday saves ride
   * the profile's Edit details form (saveCustomerEdit below). The
   * bdaySelects() builder above is reused by that form. */

  /* ================= CUSTOMER PROFILES + EDIT APPROVALS =================
   * PORTAL_CUSTOMER_PROFILE_2026_11_02 (Austin, Nov 2, 2026):
   *
   * Tapping a customer in the Customers panel opens their PROFILE in
   * the shared drawer (so it inherits the drawer's scroll lock — the
   * page behind stays frozen, only the profile scrolls):
   *   - Contact info (name, email, phone, address, customer since).
   *   - REPAIR HISTORY: the customer's own tickets (date, device,
   *     issue, status) — no more hunting the Repair Queue for a past
   *     repair.
   *   - REPAIR INVESTMENTS: the money that customer has actually put
   *     into ATRG through repairs. Austin's language rule: customers
   *     INVEST in ATRG — the total is labeled "Repair investments",
   *     never "paid". Computed exactly the way Financials computes
   *     "Collected" (see finSum / the Phase 2 comment): ticket_charges
   *     rows with kind = 'deposit_credit', amount = qty x unit_price,
   *     summed across the customer's tickets.
   *
   * EDITING, with the owner/associate split Austin set:
   *   - The signed-in role comes from state.profile (public.
   *     employee_profiles, loaded at sign-in). isPortalOwner() is a
   *     STRICT check — role exactly 'owner'. (The looser isManager()
   *     helper, owner|admin|manager, exists for other features; this
   *     one is owner-only by Austin's word: "Only on the owner
   *     account.")
   *   - OWNER: the edit form writes straight to the customers row.
   *   - ASSOCIATE (any non-owner employee): the same form NEVER
   *     writes the customer. It inserts one row into public.
   *     customer_edit_requests (customer-edit-requests.sql) holding
   *     just the fields that changed. Until approval, the customer
   *     record is untouched.
   *
   * APPROVALS LIVE IN REQUESTS (Austin correction, Nov 2, 2026):
   * the owner's review surface is NOT the Customers panel — it is a
   * "Customer update" section at the top of the existing REQUESTS
   * panel, the shop's one queue for everything associates ask for
   * (parts, tools, swag — and now customer changes). Approving there
   * applies the stored changes to the customers row; Rejecting
   * discards them. The customer's profile and card still SHOW that a
   * change is waiting (the associate needs that feedback, and the
   * owner needs the context), but no Approve/Reject buttons exist
   * anywhere except Requests — it is the single landing spot. The
   * Requests tab's own count badge stays the shop queue's (owned by
   * that panel's inline code); the customer-update count rides in
   * the section heading.
   *   - If customer_edit_requests does not exist yet (SQL not run),
   *     every request query just errors into an empty list: profiles
   *     still open, the owner can still edit directly, and an
   *     associate's submit gets a plain "not set up yet" message —
   *     the same degrade-gracefully posture as the Members panel.
   */
  var custEditRequests = [];      /* pending rows from customer_edit_requests */
  var custEditByCustomer = {};    /* customer_id -> [pending rows] */
  var custProfileCurrent = null;  /* full customers row open in the drawer */
  var custProfileNotice = '';     /* one-shot message for the profile edit form */
  var custProfileMembership = null; /* PORTAL_TIER_SET_FINISH_2026_11_02: latest customer_memberships row (any status) for the open profile, or null */
  var empNameCache = {};          /* employee_profiles id -> name */

  var CUST_EDIT_FIELDS = [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Phone', type: 'tel' },
    { key: 'address', label: 'Address', type: 'text' }
  ];

  /* The exact role check for this feature (see the block comment):
   * Austin is the owner; everyone else on staff is an associate for
   * customer-info purposes. */
  function isPortalOwner() {
    return trim(state.profile && state.profile.role).toLowerCase() === 'owner';
  }

  function custRowById(customerId) {
    var row = null;
    state.customersCache.forEach(function (c) { if (c.id === customerId) row = c; });
    return row;
  }

  function loadEmpNames(client, done) {
    var missing = [];
    custEditRequests.forEach(function (r) {
      if (r.submitted_by && !empNameCache[r.submitted_by] && missing.indexOf(r.submitted_by) === -1) missing.push(r.submitted_by);
    });
    if (!missing.length) { done(); return; }
    client.from('employee_profiles').select('id, name').in('id', missing)
      .then(function (res) {
        if (!res.error) (res.data || []).forEach(function (p) { empNameCache[p.id] = p.name || 'Employee'; });
        done();
      })
      .catch(function () { done(); });
  }

  function loadCustEditRequests(done) {
    withClient(function (client) {
      if (!client) { custEditRequests = []; custEditByCustomer = {}; if (done) done(); return; }
      client.from('customer_edit_requests').select('*').eq('status', 'pending')
        .order('created_at', { ascending: true }).limit(200)
        .then(function (res) {
          if (res.error) { /* Table not set up yet — no pending requests, no crash. */
            custEditRequests = []; custEditByCustomer = {};
            if (done) done(); return;
          }
          custEditRequests = res.data || [];
          custEditByCustomer = {};
          custEditRequests.forEach(function (r) {
            (custEditByCustomer[r.customer_id] = custEditByCustomer[r.customer_id] || []).push(r);
          });
          loadEmpNames(client, function () { if (done) done(); });
        })
        .catch(function () { custEditRequests = []; custEditByCustomer = {}; if (done) done(); });
    });
  }

  /* PORTAL_TIER_SET_FINISH_2026_11_02: birthday helpers — birthdays
   * are month and day ONLY, never a year (Austin's standing rule).
   * Stored values may be 'MM-DD' or a legacy full date; both
   * normalize to 'MM-DD' for compare/display. */
  function bdayMonthDay(val) {
    var parts = String(val || '').split('-');
    if (parts.length === 3) return parts[1] + '-' + parts[2];
    if (parts.length === 2 && parts[0] && parts[1]) return parts[0] + '-' + parts[1];
    return '';
  }
  function bdayDisplay(val) {
    var md = bdayMonthDay(val);
    if (!md) return '—';
    var p = md.split('-');
    return p[0] + '/' + p[1];
  }

  /* "Phone: (old) -> (new)" lines for one request. The old side reads
   * the CURRENT customer row, so what the owner sees at decision time
   * is the value his approval would replace. */
  function custChangeLines(req, cust) {
    var changes = req.changes || {};
    /* PORTAL_TIER_SET_FINISH_2026_11_02: membership change requests
     * ride this same queue with the members build's _kind payload
     * (PORTAL_MEMBERS_EDIT_2026_11_02 format) — their lines describe
     * the proposed membership change, not contact fields. */
    if (changes._kind === 'membership') {
      var mout = '';
      if (changes._create) {
        mout += '<p class="cust-change-line"><strong>Membership:</strong> turn <strong>ON</strong> — new <strong>' + esc(atroneTierName(changes.tier)) + '</strong> membership</p>';
      } else {
        if (changes.status === 'cancelled') {
          mout += '<p class="cust-change-line"><strong>Membership:</strong> turn <strong>OFF</strong> (cancelled' +
            (changes.cancelled_on ? ', cancelled on ' + esc(fmtJobDate(changes.cancelled_on)) : '') + ')</p>';
        } else if (changes.status === 'active') {
          mout += '<p class="cust-change-line"><strong>Membership:</strong> turn <strong>ON</strong> (active again)</p>';
        }
        if (changes.tier) {
          mout += '<p class="cust-change-line"><strong>Tier:</strong> &rarr; <strong>' + esc(atroneTierName(changes.tier)) + '</strong></p>';
        }
      }
      return mout || '<p class="cust-change-line">Membership change.</p>';
    }
    var out = '';
    CUST_EDIT_FIELDS.forEach(function (f) {
      if (!Object.prototype.hasOwnProperty.call(changes, f.key)) return;
      var oldVal = cust ? trim(cust[f.key]) : '';
      out += '<p class="cust-change-line"><strong>' + esc(f.label) + ':</strong> ' +
        (oldVal ? esc(oldVal) + ' &rarr; ' : '') + '<strong>' + esc(changes[f.key] || '—') + '</strong></p>';
    });
    /* PORTAL_TIER_SET_FINISH_2026_11_02: birthday changes ride the
     * same request (the profile's Edit details form carries them). */
    if (Object.prototype.hasOwnProperty.call(changes, 'birthday')) {
      out += '<p class="cust-change-line"><strong>Birthday:</strong> ' +
        (cust && bdayMonthDay(cust.birthday) ? esc(bdayDisplay(cust.birthday)) + ' &rarr; ' : '') +
        '<strong>' + esc(changes.birthday ? bdayDisplay(changes.birthday) : '—') + '</strong></p>';
    }
    return out || '<p class="cust-change-line">No field changes listed.</p>';
  }

  function custApproveRejectButtons(req) {
    return '<p><button class="portal-btn portal-btn-sm" type="button" data-cust-approve="' + esc(req.id) + '">Approve</button> ' +
      '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-cust-reject="' + esc(req.id) + '">Reject</button></p>';
  }

  /* The owner's approvals section — the "Customer update" block at
   * the top of the REQUESTS panel (Austin correction, Nov 2, 2026;
   * the container lives in that panel, above the shop request list,
   * whose own renderer never touches it). Associates never see it
   * (their pending requests show on the customer's profile instead).
   * The rows keep their own table on purpose: the shop queue's kinds
   * (swag/tool/part/other on tech_requests) carry an Ordered/Done/
   * Denied lifecycle, while a customer update's approval APPLIES the
   * stored changes to the customers row — a different lifecycle, so
   * it renders as its own labeled section in the same panel rather
   * than as rows in the shop list. */
  function renderCustEditPanel(notice) {
    var box = $('portal-cust-edit-requests');
    if (!box) return;
    if (!isPortalOwner() || !custEditRequests.length) { box.innerHTML = ''; return; }
    /* PORTAL_MEMBERS_EDIT_2026_11_02: once membership requests ride
     * this section too, the heading stops calling everything a
     * customer update; each row's badge carries its kind. */
    var anyMem = custEditRequests.some(function (r) { return r.changes && r.changes._kind === 'membership'; });
    var html = '<div class="portal-card cust-req-card"><h3 class="cust-req-title"><i class="fas fa-user-pen"></i> ' +
      (anyMem ? 'Updates' : 'Customer updates') + ' waiting for your approval (' + custEditRequests.length + ')</h3>';
    if (notice) html += '<p class="portal-error">' + esc(notice) + '</p>';
    html += custEditRequests.map(function (r) {
      var cust = custRowById(r.customer_id);
      /* PORTAL_MEMBERS_EDIT_2026_11_02: membership requests render in the same
       * section with their own badge; the name falls back to the
       * snapshot stored on the request when the customer list has
       * not been loaded in this session. */
      var isMem = r.changes && r.changes._kind === 'membership';
      var rowName = cust ? (cust.name || 'Customer') : ((r.changes && r.changes._member_name) || 'Customer');
      return '<div class="cust-req-row">' +
        '<p class="portal-card-title">' + esc(rowName) + ' <span class="portal-badge portal-st-new">' + (isMem ? 'Membership update' : 'Customer update') + '</span></p>' +
        custChangeLines(r, cust) +
        '<p class="portal-muted portal-small">Submitted by ' + esc(empNameCache[r.submitted_by] || 'an associate') + ' · ' + esc(fmtDateTime(r.created_at)) + '</p>' +
        custApproveRejectButtons(r) +
        '</div>';
    }).join('');
    box.innerHTML = html + '</div>';
  }

  function openCustomerProfile(customerId) {
    var cached = custRowById(customerId);
    drawerLoading(cached ? (cached.name || 'Customer') : 'Customer profile');
    withClient(function (client) {
      if (!client) { $('portal-drawer-body').innerHTML = '<p class="portal-error">Couldn&rsquo;t reach the database.</p>'; return; }
      client.from('customers').select('*').eq('id', customerId).maybeSingle()
        .then(function (res) {
          if (res.error || !res.data) { $('portal-drawer-body').innerHTML = '<p class="portal-error">Couldn&rsquo;t load that customer. They may have been deleted.</p>'; return; }
          var cust = res.data;
          custProfileCurrent = cust;
          $('portal-drawer-title').textContent = cust.name || 'Customer';
          /* PORTAL_TIER_SET_FINISH_2026_11_02: the profile also shows
           * and edits the customer's ATR One membership, which lives
           * in customer_memberships — load the latest row (any
           * status) before rendering. If the table is not set up the
           * query just errors and the profile renders without it. */
          client.from('customer_memberships').select('*').eq('customer_id', customerId)
            .order('started_on', { ascending: false }).limit(1)
            .then(function (mres) {
              custProfileMembership = mres.error ? null : ((mres.data || [])[0] || null);
              proceed();
            })
            .catch(function () { custProfileMembership = null; proceed(); });
          function proceed() {
          client.from('tickets').select('*').eq('customer_id', customerId)
            .order('created_at', { ascending: false }).limit(200)
            .then(function (tres) {
              var tickets = tres.error ? [] : (tres.data || []);
              var ids = tickets.map(function (t) { return t.id; });
              function render(charges) {
                loadCustEditRequests(function () {
                  renderCustProfile(cust, tickets, charges);
                  renderCustEditPanel();
                });
              }
              if (!ids.length) { render([]); return; }
              client.from('ticket_charges').select('ticket_id, kind, qty, unit_price').in('ticket_id', ids)
                .then(function (cres) { render(cres.error ? [] : (cres.data || [])); })
                .catch(function () { render([]); });
            })
            .catch(function () { $('portal-drawer-body').innerHTML = '<p class="portal-error">Couldn&rsquo;t load that customer&rsquo;s repairs.</p>'; });
          }
        })
        .catch(function () { $('portal-drawer-body').innerHTML = '<p class="portal-error">Couldn&rsquo;t load that customer.</p>'; });
    });
  }

  function renderCustProfile(cust, tickets, charges) {
    var body = $('portal-drawer-body');
    if (!body) return;
    var investedByTicket = {};
    var totalInvested = 0;
    (charges || []).forEach(function (c) {
      if (c.kind !== 'deposit_credit') return;
      var amt = Number(c.qty || 0) * Number(c.unit_price || 0);
      investedByTicket[c.ticket_id] = (investedByTicket[c.ticket_id] || 0) + amt;
      totalInvested += amt;
    });
    var pending = custEditByCustomer[cust.id] || [];
    var owner = isPortalOwner();
    var html = '';

    html += '<div class="portal-drawer-section"><h3>Contact</h3>' + kvRows([
      ['Name', valOrDash(cust.name)],
      ['Email', valOrDash(cust.email)],
      ['Phone', valOrDash(cust.phone)],
      ['Address', valOrDash(cust.address)],
      ['Birthday', esc(bdayDisplay(cust.birthday))],
      ['Customer since', esc(fmtDate(cust.created_at))]
    ]) + '</div>';

    /* PORTAL_TIER_SET_FINISH_2026_11_02: ATR One status on the
     * profile (Austin, Nov 2, 2026) — the same customer_memberships
     * record the Members panel reads, so the two surfaces can never
     * disagree. Green dot = active, red dot = not active; a customer
     * with no membership row reads "ATR One: Not a member". */
    var mem = custProfileMembership;
    html += '<div class="portal-drawer-section"><h3>ATR One</h3>';
    if (!mem) {
      html += '<p class="cust-prof-mem"><span class="mem-dot mem-dot-off"></span> ATR One: Not a member</p>';
    } else {
      var memActive = mem.status === 'active';
      var memTier = ATRONE_TIERS[mem.tier] || null;
      html += '<p class="cust-prof-mem"><span class="mem-dot ' + (memActive ? 'mem-dot-on' : 'mem-dot-off') + '"></span> ' +
        '<strong>ATR One ' + esc(atroneTierName(mem.tier)) + '</strong>' +
        (memTier ? ' · ' + esc(fmtMoney(memTier.price)) + '/mo' : '') +
        ' · ' + (memActive ? 'Active' : 'Not active') + '</p>' +
        '<p class="portal-muted portal-small">Member since ' + esc(fmtJobDate(mem.started_on) || fmtDate(mem.started_on)) +
        (mem.cancelled_on ? ' · Cancelled ' + esc(fmtJobDate(mem.cancelled_on) || fmtDate(mem.cancelled_on)) : '') +
        (mem.note ? ' · ' + esc(mem.note) : '') + '</p>';
    }
    html += '</div>';

    /* Austin's language rule: this total is "Repair investments" —
     * the word for what a customer puts into ATRG is "invested". */
    html += '<div class="portal-drawer-section"><h3>Repair investments</h3>' +
      '<p class="cust-prof-invest">' + esc(fmtMoney(totalInvested)) + '</p>' +
      '<p class="portal-muted portal-small">Total invested with us across ' + tickets.length + ' repair' + (tickets.length === 1 ? '' : 's') + '.</p></div>';

    html += '<div class="portal-drawer-section"><h3>Repair history</h3>';
    if (!tickets.length) {
      html += '<p class="portal-muted">No repairs on file yet.</p>';
    } else {
      html += tickets.map(function (t) {
        var when = fmtJobDate(t.job_date) || fmtDate(t.created_at);
        return '<div class="cust-prof-ticket">' +
          '<div class="cust-prof-ticket-top"><span class="cust-prof-ticket-date">' + esc(when) + '</span>' +
          '<span class="portal-badge portal-st-reviewed">' + esc(t.status || '') + '</span></div>' +
          '<p class="cust-prof-ticket-device">' + esc(deviceLabel(t)) + '</p>' +
          (t.issue ? '<p class="portal-card-issue">' + esc(t.issue) + '</p>' : '') +
          '<p class="portal-muted portal-small">Invested ' + esc(fmtMoney(investedByTicket[t.id] || 0)) + ' on this repair</p>' +
          '</div>';
      }).join('');
    }
    html += '</div>';

    if (pending.length) {
      html += '<div class="portal-drawer-section"><h3>Changes waiting for approval</h3>' + pending.map(function (r) {
        return '<div class="cust-req-row">' + custChangeLines(r, cust) +
          '<p class="portal-muted portal-small">Submitted by ' + esc(empNameCache[r.submitted_by] || 'an associate') + ' · ' + esc(fmtDateTime(r.created_at)) + '</p>' +
          /* Austin correction, Nov 2, 2026: no approve/reject here — Requests is the single landing spot for decisions. The profile only shows that a change is waiting. */
          (owner
            ? '<p class="portal-muted portal-small">Approve or reject this in Requests — that is where customer updates are decided.</p>'
            : '<p class="portal-muted portal-small">Waiting on the owner to approve — the record above still shows the current information.</p>') +
          '</div>';
      }).join('') + '</div>';
    }

    /* PORTAL_TIER_SET_FINISH_2026_11_02: the edit form sits behind
     * an "Edit details" button (the RepairQ pattern — the ticket
     * drawer's card says "View details", and inside the details
     * there is an "Edit details" button). One form carries contact
     * info, the birthday (folded in here — no separate birthday
     * editor), and the ATR One membership controls. */
    html += '<div class="portal-drawer-section">' +
      '<p style="margin:0"><button class="portal-btn portal-btn-outline portal-btn-sm" type="button" id="cust-prof-edit-btn"><i class="fas fa-pen"></i> Edit details</button></p>' +
      '<div id="cust-prof-edit-form" hidden>' +
      '<h3>' + (owner ? 'Edit contact info' : 'Suggest a change') + '</h3>' +
      CUST_EDIT_FIELDS.map(function (f) {
        return '<div class="portal-field"><label for="cust-prof-' + f.key + '">' + esc(f.label) + '</label>' +
          '<input type="' + f.type + '" id="cust-prof-' + f.key + '" value="' + esc(cust[f.key] || '') + '" /></div>';
      }).join('') +
      '<div class="portal-field"><label>Birthday (month and day only)</label><div>' + bdaySelects(cust) + '</div></div>' +
      '<div class="portal-field"><label for="cust-prof-mem">ATR One member</label>' +
      '<select id="cust-prof-mem"><option value="no">No</option><option value="yes">Yes</option></select></div>' +
      '<div class="portal-field"><label for="cust-prof-mem-tier">ATR One tier</label>' +
      '<select id="cust-prof-mem-tier">' +
      Object.keys(ATRONE_TIERS).map(function (k) {
        var tr = ATRONE_TIERS[k];
        return '<option value="' + k + '">' + esc(tr.name) + ' — ' + esc(fmtMoney(tr.price)) + '/mo</option>';
      }).join('') +
      '</select></div>' +
      '<p><button class="portal-btn" type="button" data-cust-edit-save="' + esc(cust.id) + '">' +
      (owner ? 'Save changes' : 'Submit changes for approval') + '</button> ' +
      '<span class="portal-muted portal-small" id="cust-prof-edit-msg">' + esc(custProfileNotice) + '</span></p>' +
      '<p class="portal-muted portal-small">' + (owner
        ? 'You are signed in as the owner — changes save straight to the customer record.'
        : 'Associates cannot change a customer record directly. Your changes go to the owner, and the record only updates after he approves them.') + '</p>' +
      '</div></div>';
    custProfileNotice = '';
    body.innerHTML = html;

    /* Wire the Edit details toggle and preset the membership
     * controls from the loaded membership row. */
    var editBtn = $('cust-prof-edit-btn'), editBox = $('cust-prof-edit-form');
    if (editBtn && editBox) {
      editBtn.addEventListener('click', function () {
        editBox.hidden = !editBox.hidden;
        editBtn.innerHTML = editBox.hidden
          ? '<i class="fas fa-pen"></i> Edit details'
          : '<i class="fas fa-chevron-up"></i> Hide edit form';
      });
    }
    var memSel = $('cust-prof-mem'), memTierSel = $('cust-prof-mem-tier');
    if (memSel && memTierSel) {
      memSel.value = (mem && mem.status === 'active') ? 'yes' : 'no';
      memTierSel.value = mem ? mem.tier : 'single';
      memTierSel.disabled = memSel.value !== 'yes';
      memSel.addEventListener('change', function () {
        memTierSel.disabled = memSel.value !== 'yes';
      });
    }
  }

  /* PORTAL_TIER_SET_FINISH_2026_11_02: saveCustomerEdit now covers
   * the whole Edit details form in one save — contact fields, the
   * birthday (folded into this form; month/day only, stored as
   * 'MM-DD' exactly like the old card editor stored it), and the
   * ATR One membership controls, which write the SAME
   * customer_memberships record the Members panel edits.
   *   - OWNER: contact + birthday write straight to the customers
   *     row; membership writes straight to customer_memberships
   *     (insert when there is no row, reactivate/update the latest
   *     row when there is one, cancel it when Member = No).
   *   - ASSOCIATE: nothing is written directly. Contact + birthday
   *     changes file as one customer_edit_requests row (the standing
   *     payload); a membership change files as its OWN row carrying
   *     the members build's _kind='membership' payload, so the
   *     owner's approval applies it to customer_memberships.
   * A membership recorded from the profile carries no ticket, so —
   * unlike the ticket drawer's signup — no signup charge line is
   * filed here; the record is the membership itself. */
  function saveCustomerEdit(customerId) {
    var msg = $('cust-prof-edit-msg');
    var cust = custProfileCurrent;
    if (!cust || cust.id !== customerId) return;
    var changes = {};
    CUST_EDIT_FIELDS.forEach(function (f) {
      var el = $('cust-prof-' + f.key);
      if (!el) return;
      var v = trim(el.value);
      if (v !== trim(cust[f.key])) changes[f.key] = v;
    });
    /* Birthday from this form's month/day selects. */
    var mo = document.querySelector('[data-bday-month="' + customerId + '"]');
    var dy = document.querySelector('[data-bday-day="' + customerId + '"]');
    if (mo && dy) {
      var newBday = (mo.value && dy.value) ? (mo.value + '-' + dy.value) : null;
      var curBday = bdayMonthDay(cust.birthday) || null;
      if (newBday !== curBday) changes.birthday = newBday;
    }
    /* Membership intent from the Yes/No + tier controls. */
    var memSel = $('cust-prof-mem'), memTierSel = $('cust-prof-mem-tier');
    var wantMember = !!(memSel && memSel.value === 'yes');
    var wantTier = memTierSel ? memTierSel.value : 'single';
    var mem = custProfileMembership;
    var activeRow = (mem && mem.status === 'active') ? mem : null;
    var memChange = null; /* { create:true, tier } or { create:false, patch } */
    if (wantMember) {
      if (activeRow) {
        if (activeRow.tier !== wantTier) memChange = { create: false, patch: { tier: wantTier } };
      } else if (mem) {
        memChange = { create: false, patch: { status: 'active', cancelled_on: null, tier: wantTier } };
      } else {
        memChange = { create: true, tier: wantTier };
      }
    } else if (activeRow) {
      memChange = { create: false, patch: { status: 'cancelled', cancelled_on: todayDateOnly() } };
    }
    var hasContact = Object.keys(changes).length > 0;
    if (!hasContact && !memChange) { if (msg) msg.textContent = 'No changes to save.'; return; }
    if (changes.name !== undefined && !changes.name) { if (msg) msg.textContent = 'Name cannot be empty.'; return; }
    if (changes.email !== undefined && !changes.email) { if (msg) msg.textContent = 'Email cannot be empty.'; return; }
    if (msg) msg.textContent = isPortalOwner() ? 'Saving\u2026' : 'Submitting\u2026';
    withClient(function (client) {
      if (!client) { if (msg) msg.textContent = 'No connection.'; return; }
      if (isPortalOwner()) {
        /* Owner: straight to the rows. */
        var chain = Promise.resolve();
        if (hasContact) {
          chain = chain.then(function () {
            return client.from('customers').update(changes).eq('id', customerId).then(function (res) {
              if (res.error) throw new Error('contact');
            });
          });
        }
        if (memChange) {
          chain = chain.then(function () {
            var op = memChange.create
              ? client.from('customer_memberships').insert({
                  customer_id: customerId, tier: memChange.tier, status: 'active',
                  started_on: todayDateOnly(), note: null
                })
              : client.from('customer_memberships').update(memChange.patch).eq('id', mem.id);
            return op.then(function (res) { if (res.error) throw new Error('membership'); });
          });
        }
        chain.then(function () {
          Object.keys(changes).forEach(function (k) { cust[k] = changes[k]; });
          var row = custRowById(customerId);
          if (row) Object.keys(changes).forEach(function (k) { row[k] = changes[k]; });
          custProfileNotice = 'Saved.';
          if (memChange) loadAtrOneMembers(true);
          openCustomerProfile(customerId);
          applyCustomerSearch();
        }).catch(function () {
          if (msg) msg.textContent = 'Couldn\u2019t save \u2014 that email may already be on another customer, or the membership table is not set up yet.';
        });
        return;
      }
      /* Associate: file requests. The records are NOT touched \u2014
       * they change only when the owner approves in Requests. */
      var inserts = [];
      if (hasContact) {
        inserts.push(function () {
          return client.from('customer_edit_requests').insert({
            customer_id: customerId, submitted_by: state.user.id,
            changes: changes, status: 'pending'
          });
        });
      }
      if (memChange) {
        inserts.push(function () {
          var payload;
          if (memChange.create) {
            payload = {
              _kind: 'membership', membership_id: null, _create: true,
              _member_name: cust.name || 'Customer',
              status: 'active', cancelled_on: null, tier: memChange.tier
            };
          } else {
            payload = {
              _kind: 'membership', membership_id: mem.id,
              _member_name: cust.name || 'Customer'
            };
            ['status', 'cancelled_on', 'tier'].forEach(function (k) {
              if (Object.prototype.hasOwnProperty.call(memChange.patch, k)) payload[k] = memChange.patch[k];
            });
          }
          return client.from('customer_edit_requests').insert({
            customer_id: customerId, submitted_by: state.user.id,
            changes: payload, status: 'pending'
          });
        });
      }
      var seq = Promise.resolve();
      inserts.forEach(function (fn) {
        seq = seq.then(fn).then(function (res) { if (res.error) throw new Error('insert'); });
      });
      seq.then(function () {
        custProfileNotice = 'Submitted for approval. The record has not changed yet.';
        loadCustEditRequests(function () {
          openCustomerProfile(customerId);
          renderCustEditPanel();
        });
      }).catch(function () {
        if (msg) msg.textContent = 'Couldn\u2019t submit \u2014 change requests are not set up yet.';
      });
    });
  }

  function decideCustEdit(requestId, approve) {
    if (!isPortalOwner()) return;
    var req = null;
    custEditRequests.forEach(function (r) { if (r.id === requestId) req = r; });
    if (!req) { loadCustEditRequests(function () { renderCustEditPanel(); }); return; }
    withClient(function (client) {
      if (!client) return;
      function stamp(status, done) {
        client.from('customer_edit_requests')
          .update({ status: status, decided_by: state.user.id, decided_at: new Date().toISOString() })
          .eq('id', requestId)
          .then(function () { done(); })
          .catch(function () { done(); });
      }
      function finish() {
        loadCustEditRequests(function () {
          renderCustEditPanel();
          applyCustomerSearch();
          /* If the drawer is OPEN on this customer's profile right
           * now, refresh it so the owner sees the change land (or the
           * request clear). Both halves of the check matter: the
           * drawer body keeps the last profile's HTML after it is
           * closed, so the edit-save button's presence alone would
           * reopen a drawer the owner had already dismissed — e.g.
           * when he approves from Requests with no profile up. */
          var drawerEl = $('portal-drawer');
          if (custProfileCurrent && custProfileCurrent.id === req.customer_id &&
              drawerEl && drawerEl.classList.contains('open') &&
              document.querySelector('[data-cust-edit-save]')) {
            custProfileNotice = approve ? 'Change approved and saved to the record.' : 'Change rejected — the record was not changed.';
            openCustomerProfile(req.customer_id);
          }
        });
      }
      if (!approve) { stamp('rejected', finish); return; }
      /* PORTAL_TIER_SET_FINISH_2026_11_02: approving a MEMBERSHIP
       * request (the members build's _kind payload — membership
       * changes from the Members panel AND from the customer
       * profile ride this queue) applies its payload to
       * customer_memberships, never to customers. _create files a
       * brand-new membership row for the customer; otherwise the
       * payload patches the membership it names. */
      if (req.changes && req.changes._kind === 'membership') {
        var mc = req.changes;
        /* Reconciled at the chain-on-tier merge: the members-edit
         * build's post-approval behavior (PORTAL_MEMBERS_EDIT_2026_11_02)
         * rides this branch too — a successful apply updates the
         * local member rows at once and refreshes an open member
         * editor, on top of the stamp + panel reload. */
        function memApplied(appliedId, appliedUpd) {
          if (appliedId && appliedUpd) memApplyLocal(appliedId, appliedUpd);
          stamp('approved', function () {
            finish();
            loadAtrOneMembers(true);
            var dr = $('portal-drawer');
            if (appliedId && memEditCurrent && memEditCurrent.id === appliedId && dr && dr.classList.contains('open')) {
              memEditNotice = 'Membership change approved and saved.';
              renderMemberEditor();
            }
          });
        }
        function memFailed() {
          renderCustEditPanel('Could not apply that membership change. The request is still waiting.');
        }
        if (mc._create) {
          if (!mc.tier) { renderCustEditPanel('That membership request is missing its tier — it is still waiting.'); return; }
          client.from('customer_memberships').insert({
            customer_id: req.customer_id, tier: mc.tier, status: 'active',
            started_on: todayDateOnly(), note: null
          }).then(function (res) { if (res.error) { memFailed(); return; } memApplied(); })
            .catch(memFailed);
          return;
        }
        var mid = mc.membership_id;
        var mupd = {};
        ['status', 'cancelled_on', 'tier'].forEach(function (k) {
          if (Object.prototype.hasOwnProperty.call(mc, k)) mupd[k] = mc[k];
        });
        if (!mid || !Object.keys(mupd).length) {
          renderCustEditPanel('That membership request is missing its membership — it is still waiting.');
          return;
        }
        client.from('customer_memberships').update(mupd).eq('id', mid)
          .then(function (res) { if (res.error) { memFailed(); return; } memApplied(mid, mupd); })
          .catch(memFailed);
        return;
      }
      /* Approve: apply the stored changes FIRST; only a successful
       * apply gets stamped approved. A failed apply (e.g. the new
       * email already belongs to another customer) leaves the
       * request pending with a plain explanation. */
      client.from('customers').update(req.changes || {}).eq('id', req.customer_id)
        .then(function (res) {
          if (res.error) {
            renderCustEditPanel('Could not apply that change — the email may already belong to another customer. The request is still waiting.');
            return;
          }
          var row = custRowById(req.customer_id);
          if (row) Object.keys(req.changes || {}).forEach(function (k) { row[k] = req.changes[k]; });
          if (custProfileCurrent && custProfileCurrent.id === req.customer_id) {
            Object.keys(req.changes || {}).forEach(function (k) { custProfileCurrent[k] = req.changes[k]; });
          }
          stamp('approved', finish);
        })
        .catch(function () { renderCustEditPanel('Could not apply that change. The request is still waiting.'); });
    });
  }
  /* end PORTAL_CUSTOMER_PROFILE_2026_11_02 */

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
        '<td class="p3-inv-actions">' +
        /* PORTAL_PARTS_TO_INVENTORY_2026_11_02: one-tap reorder, only when a link is saved */
        (trim(p.reorder_url || '') ? '<a class="portal-btn portal-btn-outline portal-btn-sm" href="' + esc(p.reorder_url) + '" target="_blank" rel="noopener">Reorder</a> ' : '') +
        /* PORTAL_INV_SCAN_2026_11_02 (attach to repair): disabled at zero — the panel already shows the count at 0 (low) */
        '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-inv-attach="' + esc(p.id) + '"' + ((Number(p.stock_qty) || 0) < 1 ? ' disabled' : '') + '>Attach to repair</button> ' +
        '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-inv-edit="' + esc(p.id) + '">Edit</button> ' +
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
    /* PORTAL_INV_SCAN_2026_11_02 (attach to repair) */
    list.querySelectorAll('[data-inv-attach]').forEach(function (btn) {
      btn.addEventListener('click', function () { openInvAttachPicker(invRow(btn.getAttribute('data-inv-attach'))); });
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
    /* PORTAL_PARTS_TO_INVENTORY_2026_11_02 */ $('portal-inv-reorder-url').value = p.reorder_url || '';
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
      /* PORTAL_PARTS_TO_INVENTORY_2026_11_02 */ reorder_url: trim($('portal-inv-reorder-url').value) || null,
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

  /* ================= PORTAL_INV_SCAN_2026_11_02 =================
   * Scan UPC in Inventory & Orders: receive stock by scanning the
   * UPC on the supplier box (Austin, Nov 2, 2026 — the panel had Add
   * stock item but no way to scan). This REUSES the ticket drawer's
   * barcode scanner (the "Parts on this ticket" section above):
   * same camera flow (BarcodeDetector, ZXing fallback loaded from
   * the same CDN, Stop camera, type-the-code manual fallback) and
   * the same match logic — the code is looked up as a supplier SKU
   * in inventory first, then in past part_orders. Matches come from
   * ATRG's own records only; there is no external UPC lookup.
   * What differs is only where the result lands: the stock form.
   * A part already in inventory opens in that form (Save changes)
   * with the quantity focused, so receiving updates its count
   * instead of duplicating the row; a past-order match or a brand
   * new code starts the Add stock item form prefilled. */
  var invScanStream = null, invScanTimer = null, invScanReader = null;
  function stopInvScan() {
    if (invScanTimer) { clearInterval(invScanTimer); invScanTimer = null; }
    if (invScanReader && invScanReader.reset) { try { invScanReader.reset(); } catch (e) {} invScanReader = null; }
    if (invScanStream) { invScanStream.getTracks().forEach(function (tr) { tr.stop(); }); invScanStream = null; }
    var v = $('portal-inv-scan-video'); if (v) v.srcObject = null;
    var box = $('portal-inv-scan-box'); if (box) box.hidden = true;
  }
  function focusInvField(id) {
    var el = $(id);
    if (!el) return;
    try { el.focus(); if (el.select) el.select(); } catch (e) {}
  }
  function applyInvScannedCode(code) {
    code = String(code || '').trim();
    if (!code) return;
    stopInvScan();
    var msg = $('portal-inv-scan-msg');
    if (msg) msg.textContent = 'Scanned: ' + code + ' — looking it up…';
    withClient(function (client) {
      if (!client) {
        resetInventoryForm();
        $('portal-inv-sku').value = code;
        if (!$('portal-inv-supplier').value) $('portal-inv-supplier').value = 'Mobile Sentrix';
        if (msg) msg.textContent = 'Code filled in as ' + code + ' — add the name and price, then tap Add stock item.';
        focusInvField('portal-inv-name');
        return;
      }
      /* Match order (same as the ticket drawer): stock first, then a part already ordered on a ticket. */
      client.from('inventory').select('*').eq('supplier_sku', code).maybeSingle().then(function (res) {
        if (res.data) {
          /* Already a stock item: open it in the form so receiving
           * updates the count on the one row — never a duplicate. */
          fillInventoryForm(res.data);
          if (msg) msg.textContent = 'Matched stock: ' + (res.data.product_name || code) + ' — already on file. Update the quantity to what is on hand now and tap Save changes.';
          focusInvField('portal-inv-qty');
          return;
        }
        return client.from('part_orders').select('*').eq('supplier_sku', code).order('created_at', { ascending: false }).limit(1).maybeSingle();
      }).then(function (res) {
        if (res && res.data) {
          var po = res.data;
          resetInventoryForm();
          $('portal-inv-name').value = po.description || '';
          $('portal-inv-supplier').value = po.supplier || 'Mobile Sentrix';
          $('portal-inv-sku').value = code;
          if (po.our_cost != null) $('portal-inv-cost').value = po.our_cost;
          if (po.retail_price != null) $('portal-inv-retail').value = po.retail_price;
          $('portal-inv-qty').value = '';
          var form = $('portal-inv-form');
          if (form && form.scrollIntoView) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
          if (msg) msg.textContent = 'Matched an earlier part order: ' + (po.description || code) + ' — type how many arrived and tap Add stock item.';
          focusInvField('portal-inv-qty');
        } else if (msg && msg.textContent.indexOf('Matched') !== 0) {
          resetInventoryForm();
          $('portal-inv-sku').value = code;
          $('portal-inv-supplier').value = 'Mobile Sentrix';
          var form2 = $('portal-inv-form');
          if (form2 && form2.scrollIntoView) form2.scrollIntoView({ behavior: 'smooth', block: 'start' });
          msg.textContent = 'No match on file for ' + code + ' — code and supplier are filled in, add the name and price, then tap Add stock item. It will match next time.';
          focusInvField('portal-inv-name');
        }
      }).catch(function () {
        resetInventoryForm();
        $('portal-inv-sku').value = code;
        if (!$('portal-inv-supplier').value) $('portal-inv-supplier').value = 'Mobile Sentrix';
        if (msg) msg.textContent = 'Code filled in as ' + code + ' — add the name and price, then tap Add stock item.';
        focusInvField('portal-inv-name');
      });
    });
  }
  function startInvScan() {
    var box = $('portal-inv-scan-box'); if (!box) return;
    if (invScanStream || invScanTimer) stopInvScan();
    box.hidden = false;
    if (box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var status = $('portal-inv-scan-status');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (status) status.textContent = 'This device cannot open the camera here — type the code below instead.';
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function (stream) {
      invScanStream = stream;
      var v = $('portal-inv-scan-video'); v.srcObject = stream; v.play();
      if (status) status.textContent = 'Point the camera at the UPC…';
      if (window.BarcodeDetector) {
        var det = new BarcodeDetector({ formats: ['upc_a', 'upc_e', 'ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code'] });
        invScanTimer = setInterval(function () {
          det.detect(v).then(function (codes) {
            if (codes && codes.length) applyInvScannedCode(codes[0].rawValue);
          }).catch(function () {});
        }, 500);
      } else if (window.ZXing) {
        try {
          invScanReader = new ZXing.BrowserMultiFormatReader();
          invScanReader.decodeFromVideoDevice(null, v, function (result) {
            if (result) applyInvScannedCode(result.getText());
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
            invScanReader = new ZXing.BrowserMultiFormatReader();
            invScanReader.decodeFromVideoDevice(null, v, function (result) {
              if (result) applyInvScannedCode(result.getText());
            });
          } catch (e) {}
        };
        s.onerror = function () { if (status) status.textContent = 'Barcode reading could not load — type the code below instead.'; };
        document.head.appendChild(s);
      }
    }).catch(function () {
      if (status) status.textContent = 'Camera permission was denied — type the code below instead.';
    });
  }

  /* ---------- PORTAL_INV_SCAN_2026_11_02 (attach to repair) ----------
   * Austin, Nov 2, 2026: the inventory flow is parts and stock first —
   * a part gets stocked, then from the stock list it attaches to a
   * job. "Attach to repair" on a stock row opens a ticket picker in
   * the shared drawer: the open repair queue (everything not Job
   * Complete, queue order), searchable by customer, device or issue,
   * mirroring the check-in customer picker (search input + .ci-result
   * buttons). Picking a ticket attaches the part with the SAME code
   * path the ticket drawer's own part form uses when a part is picked
   * from stock: insert the same part_orders row (inventory_id set,
   * description / supplier / SKU / cost / retail carried from the
   * stock item, qty 1, status 'Ordered'), then the drawer's own
   * adjustStock() takes the unit out of stock. No second mechanism,
   * and landPartInInventory is not involved — the part came FROM the
   * inventory row, so there is nothing new to land. */
  var invAttachItem = null, invAttachTickets = null;
  function openInvAttachPicker(item) {
    if (!item) return;
    if ((Number(item.stock_qty) || 0) < 1) return; /* button is disabled at zero; belt and braces */
    invAttachItem = item;
    invAttachTickets = null;
    openDrawer('Attach to repair');
    var body = $('portal-drawer-body');
    body.innerHTML =
      '<div class="portal-drawer-section"><p class="portal-card-title">' + esc(item.product_name || 'Part') + '</p>' +
      '<p class="portal-card-meta">' + esc(String(item.stock_qty)) + ' in stock' +
      (item.supplier_sku ? ' &middot; SKU ' + esc(item.supplier_sku) : '') +
      (item.supplier ? ' &middot; ' + esc(item.supplier) : '') + '</p>' +
      '<div class="portal-field"><label for="inv-attach-search">Which repair?</label>' +
      '<input type="search" id="inv-attach-search" placeholder="Search customer or device&hellip;" autocomplete="off" /></div>' +
      '<div id="inv-attach-results"><p class="portal-muted">Loading open repairs&hellip;</p></div>' +
      '<p class="portal-error" id="inv-attach-error" hidden></p>' +
      '<p class="portal-muted portal-small" id="inv-attach-msg"></p></div>';
    var search = $('inv-attach-search');
    if (search) {
      search.addEventListener('input', renderInvAttachResults);
      try { search.focus(); } catch (e) {}
    }
    withClient(function (client) {
      if (!client) { $('inv-attach-results').innerHTML = '<p class="portal-error">Couldn&rsquo;t reach the database.</p>'; return; }
      var q = client.from('tickets').select('*').neq('status', 'Job Complete');
      q = q.order('job_date', { ascending: false });
      q = q.order('created_at', { ascending: false }).limit(200);
      q.then(function (res) {
        if (res.error) { $('inv-attach-results').innerHTML = '<p class="portal-error">Couldn&rsquo;t load the repair queue.</p>'; return; }
        invAttachTickets = res.data || [];
        renderInvAttachResults();
      }).catch(function () { $('inv-attach-results').innerHTML = '<p class="portal-error">Couldn&rsquo;t load the repair queue.</p>'; });
    });
  }
  function renderInvAttachResults() {
    var box = $('inv-attach-results');
    if (!box || !invAttachTickets) return;
    var term = trim((($('inv-attach-search') || {}).value || '')).toLowerCase();
    var hits = invAttachTickets.filter(function (t) {
      if (!term) return true;
      var hay = ((t.customer_name || '') + ' ' + deviceLabel(t) + ' ' + (t.issue || '')).toLowerCase();
      return hay.indexOf(term) !== -1;
    }).slice(0, 50);
    if (!invAttachTickets.length) { box.innerHTML = '<p class="portal-muted">No open repairs right now.</p>'; return; }
    if (!hits.length) { box.innerHTML = '<p class="portal-muted">No open repair matches that search.</p>'; return; }
    box.innerHTML = hits.map(function (t) {
      return '<button type="button" class="ci-result" data-inv-attach-pick="' + esc(t.id) + '"><strong>' + esc(t.customer_name || 'No name given') + '</strong><span>' + esc(deviceLabel(t)) + ' &middot; ' + esc(t.status || '') + '</span></button>';
    }).join('');
    box.querySelectorAll('[data-inv-attach-pick]').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = null;
        invAttachTickets.forEach(function (x) { if (String(x.id) === b.getAttribute('data-inv-attach-pick')) t = x; });
        if (t) attachStockToTicket(t);
      });
    });
  }
  function attachStockToTicket(t) {
    var item = invAttachItem;
    if (!item) return;
    var err = $('inv-attach-error');
    if (err) { err.hidden = true; err.textContent = ''; }
    var msg = $('inv-attach-msg');
    var box = $('inv-attach-results');
    if (box) box.querySelectorAll('[data-inv-attach-pick]').forEach(function (b) { b.disabled = true; });
    if (msg) msg.textContent = 'Attaching&hellip;';
    withClient(function (client) {
      if (!client) {
        if (msg) msg.textContent = '';
        if (err) { err.textContent = 'Couldn&rsquo;t reach the database.'; err.hidden = false; }
        renderInvAttachResults();
        return;
      }
      if ((Number(item.stock_qty) || 0) < 1) {
        if (msg) msg.textContent = '';
        if (err) { err.textContent = 'That part is out of stock.'; err.hidden = false; }
        renderInvAttachResults();
        return;
      }
      var part = {
        ticket_id: t.id,
        inventory_id: item.id,
        description: item.product_name || '',
        supplier: item.supplier || null,
        supplier_sku: item.supplier_sku || null,
        our_cost: item.cost != null ? item.cost : null,
        retail_price: item.retail_price != null ? item.retail_price : null,
        qty: 1,
        carrier: null,
        tracking_number: null,
        order_number: null,
        status: 'Ordered'
      };
      client.from('part_orders').insert(part).select().then(function (res) {
        if (res.error) {
          if (msg) msg.textContent = '';
          if (err) { err.textContent = 'Couldn&rsquo;t attach that part. Try again.'; err.hidden = false; }
          renderInvAttachResults();
          return;
        }
        adjustStock(client, item.id, -1);
        var left = Math.max(0, (Number(item.stock_qty) || 0) - 1);
        state.loaded.inventory = false;
        loadInventory(true);
        $('portal-drawer-body').innerHTML =
          '<div class="portal-drawer-section"><p class="portal-card-title">' + esc(item.product_name || 'Part') + '</p>' +
          '<p>Attached to ' + esc(t.customer_name || 'the repair') + ' &mdash; ' + esc(deviceLabel(t)) + '.</p>' +
          '<p class="portal-card-meta">Stock left: ' + left + '</p>' +
          '<button class="portal-btn portal-btn-primary" type="button" id="inv-attach-done">Done</button></div>';
        var done = $('inv-attach-done');
        if (done) done.addEventListener('click', function () {
          /* adjustStock is fire-and-forget (the drawer's helper), so
           * reload once more as the drawer closes — the panel behind
           * then shows the landed count, not a mid-flight one. */
          state.loaded.inventory = false;
          loadInventory(true);
          closeDrawer();
        });
      }).catch(function () {
        if (msg) msg.textContent = '';
        if (err) { err.textContent = 'Couldn&rsquo;t attach that part. Try again.'; err.hidden = false; }
        renderInvAttachResults();
      });
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
      /* PORTAL_ROSTER_DETAIL_2026_11_02: taps inside the roster's
       * owner-section fields must not fall through to the card
       * toggle below (the whole card is the toggle target) — typing
       * a pay rate is not a tap on the card. Buttons in the detail
       * carry their own data attributes and are still handled by
       * their branches as the walk passes them. */
      if (e.target && e.target.closest && e.target.closest('.assoc-detail input, .assoc-detail select, .assoc-detail textarea')) return;
      var t = e.target;
      while (t && t !== document) {
        if (t.getAttribute) {
          var tid = t.getAttribute('data-view-ticket');
          if (tid) { openTicket(tid); return; }
          var aid = t.getAttribute('data-view-application');
          if (aid) { openApplication(aid); return; }
          var iid = t.getAttribute('data-view-investor');
          if (iid) { openInvestor(iid); return; }
          var del = t.getAttribute('data-cust-delete');
          if (del) { deleteCustomer(del); return; }
          /* PORTAL_CUSTOMER_PROFILE_2026_11_02: customer profile + edit-approval actions (cards, drawer profile, approvals section). */
          var cp = t.getAttribute('data-cust-profile');
          if (cp) { openCustomerProfile(cp); return; }
          var ca = t.getAttribute('data-cust-approve');
          if (ca) { decideCustEdit(ca, true); return; }
          var cr = t.getAttribute('data-cust-reject');
          if (cr) { decideCustEdit(cr, false); return; }
          var cs = t.getAttribute('data-cust-edit-save');
          if (cs) { saveCustomerEdit(cs); return; }
          /* PORTAL_ROSTER_DETAIL_2026_11_02: roster owner-section
           * actions — the walk reaches these buttons before the card
           * they sit in, so they act instead of toggling it. */
          var aps = t.getAttribute('data-assoc-pay-save');
          if (aps) { saveAssocPay(aps); return; }
          var ahs = t.getAttribute('data-assoc-home-save');
          if (ahs) { saveAssocHome(ahs); return; } /* PORTAL_MILEAGE_2026_11_02 */
          var aar = t.getAttribute('data-assoc-avatar-remove');
          if (aar) { removeAssocAvatar(aar); return; } /* AVATARS_2026_11_03 */
          var atc = t.getAttribute('data-assoc-timecard');
          if (atc) { openAssocTimeCard(atc); return; }
          /* ACCOUNT_CONTROLS_2026_11_03: Account Controls panel
           * actions (staff login rows, their inline forms, the
           * password eyes and the Add staff login button). */
          var acey = t.getAttribute('data-acct-eye');
          if (acey) { acctToggleEye(t); return; }
          var ace = t.getAttribute('data-acct-edit');
          if (ace) { acctToggleForm(ace, 'email'); return; }
          var acp = t.getAttribute('data-acct-pass');
          if (acp) { acctToggleForm(acp, 'password'); return; }
          var aces = t.getAttribute('data-acct-email-save');
          if (aces) { acctSaveEmail(t, aces); return; }
          var acps = t.getAttribute('data-acct-pass-save');
          if (acps) { acctSavePassword(t, acps); return; }
          var acb = t.getAttribute('data-acct-ban');
          if (acb) { acctToggleBan(t, acb); return; }
          var accx = t.getAttribute('data-acct-cancel');
          if (accx) { acctExpand = null; renderAssociates(); return; } /* ASSOCIATE_ACCOUNTS_2026_11_03 */
          var acad = t.getAttribute('data-acct-add');
          if (acad) { acctAddUser(t); return; }
          /* PORTAL_SIDEBAR_ROSTER_2026_11_02: roster row tap expands/collapses that associate's profile in place. */
          var at = t.getAttribute('data-assoc-toggle');
          if (at) { toggleAssociateCard(at); return; }
          /* PORTAL_MEMBERS_EDIT_2026_11_02: member cards + member editor actions. */
          var me = t.getAttribute('data-member-edit');
          if (me) { openMemberEditor(me); return; }
          var mt = t.getAttribute('data-mem-toggle');
          if (mt) { saveMembershipToggle(mt); return; }
          var mts = t.getAttribute('data-mem-tier-save');
          if (mts) { saveMembershipTier(mts); return; }
        }
        t = t.parentNode;
      }
    });

    /* PORTAL_CUSTOMER_PROFILE_2026_11_02 (Austin correction): the
     * approvals section lives in the Requests panel — refresh the
     * pending customer updates every time that tab is opened, so the
     * owner never lands on a stale queue. (The panel's own inline
     * code shows the panel and loads the shop list; this listener is
     * independent and only re-renders the customer-update section.) */
    var reqTab = $('portal-tab-requests');
    if (reqTab) reqTab.addEventListener('click', function () {
      loadCustEditRequests(function () { renderCustEditPanel(); });
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
    /* PORTAL_INV_SCAN_2026_11_02 */
    var invScanBtn = $('portal-inv-scan-btn');
    if (invScanBtn) invScanBtn.addEventListener('click', startInvScan);
    var invScanStop = $('portal-inv-scan-stop');
    if (invScanStop) invScanStop.addEventListener('click', stopInvScan);
    var invScanUse = $('portal-inv-scan-use');
    if (invScanUse) invScanUse.addEventListener('click', function () {
      var code = $('portal-inv-scan-manual') ? $('portal-inv-scan-manual').value : '';
      applyInvScannedCode(code);
    });
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
  var EXTRA_LOADERS = { timeclock: loadTimeClock, checkin: loadCheckinCustomers, mileage: loadMileage /* PORTAL_MILEAGE_2026_11_02 */ };
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
    ['timeclock', 'links', 'square', 'checkin', 'mileage'].forEach(function (name) { /* PORTAL_MILEAGE_2026_11_02 */
      var tab = $('portal-tab-' + name);
      if (tab) tab.addEventListener('click', function () { showExtraPanel(name); });
    });
    var toggle = $('portal-nav-toggle');
    if (toggle) toggle.addEventListener('click', function () { var nav = $('portal-nav'); if (nav) nav.classList.toggle('open'); });
    initCheckin();
    var rb = $('tc-test-receipt'); if (rb) rb.addEventListener('click', function () { printTest(false); });
    var lb = $('tc-test-label'); if (lb) lb.addEventListener('click', function () { printTest(true); });
    var act = $('tc-action'); if (act) act.addEventListener('click', toggleClock);
    /* PORTAL_MILEAGE_2026_11_02: mileage panel wiring, plus the
     * associate's own home-address save on the Time Clock panel. */
    initMileage();
    var hsb = $('tc-home-save'); if (hsb) hsb.addEventListener('click', saveOwnHome);
    /* PORTAL_TIME_CARDS_2026_11_02: week stepper for the time cards. */
    var wp = $('tc-week-prev'); if (wp) wp.addEventListener('click', function () { tcWeekOffset -= 1; renderTimeCards(); });
    var wn = $('tc-week-next'); if (wn) wn.addEventListener('click', function () { if (tcWeekOffset < 0) { tcWeekOffset += 1; renderTimeCards(); } });
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
  /* PORTAL_TIME_CARDS_2026_11_02 (Austin, Nov 2, 2026): "time clock. I
   * need it to be a little bit better so I can see associates time
   * cards." The panel is now TIME CARDS: an owner-only "On the clock
   * now" board at the top (who is clocked in and since when), then one
   * card per associate with their shifts for one pay week at a time
   * (ATRG pays weekly, so cards follow the same Monday-start week as
   * weekStart()), previous/next week stepping, and each card's total
   * hours for the displayed week. The displayed week IS the pay week
   * and is labeled that way: the stepper header reads "Pay week:
   * <range>" and each card's total reads "Pay-week total". The old flat "My time this week"
   * list and the manager approve queue are replaced: the approve
   * action (same approved flag, owner only) now sits on the shift row
   * inside the associate's card. Access mirrors the old panel — the
   * owner fetches every entry; an associate's loader only ever
   * queries their own employee_id, so they see only their own card
   * and never the on-the-clock board. Clock in / out is unchanged:
   * toggleClock still inserts {employee_id, employee_name} on clock
   * in and stamps clock_out on clock out. A shift belongs to the week
   * of its clock_in; an overnight shift's hours land on the day it
   * started (duration is clock_out minus clock_in, unchanged). The
   * week stepper re-renders from the rows already fetched, so
   * stepping never loses the on-the-clock board. */
  var tcWeekOffset = 0;
  var tcCardRows = null;
  var tcClientRef = null;
  function tcWeekStart() { var d = weekStart(); d.setDate(d.getDate() + tcWeekOffset * 7); return d; }
  function loadTimeClock() {
    withClient(function (client) {
      if (!client || !state.user) return;
      tcClientRef = client;
      client.from('time_entries').select('*').eq('employee_id', state.user.id).order('clock_in', { ascending: false }).limit(60)
        .then(function (res) {
          var status = $('tc-status'), btn = $('tc-action');
          if (res.error) { if (status) status.textContent = 'Time clock is not set up yet.'; var cardsErr = $('tc-cards'); if (cardsErr) cardsErr.innerHTML = ''; return; }
          var rows = res.data || [];
          tcOpenEntry = null;
          rows.forEach(function (r) { if (!r.clock_out) tcOpenEntry = r; });
          if (tcOpenEntry) {
            if (status) status.innerHTML = 'You are <strong>on the clock</strong> since ' + esc(new Date(tcOpenEntry.clock_in).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) + '.';
            if (btn) btn.textContent = 'Clock Out';
          } else {
            if (status) status.textContent = 'You are off the clock.';
            if (btn) btn.textContent = 'Clock In';
          }
          loadBirthdays(client);
          loadTimeCards(client);
          loadOwnHome(client); /* PORTAL_MILEAGE_2026_11_02: the associate's own home-address row */
        });
    });
  }
  function loadTimeCards(client) {
    var cards = $('tc-cards'), onWrap = $('tc-onnow-wrap');
    if (isManager()) {
      if (onWrap) onWrap.hidden = false;
      client.from('time_entries').select('*').is('clock_out', null).order('clock_in', { ascending: true }).then(function (res) {
        renderOnNow(res.error ? null : (res.data || []));
      });
      client.from('time_entries').select('*').order('clock_in', { ascending: false }).limit(300).then(function (res) {
        if (res.error) { if (cards) cards.innerHTML = '<p class="portal-muted">Team time unavailable.</p>'; return; }
        tcCardRows = res.data || [];
        renderTimeCards(); tcMetaLoad(client); /* PORTAL_TIMECARDS_2026_11_02: fields / profiles / approvals settle in behind the cards */
      });
    } else {
      if (onWrap) onWrap.hidden = true;
      client.from('time_entries').select('*').eq('employee_id', state.user.id).order('clock_in', { ascending: false }).limit(300).then(function (res) {
        if (res.error) { if (cards) cards.innerHTML = '<p class="portal-muted">Your time is unavailable.</p>'; return; }
        tcCardRows = res.data || [];
        renderTimeCards(); tcMetaLoad(client); /* PORTAL_TIMECARDS_2026_11_02 */
      });
    }
  }
  function renderOnNow(rows) {
    var list = $('tc-onnow-list');
    if (!list) return;
    if (!rows || !rows.length) { list.innerHTML = '<p class="portal-muted">Nobody is on the clock right now.</p>'; return; }
    list.innerHTML = rows.map(function (r) {
      var ci = new Date(r.clock_in);
      return '<div class="tc-row"><span><strong>' + esc(r.employee_name || 'Tech') + '</strong></span><span class="portal-muted">since ' + esc(ci.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })) + ' &middot; ' + esc(ci.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) + '</span></div>';
    }).join('');
  }
  function renderTimeCards() {
    var wrap = $('tc-cards');
    if (!wrap || !tcCardRows) return;
    var ws = tcWeekStart(), we = new Date(ws); we.setDate(we.getDate() + 7);
    var sun = new Date(we); sun.setDate(sun.getDate() - 1);
    var label = $('tc-week-label');
    if (label) label.textContent = 'Pay week: ' + ws.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' \u2013 ' + sun.toLocaleDateString([], { month: 'short', day: 'numeric' });
    var next = $('tc-week-next'); if (next) next.disabled = tcWeekOffset >= 0;
    var inWeek = tcCardRows.filter(function (r) { var d = new Date(r.clock_in); return d >= ws && d < we; });
    if (!inWeek.length) { wrap.innerHTML = tcOwnerBarHtml() + '<p class="portal-muted">No time logged for this week.</p>'; wireTcManual(wrap); return; } /* PORTAL_TIMECARDS_2026_11_02: the owner can still add the week's first entry */
    var focusId = window.portalTcFocusEmployeeId || null; /* PAYROLL_SPLIT_2026_11_03: the roster's View time card jump lands here now — highlight that associate's card on this render, then clear the flag */
    if (focusId) window.portalTcFocusEmployeeId = null;
    var groups = [], byKey = {};
    inWeek.forEach(function (r) {
      var key = r.employee_id || r.employee_name || 'tech';
      if (!byKey[key]) {
        /* PAYROLL_SPLIT_2026_11_03: the group carries the profile's
         * role and pay rate so the card can price its own week
         * (rate + week pay, below). rateKnown is false when the
         * profiles load never got a pay_rate column back, in which
         * case the card renders exactly as it did before the split. */
        var prof = tcProfileById(r.employee_id);
        byKey[key] = {
          id: r.employee_id || null,
          name: (prof && prof.name) || r.employee_name || 'Tech',
          rows: [], workMs: 0, driveMs: 0, miles: 0, milesAmt: 0,
          rate: (prof && prof.pay_rate != null && prof.pay_rate !== '' && !isNaN(Number(prof.pay_rate))) ? Number(prof.pay_rate) : null,
          rateKnown: !!(prof && ('pay_rate' in prof)),
          isOwner: !!(prof && trim(prof.role).toLowerCase() === 'owner')
        };
        groups.push(byKey[key]);
      }
      byKey[key].rows.push(r);
    });
    var mgr = isManager();
    wrap.innerHTML = tcOwnerBarHtml() + groups.map(function (g) { /* PORTAL_TIMECARDS_2026_11_02: the owner add bar rides on top of the cards */
      var total = 0;
      var rowsHtml = g.rows.map(function (r) {
        var ci = new Date(r.clock_in), co = r.clock_out ? new Date(r.clock_out) : null;
        var when = esc(ci.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })) + ' &middot; ' + esc(ci.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) + ' &rarr; ';
        /* PORTAL_TIMECARDS_2026_11_02: the row editor replaces the
         * row outright while it is open. */
        if (tcEditId === r.id) return tcEditFormHtml(r);
        var isDriving = tcFieldsKnown && r.entry_type === 'driving';
        var editBtn = isPortalOwner() ? '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-tc-edit="' + r.id + '">Edit</button>' : '';
        var tripLine = '';
        if (isDriving && (r.from_location || r.to_location)) {
          tripLine = '<div class="tc-note-line"><i class="fas fa-route"></i> ' + esc(r.from_location || '?') + ' &rarr; ' + esc(r.to_location || '?') + (r.miles != null && r.miles !== '' ? ' &middot; ' + esc(String(Number(r.miles))) + ' mi' : '') + '</div>';
        }
        var noteLine = (tcFieldsKnown && r.note) ? '<div class="tc-note-line">' + esc(r.note) + '</div>' : '';
        var driveBadge = isDriving ? '<span class="tc-badge"><i class="fas fa-car"></i> Driving</span>' : '';
        if (!co) return '<div class="tc-row"><span>' + when + '<strong>On the clock</strong></span><span class="tc-row-end">' + driveBadge + editBtn + '</span></div>' + tripLine + noteLine;
        total += (co - ci);
        if (isDriving) {
          g.driveMs += (co - ci);
          /* PAYROLL_SPLIT_2026_11_03: price the miles as the rows
           * land — per-date rate from the shared mileageRateFor(),
           * and never for the owner (house rule: his driving is
           * recorded, not paid). Mirrors finPayroll()'s driving math
           * exactly, per week instead of per period. */
          var rowMiles = tcFieldsKnown ? (Number(r.miles) || 0) : 0;
          g.miles += rowMiles;
          if (!g.isOwner && rowMiles > 0) g.milesAmt += rowMiles * mileageRateFor(ci).rate;
        } else g.workMs += (co - ci);
        var badge = r.approved ? '<span class="tc-badge">Approved</span>' : '<span class="tc-badge tc-badge-pending">Pending approval</span>';
        var approve = (!r.approved && mgr) ? '<button class="portal-btn portal-btn-primary portal-btn-sm" type="button" data-approve="' + r.id + '">Approve</button>' : '';
        return '<div class="tc-row"><span>' + when + esc(co.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) + ' (' + fmtHours(co - ci) + ')</span><span class="tc-row-end">' + driveBadge + badge + approve + editBtn + '</span></div>' + tripLine + noteLine;
      }).join('');
      var driveNote = g.driveMs > 0 ? ' <span class="portal-muted">(incl. ' + esc(fmtHours(g.driveMs)) + ' driving — mileage only)</span>' : '';
      /* PAYROLL_SPLIT_2026_11_03: the card prices its own week —
       * work hours x the profile rate, plus priced mileage for
       * non-owners — the same rules finPayroll() applies per
       * period. Shown only when the rate actually came back with
       * the profiles; a known-but-unset rate says so plainly. */
      var payLine = '';
      if (g.rateKnown) {
        if (g.rate == null) {
          payLine = '<div class="tc-card-pay">Pay rate not set — these hours are not priced yet. Set the rate on the Associates card.</div>';
        } else {
          var weekPay = (g.workMs / 3600000) * g.rate + g.milesAmt;
          payLine = '<div class="tc-card-pay">Rate ' + esc(fmtMoney(g.rate)) + ' / hr &middot; Week pay: <strong>' + esc(fmtMoney(weekPay)) + '</strong>' +
            (g.milesAmt > 0 ? ' <span class="portal-muted">(incl. ' + esc(fmtMoney(g.milesAmt)) + ' mileage on ' + esc(String(Math.round(g.miles * 10) / 10)) + ' mi)</span>' : '') +
            '</div>';
        }
      }
      return '<div class="tc-card' + (focusId && g.id === focusId ? ' tc-card-focus' : '') + '"><div class="tc-card-head"><strong>' + esc(g.name) + '</strong><span class="tc-card-total">Pay-week total: ' + fmtHours(total) + driveNote + '</span></div>' + payLine + tcWeekApprovalHtml(g) + rowsHtml + '</div>'; /* PORTAL_TIMECARDS_2026_11_02: driving breakout + the weekly approval */
    }).join('');
    wrap.querySelectorAll('[data-approve]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!tcClientRef) return;
        tcClientRef.from('time_entries').update({ approved: true }).eq('id', b.getAttribute('data-approve')).then(function () { loadTimeClock(); });
      });
    });
    wireTcManual(wrap); /* PORTAL_TIMECARDS_2026_11_02 */
    /* PAYROLL_SPLIT_2026_11_03: if the roster's View time card jump
     * brought us here, bring that associate's card into view. */
    if (focusId) { var fc = wrap.querySelector('.tc-card-focus'); if (fc && fc.scrollIntoView) { try { fc.scrollIntoView({ block: 'nearest' }); } catch (e) {} } }
  }
  function toggleClock() {
    withClient(function (client) {
      if (!client || !state.user) return;
      var btn = $('tc-action'); if (btn) btn.disabled = true;
      var wasOpenTc = !!tcOpenEntry; /* PORTAL_LOCATION_2026_11_02: which snapshot this clock action files */
      var done = function () { if (btn) btn.disabled = false; extraLoaded.timeclock = true; loadTimeClock(); try { geoCapture(wasOpenTc ? 'clock_out' : 'clock_in'); } catch (e) {} };
      if (tcOpenEntry) {
        client.from('time_entries').update({ clock_out: new Date().toISOString() }).eq('id', tcOpenEntry.id).then(done).catch(done);
      } else {
        client.from('time_entries').insert({ employee_id: state.user.id, employee_name: (state.profile && state.profile.name) || state.user.email }).then(done).catch(done);
      }
    });
  }

  /* ================= PORTAL_TIMECARDS_2026_11_02 =================
   * (Austin, Nov 2, 2026): full manual control of time cards for
   * the owner, plus the weekly approval.
   *
   * MANUAL ENTRIES: the owner can add an entry for any associate
   * (date, clock-in, clock-out, type, miles, note), edit any entry's
   * times (shortening included — it is the same edit), and delete an
   * entry outright behind a two-tap confirm. Everything is gated on
   * isPortalOwner() — the same gate as the pay-rate editor — and the
   * controls never render for anyone else. Writes go to the same
   * time_entries rows everything else reads, so a manual change
   * flows on its own into the roster's "Hours this pay week"
   * (loadAssocTime re-reads the table; the roster cache is also
   * dropped below), the time-card totals (this panel re-fetches),
   * and Financials payroll (its own fetch).
   *
   * TYPES (with PORTAL_MILEAGE_2026_11_02): an entry is Work or
   * Driving. The type / miles / note / trip-endpoint columns arrive
   * with time-entries-fields.sql; until then tcFieldsKnown is false
   * and the forms carry times only — entries still save, and nothing
   * pretends the extra fields exist.
   *
   * WEEKLY APPROVAL: one row in time_card_approvals per associate
   * per pay week (week_start = the Monday, finWeekKey). Austin's
   * cadence: approve every TUESDAY for FRIDAY pay, for the completed
   * Mon–Sun week. The Approve control sits on each associate's card
   * for the displayed week; an approved week shows who approved it
   * and when, with an Undo. This is separate from the per-ENTRY
   * approved flag the shift rows already carry — that one is
   * untouched. Until the approvals table exists
   * (time-card-approvals.sql), tcApprovalsKnown is false and the
   * approval controls simply do not render. */
  var tcEditId = null;
  var tcFieldsProbed = false;
  var tcFieldsKnown = false;
  var tcMetaLoaded = false;
  var tcProfiles = [];
  var tcApprovals = {};
  var tcApprovalsKnown = false;
  var tcManualMsg = '';

  function tcProbeFields(client, done) {
    if (tcFieldsProbed) { if (done) done(tcFieldsKnown); return; }
    client.from('time_entries').select('id, entry_type, miles, note, from_location, to_location').limit(1)
      .then(function (res) { tcFieldsProbed = true; tcFieldsKnown = !res.error; if (done) done(tcFieldsKnown); })
      .catch(function () { tcFieldsProbed = true; tcFieldsKnown = false; if (done) done(false); });
  }

  function tcMetaLoad(client) {
    if (tcMetaLoaded || !client) return;
    tcMetaLoaded = true;
    tcProbeFields(client, function () { if (tcCardRows) renderTimeCards(); });
    /* PAYROLL_SPLIT_2026_11_03: profiles are asked for role and
     * pay_rate too, so each time card can show the associate's rate
     * and week pay (the Payroll panel is where pay lives now). Same
     * graceful fallback shape as the Financials profile load: if a
     * column is not there yet, the ask narrows instead of failing,
     * and the card simply renders without a rate line. */
    client.from('employee_profiles').select('id, name, role, pay_rate').order('name', { ascending: true }).limit(200)
      .then(function (res) {
        if (!res.error) { tcProfiles = res.data || []; if (tcCardRows) renderTimeCards(); return; }
        return client.from('employee_profiles').select('id, name, role').order('name', { ascending: true }).limit(200)
          .then(function (res2) {
            if (!res2.error) { tcProfiles = res2.data || []; if (tcCardRows) renderTimeCards(); return; }
            return client.from('employee_profiles').select('id, name').order('name', { ascending: true }).limit(200)
              .then(function (res3) { if (!res3.error) { tcProfiles = res3.data || []; if (tcCardRows) renderTimeCards(); } })
              .catch(function () {});
          })
          .catch(function () {});
      })
      .catch(function () {});
    client.from('time_card_approvals').select('employee_id, week_start, approved_by, approved_at').limit(500)
      .then(function (res) {
        if (res.error) { tcApprovalsKnown = false; return; }
        tcApprovalsKnown = true;
        tcApprovals = {};
        (res.data || []).forEach(function (a) { tcApprovals[a.employee_id + '|' + String(a.week_start).slice(0, 10)] = a; });
        if (tcCardRows) renderTimeCards();
      })
      .catch(function () { tcApprovalsKnown = false; });
  }

  function tcPad2(n) { return ('0' + n).slice(-2); }
  function tcDateStr(d) { return d.getFullYear() + '-' + tcPad2(d.getMonth() + 1) + '-' + tcPad2(d.getDate()); }
  function tcTimeStr(d) { return tcPad2(d.getHours()) + ':' + tcPad2(d.getMinutes()); }
  function tcParseLocal(ds, ts) {
    var dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ds || ''), tm = /^(\d{2}):(\d{2})$/.exec(ts || '');
    if (!dm || !tm) return null;
    return new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2]));
  }
  function tcProfileName(id) {
    for (var i = 0; i < tcProfiles.length; i++) if (tcProfiles[i].id === id) return tcProfiles[i].name || 'Associate';
    if (id === (state.user && state.user.id)) return (state.profile && state.profile.name) || 'Associate';
    return 'Associate';
  }
  /* PAYROLL_SPLIT_2026_11_03: the whole profile row (role, pay_rate)
   * for a time-card group — renderTimeCards prices the card from it. */
  function tcProfileById(id) {
    if (!id) return null;
    for (var i = 0; i < tcProfiles.length; i++) if (tcProfiles[i].id === id) return tcProfiles[i];
    return null;
  }
  function tcReloadCards() {
    assocTimeCache = {};
    tcEditId = null;
    if (tcClientRef) loadTimeCards(tcClientRef);
  }

  function tcTypeFieldsHtml(prefix, type, miles, note) {
    if (!tcFieldsKnown) return '';
    return '<label>Type <select id="' + prefix + '-type"><option value="work"' + (type === 'driving' ? '' : ' selected') + '>Work</option><option value="driving"' + (type === 'driving' ? ' selected' : '') + '>Driving</option></select></label>' +
      '<label>Miles (driving) <input type="number" id="' + prefix + '-miles" min="0" step="0.1" inputmode="decimal" value="' + (miles != null && miles !== '' ? esc(String(Number(miles))) : '') + '"></label>' +
      '<label>Note <input type="text" id="' + prefix + '-note" value="' + esc(note || '') + '"></label>';
  }

  function tcOwnerBarHtml() {
    if (!isPortalOwner()) return '';
    var people = tcProfiles.length ? tcProfiles : [];
    if (!people.length && tcCardRows) {
      var seen = {};
      tcCardRows.forEach(function (r) { if (r.employee_id && !seen[r.employee_id]) { seen[r.employee_id] = 1; people.push({ id: r.employee_id, name: r.employee_name || 'Associate' }); } });
    }
    var opts = people.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name || 'Associate') + '</option>'; }).join('');
    var today = tcDateStr(new Date());
    return '<div class="tc-owner-bar"><p class="assoc-owner-head"><i class="fas fa-lock"></i> Owner — add a time entry</p>' +
      '<div class="tc-manual-grid">' +
      '<label>Associate <select id="tc-add-emp">' + opts + '</select></label>' +
      '<label>Date in <input type="date" id="tc-add-indate" value="' + today + '"></label>' +
      '<label>Time in <input type="time" id="tc-add-intime"></label>' +
      '<label>Date out <input type="date" id="tc-add-outdate" value="' + today + '"></label>' +
      '<label>Time out <input type="time" id="tc-add-outtime"></label>' +
      tcTypeFieldsHtml('tc-add', 'work', '', '') +
      '<button class="portal-btn portal-btn-primary portal-btn-sm" type="button" data-tc-add="1">Add entry</button>' +
      '</div>' +
      (tcFieldsKnown ? '' : '<p class="portal-muted portal-small">Times only for now — entry type, miles and notes turn on when the staged time-entries update runs.</p>') +
      '<p class="portal-muted portal-small">Approving a week: step to the completed Mon–Sun week on an associate&rsquo;s card and tap Approve week — you do this on Tuesdays, for Friday pay.</p>' +
      (tcManualMsg ? '<p class="portal-small tc-manual-msg">' + esc(tcManualMsg) + '</p>' : '') +
      '</div>';
  }

  function tcEditFormHtml(r) {
    var ci = new Date(r.clock_in), co = r.clock_out ? new Date(r.clock_out) : null;
    return '<div class="tc-row"><form class="tc-edit-form" data-tc-editform="' + esc(r.id) + '">' +
      '<div class="tc-manual-grid">' +
      '<label>Date in <input type="date" data-f="indate" value="' + tcDateStr(ci) + '"></label>' +
      '<label>Time in <input type="time" data-f="intime" value="' + tcTimeStr(ci) + '"></label>' +
      '<label>Date out <input type="date" data-f="outdate" value="' + (co ? tcDateStr(co) : '') + '"></label>' +
      '<label>Time out <input type="time" data-f="outtime" value="' + (co ? tcTimeStr(co) : '') + '"></label>' +
      (tcFieldsKnown ? '<label>Type <select data-f="type"><option value="work"' + (r.entry_type === 'driving' ? '' : ' selected') + '>Work</option><option value="driving"' + (r.entry_type === 'driving' ? ' selected' : '') + '>Driving</option></select></label>' +
        '<label>Miles (driving) <input type="number" data-f="miles" min="0" step="0.1" inputmode="decimal" value="' + (r.miles != null && r.miles !== '' ? esc(String(Number(r.miles))) : '') + '"></label>' +
        '<label>Note <input type="text" data-f="note" value="' + esc(r.note || '') + '"></label>' : '') +
      '<button class="portal-btn portal-btn-primary portal-btn-sm" type="button" data-tc-save="' + esc(r.id) + '">Save</button>' +
      '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-tc-cancel="1">Cancel</button>' +
      '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-tc-del="' + esc(r.id) + '">Delete entry</button>' +
      '</div>' +
      '<p class="portal-muted portal-small">Leave the out fields empty to keep the shift open. Shortening a shift is just this edit with an earlier out time.</p>' +
      '</form></div>';
  }

  function tcWeekApprovalHtml(g) {
    if (!g.id || !tcApprovalsKnown) return '';
    var wk = finWeekKey(tcWeekStart());
    var a = tcApprovals[g.id + '|' + wk];
    if (a) {
      var who = a.approved_by ? tcProfileName(a.approved_by) : 'the owner';
      var when = a.approved_at ? new Date(a.approved_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
      return '<div class="tc-approval"><span class="tc-badge">Week approved</span><span class="portal-muted portal-small">by ' + esc(who) + (when ? ' &middot; ' + esc(when) : '') + ' — ready for Friday pay</span>' +
        (isPortalOwner() ? '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-tc-unapprove-week="' + esc(g.id) + '">Undo approval</button>' : '') + '</div>';
    }
    if (isPortalOwner()) {
      return '<div class="tc-approval"><button class="portal-btn portal-btn-primary portal-btn-sm" type="button" data-tc-approve-week="' + esc(g.id) + '">Approve week</button><span class="portal-muted portal-small">Approving is for the completed Mon–Sun week — Tuesdays, for Friday pay.</span></div>';
    }
    return '<div class="tc-approval"><span class="tc-badge tc-badge-pending">Week not yet approved</span></div>';
  }

  function tcReadTimes(scope, indateId, intimeId, outdateId, outtimeId) {
    var gi = function (id) { var el = scope.querySelector('#' + id); return el ? el.value : ''; };
    var inD = tcParseLocal(gi(indateId), gi(intimeId));
    var outDs = gi(outdateId), outTs = gi(outtimeId);
    var outD = null;
    if (outDs || outTs) {
      outD = tcParseLocal(outDs, outTs);
      if (!outD) return { error: 'The out date and time need both halves.' };
    }
    if (!inD) return { error: 'The in date and time need both halves.' };
    if (outD && outD <= inD) return { error: 'Clock-out has to be after clock-in.' };
    return { inD: inD, outD: outD };
  }

  function tcAddEntry() {
    if (!tcClientRef) return;
    var wrap = $('tc-cards'); if (!wrap) return;
    var empEl = wrap.querySelector('#tc-add-emp');
    var empId = empEl ? empEl.value : '';
    if (!empId) { tcManualMsg = 'Pick an associate first.'; renderTimeCards(); return; }
    var times = tcReadTimes(wrap, 'tc-add-indate', 'tc-add-intime', 'tc-add-outdate', 'tc-add-outtime');
    if (times.error) { tcManualMsg = times.error; renderTimeCards(); return; }
    var row = {
      employee_id: empId, employee_name: tcProfileName(empId),
      clock_in: times.inD.toISOString(), clock_out: times.outD ? times.outD.toISOString() : null
    };
    if (tcFieldsKnown) {
      var typeEl = wrap.querySelector('#tc-add-type');
      var type = typeEl ? typeEl.value : 'work';
      row.entry_type = type;
      var milesEl = wrap.querySelector('#tc-add-miles');
      var noteEl = wrap.querySelector('#tc-add-note');
      row.miles = type === 'driving' && milesEl && milesEl.value !== '' ? parseFloat(milesEl.value) : null;
      row.note = noteEl && trim(noteEl.value) ? trim(noteEl.value) : null;
    }
    tcClientRef.from('time_entries').insert(row).then(function (res) {
      if (res.error) { tcManualMsg = 'Could not add that entry. Try again.'; renderTimeCards(); return; }
      tcManualMsg = 'Entry added for ' + tcProfileName(empId) + '.';
      tcReloadCards();
    }).catch(function () { tcManualMsg = 'Could not add that entry. Try again.'; renderTimeCards(); });
  }

  function tcSaveEdit(id) {
    if (!tcClientRef) return;
    var form = document.querySelector('[data-tc-editform="' + id + '"]');
    if (!form) return;
    var q = function (f) { var el = form.querySelector('[data-f="' + f + '"]'); return el ? el.value : ''; };
    var inD = tcParseLocal(q('indate'), q('intime'));
    var outD = null;
    if (q('outdate') || q('outtime')) {
      outD = tcParseLocal(q('outdate'), q('outtime'));
      if (!outD) { tcManualMsg = 'The out date and time need both halves.'; renderTimeCards(); return; }
    }
    if (!inD) { tcManualMsg = 'The in date and time need both halves.'; renderTimeCards(); return; }
    if (outD && outD <= inD) { tcManualMsg = 'Clock-out has to be after clock-in.'; renderTimeCards(); return; }
    var upd = { clock_in: inD.toISOString(), clock_out: outD ? outD.toISOString() : null };
    if (tcFieldsKnown) {
      var type = q('type') || 'work';
      upd.entry_type = type;
      upd.miles = type === 'driving' && q('miles') !== '' ? parseFloat(q('miles')) : null;
      upd.note = trim(q('note')) || null;
    }
    tcClientRef.from('time_entries').update(upd).eq('id', id).then(function (res) {
      if (res.error) { tcManualMsg = 'Could not save that edit. Try again.'; renderTimeCards(); return; }
      tcManualMsg = 'Entry updated.';
      tcReloadCards();
    }).catch(function () { tcManualMsg = 'Could not save that edit. Try again.'; renderTimeCards(); });
  }

  function tcDeleteEntry(id) {
    if (!tcClientRef) return;
    tcClientRef.from('time_entries').delete().eq('id', id).then(function (res) {
      if (res.error) { tcManualMsg = 'Could not delete that entry. Try again.'; renderTimeCards(); return; }
      tcManualMsg = 'Entry deleted.';
      tcReloadCards();
    }).catch(function () { tcManualMsg = 'Could not delete that entry. Try again.'; renderTimeCards(); });
  }

  function tcApproveWeek(empId) {
    if (!tcClientRef || !state.user) return;
    var wk = finWeekKey(tcWeekStart());
    tcClientRef.from('time_card_approvals').insert({ employee_id: empId, week_start: wk, approved_by: state.user.id })
      .then(function (res) {
        if (res.error) { tcManualMsg = 'Could not approve that week — the approvals table may not be set up yet.'; renderTimeCards(); return; }
        tcApprovals[empId + '|' + wk] = { employee_id: empId, week_start: wk, approved_by: state.user.id, approved_at: new Date().toISOString() };
        tcManualMsg = 'Week approved for ' + tcProfileName(empId) + ' — ready for Friday pay.';
        renderTimeCards();
      })
      .catch(function () { tcManualMsg = 'Could not approve that week. Try again.'; renderTimeCards(); });
  }

  function tcUnapproveWeek(empId) {
    if (!tcClientRef) return;
    var wk = finWeekKey(tcWeekStart());
    tcClientRef.from('time_card_approvals').delete().eq('employee_id', empId).eq('week_start', wk)
      .then(function (res) {
        if (res.error) { tcManualMsg = 'Could not undo that approval. Try again.'; renderTimeCards(); return; }
        delete tcApprovals[empId + '|' + wk];
        tcManualMsg = 'Approval undone for ' + tcProfileName(empId) + '.';
        renderTimeCards();
      })
      .catch(function () { tcManualMsg = 'Could not undo that approval. Try again.'; renderTimeCards(); });
  }

  function wireTcManual(wrap) {
    if (!wrap) return;
    wrap.querySelectorAll('[data-tc-edit]').forEach(function (b) {
      b.addEventListener('click', function () { tcEditId = b.getAttribute('data-tc-edit'); renderTimeCards(); });
    });
    wrap.querySelectorAll('[data-tc-cancel]').forEach(function (b) {
      b.addEventListener('click', function () { tcEditId = null; renderTimeCards(); });
    });
    wrap.querySelectorAll('[data-tc-save]').forEach(function (b) {
      b.addEventListener('click', function () { tcSaveEdit(b.getAttribute('data-tc-save')); });
    });
    wrap.querySelectorAll('[data-tc-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.getAttribute('data-confirm') !== '1') {
          b.setAttribute('data-confirm', '1');
          b.textContent = 'Confirm — delete this entry?';
          return;
        }
        tcDeleteEntry(b.getAttribute('data-tc-del'));
      });
    });
    wrap.querySelectorAll('[data-tc-add]').forEach(function (b) {
      b.addEventListener('click', function () { tcAddEntry(); });
    });
    wrap.querySelectorAll('[data-tc-approve-week]').forEach(function (b) {
      b.addEventListener('click', function () { tcApproveWeek(b.getAttribute('data-tc-approve-week')); });
    });
    wrap.querySelectorAll('[data-tc-unapprove-week]').forEach(function (b) {
      b.addEventListener('click', function () { tcUnapproveWeek(b.getAttribute('data-tc-unapprove-week')); });
    });
  }
  /* end PORTAL_TIMECARDS_2026_11_02 */

  /* ================= PORTAL_MILEAGE_2026_11_02 =================
   * (Austin, Nov 2, 2026): the Mileage panel — "the biggest thing
   * we have not put in there". Technicians log trips; road miles
   * and drive time are calculated automatically; a saved trip files
   * a Driving time entry that shows on the tech's time card and
   * pays mileage in Financials (Parts 1/5 rules live there — this
   * panel only creates the entries).
   *
   * ROUTING — the free OpenStreetMap stack, behind ONE function:
   * computeRouteMiles(from, to, done) is the only place that knows
   * about the providers. Geocoding is Nominatim (results cached in
   * memory for the session; calls serialized at ~1/second per its
   * usage policy) and routing is the public OSRM service — no API
   * key, fine at this shop's human scale. A keyed provider
   * (OpenRouteService, Google Distance Matrix) can replace the
   * internals of nominatimGeocode / osrmRoute later without the UI
   * or the data model ever knowing. If an address cannot be found
   * or routing fails, the tech types the miles by hand and the trip
   * still saves — the failure text says exactly that.
   *
   * TRIP MODEL: trips normally run from the tech's house to the
   * store or a customer's address, so both endpoints are usually
   * known: the From pre-fills with the tech's home address (a field
   * on their employee profile — they can set their own here on the
   * Time Clock panel; the owner can set anyone's from the roster),
   * and the To quick-pick offers the store (the geofence base
   * address) and every open ticket's service address. Free text
   * always works too. A saved trip's duration becomes the entry's
   * clock_out minus clock_in (start time + route minutes), so the
   * "hours" on the card adjust through the normal entry editor.
   * The Return trip button on a saved trip files the reverse leg
   * with miles recomputed (falling back to the original miles if
   * routing fails).
   *
   * DATA MODEL: a trip IS a time_entries row (entry_type 'driving',
   * miles, from/to + coordinates) — no separate trips table — so
   * time cards, manual editing, approvals and payroll all see it
   * with zero extra plumbing. The columns arrive with
   * time-entries-fields.sql; until then the panel says so and the
   * form waits. */

  /* ---------- profile pictures (AVATARS_2026_11_03) ---------- */
  var assocAvatarById = {};
  var assocAvatarKnown = false;

  /* Independent column probe, the loadAssocHome rule: if the
   * avatar_url column is not live yet the select errors, the
   * pictures quietly stay initials discs, and the roster load is
   * never disturbed. The summaries wear pictures, so a landed
   * probe re-renders even with no card open. */
  function loadAssocAvatars(client) {
    client.from('employee_profiles').select('id, avatar_url').limit(200)
      .then(function (res) {
        if (res.error) { assocAvatarKnown = false; return; }
        assocAvatarKnown = true;
        assocAvatarById = {};
        (res.data || []).forEach(function (r) { assocAvatarById[r.id] = r.avatar_url || ''; });
        renderAssociates();
      })
      .catch(function () { assocAvatarKnown = false; });
  }

  /* Owner moderation, the one clean rule: clearing avatar_url
   * hides the picture everywhere at once (Associate Accounts
   * cards, Team Chat, the customer's "Your technician" view).
   * The stored file itself is NOT deleted — the storage policy
   * reserves file writes and deletes to the picture's owner, so
   * the file simply sits unreferenced in the bucket until the
   * person uploads a new one (their next upload overwrites the
   * same file name and re-points the field at it). */
  function removeAssocAvatar(id) {
    var msg = document.querySelector('[data-assoc-avatar-msg="' + id + '"]');
    if (msg) msg.textContent = 'Removing…';
    withClient(function (client) {
      if (!client) { if (msg) msg.textContent = 'Could not remove it. Try again.'; return; }
      client.from('employee_profiles').update({ avatar_url: null }).eq('id', id).select('id')
        .then(function (res) {
          /* .select() asks for the written row back: under RLS a
           * refused update returns success with zero rows, and
           * that must read as failure, not "Removed." */
          if (res.error || !res.data || !res.data.length) { if (msg) msg.textContent = 'Could not remove it. Try again.'; return; }
          assocAvatarById[id] = '';
          var dp = teamChatDirPerson(id);
          if (dp) dp.avatar_url = '';
          renderAssociates();
        })
        .catch(function () { if (msg) msg.textContent = 'Could not remove it. Try again.'; });
    });
  }

  /* ---------- home addresses (profile field) ---------- */
  var assocHomeById = {};
  var assocHomeKnown = false;
  var ownHomeAddress = '';

  function loadAssocHome(client) {
    client.from('employee_profiles').select('id, home_address').limit(200)
      .then(function (res) {
        if (res.error) { assocHomeKnown = false; return; }
        assocHomeKnown = true;
        assocHomeById = {};
        (res.data || []).forEach(function (r) { assocHomeById[r.id] = r.home_address || ''; });
        if (assocExpandedId) renderAssociates();
      })
      .catch(function () { assocHomeKnown = false; });
  }

  /* Owner-only, mirrors saveAssocPay exactly: writes the profile
   * row's home_address (empty box clears it); any refusal lands in
   * the message line instead of failing silently. */
  function saveAssocHome(id) {
    var input = document.querySelector('[data-assoc-home-input="' + id + '"]');
    var msg = document.querySelector('[data-assoc-home-msg="' + id + '"]');
    if (!input) return;
    var val = trim(input.value);
    if (msg) msg.textContent = 'Saving&hellip;';
    withClient(function (client) {
      if (!client) { if (msg) msg.textContent = 'Could not save. Try again.'; return; }
      /* PAYRATE_FIX_2026_11_03: same land-or-fail guard as
       * saveAssocPay — a blocked update returns zero rows, which
       * must not read as "Saved." or touch the cached address. */
      client.from('employee_profiles').update({ home_address: val || null }).eq('id', id).select('id, home_address')
        .then(function (res) {
          if (res.error || !res.data || !res.data.length) { if (msg) msg.textContent = 'Could not save that address.'; return; }
          val = res.data[0].home_address || '';
          assocHomeById[id] = val;
          if (msg) msg.textContent = 'Saved.';
          try { geoEnsureHomeFence(client, id, val, tcProfileName(id)); } catch (e) {}
          setTimeout(function () { if (assocExpandedId === id) renderAssociates(); }, 900);
        })
        .catch(function () { if (msg) msg.textContent = 'Could not save. Try again.'; });
    });
  }

  function loadOwnHome(client) {
    if (!state.user) return;
    client.from('employee_profiles').select('home_address').eq('id', state.user.id).maybeSingle()
      .then(function (res) {
        if (res.error || !res.data) return;
        ownHomeAddress = res.data.home_address || '';
        var wrap = $('tc-home-wrap'), input = $('tc-home-address');
        if (wrap) wrap.hidden = false;
        if (input) input.value = ownHomeAddress;
      })
      .catch(function () {});
  }

  function saveOwnHome() {
    var input = $('tc-home-address'), msg = $('tc-home-msg');
    if (!input || !state.user) return;
    var val = trim(input.value);
    if (msg) msg.textContent = 'Saving&hellip;';
    withClient(function (client) {
      if (!client) { if (msg) msg.textContent = 'Could not save. Try again.'; return; }
      /* PAYRATE_FIX_2026_11_03: same land-or-fail guard as
       * saveAssocPay — zero rows back means the address did not
       * persist; do not update ownHomeAddress off a phantom save. */
      client.from('employee_profiles').update({ home_address: val || null }).eq('id', state.user.id).select('id, home_address')
        .then(function (res) {
          if (res.error || !res.data || !res.data.length) { if (msg) msg.textContent = 'Could not save that address.'; return; }
          val = res.data[0].home_address || '';
          ownHomeAddress = val;
          if (msg) msg.textContent = 'Saved.';
          try { geoEnsureHomeFence(client, state.user.id, val, (state.profile && state.profile.name) || ''); } catch (e) {}
        })
        .catch(function () { if (msg) msg.textContent = 'Could not save. Try again.'; });
    });
  }

  /* ---------- routing (the swap point) ---------- */
  var geoCache = {};
  var geoChain = Promise.resolve();
  var geoLastHit = 0;
  function geoThrottled(fn) {
    var run = geoChain.then(function () {
      var wait = Math.max(0, 1100 - (Date.now() - geoLastHit));
      return new Promise(function (res) { setTimeout(res, wait); });
    }).then(function () { geoLastHit = Date.now(); return fn(); });
    geoChain = run.then(function () {}, function () {});
    return run;
  }
  function nominatimGeocode(text) {
    var key = 'g:' + trim(text).toLowerCase();
    if (!trim(text)) return Promise.resolve(null);
    if (geoCache[key]) return Promise.resolve(geoCache[key]);
    return geoThrottled(function () {
      return fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=' + encodeURIComponent(trim(text)), { headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (rows) {
          var out = null;
          if (rows && rows.length) out = { lat: parseFloat(rows[0].lat), lng: parseFloat(rows[0].lon), label: rows[0].display_name };
          if (out) geoCache[key] = out;
          return out;
        })
        .catch(function () { return null; });
    });
  }
  function nominatimReverse(lat, lng) {
    var key = 'r:' + lat.toFixed(5) + ',' + lng.toFixed(5);
    if (geoCache[key]) return Promise.resolve(geoCache[key]);
    return geoThrottled(function () {
      return fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng, { headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          var out = (j && j.display_name) ? { label: j.display_name } : null;
          if (out) geoCache[key] = out;
          return out;
        })
        .catch(function () { return null; });
    });
  }
  function osrmRoute(a, b) {
    return fetch('https://router.project-osrm.org/route/v1/driving/' + a.lng + ',' + a.lat + ';' + b.lng + ',' + b.lat + '?overview=false')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || j.code !== 'Ok' || !j.routes || !j.routes.length) return null;
        return { miles: Math.round(j.routes[0].distance / 1609.344 * 10) / 10, minutes: Math.round(j.routes[0].duration / 60) };
      })
      .catch(function () { return null; });
  }
  /* from / to: { text, lat, lng } — coordinates ride along when the
   * endpoint came from GPS or a pick, so routing can skip geocoding
   * that end entirely. done receives { miles, minutes, fromLabel,
   * toLabel, fromLat, fromLng, toLat, toLng } or { error }. */
  function computeRouteMiles(from, to, done) {
    var resFrom = (from.lat != null && from.lng != null)
      ? Promise.resolve({ lat: from.lat, lng: from.lng, label: from.text || '' })
      : nominatimGeocode(from.text);
    resFrom.then(function (a) {
      if (!a) { done({ error: 'Could not find the From address. Check it, or type the miles by hand and save — the trip still files.' }); return; }
      var resTo = (to.lat != null && to.lng != null)
        ? Promise.resolve({ lat: to.lat, lng: to.lng, label: to.text || '' })
        : nominatimGeocode(to.text);
      resTo.then(function (b) {
        if (!b) { done({ error: 'Could not find the To address. Check it, or type the miles by hand and save — the trip still files.' }); return; }
        osrmRoute(a, b).then(function (rt) {
          if (!rt) { done({ error: 'The routing service did not answer for that trip. Type the miles by hand and save — the trip still files.' }); return; }
          done({ miles: rt.miles, minutes: rt.minutes, fromLabel: a.label, toLabel: b.label, fromLat: a.lat, fromLng: a.lng, toLat: b.lat, toLng: b.lng });
        });
      });
    });
  }

  /* ---------- the panel ---------- */
  var mlClientRef = null;
  var mlProfiles = [];
  var mlHomeKnown = false;
  var mlTrips = [];
  var mlFromCoords = null;
  var mlToCoords = null;
  var mlLastDefaultFrom = '';

  function fmtRate(r) { return r >= 1 ? fmtMoney(r) : (Math.round(r * 1000) / 10) + '&cent;'; }

  function initMileage() {
    var rb = $('ml-refresh'); if (rb) rb.addEventListener('click', function () { loadMileage(); });
    var calc = $('ml-route-btn'); if (calc) calc.addEventListener('click', function () { mlCalculate(); });
    var form = $('ml-form'); if (form) form.addEventListener('submit', function (e) { e.preventDefault(); mlSaveTrip(); });
    var fg = $('ml-from-gps'); if (fg) fg.addEventListener('click', function () { geoFillFromGps('from'); });
    var tg = $('ml-to-gps'); if (tg) tg.addEventListener('click', function () { geoFillFromGps('to'); });
    var tech = $('ml-tech'); if (tech) tech.addEventListener('change', function () { mlApplyTechDefaults(); });
    var pick = $('ml-to-pick'); if (pick) pick.addEventListener('change', function () { if (pick.value) { $('ml-to').value = pick.value; mlToCoords = null; } });
    var fromEl = $('ml-from'); if (fromEl) fromEl.addEventListener('input', function () { mlFromCoords = null; });
    var toEl = $('ml-to'); if (toEl) toEl.addEventListener('input', function () { mlToCoords = null; });
  }

  function loadMileage() {
    var list = $('ml-list');
    if (list) list.innerHTML = '<p class="portal-muted">Loading trips&hellip;</p>';
    /* LOC_SETTINGS_2026_11_03: the Location tracking settings card
     * lives at the top of this panel — render it on every load so
     * its state line is never stale. */
    try { geoRenderLocSettings(); } catch (e) {}
    withClient(function (client) {
      if (!client || !state.user) return;
      mlClientRef = client;
      tcProbeFields(client, function (known) {
        var note = $('ml-setup-note');
        if (!known) {
          if (note) note.innerHTML = '<p class="portal-error">Mileage tracking turns on once the staged time-entries update runs — it adds the trip fields to time entries. The form is built and waiting.</p>';
          if (list) list.innerHTML = '';
          try { geoLoadFences(client, function () { geoRenderOwnerSections(); }); } catch (e) {}
          return;
        }
        if (note) note.innerHTML = '';
        mlLoadProfiles(client, function () {
          mlPopulateTech();
          mlPopulatePicks(client);
          mlLoadTrips(client);
          try { geoLoadFences(client, function () { geoSyncTicketFences(client); geoSyncHomeFences(client); geoRenderOwnerSections(); }); } catch (e) {}
        });
      });
    });
  }

  function mlLoadProfiles(client, done) {
    client.from('employee_profiles').select('id, name, role, home_address').order('name', { ascending: true }).limit(200)
      .then(function (res) {
        if (res.error) {
          return client.from('employee_profiles').select('id, name, role').order('name', { ascending: true }).limit(200)
            .then(function (res2) { mlProfiles = res2.error ? [] : (res2.data || []); mlHomeKnown = false; done(); })
            .catch(function () { mlProfiles = []; done(); });
        }
        mlProfiles = res.data || [];
        mlHomeKnown = true;
        done();
      })
      .catch(function () { mlProfiles = []; done(); });
  }

  function mlProfileById(id) {
    for (var i = 0; i < mlProfiles.length; i++) if (mlProfiles[i].id === id) return mlProfiles[i];
    return null;
  }

  function mlPopulateTech() {
    var sel = $('ml-tech'); if (!sel) return;
    var owner = isPortalOwner();
    var people = owner ? mlProfiles : mlProfiles.filter(function (p) { return p.id === state.user.id; });
    if (!people.length && !owner) people = [{ id: state.user.id, name: (state.profile && state.profile.name) || 'Me' }];
    sel.innerHTML = people.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === state.user.id ? ' selected' : '') + '>' + esc(p.name || 'Associate') + '</option>'; }).join('');
    if (!owner) sel.disabled = true;
    var d = $('ml-date'); if (d && !d.value) d.value = tcDateStr(new Date());
    var s = $('ml-start'); if (s && !s.value) s.value = tcTimeStr(new Date());
    mlApplyTechDefaults();
  }

  function mlApplyTechDefaults() {
    var sel = $('ml-tech'); if (!sel) return;
    var p = mlProfileById(sel.value);
    var home = '';
    if (p) home = (mlHomeKnown && p.home_address) || (p.id === state.user.id ? ownHomeAddress : '') || '';
    var fromEl = $('ml-from');
    if (fromEl && (fromEl.value === '' || fromEl.value === mlLastDefaultFrom)) {
      fromEl.value = home;
      mlLastDefaultFrom = home;
      mlFromCoords = null;
    }
  }

  function mlPopulatePicks(client) {
    var pick = $('ml-to-pick'); if (!pick) return;
    var html = '<option value="">Home base, or a job address&hellip;</option>';
    if (geoBaseFence && geoBaseFence.address) {
      html += '<option value="' + esc(geoBaseFence.address) + '">Home base — ' + esc(geoBaseFence.address) + '</option>';
    }
    pick.innerHTML = html;
    client.from('tickets').select('id, status, service_address').limit(200)
      .then(function (res) {
        if (res.error) return;
        var opts = '';
        (res.data || []).forEach(function (t) {
          if (!trim(t.service_address) || t.status === 'Job Complete') return;
          opts += '<option value="' + esc(t.service_address) + '">Job — ' + esc(t.service_address) + ' (' + esc(t.status || '') + ')</option>';
        });
        pick.innerHTML = html + opts;
      })
      .catch(function () {});
  }

  function mlEndpoints() {
    return {
      from: { text: trim($('ml-from').value), lat: mlFromCoords ? mlFromCoords.lat : null, lng: mlFromCoords ? mlFromCoords.lng : null },
      to: { text: trim($('ml-to').value), lat: mlToCoords ? mlToCoords.lat : null, lng: mlToCoords ? mlToCoords.lng : null }
    };
  }

  function mlCalculate() {
    var info = $('ml-route-info');
    var ep = mlEndpoints();
    if (!ep.from.text || !ep.to.text) { if (info) info.textContent = 'Fill in From and To first.'; return; }
    if (info) info.textContent = 'Working out the route&hellip;';
    computeRouteMiles(ep.from, ep.to, function (res) {
      if (res.error) { if (info) info.textContent = res.error; return; }
      $('ml-miles').value = res.miles;
      $('ml-minutes').value = res.minutes;
      mlFromCoords = { lat: res.fromLat, lng: res.fromLng };
      mlToCoords = { lat: res.toLat, lng: res.toLng };
      if (info) info.textContent = 'Route: ' + res.miles + ' mi · about ' + res.minutes + ' min of driving (OpenStreetMap). Adjust either number if your odometer disagrees.';
    });
  }

  function mlSaveTrip() {
    if (!mlClientRef || !state.user) return;
    var msg = $('ml-msg'), info = $('ml-route-info');
    var empId = $('ml-tech').value;
    var prof = mlProfileById(empId);
    var name = prof ? (prof.name || 'Associate') : ((state.profile && state.profile.name) || 'Associate');
    var ep = mlEndpoints();
    var startD = tcParseLocal($('ml-date').value, $('ml-start').value || tcTimeStr(new Date()));
    if (!empId) { if (msg) msg.textContent = 'Pick the technician first.'; return; }
    if (!startD) { if (msg) msg.textContent = 'The date and start time need both halves.'; return; }
    if (!ep.from.text || !ep.to.text) { if (msg) msg.textContent = 'Fill in From and To.'; return; }
    var milesV = $('ml-miles').value, minV = $('ml-minutes').value;
    function doInsert(miles, minutes, coords) {
      var row = {
        employee_id: empId, employee_name: name,
        clock_in: startD.toISOString(),
        clock_out: new Date(startD.getTime() + (minutes || 0) * 60000).toISOString(),
        entry_type: 'driving', miles: miles,
        from_location: ep.from.text, to_location: ep.to.text,
        from_lat: coords && coords.fromLat != null ? coords.fromLat : (mlFromCoords ? mlFromCoords.lat : null),
        from_lng: coords && coords.fromLng != null ? coords.fromLng : (mlFromCoords ? mlFromCoords.lng : null),
        to_lat: coords && coords.toLat != null ? coords.toLat : (mlToCoords ? mlToCoords.lat : null),
        to_lng: coords && coords.toLng != null ? coords.toLng : (mlToCoords ? mlToCoords.lng : null)
      };
      mlClientRef.from('time_entries').insert(row).then(function (res) {
        if (res.error) { if (msg) msg.textContent = 'Could not save that trip. Try again.'; return; }
        if (msg) msg.textContent = 'Trip saved — it is on ' + (empId === state.user.id ? 'your' : name + "'s") + ' time card as a Driving entry.';
        $('ml-miles').value = ''; $('ml-minutes').value = '';
        if (info) info.textContent = '';
        try { geoCapture('trip_end'); } catch (e) {}
        mlLoadTrips(mlClientRef);
      }).catch(function () { if (msg) msg.textContent = 'Could not save that trip. Try again.'; });
    }
    if (milesV !== '' && minV !== '') { doInsert(parseFloat(milesV), parseInt(minV, 10), null); return; }
    if (msg) msg.textContent = 'Working out the route&hellip;';
    computeRouteMiles(ep.from, ep.to, function (res) {
      if (res.error) { if (info) info.textContent = res.error; if (msg) msg.textContent = ''; return; }
      if (msg) msg.textContent = '';
      doInsert(milesV !== '' ? parseFloat(milesV) : res.miles, minV !== '' ? parseInt(minV, 10) : res.minutes, res);
    });
  }

  function mlLoadTrips(client) {
    var q = client.from('time_entries').select('*').eq('entry_type', 'driving').order('clock_in', { ascending: false }).limit(300);
    if (!isManager()) q = q.eq('employee_id', state.user.id);
    q.then(function (res) {
      mlTrips = res.error ? [] : (res.data || []);
      mlRenderTrips();
    }).catch(function () { mlTrips = []; mlRenderTrips(); });
  }

  function mlRenderTrips() {
    var wrap = $('ml-list'); if (!wrap) return;
    var ws = weekStart(), we = new Date(ws); we.setDate(we.getDate() + 7);
    var inWeek = mlTrips.filter(function (r) { var d = new Date(r.clock_in); return d >= ws && d < we; });
    if (!inWeek.length) { wrap.innerHTML = '<p class="portal-muted">No trips logged this pay week yet.</p>'; return; }
    var groups = [], byKey = {};
    inWeek.forEach(function (r) {
      var key = r.employee_id || r.employee_name || 'tech';
      if (!byKey[key]) { byKey[key] = { id: r.employee_id || null, name: r.employee_name || 'Associate', rows: [], miles: 0, amt: 0 }; groups.push(byKey[key]); }
      byKey[key].rows.push(r);
    });
    wrap.innerHTML = groups.map(function (g) {
      var prof = g.id ? mlProfileById(g.id) : null;
      var isOwnerRow = prof ? trim(prof.role).toLowerCase() === 'owner' : (g.id === (state.user && state.user.id) && isPortalOwner());
      var rowsHtml = g.rows.map(function (r) {
        var ci = new Date(r.clock_in), co = r.clock_out ? new Date(r.clock_out) : null;
        var durMin = co ? Math.max(0, Math.round((co - ci) / 60000)) : 0;
        var mi = Number(r.miles) || 0;
        var rate = mileageRateFor(ci);
        var amt = mi * rate.rate;
        if (!isOwnerRow) { g.miles += mi; g.amt += amt; }
        var canReturn = isPortalOwner() || r.employee_id === state.user.id;
        return '<div class="tc-row"><span>' + esc(ci.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })) + ' &middot; ' + esc(r.from_location || '?') + ' &rarr; ' + esc(r.to_location || '?') + '</span>' +
          '<span class="tc-row-end"><span>' + mi.toFixed(1) + ' mi &middot; ' + durMin + ' min' + (isOwnerRow ? ' &middot; owner — unpaid' : ' &middot; ' + esc(fmtMoney(amt)) + ' @ ' + fmtRate(rate.rate)) + '</span>' +
          (canReturn ? '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" data-ml-return="' + esc(r.id) + '">Return trip</button>' : '') + '</span></div>';
      }).join('');
      var totalLine = isOwnerRow
        ? '<span class="ml-trip-total">Week: ' + g.rows.reduce(function (s, r) { return s + (Number(r.miles) || 0); }, 0).toFixed(1) + ' mi (owner — unpaid)</span>'
        : '<span class="ml-trip-total">Week total: ' + g.miles.toFixed(1) + ' mi &middot; ' + esc(fmtMoney(g.amt)) + '</span>';
      return '<div class="tc-card"><div class="tc-card-head"><strong>' + esc(g.name) + '</strong>' + totalLine + '</div>' + rowsHtml + '</div>';
    }).join('');
    wrap.querySelectorAll('[data-ml-return]').forEach(function (b) {
      b.addEventListener('click', function () { mlReturnTrip(b.getAttribute('data-ml-return')); });
    });
  }

  function mlReturnTrip(id) {
    var t = null;
    mlTrips.forEach(function (r) { if (r.id === id) t = r; });
    if (!t || !mlClientRef) return;
    var msg = $('ml-msg');
    var ci = new Date(t.clock_in), co = t.clock_out ? new Date(t.clock_out) : null;
    var origDur = co ? Math.max(0, Math.round((co - ci) / 60000)) : 0;
    var startD = co || ci;
    function doInsert(miles, minutes) {
      var row = {
        employee_id: t.employee_id, employee_name: t.employee_name,
        clock_in: startD.toISOString(),
        clock_out: new Date(startD.getTime() + (minutes || 0) * 60000).toISOString(),
        entry_type: 'driving', miles: miles,
        from_location: t.to_location, to_location: t.from_location,
        from_lat: t.to_lat, from_lng: t.to_lng, to_lat: t.from_lat, to_lng: t.from_lng,
        note: 'Return trip'
      };
      mlClientRef.from('time_entries').insert(row).then(function (res) {
        if (res.error) { if (msg) msg.textContent = 'Could not file the return trip. Try again.'; return; }
        if (msg) msg.textContent = 'Return trip filed — ' + (Number(miles) || 0).toFixed(1) + ' mi back.';
        mlLoadTrips(mlClientRef);
      }).catch(function () { if (msg) msg.textContent = 'Could not file the return trip. Try again.'; });
    }
    computeRouteMiles(
      { text: t.to_location || '', lat: t.to_lat != null ? Number(t.to_lat) : null, lng: t.to_lng != null ? Number(t.to_lng) : null },
      { text: t.from_location || '', lat: t.from_lat != null ? Number(t.from_lat) : null, lng: t.from_lng != null ? Number(t.from_lng) : null },
      function (res) {
        if (res.error) { doInsert(Number(t.miles) || 0, origDur); return; }
        doInsert(res.miles, res.minutes);
      });
  }
  /* end PORTAL_MILEAGE_2026_11_02 */

  /* ================= PORTAL_LOCATION_2026_11_02 =================
   * (Austin, Nov 2, 2026, as corrected the same night — "No, we're
   * just using geofencing"): place-based automation, NOT device
   * tracking. There is no continuous track, no background capture,
   * and no silent anything:
   *
   * CONSENT: on a tech's first login (and any login where the
   * answer is still unrecorded) the portal asks in its own words —
   * "Allow location tracking" — and only then triggers the
   * browser's Geolocation prompt. The answer (granted / denied /
   * not_asked) is stored on the tech's employee_profiles row
   * (location-geofence.sql). Denied means the feature stays off and
   * nobody is asked again in the app.
   *
   * CAPTURES: with permission granted, a location snapshot is saved
   * only at named work events — login, clock in, clock out, mileage
   * trip start/end — plus a lightweight position watch runs WHILE
   * THE PORTAL IS OPEN so fence crossings are noticed. Snapshots
   * are work records (location_snapshots), each tied to its event.
   *
   * FENCES: a ~150 m circle (owner-adjustable) around the store /
   * business base (set once by the owner), one around each tech's
   * home, and one auto-created around the service address of any
   * ticket that goes En Route to Customer. Each device evaluates
   * only its own fence set (base + ticket fences + its OWN home
   * fence). The first position after sign-in sets the baseline —
   * crossings after that log one fence_events row (enter/exit,
   * timestamp, position) and drive the paperwork offers:
   *   leaving base/home  → offer to start a Driving entry
   *   entering a job fence → the open Driving entry is ended and
   *                        its miles computed by routing between
   *                        the entry's endpoints; an offer (never
   *                        silent) to flip the ticket In Progress —
   *                        arrival means In Progress in this portal,
   *                        and the fence asks for the same tap the
   *                        tech would make by hand
   *   leaving a job fence → offer to start the return trip
   * Offers render in the prompt strip above the panels and always
   * wait for a tap.
   *
   * OWNER VIEW: the Mileage panel carries the fence setup, who is
   * inside each fence now, and the arrivals/departures feed. There
   * is deliberately NO "last known location" map — the correction
   * dropped it; the feed shows fence events only.
   *
   * Until location-geofence.sql runs, every read/write here fails
   * quietly and the whole feature stays dark — no prompts, no
   * captures, no errors on screen.
   *
   * LOC_SETTINGS_2026_11_03 (Austin, Nov 3, 2026): the consent
   * banner is retired. It popped up at sign-in whenever the answer
   * was still 'not_asked' and shoved the whole layout down, so the
   * first-login ask described above no longer happens: 'not_asked'
   * simply means captures stay off. The tracking choice is now a
   * normal setting at the top of the Mileage panel
   * (geoRenderLocSettings), saving through the same geoSetConsent
   * write. Also: there is no store — the base fence is the HOME
   * BASE. Visible language changed only (kind 'base', the stored
   * schema, and the consent values are untouched), and the fence
   * form pre-fills from the signed-in profile's home address when
   * no base fence exists yet. */
  var geoClientRef = null;
  var geoConsentKnown = false;
  var geoConsentState = null;
  var geoFences = [];
  var geoFencesKnown = false;
  var geoBaseFence = null;
  var geoInside = {};
  var geoWatchId = null;
  var geoLastEvalPos = null;
  var geoLastEvalAt = 0;

  function geoInitAfterLogin() {
    if (!state.user) return;
    withClient(function (client) {
      if (!client) return;
      geoClientRef = client;
      client.from('employee_profiles').select('location_consent').eq('id', state.user.id).maybeSingle()
        .then(function (res) {
          if (res.error || !res.data) { geoConsentKnown = false; return; }
          geoConsentKnown = true;
          geoConsentState = res.data.location_consent || 'not_asked';
          geoLoadFences(client, function () { geoSyncTicketFences(client); geoSyncHomeFences(client); });
          /* LOC_SETTINGS_2026_11_03: no banner at login anymore —
           * 'not_asked' just leaves captures off until the tech
           * turns tracking on in the Mileage panel setting. */
          if (geoConsentState === 'granted') { geoCapture('login'); geoStartWatch(); }
          try { geoRenderLocSettings(); } catch (e) {}
        })
        .catch(function () { geoConsentKnown = false; });
    });
  }

  /* LOC_SETTINGS_2026_11_03: geoShowConsentBanner() is removed and
   * nothing calls it — the pop-up consent banner is retired for
   * good. The #portal-loc-banner element stays in the markup,
   * permanently hidden, and geoHideBanner() below remains as the
   * harmless closer geoAllowClicked still calls. The consent
   * choice itself lives in the Mileage panel now
   * (geoRenderLocSettings, after geoSetConsent). */

  function geoHideBanner() { var b = $('portal-loc-banner'); if (b) { b.hidden = true; b.innerHTML = ''; } }

  function geoAllowClicked() {
    if (!navigator.geolocation) { geoSetConsent('denied'); geoHideBanner(); return; }
    navigator.geolocation.getCurrentPosition(function (pos) {
      geoSetConsent('granted');
      geoHideBanner();
      geoStoreSnapshot('login', pos);
      geoHandlePosition(pos.coords.latitude, pos.coords.longitude);
      geoStartWatch();
    }, function () { geoSetConsent('denied'); geoHideBanner(); }, { timeout: 10000 });
  }

  function geoSetConsent(v, done) {
    var prevConsent = geoConsentState;
    geoConsentState = v;
    if (!geoClientRef || !state.user) { if (done) done(false); return; }
    /* PAYRATE_FIX_2026_11_03: land-or-fail, adapted to this site's
     * shape. There is no message line here — the write was
     * fire-and-forget — so .select() asks for the written row back
     * and a blocked write (zero rows) rolls the local state back
     * instead of letting the portal act on a consent choice that
     * was never stored: a failed 'granted' stops the watch its
     * caller just started, and falling back to 'not_asked' brings
     * the banner back so the choice can be made again honestly. */
    geoClientRef.from('employee_profiles').update({ location_consent: v, location_consent_at: new Date().toISOString() }).eq('id', state.user.id).select('id, location_consent')
      .then(function (res) {
        if (!res.error && res.data && res.data.length) { if (done) done(true); return; }
        geoConsentState = prevConsent;
        if (v === 'granted' && geoWatchId != null && navigator.geolocation) { navigator.geolocation.clearWatch(geoWatchId); geoWatchId = null; }
        /* LOC_SETTINGS_2026_11_03: a rolled-back first choice used
         * to bring the banner back; now the Mileage settings card
         * simply re-renders with the true (unchanged) state. */
        try { geoRenderLocSettings(); } catch (e) {}
        if (done) done(false);
      })
      .catch(function () {
        geoConsentState = prevConsent;
        if (v === 'granted' && geoWatchId != null && navigator.geolocation) { navigator.geolocation.clearWatch(geoWatchId); geoWatchId = null; }
        try { geoRenderLocSettings(); } catch (e) {}
        if (done) done(false);
      });
  }

  /* ---------- LOC_SETTINGS_2026_11_03: the Mileage panel setting ----------
   * The Location tracking card at the top of the Mileage panel —
   * the consent choice as a normal setting, replacing the retired
   * sign-in banner. The state line reads the same geoConsentState
   * the banner used; the buttons save through geoSetConsent (the
   * hardened, .select()-verified write above) and the card
   * re-renders with the stored result: a saved confirmation on
   * success, an honest failure line when the write rolls back. */
  function geoRenderLocSettings(msg) {
    var wrap = $('ml-loc-settings'); if (!wrap) return;
    var st = geoConsentState;
    var stateText = st === 'granted' ? 'On' : (st === 'denied' ? 'Off' : 'Not set yet');
    wrap.innerHTML = '<div class="portal-card loc-settings-card">' +
      '<div class="portal-card-top"><p class="portal-card-title">Location tracking</p>' +
      '<span class="portal-badge ' + (st === 'granted' ? 'portal-st-ready' : 'portal-badge-role') + '">' + stateText + '</span></div>' +
      '<p class="portal-muted portal-small">With it on, the portal clocks your arrivals and departures at the home base and job sites for you — starting and ending mileage trips automatically. Location is only checked at work moments (signing in, clocking in or out, trip start and end) and only while the portal is open on your device. Never in the background, never off the clock.</p>' +
      '<div class="p2-actions">' +
      '<button class="portal-btn portal-btn-primary portal-btn-sm" type="button" id="geo-loc-on"' + (st === 'granted' ? ' disabled' : '') + '>Turn on location tracking</button>' +
      '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" id="geo-loc-off"' + (st === 'denied' ? ' disabled' : '') + '>Turn off</button>' +
      '</div>' +
      '<p class="portal-small" id="geo-loc-msg" aria-live="polite">' + (msg ? esc(msg) : '') + '</p>' +
      '</div>';
    var onBtn = $('geo-loc-on'); if (onBtn) onBtn.addEventListener('click', geoLocSettingsAllow);
    var offBtn = $('geo-loc-off'); if (offBtn) offBtn.addEventListener('click', geoLocSettingsOff);
  }

  /* "Turn on" mirrors the old banner's Allow flow (geoAllowClicked):
   * the browser's own Geolocation prompt comes first, then the
   * choice is stored — and the first snapshot plus the watch start
   * only once the store is confirmed, so the portal never acts on
   * an unsaved yes. */
  function geoLocSettingsAllow() {
    var msg = $('geo-loc-msg');
    if (!geoClientRef) { geoRenderLocSettings('Location settings are not connected yet — reopen the portal and try again.'); return; }
    if (!navigator.geolocation) {
      geoSetConsent('denied', function (ok) {
        geoRenderLocSettings(ok ? 'This device has no location available, so tracking was set to Off.' : 'That did not save — no change was stored. Try again.');
      });
      return;
    }
    if (msg) msg.textContent = 'Asking this device for its location…';
    navigator.geolocation.getCurrentPosition(function (pos) {
      geoSetConsent('granted', function (ok) {
        if (!ok) { geoRenderLocSettings('That did not save — no change was stored. Try again.'); return; }
        geoStoreSnapshot('login', pos);
        geoHandlePosition(pos.coords.latitude, pos.coords.longitude);
        geoStartWatch();
        geoRenderLocSettings('Saved — location tracking is on.');
      });
    }, function () {
      geoSetConsent('denied', function (ok) {
        geoRenderLocSettings(ok ? 'This device would not share its location, so tracking was set to Off.' : 'That did not save — no change was stored. Try again.');
      });
    }, { timeout: 10000 });
  }

  function geoLocSettingsOff() {
    if (!geoClientRef) { geoRenderLocSettings('Location settings are not connected yet — reopen the portal and try again.'); return; }
    if (geoWatchId != null && navigator.geolocation) { navigator.geolocation.clearWatch(geoWatchId); geoWatchId = null; }
    geoSetConsent('denied', function (ok) {
      if (ok) { geoRenderLocSettings('Saved — location tracking is off.'); return; }
      /* The write rolled back: if the stored choice is still
       * 'granted', the watch has to be running again to match it. */
      if (geoConsentState === 'granted') geoStartWatch();
      geoRenderLocSettings('That did not save — no change was stored. Try again.');
    });
  }

  function geoCapture(eventName) {
    if (geoConsentState !== 'granted' || !navigator.geolocation || !state.user) return;
    navigator.geolocation.getCurrentPosition(function (pos) {
      geoStoreSnapshot(eventName, pos);
      geoHandlePosition(pos.coords.latitude, pos.coords.longitude);
    }, function () {}, { timeout: 10000, maximumAge: 60000 });
  }

  function geoStoreSnapshot(eventName, pos) {
    if (!geoClientRef || !state.user || !pos || !pos.coords) return;
    geoClientRef.from('location_snapshots').insert({
      user_id: state.user.id, event: eventName,
      lat: pos.coords.latitude, lng: pos.coords.longitude,
      accuracy_m: pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null
    }).then(function () {}).catch(function () {});
  }

  function geoStartWatch() {
    if (geoWatchId != null || geoConsentState !== 'granted' || !navigator.geolocation) return;
    geoWatchId = navigator.geolocation.watchPosition(function (pos) {
      var now = Date.now();
      if (geoLastEvalPos && (now - geoLastEvalAt) < 60000 &&
          geoDistanceM(pos.coords.latitude, pos.coords.longitude, geoLastEvalPos.lat, geoLastEvalPos.lng) < 50) return;
      geoLastEvalPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      geoLastEvalAt = now;
      geoHandlePosition(pos.coords.latitude, pos.coords.longitude);
    }, function () {}, { enableHighAccuracy: false, maximumAge: 30000, timeout: 20000 });
  }

  function geoDistanceM(lat1, lng1, lat2, lng2) {
    var R = 6371000, rad = Math.PI / 180;
    var dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function geoLoadFences(client, done) {
    if (!client) { if (done) done(); return; }
    client.from('geofences').select('*').eq('active', true).limit(500)
      .then(function (res) {
        if (!res.error) {
          geoFences = res.data || [];
          geoFencesKnown = true;
          geoBaseFence = null;
          geoFences.forEach(function (f) { if (f.kind === 'base') geoBaseFence = f; });
        }
        if (done) done();
      })
      .catch(function () { if (done) done(); });
  }

  /* The fences THIS device answers to: the base, every ticket
   * fence, and the signed-in tech's own home fence (newest, if an
   * address change left more than one). */
  function geoMyFences() {
    var mine = [], homeBest = null;
    geoFences.forEach(function (f) {
      if (f.kind === 'home') {
        if (!state.user || f.employee_id !== state.user.id) return;
        if (!homeBest || String(f.created_at) > String(homeBest.created_at)) homeBest = f;
        return;
      }
      mine.push(f);
    });
    if (homeBest) mine.push(homeBest);
    return mine;
  }

  function geoHandlePosition(lat, lng) {
    if (!geoFencesKnown || !state.user) return;
    geoMyFences().forEach(function (f) {
      var inside = geoDistanceM(lat, lng, Number(f.lat), Number(f.lng)) <= (Number(f.radius_m) || 150);
      var prev = geoInside[f.id];
      geoInside[f.id] = inside;
      if (prev === undefined || prev === inside) return;
      geoLogEvent(f, inside ? 'enter' : 'exit', lat, lng);
      geoOnFenceEvent(f, inside ? 'enter' : 'exit');
    });
  }

  function geoLogEvent(f, ev, lat, lng) {
    if (!geoClientRef || !state.user) return;
    geoClientRef.from('fence_events').insert({ fence_id: f.id, user_id: state.user.id, event: ev, lat: lat, lng: lng })
      .then(function () {}).catch(function () {});
  }

  function geoOnFenceEvent(f, ev) {
    if (ev === 'exit' && (f.kind === 'base' || f.kind === 'home')) {
      geoShowPrompt('You left ' + f.label + '. Start a driving trip?', 'Start driving entry', function () { geoStartOpenTrip(f); });
    } else if (ev === 'enter' && f.kind === 'ticket') {
      geoEndOpenTrip(f);
      if (f.ticket_id) {
        geoShowPrompt('You arrived at ' + f.label + '. Mark the job In Progress?', 'Mark In Progress', function () { geoMarkInProgress(f); });
      } else {
        geoShowPrompt('You arrived at ' + f.label + '.', null, null);
      }
    } else if (ev === 'exit' && f.kind === 'ticket') {
      geoShowPrompt('You left ' + f.label + '. Start the return trip?', 'Start return trip', function () { geoStartOpenTrip(f); });
    } else if (ev === 'enter' && (f.kind === 'base' || f.kind === 'home')) {
      geoEndOpenTrip(f);
    }
  }

  function geoShowPrompt(text, btnLabel, onBtn) {
    var p = $('portal-geo-prompt'); if (!p) return;
    p.innerHTML = '<span class="loc-banner-text">' + esc(text) + '</span>' +
      (btnLabel ? '<button class="portal-btn portal-btn-primary portal-btn-sm" type="button" id="geo-prompt-btn">' + esc(btnLabel) + '</button>' : '') +
      '<button class="portal-btn portal-btn-outline portal-btn-sm" type="button" id="geo-prompt-dismiss">Dismiss</button>';
    p.hidden = false;
    var d = $('geo-prompt-dismiss'); if (d) d.addEventListener('click', function () { p.hidden = true; p.innerHTML = ''; });
    var b = $('geo-prompt-btn');
    if (b && onBtn) b.addEventListener('click', function () { p.hidden = true; p.innerHTML = ''; onBtn(); });
  }

  function geoStartOpenTrip(f) {
    if (!geoClientRef || !state.user) return;
    tcProbeFields(geoClientRef, function (known) {
      if (!known) { geoShowPrompt('Trip tracking needs the staged time-entries update first — no entry was started.', null, null); return; }
      geoClientRef.from('time_entries').insert({
        employee_id: state.user.id,
        employee_name: (state.profile && state.profile.name) || state.user.email,
        clock_in: new Date().toISOString(), clock_out: null,
        entry_type: 'driving',
        from_location: f.address || f.label,
        from_lat: Number(f.lat), from_lng: Number(f.lng)
      }).then(function (res) {
        if (res.error) { geoShowPrompt('Could not start the driving entry. You can log the trip on the Mileage panel instead.', null, null); return; }
        geoShowPrompt('Driving entry started from ' + f.label + ' — it is on your time card, and arriving will end it.', null, null);
        try { tcReloadCards(); } catch (e) {}
        try { geoCapture('trip_start'); } catch (e) {}
      }).catch(function () { geoShowPrompt('Could not start the driving entry. You can log the trip on the Mileage panel instead.', null, null); });
    });
  }

  function geoEndOpenTrip(f) {
    if (!geoClientRef || !state.user) return;
    tcProbeFields(geoClientRef, function (known) {
      if (!known) return;
      geoClientRef.from('time_entries').select('*')
        .eq('employee_id', state.user.id).eq('entry_type', 'driving').is('clock_out', null)
        .order('clock_in', { ascending: false }).limit(1)
        .then(function (res) {
          if (res.error || !res.data || !res.data.length) return;
          var entry = res.data[0];
          var upd = { clock_out: new Date().toISOString(), to_location: f.address || f.label, to_lat: Number(f.lat), to_lng: Number(f.lng) };
          geoClientRef.from('time_entries').update(upd).eq('id', entry.id).then(function () {
            try { tcReloadCards(); } catch (e) {}
            if (entry.from_location) {
              computeRouteMiles(
                { text: entry.from_location, lat: entry.from_lat != null ? Number(entry.from_lat) : null, lng: entry.from_lng != null ? Number(entry.from_lng) : null },
                { text: f.address || f.label, lat: Number(f.lat), lng: Number(f.lng) },
                function (rt) {
                  if (rt.error) return;
                  geoClientRef.from('time_entries').update({ miles: rt.miles }).eq('id', entry.id).then(function () { try { tcReloadCards(); } catch (e) {} }).catch(function () {});
                });
            }
          }).catch(function () {});
        })
        .catch(function () {});
    });
  }

  function geoMarkInProgress(f) {
    if (!geoClientRef || !f.ticket_id) return;
    geoClientRef.from('tickets').update({ status: 'In Progress' }).eq('id', f.ticket_id)
      .then(function (res) {
        if (res.error) { geoShowPrompt('Could not mark the job In Progress — open the ticket and set it there.', null, null); return; }
        geoShowPrompt('Job marked In Progress. Welcome to ' + f.label + '.', null, null);
      })
      .catch(function () { geoShowPrompt('Could not mark the job In Progress — open the ticket and set it there.', null, null); });
  }

  /* Auto-create a fence for every En Route ticket that lacks one,
   * from the ticket's own service address. Runs when fences load —
   * idempotent, and geocodes at the throttled Nominatim pace. */
  function geoSyncTicketFences(client) {
    if (!client || !geoFencesKnown) return;
    client.from('tickets').select('id, status, service_address').eq('status', 'En Route to Customer').limit(50)
      .then(function (res) {
        if (res.error) return;
        (res.data || []).forEach(function (t) {
          if (!trim(t.service_address)) return;
          var has = geoFences.some(function (f) { return f.kind === 'ticket' && f.ticket_id === t.id; });
          if (has) return;
          nominatimGeocode(t.service_address).then(function (g) {
            if (!g) return;
            client.from('geofences').insert({
              label: 'Job — ' + t.service_address, address: t.service_address,
              lat: g.lat, lng: g.lng, radius_m: 150, kind: 'ticket', ticket_id: t.id,
              created_by: state.user ? state.user.id : null
            }).then(function (r2) { if (!r2.error) geoLoadFences(client, null); }).catch(function () {});
          });
        });
      })
      .catch(function () {});
  }

  function geoEnsureHomeFence(client, empId, address, name) {
    if (!client || !empId || !trim(address)) return;
    nominatimGeocode(address).then(function (g) {
      if (!g) return;
      client.from('geofences').select('id, address, created_at').eq('kind', 'home').eq('employee_id', empId).eq('active', true)
        .order('created_at', { ascending: false })
        .then(function (res) {
          if (res.error) return;
          var rows = res.data || [];
          if (rows.length && rows[0].address === address) return;
          client.from('geofences').insert({
            label: (name ? name + ' — home' : 'Home'), address: address,
            lat: g.lat, lng: g.lng, radius_m: 150, kind: 'home', employee_id: empId,
            created_by: state.user ? state.user.id : null
          }).then(function (r2) { if (!r2.error && geoFencesKnown) geoLoadFences(client, null); }).catch(function () {});
        })
        .catch(function () {});
    });
  }

  function geoSyncHomeFences(client) {
    if (!client || !geoFencesKnown) return;
    client.from('employee_profiles').select('id, name, home_address').limit(200)
      .then(function (res) {
        if (res.error) return;
        (res.data || []).forEach(function (p) { if (trim(p.home_address)) geoEnsureHomeFence(client, p.id, p.home_address, p.name); });
      })
      .catch(function () {});
  }

  /* "Use my current location" on the Mileage form: fills the field
   * with the reverse-geocoded address and keeps the raw coordinates
   * riding along, so routing can use them directly. */
  function geoFillFromGps(which) {
    var info = $('ml-route-info');
    if (!navigator.geolocation) { if (info) info.textContent = 'This device has no location available — type the address instead.'; return; }
    if (info) info.textContent = 'Getting your location&hellip;';
    navigator.geolocation.getCurrentPosition(function (pos) {
      var lat = pos.coords.latitude, lng = pos.coords.longitude;
      if (which === 'from') { mlFromCoords = { lat: lat, lng: lng }; try { geoStoreSnapshot('trip_start', pos); } catch (e) {} }
      else { mlToCoords = { lat: lat, lng: lng }; }
      geoHandlePosition(lat, lng);
      nominatimReverse(lat, lng).then(function (r) {
        var el = $(which === 'from' ? 'ml-from' : 'ml-to');
        if (el) el.value = (r && r.label) ? r.label : (lat.toFixed(5) + ', ' + lng.toFixed(5));
        if (info) info.textContent = 'Location set from this device. Routing will use the exact coordinates.';
      });
    }, function () { if (info) info.textContent = 'Could not get your location — check the permission, or type the address instead.'; }, { timeout: 10000 });
  }

  /* ---------- owner view in the Mileage panel ---------- */
  function geoNameFor(id) {
    var p = mlProfileById(id);
    if (p) return p.name || 'Associate';
    return tcProfileName(id);
  }

  function geoRenderOwnerSections() {
    var wrap = $('ml-owner-sections'); if (!wrap) return;
    if (!isPortalOwner()) { wrap.innerHTML = ''; return; }
    if (!geoFencesKnown) {
      wrap.innerHTML = '<div class="portal-panel-head portal-subhead"><h3 class="portal-h3">Geofences</h3></div>' +
        '<p class="portal-muted">Geofences turn on once the staged location update runs: a fence around the home base, one around each tech&rsquo;s home, and one around each job address — arrivals and departures log themselves here, and trips start and end on their own.</p>';
      return;
    }
    var html = '<div class="portal-panel-head portal-subhead"><h3 class="portal-h3">Geofences</h3></div>';
    /* LOC_SETTINGS_2026_11_03: the base is the HOME BASE (there is
     * no store). When no base fence exists yet, the address box
     * pre-fills from the signed-in profile's home address on file —
     * the same home_address the Time Clock panel keeps — and stays
     * editable before saving. */
    var basePrefill = '';
    if (!geoBaseFence) {
      var ownProf = state.user ? mlProfileById(state.user.id) : null;
      basePrefill = (ownProf && mlHomeKnown && ownProf.home_address) || ownHomeAddress || '';
    }
    if (geoBaseFence) {
      html += '<p><strong>Home base:</strong> ' + esc(geoBaseFence.address || geoBaseFence.label) + ' &middot; fence ' + esc(String(geoBaseFence.radius_m || 150)) + ' m</p>';
    } else {
      html += '<p class="portal-muted">No home base set yet — set your home address once and trips, arrivals and the quick-pick all key off it.</p>';
    }
    html += '<div class="tc-manual-grid">' +
      '<label>Home base address <input type="text" id="geo-base-addr" placeholder="Home base address" value="' + (geoBaseFence ? esc(geoBaseFence.address || '') : esc(basePrefill)) + '"></label>' +
      '<label>Radius (m) <input type="number" id="geo-base-radius" min="25" step="25" value="' + (geoBaseFence ? esc(String(geoBaseFence.radius_m || 150)) : '150') + '"></label>' +
      '<button class="portal-btn portal-btn-primary portal-btn-sm" type="button" id="geo-base-save">' + (geoBaseFence ? 'Save home base' : 'Set home base') + '</button></div>' +
      '<p class="portal-small" id="geo-base-msg"></p>';
    html += '<div id="geo-fence-status"><p class="portal-muted">Loading fence status&hellip;</p></div>';
    html += '<div class="portal-panel-head portal-subhead"><h3 class="portal-h3">Arrivals &amp; departures</h3></div><div id="geo-feed"><p class="portal-muted">Loading&hellip;</p></div>';
    wrap.innerHTML = html;
    var save = $('geo-base-save');
    if (save) save.addEventListener('click', geoSaveBaseFence);
    geoLoadFeed();
  }

  function geoSaveBaseFence() {
    var client = mlClientRef || geoClientRef;
    var msg = $('geo-base-msg');
    if (!client) return;
    var addr = trim($('geo-base-addr').value);
    var radius = parseInt($('geo-base-radius').value, 10);
    if (!isFinite(radius) || radius < 25) radius = 150;
    function apply(lat, lng) {
      if (geoBaseFence) {
        client.from('geofences').update({ address: addr || geoBaseFence.address, lat: lat != null ? lat : Number(geoBaseFence.lat), lng: lng != null ? lng : Number(geoBaseFence.lng), radius_m: radius }).eq('id', geoBaseFence.id)
          .then(function (res) {
            if (res.error) { if (msg) msg.textContent = 'Could not save the home base.'; return; }
            geoLoadFences(client, function () { geoRenderOwnerSections(); });
          }).catch(function () { if (msg) msg.textContent = 'Could not save the home base.'; });
      } else {
        client.from('geofences').insert({ label: 'Home base', address: addr, lat: lat, lng: lng, radius_m: radius, kind: 'base', created_by: state.user.id })
          .then(function (res) {
            if (res.error) { if (msg) msg.textContent = 'Could not save the home base.'; return; }
            geoLoadFences(client, function () { geoRenderOwnerSections(); mlPopulatePicks(client); });
          }).catch(function () { if (msg) msg.textContent = 'Could not save the home base.'; });
      }
    }
    if (addr && (!geoBaseFence || addr !== geoBaseFence.address)) {
      if (msg) msg.textContent = 'Finding that address&hellip;';
      nominatimGeocode(addr).then(function (g) {
        if (!g) { if (msg) msg.textContent = 'Could not find that address — check it and try again.'; return; }
        apply(g.lat, g.lng);
      });
    } else if (geoBaseFence) { apply(null, null); }
    else if (msg) { msg.textContent = 'Type the home base address first.'; }
  }

  function geoLoadFeed() {
    var client = mlClientRef || geoClientRef;
    var feed = $('geo-feed'), status = $('geo-fence-status');
    if (!client || !feed) return;
    client.from('fence_events').select('*').order('occurred_at', { ascending: false }).limit(200)
      .then(function (res) {
        if (res.error) {
          feed.innerHTML = '<p class="portal-muted">No fence events yet.</p>';
          if (status) status.innerHTML = '';
          return;
        }
        var events = res.data || [];
        var fenceById = {};
        geoFences.forEach(function (f) { fenceById[f.id] = f; });
        var lastByKey = {};
        events.forEach(function (e) {
          var k = e.fence_id + '|' + e.user_id;
          if (!lastByKey[k]) lastByKey[k] = e;
        });
        if (status) {
          status.innerHTML = geoFences.map(function (f) {
            var insideNames = [];
            Object.keys(lastByKey).forEach(function (k) {
              var e = lastByKey[k];
              if (e.fence_id === f.id && e.event === 'enter') insideNames.push(geoNameFor(e.user_id));
            });
            return '<div class="tc-row"><span><strong>' + esc(f.label) + '</strong> <span class="portal-muted">' + esc(f.kind) + ' &middot; ' + esc(String(f.radius_m || 150)) + ' m</span></span><span>' + (insideNames.length ? 'Inside now: ' + esc(insideNames.join(', ')) : '<span class="portal-muted">Nobody inside</span>') + '</span></div>';
          }).join('') || '<p class="portal-muted">No fences yet.</p>';
        }
        if (!events.length) { feed.innerHTML = '<p class="portal-muted">No arrivals or departures logged yet — they appear as techs cross fences with the portal open.</p>'; return; }
        feed.innerHTML = events.slice(0, 30).map(function (e) {
          var f = fenceById[e.fence_id];
          var when = new Date(e.occurred_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
          return '<div class="tc-row"><span><strong>' + esc(geoNameFor(e.user_id)) + '</strong> ' + (e.event === 'enter' ? 'arrived at' : 'left') + ' ' + esc(f ? f.label : 'a fence') + '</span><span class="portal-muted">' + esc(when) + '</span></div>';
        }).join('');
      })
      .catch(function () { feed.innerHTML = '<p class="portal-muted">No fence events yet.</p>'; });
  }
  /* end PORTAL_LOCATION_2026_11_02 */

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
  /* PORTAL_ATRONE_PER_TIER_2026_11_02: the tier picked at check-in
   * — set when a Square tier card in the signup box is tapped (each
   * card's plan link identifies its tier), read at submit so the
   * agreement attached to the new ticket is that tier's agreement.
   * Null when no card was tapped: then no agreement is attached. */
  var ciAtroneTier = null;
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
    /* PORTAL_ATRONE_PER_TIER_2026_11_02: tapping a tier card in the
     * signup box records the tier — each card links to its own
     * Square plan, and the plan link identifies the tier. */
    var ciSignupBox = $('ci-atrone-signup');
    if (ciSignupBox && !ciSignupBox.getAttribute('data-wired')) {
      ciSignupBox.setAttribute('data-wired', '1');
      ciSignupBox.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () {
          var href = a.getAttribute('href') || '';
          if (href.indexOf('eFKxDvyo') !== -1) ciAtroneTier = 'single';
          else if (href.indexOf('ZA7502vD') !== -1) ciAtroneTier = 'family';
          else if (href.indexOf('HtnQBIG1') !== -1) ciAtroneTier = 'business_plus';
          else if (href.indexOf('V8WCkjbW') !== -1) ciAtroneTier = 'business_pro';
        });
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
      ciAtroneTier = null;
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
      /* PORTAL_ATRONE_DOC_2026_11_02: captured before the insert —
       * the form (and this select) is reset once the ticket exists. */
      var wantsAtrOneSignup = $('ci-atrone') ? $('ci-atrone').value === 'signup' : false;
      var signupTier = wantsAtrOneSignup ? ciAtroneTier : null;
      withClient(function (client) {
        if (!client) { btn.disabled = false; return; }
        client.from('tickets').insert(row).select('id').single().then(function (res) {
          if (res.error) { btn.disabled = false; err.textContent = 'Could not create the ticket — try again.'; err.hidden = false; return; }
          var newId = res.data && res.data.id;
          var proceed = function (consentFailed, atroneAttachFailed) {
            btn.disabled = false;
            $('ci-form').reset(); ciCustomerId = null; ciAtroneTier = null;
            document.querySelectorAll('#ci-reasons .ci-tile.on').forEach(function (c) { c.classList.remove('on'); c.setAttribute('aria-pressed', 'false'); });
            ciConsentReset();
            state.loaded.tickets = false;
            activateTab('tickets');
            loadTickets(true);
            if (newId) setTimeout(function () { openTicket(newId); }, 450);
            if (consentFailed) setTimeout(function () { docMsg('The ticket was created, but the check-in agreement could not be filed — take the signature here in Documents.'); }, 900);
            if (atroneAttachFailed) setTimeout(function () { docMsg('The ticket was created, but the ATR One membership agreement could not be attached — take the signature here in Documents.'); }, 900);
          };
          /* PORTAL_CHECKIN_CONSENT_2026_10_30: consent captured on the
           * form files itself on the new ticket, in the drawer flow's
           * order (create ticket → upload + file → set flags);
           * no consent → the ticket is created exactly as before. */
          /* PORTAL_ATRONE_PER_TIER_2026_11_02: a wants-signup
           * check-in gets the agreement for the tier picked at
           * check-in filed on the new ticket right after creation
           * — after any check-in consent, the drawer flow's order
           * (create ticket → file documents) — so the agreement
           * is on the ticket for the customer to view and sign;
           * staff never fetch it from Documents by hand. No tier
           * picked → nothing attached, never a guess. Every other
           * check-in follows the exact path it always has. */
          var afterConsent = function (consentFailed) {
            if (wantsAtrOneSignup && newId) {
              attachAtrOneAgreementAtCheckin(client, newId, row, function (attachErr) { proceed(consentFailed, !!attachErr); }, signupTier);
            } else {
              proceed(consentFailed, false);
            }
          };
          if (consent && newId) {
            fileCiConsent(client, newId, row, consent, function (fileErr) { afterConsent(!!fileErr); });
          } else {
            afterConsent(!!consent);
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
        /* PAYRATE_FIX_2026_11_03: land-or-fail — .select() asks for
         * the written row back, and zero rows back (a policy-blocked
         * update reports success) counts as not saved, same as an
         * error: no success message, no board reload. */
        client.from('employee_profiles').update({ birthday: val }).eq('id', state.user.id).select('id, birthday').then(function (res2) {
          var landed = !res2.error && !!res2.data && res2.data.length > 0;
          if (!msg) return;
          msg.textContent = !landed ? 'Couldn\'t save \u2014 try again.' : 'Saved. Your day is on the board.';
          if (landed) loadBirthdays(client);
        });
      });
    }
  }
})();
