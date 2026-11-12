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
 * TURNSTILE_LOADHELP_2026_11_10 (v89): if Cloudflare's api.js is
 * blocked outright, mount() now says so in the widget's own spot,
 * in plain words, with a Try again button — instead of an empty
 * gap and a silent wait (owner's laptop: the check box simply
 * was not there).
 *
 * LOGIN_SPEED_2026_11_10 (staged): this copy adds freshToken() —
 * the login form waits for a fresh token instead of dead-ending
 * when the widget is still verifying or its token went stale on a
 * slow connection. This staged file is the copy to publish; the
 * test harness prefers it over the skeleton helper when present.
 *
 * TURNSTILE_AUTOFILL_2026_11_12 (v130b): the owner found it live —
 * typing the password works, autofill does not. Autofill fills
 * email + password at once and Log In is tapped before the widget
 * (which only mounted when the account box opened) has rendered or
 * produced a token. So the login + signup widgets now mount on
 * page load, a short autofill watch (field-value poll + the
 * :-webkit-autofill animation signal + focus) makes sure they are
 * mounted whenever the fields fill without typing, and freshToken()
 * waits out the first challenge instead of resetting it — it only
 * restarts a check that already went stale.
 *
 * TURNSTILE_SIGNIN_WAIT_2026_11_12 (v132): the owner proved the
 * 45s wait still gives up too soon — on his 5 Mbps hotspot the
 * token landed after about a minute, past the wait, while the
 * widget itself showed Success a moment later. freshToken() now
 * waits 120s and never resets a first challenge that has never
 * produced a token merely for being slow (the old 20s STUCK_MS
 * reset is gone — it restarted the very challenge that was about
 * to finish). The wait ends early only on a true failure: the
 * widget's error-callback fired, or the Cloudflare script never
 * loaded. See freshToken() for the full rule.
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

  /* TURNSTILE_LOADHELP_2026_11_10 (v89): when Cloudflare's script is
   * blocked outright (ad blocker, strict tracking protection, a
   * network filter), the widget never renders and the guest sees an
   * empty gap. Put the reason and the way back in the widget's own
   * spot. Try again re-asks for the script and restarts the wait —
   * if the block has been lifted, the check appears. */
  function showLoadHelp(el, entry) {
    if (entry.helpShown) return;
    entry.helpShown = true;
    el.innerHTML = '';
    var box = document.createElement('div');
    box.setAttribute('style', 'border:1px solid #b08954;border-radius:10px;padding:.7rem .8rem;font-size:.92rem;line-height:1.45;text-align:left;');
    var msg = document.createElement('div');
    msg.textContent = 'The human check could not load. It is a small box from Cloudflare that keeps bots out, and something on this device or network is blocking it. Turn off any ad blocker or strict tracking protection for this site, then tap Try again.';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Try again';
    btn.setAttribute('style', 'margin-top:.55rem;padding:.5rem 1rem;border-radius:8px;border:1px solid #b08954;background:transparent;color:inherit;font:inherit;cursor:pointer;');
    btn.addEventListener('click', function () {
      entry.helpShown = false;
      entry.loadFailed = false;
      el.innerHTML = '';
      try {
        var s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        s.async = true;
        document.head.appendChild(s);
      } catch (e) {}
      if (entry.resumeAttempts) entry.resumeAttempts();
    });
    box.appendChild(msg);
    box.appendChild(btn);
    el.appendChild(box);
  }

  /* Render the widget into a container (idempotent). The container may
   * start out hidden (signup tab, account views, chat panel): explicit
   * rendering still works, and mount() is simply called again when the
   * view is shown — later calls are no-ops once a widget exists. */
  var mountCalls = 0; /* diagnostic counter (v130b): mount() calls, incl. no-ops */
  function mount(el) {
    if (!el) return null;
    mountCalls++;
    var entry = entryFor(el);
    if (entry) return entry;
    entry = { el: el, id: null, token: '', issuedAt: 0, hadToken: false, renderedAt: 0, failed: false };
    widgets.push(entry);
    el.style.margin = '.75rem 0';
    var tries = 0;
    var attempt = function () {
      if (entry.id !== null) return;
      if (apiReady()) {
        try {
          entry.id = window.turnstile.render(el, {
            sitekey: SITE_KEY,
            /* TURNSTILE_NAVFIX_2026_11_10 (v83): compact render — the
               full-size widget's live states could cover the bottom
               thumb bar on phones; compact keeps it one short row. */
            size: 'compact',
            callback: function (tok) { entry.token = String(tok || ''); entry.issuedAt = Date.now(); entry.hadToken = true; entry.failed = false; },
            'expired-callback': function () { entry.token = ''; entry.issuedAt = 0; },
            'error-callback': function () { entry.token = ''; entry.issuedAt = 0; entry.failed = true; }
          });
          entry.renderedAt = Date.now();
        } catch (e) { /* a later mount() call retries */ }
        return;
      }
      if (++tries <= 300) { setTimeout(attempt, 100); return; } // api.js is async; wait up to ~30s (TURNSTILE_SLOWFIX_2026_11_10 v86: the old ~10s window starved slow connections — the widget never rendered and no token ever existed, which is what stranded the owner's sign-in on his capped hotspot)
      /* TURNSTILE_LOADHELP_2026_11_10 (v89): ~30s and the script
         still is not here — it is blocked, not slow. Say so in the
         widget's own spot instead of leaving an empty gap. */
      if (!entry.loadFailed) { entry.loadFailed = true; showLoadHelp(el, entry); }
    };
    entry.resumeAttempts = function () { tries = 0; attempt(); };
    attempt();
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

  /* LOGIN_SPEED_2026_11_10: hand back a FRESH token, waiting for one
   * if that is what it takes. The login form passes its token
   * straight to Supabase Auth, and on a slow connection the widget
   * can still be sitting on "Verifying…" — or its token can have
   * gone stale (over ~4 minutes old) — when the guest taps Log In.
   * The old flow stopped right there with "complete the human check
   * and log in again", a dead end on exactly the connections that
   * need the most patience.
   * TURNSTILE_AUTOFILL_2026_11_12 (v130b): freshToken waits out the
   * FIRST challenge — it must NOT reset a widget that is still on
   * its first "Verifying…" just because no token exists yet (that
   * is exactly the autofill case: fields filled at once, Log In
   * tapped at once). Reset happens only when a token already existed
   * and went stale/expired.
   * TURNSTILE_SIGNIN_WAIT_2026_11_12 (v132): the owner proved the
   * 45s wait still gives up too soon — on his 5 Mbps hotspot the
   * token landed after about a minute, past the wait, while the
   * widget itself showed Success a moment later (his laptop photo:
   * Success badge + "did not finish" error at the same time). Two
   * changes: (1) the wait is 120s — twice his observed minute, with
   * margin for a slow Managed challenge end to end. (2) The old
   * STUCK_MS reset is GONE: a first challenge that has never
   * produced a token is never reset for being slow — resetting it
   * restarts the very challenge that was about to finish, making
   * the total even longer. The wait now ends early ONLY on a true
   * failure: the widget's error-callback fired (entry.failed), or
   * the Cloudflare script never loaded (entry.loadFailed — blocked
   * or network down). A merely slow challenge is waited out. A
   * fresh token comes back at once; otherwise this polls every
   * 250ms until a fresh token lands, a true failure reports, or
   * the 120s wait runs out, and calls back with the token or ''.
   * Login AND signup use it — every other form keeps the gate() /
   * token() behavior it already had. */
  function freshToken(el, cb, opts) {
    opts = opts || {};
    var waitMs = opts.waitMs || 120000; // TURNSTILE_SIGNIN_WAIT_2026_11_12 (v132): 45s -> 120s, twice the owner's observed ~60s token time on his 5 Mbps hotspot, with margin — the wait gives up only after two full minutes, by which time something is actually wrong, not merely slow
    var entry = mount(el);
    if (!entry) { cb(''); return; }
    if (entry.token && (Date.now() - entry.issuedAt <= TOKEN_MAX_AGE_MS)) { cb(entry.token); return; }
    /* A previous challenge REPORTED failure (error-callback): that
     * challenge is dead, so a new attempt starts a fresh one instead
     * of failing at once. This is recovery from a reported failure,
     * not a reset of a slow challenge. */
    if (entry.failed) { entry.failed = false; reset(el); }
    var resetDone = false;
    if (entry.token || entry.hadToken) { reset(el); resetDone = true; } // stale/expired token: one fresh check
    var started = Date.now();
    (function poll() {
      var t = token(el);
      if (t) { cb(t); return; }
      /* True failure only: the widget reported failure, or the
       * Cloudflare script never loaded (blocked / network down). A
       * merely slow challenge keeps waiting — the wait ends early
       * on a reported failure, never on slowness. */
      if (entry.failed || entry.loadFailed) { cb(''); return; }
      if (Date.now() - started >= waitMs) { cb(''); return; }
      setTimeout(poll, 250);
    })();
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

  /* TURNSTILE_AUTOFILL_2026_11_12 (v130b): mount on page load +
   * autofill watch. The old flow mounted the auth widgets only when
   * the account box opened, so an autofilled sign-in raced the
   * mount: both fields filled at once, Log In tapped at once, no
   * token yet. Mounting at load gives the Managed check its whole
   * run-up before anyone taps anything, however fast they fill.
   * Autofill fires no input/change event, so the watch does not
   * rely on them: (a) a 500ms poll of the four auth fields for a
   * non-empty value, for up to 30s or until both widgets render;
   * (b) the :-webkit-autofill CSS-animation signal (a 0.01s
   * animation on autofilled inputs; the animationstart event
   * carries it); (c) focus on any auth field. All three just call
   * mount(), which is idempotent — the worst case is a no-op.
   * Managed mode stays automatic: no checkbox, no puzzle, no click
   * step. The v89 load-help box is untouched. */
  var AUTH_WIDGET_IDS = ['ts-login', 'ts-signup'];
  var AUTH_FIELD_IDS = ['authx-login-email', 'authx-login-password', 'authx-signup-email', 'authx-signup-password'];
  function mountAuthWidgets() {
    for (var i = 0; i < AUTH_WIDGET_IDS.length; i++) {
      var w = document.getElementById(AUTH_WIDGET_IDS[i]);
      if (w) mount(w);
    }
  }
  function authWidgetsRendered() {
    for (var i = 0; i < AUTH_WIDGET_IDS.length; i++) {
      var w = document.getElementById(AUTH_WIDGET_IDS[i]);
      var en = w ? entryFor(w) : null;
      if (!en || en.id === null) return false;
    }
    return true;
  }
  function autofillWatchTick() {
    for (var i = 0; i < AUTH_FIELD_IDS.length; i++) {
      var f = document.getElementById(AUTH_FIELD_IDS[i]);
      if (f && f.value) { mountAuthWidgets(); return; }
    }
  }
  function installAutofillSignal() {
    try {
      var st = document.createElement('style');
      st.setAttribute('data-atr-turnstile', 'autofill-signal');
      st.textContent = '@keyframes atrAutofill { from { opacity: 1; } to { opacity: 1; } } input:-webkit-autofill { animation-name: atrAutofill; animation-duration: 0.01s; }';
      document.head.appendChild(st);
    } catch (e) {}
  }
  function startAutofillWatch() {
    installAutofillSignal();
    mountAuthWidgets();
    var ticks = 0;
    var poll = setInterval(function () {
      ticks++;
      autofillWatchTick();
      if (authWidgetsRendered() || ticks >= 60) clearInterval(poll);
    }, 500);
  }
  document.addEventListener('animationstart', function (e) {
    if (e && e.animationName === 'atrAutofill') mountAuthWidgets();
  }, true);
  document.addEventListener('focus', function (e) {
    var t = e && e.target;
    if (t && t.id && AUTH_FIELD_IDS.indexOf(t.id) !== -1) mountAuthWidgets();
  }, true);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startAutofillWatch);
  } else {
    startAutofillWatch();
  }

  window.atrTurnstile = {
    SITE_KEY: SITE_KEY,
    mount: mount,
    token: token,
    reset: reset,
    verify: verify,
    gate: gate,
    freshToken: freshToken,
    mountCalls: function () { return mountCalls; }
  };
})();
