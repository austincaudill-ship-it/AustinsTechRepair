/* =====================================================================
 * ATR Turnstile — shared Cloudflare Turnstile helper for the public
 * website (SITE_TURNSTILE_2026_11_02, staged — not yet live).
 * =====================================================================
 * One explicit-render widget per form, Managed mode, site key for the
 * "ATRG Website Forms" widget. A form may not submit until:
 *   1. the widget has produced a token, AND
 *   2. the verify-turnstile Supabase Edge Function has confirmed that
 *      token server-side with Cloudflare (the secret never ships to
 *      the browser; it lives in the function's TURNSTILE_SECRET_KEY).
 *
 * Consumers:
 *   - atr-forms.js  — the five data-form forms (gate() below).
 *   - script.js     — account forms acct-ticket-form / acct-msg-form
 *                     (gate() below).
 *   - index.html    — authx login/signup + password reset pass the
 *                     token to Supabase Auth as captchaToken instead
 *                     (token() below); the chat lead flow verifies via
 *                     verify() before its tickets insert.
 *
 * FAILS CLOSED on purpose: if the widget or the verification call
 * cannot be reached, submits are blocked with a message that points
 * to the phone number. A bot that skips the page and calls the
 * database directly with the public anon key is NOT stopped by this
 * file alone — see CHANGES.md, "Residual risk / Phase 2".
 *
 * Style: ES5, matching the rest of the site.
 * ===================================================================== */
(function () {
  'use strict';

  var SITE_KEY = '0x4AAAAAAFvl6NaZJcoewefW';
  var SUPABASE_URL = 'https://lyujxpuicarblpkdzuuc.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5dWp4cHVpY2FyYmxwa2R6dXVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNjAxMjQsImV4cCI6MjEwNzczNjEyNH0.io4qD7pw878Xx97yoS6xzclO33aa4QYKENpwIyZ06xg';
  var VERIFY_URL = SUPABASE_URL + '/functions/v1/verify-turnstile';
  var TOKEN_MAX_AGE_MS = 240 * 1000; // tokens die at 300s; stop trusting at 240s

  /* widget registry: container element -> { id, token, issuedAt } */
  var widgets = [];

  function entryFor(el) {
    for (var i = 0; i < widgets.length; i++) if (widgets[i].el === el) return widgets[i];
    return null;
  }

  function apiReady() { return !!(window.turnstile && typeof window.turnstile.render === 'function'); }

  /* Render the widget into a container (idempotent). The container may
   * start out hidden (signup tab, account views, chat panel): explicit
   * rendering still works, and mount() is simply called again when the
   * view is shown — later calls are no-ops once a widget exists. */
  function mount(el) {
    if (!el) return null;
    var entry = entryFor(el);
    if (entry) return entry;
    entry = { el: el, id: null, token: '', issuedAt: 0 };
    widgets.push(entry);
    el.style.margin = '.75rem 0';
    var tries = 0;
    (function attempt() {
      if (entry.id !== null) return;
      if (apiReady()) {
        try {
          entry.id = window.turnstile.render(el, {
            sitekey: SITE_KEY,
            callback: function (tok) { entry.token = String(tok || ''); entry.issuedAt = Date.now(); },
            'expired-callback': function () { entry.token = ''; entry.issuedAt = 0; },
            'error-callback': function () { entry.token = ''; entry.issuedAt = 0; }
          });
        } catch (e) { /* a later mount() call retries */ }
        return;
      }
      if (++tries <= 100) setTimeout(attempt, 100); // api.js is async; wait up to ~10s
    })();
    return entry;
  }

  /* Current token for a container, or '' if none / stale / unmounted. */
  function token(el) {
    var entry = el ? entryFor(el) : null;
    if (!entry || !entry.token) return '';
    if (Date.now() - entry.issuedAt > TOKEN_MAX_AGE_MS) { reset(el); return ''; }
    return entry.token;
  }

  function reset(el) {
    var entry = el ? entryFor(el) : null;
    if (!entry) return;
    entry.token = ''; entry.issuedAt = 0;
    if (entry.id !== null && apiReady()) { try { window.turnstile.reset(entry.id); } catch (e) {} }
  }

  /* Server-side confirmation through the verify-turnstile Edge
   * Function. bearer: a user JWT when signed in, otherwise null and
   * the public anon key is used (anonymous public forms have no user
   * session — that is the whole point of gating them). Any network or
   * HTTP failure counts as NOT verified (fail closed). */
  function verify(tok, bearer, cb) {
    if (!tok) { cb(false); return; }
    var done = false;
    function finish(ok) { if (!done) { done = true; cb(!!ok); } }
    try {
      fetch(VERIFY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + (bearer || SUPABASE_ANON_KEY)
        },
        body: JSON.stringify({ token: tok })
      }).then(function (res) {
        if (!res.ok) { finish(false); return; }
        res.json().then(function (j) { finish(!!(j && j.success)); }).catch(function () { finish(false); });
      }).catch(function () { finish(false); });
    } catch (e) { finish(false); }
  }

  /* Submit gate for forms whose real handler is a separate submit
   * listener (atr-forms handlers, script.js account handlers).
   * MUST be registered BEFORE the real handler on the same form:
   * the first submit is stopped (stopImmediatePropagation), the
   * token is verified with the server, and only then is the submit
   * re-dispatched with a one-shot pass flag for the real handler.
   * opts.onBlocked(reason): 'incomplete' (no token yet), 'failed'
   * (server said no / unreachable), 'busy' is handled internally.
   * opts.getBearer(cb): optional async bearer provider (signed-in
   * account forms pass the session JWT; default is the anon key). */
  function gate(form, container, opts) {
    opts = opts || {};
    form.addEventListener('submit', function (e) {
      if (form.__tsPass && (Date.now() - form.__tsPass) < TOKEN_MAX_AGE_MS) {
        form.__tsPass = 0;
        reset(container); // token is single-use; next submit needs a fresh one
        return; // let the real handler run
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      if (form.__tsPending) return;
      mount(container);
      var tok = token(container);
      if (!tok) { if (opts.onBlocked) opts.onBlocked('incomplete'); return; }
      form.__tsPending = true;
      function withBearer(bearer) {
        verify(tok, bearer, function (ok) {
          form.__tsPending = false;
          if (!ok) { reset(container); if (opts.onBlocked) opts.onBlocked('failed'); return; }
          form.__tsPass = Date.now();
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });
      }
      if (opts.getBearer) { try { opts.getBearer(withBearer); } catch (err) { withBearer(null); } }
      else withBearer(null);
    });
  }

  window.atrTurnstile = {
    SITE_KEY: SITE_KEY,
    mount: mount,
    token: token,
    reset: reset,
    verify: verify,
    gate: gate
  };
})();
