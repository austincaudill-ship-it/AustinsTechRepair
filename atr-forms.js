/* =====================================================================
 * ATR Forms — native website forms for Austin's Tech Repair Group
 * =====================================================================
 * Replaces the JotForm embeds (Service Request 261955946010055,
 * Job Application 262347488023056, Investors 262354967610058) and adds
 * a native Contact form and "How Did We Do" feedback form.
 *
 * Every submission is written to Austin's own Supabase database
 * (project atr-customer-accounts) — that insert is the system of
 * record and the success criterion. A parallel email alert, sent by
 * the business's own backend (the form-alert Edge Function, mailing
 * through the business's own Zoho SMTP), goes to the business inbox
 * so Austin is notified instantly, exactly like the old lead emails.
 *
 * IMPORTANT (return=minimal): all inserts below intentionally use
 * supabase-js .insert() WITHOUT .select(). With no .select(), the
 * request carries "Prefer: return=minimal" and PostgREST does not try
 * to RETURN the row. The public (anon) role has INSERT-only access —
 * no SELECT policy — so an insert that asks for the row back would
 * FAIL even though the row was written. Never chain .select() here.
 *
 * NOTE (in-house alert, FORM_ALERTS_INHOUSE_2026_11_05): the email
 * alert is sent by the form-alert Edge Function on this same
 * Supabase project, through the business's own Zoho mail. If that
 * function's Zoho secrets are not configured it declines and no
 * alert sends - the database insert still succeeds silently, so
 * verify the alert separately during go-live testing.
 *
 * Style: ES5, matching the rest of script.js on the site.
 *
 * SITE_AUDIT_FIXES_2026_10_30: the service-request form now also
 * lives at step 4 of the repair wizard (one form, one insert path),
 * carries the guided selections in, and requires the customer's
 * signature on the Repair Authorization before it can send.
 *
 * SITE_PAYSTEP_2026_10_30: after a successful service-request submit,
 * the success panel gains a payment step — the customer pays the
 * visit fee through Square and the appointment counts as fully
 * booked once the fee is paid. Display + link only; it runs after
 * the ticket insert has already decided success.
 * FEE_SPLIT_2026_11_05: the visit fee is now two-tier — $15 when the
 * repair is already known, $35 when the job needs diagnostics. The
 * submit path carries no reliable diagnostics signal, so the panel
 * states both tiers: the button below still collects the $35
 * diagnosis tier (the only Square link that exists); the $15 tier
 * is confirmed by staff and its payment link is texted, the same
 * pattern the panel's closing note already promises. A dedicated
 * $15 Square link is the follow-up that makes the panel branch.
 *
 * SITE_TURNSTILE_2026_11_02 (staged): every form below is gated by
 * Cloudflare Turnstile. init() injects the widget container and
 * registers the shared submit gate (turnstile.js) BEFORE the real
 * handler: no token + no server confirmation from the
 * verify-turnstile Edge Function = no insert, and the email
 * alert (which only runs inside the handlers) never fires either.
 * The honeypot check still runs first inside each handler — spam
 * that fills it gets the usual fake success without ever reaching
 * the insert. See CHANGES.md for the residual-risk note.
 * ===================================================================== */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://lyujxpuicarblpkdzuuc.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5dWp4cHVpY2FyYmxwa2R6dXVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNjAxMjQsImV4cCI6MjEwNzczNjEyNH0.io4qD7pw878Xx97yoS6xzclO33aa4QYKENpwIyZ06xg';
  var SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  /* FORM_ALERTS_INHOUSE_2026_11_05 (Austin, Nov 5, 2026): form alert
   * email is sent by our own backend - the form-alert Edge Function
   * on this same Supabase project - never by an outside form service. */
  var FORM_ALERT_URL = SUPABASE_URL + '/functions/v1/form-alert';
  var BUSINESS_PHONE_DISPLAY = '937-280-6243';
  var BUSINESS_PHONE_TEL = 'tel:9372806243';
  var MAX_RESUME_BYTES = 10 * 1024 * 1024; // 10 MB client-side guard
  /* SITE_PAYSTEP_2026_10_30: Square payment link for the visit fee
   * — "House-Call Fee" link in the business Square account.
   * $36.32 total = $35.00 visit fee (the with-diagnostics tier,
   * FEE_SPLIT_2026_11_05) + $1.32 card processing (Square online
   * rate 2.9% + 30 cents). */
  var SQUARE_HOUSECALL_LINK = 'https://square.link/u/GNUAO63Y';
  /* CONNECT_PAY_STEP_2026_11_10 (owner ruling, Nov 10, 2026): the
   * ATR One join offered at the virtual pay step is the Individual
   * tier — this is the same Square link the site's own Join buttons
   * use for that tier (the ATR One page tiers and Manage
   * Membership, data-mm-tier="single"). One link, copied from the
   * site's own wiring; never invent another. */
  var ATR_ONE_JOIN_LINK = 'https://square.link/u/eFKxDvyo';
  /* VIRTUAL_ONE_ON_ONE_2026_11_10: the virtual first-hour payment
     runs through the square-ticket-checkout function (mode
     'virtual-first-hour'). HARDENED in v86 (Nov 10, 2026): the
     function takes the payment only from the booker's own signed-in
     session, with the booking email matching the account — so the
     pay step below sends the guest's session token, and a
     signed-out booker is asked to sign in first (booking saved). */
  var SQUARE_TICKET_CHECKOUT_URL = SUPABASE_URL + '/functions/v1/square-ticket-checkout';
  /* VIRTUAL_ONE_ON_ONE_2026_11_10 — THE FEE SWITCH (owner ruling,
     Nov 10, 2026): a virtual session SKIPS the $15 visit fee. The
     guest pays the first hour ($25) at booking and $25 an hour for
     the time after, on the card they leave on file. In person keeps
     its $15 + $25 an hour exactly as settled. This one constant is
     the whole switch: if the ruling ever changes, flip it here and
     the acknowledgment gate + fee copy follow. */
  var VIRTUAL_FEE_APPLIES = false;
  /* VIRTUAL_ONE_ON_ONE_2026_11_10 — WAIVER 1 of 2 (owner's consent
     law, Nov 10, 2026): before a virtual guest can pay, they agree
     to a privacy waiver in the pay step (its own box, unchecked,
     never bundled into the payment consent). The agreement is
     recorded against the booking by the virtual-session function
     (action 'waiver', kind 'booking') with this version string —
     shared with script.js (waiver 2, at session start) so a wording
     change bumps one version in both places. The text is a DRAFT
     awaiting the owner's approval (see the build report). */
  var VIRTUAL_WAIVER_VERSION = 'v1-draft-2026-11-10';
  var VIRTUAL_SESSION_URL = SUPABASE_URL + '/functions/v1/virtual-session';

  /* ---------------- Supabase client bootstrap ----------------
   * index.html already loads supabase-js v2 from the jsDelivr CDN, so
   * window.supabase normally exists. If it does not (form snippet used
   * on a page without the library), load that same CDN build lazily. */
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
  function trim(v) { return String(v == null ? '' : v).trim(); }

  function field(form, name) {
    var el = form.elements[name];
    if (!el) return '';
    if (el.type === 'checkbox') return !!el.checked;
    if (el.length && el[0] && el[0].type === 'radio') {
      for (var i = 0; i < el.length; i++) if (el[i].checked) return el[i].value;
      return '';
    }
    return trim(el.value);
  }

  function joinParts(parts, sep) {
    return parts.map(trim).filter(function (p) { return p !== ''; }).join(sep);
  }

  function fullName(form, firstName, lastName) {
    return joinParts([field(form, firstName), field(form, lastName)], ' ');
  }

  function composeAddress(form, prefix) {
    var stateZip = joinParts([field(form, prefix + '_state'), field(form, prefix + '_zip')], ' ');
    return joinParts([
      field(form, prefix + '_street'),
      field(form, prefix + '_line2'),
      field(form, prefix + '_city'),
      stateZip
    ], ', ');
  }

  /* Lead source: the intake form's "How did you hear about us?" dropdown
   * (name="lead_source"), composed exactly like script.js's
   * window.atrLeadSource: dropdown value first, then " | ref: <hostname>"
   * for an external referrer, then " | utm: <value>" when a utm_source
   * URL parameter is present. Returns '' when nothing is present; the
   * tickets insert falls back to 'website'.
   * Format: "google-search", "yelp | ref: yelp.com", "flyer | utm: fb". */
  function leadSource(form) {
    var parts = [];
    var choice = form ? field(form, 'lead_source') : '';
    if (choice) parts.push(choice);
    var refHost = '';
    try {
      if (document.referrer) refHost = new URL(document.referrer).hostname.replace(/^www\./, '');
    } catch (err) { refHost = ''; }
    if (refHost && refHost !== window.location.hostname) parts.push('ref: ' + refHost);
    var utm = '';
    try { utm = new URLSearchParams(window.location.search).get('utm_source') || ''; } catch (err) { utm = ''; }
    if (utm) parts.push('utm: ' + trim(utm));
    return parts.join(' | ');
  }

  function validEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trim(v));
  }

  function validPhone(v) {
    return String(v || '').replace(/\D/g, '').length >= 10;
  }
  /* ---------------- guest record for every ticket ----------------
   * GUEST_FOR_EVERY_TICKET_2026_11_09 (Austin, Nov 9, 2026):
   * "Everybody that has a ticket made gets a guest." Website
   * submissions used to write tickets with no customer_id at all —
   * the guest record only existed if the person had signed up for
   * an account first. ensureGuestRecord closes that at the source
   * for every form in this file that writes a ticket: given the
   * submission's name / phone / email / address it FINDS the guest
   * (email first, case-insensitive; then phone, digits only, so
   * '(937) 270-5712' and '9372705712' count as the same number) or
   * CREATES the record, and hands back its id for the ticket row.
   * A found record's stored details are never overwritten with the
   * form's. The account_number is a random unused 1-1000, the
   * table's scheme (no generator existed in code before this: the
   * account signup insert omits the column, and the owner's own
   * record fix supplies one explicitly). A guest with no email is
   * created under the standing placeholder
   * '<first-name>@no-email-on-file.invalid' (the Annie precedent —
   * customers.email carries a value on every row on file);
   * placeholders are never matched against, so two different
   * no-email guests can never be merged into one. The promise
   * NEVER rejects and resolves null on any failure: every caller
   * then inserts its ticket exactly as it did before this helper
   * existed, so the guest step can never strand a submission.
   * Only the customers table is touched, where the anon role's
   * select / insert / select-back are the account signup's proven
   * pattern — the tickets inserts stay return=minimal. Shared with
   * the guest chat in index.html as window.atrEnsureGuestRecord
   * (the window.atr* pattern the site already uses). */
  function guestPhoneDigits(p) {
    var d = String(p == null ? '' : p).replace(/\D/g, '');
    if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
    return d;
  }
  function guestPlaceholderEmail(name) {
    var slug = String(name == null ? '' : name).trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    return (slug || 'guest') + '@no-email-on-file.invalid';
  }
  function guestMatchableEmail(email) {
    var e = trim(email).toLowerCase();
    return (e && e.indexOf('@no-email-on-file.invalid') === -1) ? e : '';
  }
  function ensureGuestRecord(client, person) {
    var email = guestMatchableEmail(person && person.email);
    var phone = guestPhoneDigits(person && person.phone);
    function byEmail() {
      if (!email) return Promise.resolve(null);
      var pattern = email.replace(/([%_\\])/g, '\\$1');
      return client.from('customers').select('id').ilike('email', pattern).limit(1)
        .then(function (res) {
          return (!res.error && res.data && res.data.length) ? res.data[0].id : null;
        })
        .catch(function () { return null; });
    }
    function byPhone() {
      if (!phone || phone.length < 10) return Promise.resolve(null);
      return client.from('customers').select('id, phone').not('phone', 'is', null).limit(1000)
        .then(function (res) {
          if (res.error || !res.data) return null;
          for (var i = 0; i < res.data.length; i++) {
            if (guestPhoneDigits(res.data[i].phone) === phone) return res.data[i].id;
          }
          return null;
        })
        .catch(function () { return null; });
    }
    function pickAccountNumber(tries) {
      var n = 1 + Math.floor(Math.random() * 1000);
      return client.from('customers').select('id').eq('account_number', n).limit(1)
        .then(function (res) {
          if (!res.error && res.data && !res.data.length) return n;
          if (!res.error && res.data && res.data.length && tries < 6) return pickAccountNumber(tries + 1);
          return null;
        })
        .catch(function () { return null; });
    }
    function createGuest() {
      var row = {
        name: (person && person.name) || 'Guest',
        email: email || guestPlaceholderEmail(person && person.name)
      };
      if (person && person.phone) row.phone = person.phone;
      if (person && person.address) row.address = person.address;
      return pickAccountNumber(0).then(function (n) {
        if (n) row.account_number = n;
        return client.from('customers').insert(row).select('id').single()
          .then(function (res) {
            if (!res.error && res.data && res.data.id) return res.data.id;
            /* The record may exist anyway (a double submit raced
             * this insert, or a match the lookups could not see):
             * one more email lookup before giving up — the record
             * existing is what matters, whoever wrote it. */
            return byEmail();
          })
          .catch(function () { return byEmail(); });
      });
    }
    try {
      return byEmail()
        .then(function (id) { return id || byPhone(); })
        .then(function (id) { return id || createGuest(); })
        .then(function (id) {
          if (!id && window.console) console.warn('guest link: no guest record linked for this submission');
          return id || null;
        })
        .catch(function () { return null; });
    } catch (e) {
      if (window.console) console.warn('guest link: lookup failed', e);
      return Promise.resolve(null);
    }
  }
  if (typeof window !== 'undefined') window.atrEnsureGuestRecord = ensureGuestRecord;


  function sanitizeFilename(name) {
    var base = String(name || 'resume').toLowerCase();
    base = base.replace(/[^a-z0-9.\-_]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+/, '');
    return base || 'resume';
  }

  /* ---------------- validation / UI ---------------- */
  function clearErrors(form) {
    form.querySelectorAll('[data-error-for]').forEach(function (el) { el.textContent = ''; });
    form.querySelectorAll('.atr-field-invalid').forEach(function (el) { el.classList.remove('atr-field-invalid'); });
    var box = form.querySelector('.atr-form-error');
    if (box) { box.hidden = true; box.innerHTML = ''; }
  }

  function showFieldError(form, name, msg) {
    var slot = form.querySelector('[data-error-for="' + name + '"]');
    if (slot) slot.textContent = msg;
    var el = form.elements[name];
    if (el && el.classList) el.classList.add('atr-field-invalid');
    if (el && el.length && el[0]) el[0].classList.add('atr-field-invalid');
  }

  function showFormError(form, html) {
    var box = form.querySelector('.atr-form-error');
    if (!box) return;
    box.innerHTML = html;
    box.hidden = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function dbFailMessage() {
    return 'Something went wrong sending that. Please call or text us at ' +
      '<a href="' + BUSINESS_PHONE_TEL + '">' + BUSINESS_PHONE_DISPLAY + '</a>' +
      ' and we&rsquo;ll take it from there.';
  }

  function setBusy(form, busy) {
    var btn = form.querySelector('[type="submit"]');
    if (!btn) return;
    if (busy) {
      btn.disabled = true;
      btn.setAttribute('data-label', btn.innerHTML);
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending&hellip;';
    } else {
      btn.disabled = false;
      var label = btn.getAttribute('data-label');
      if (label) btn.innerHTML = label;
    }
  }

  function showSuccess(form, kind, values) {
    var wrap = form.closest('[data-form-wrap]') || form.parentNode;
    var success = wrap.querySelector('.atr-success');
    form.hidden = true;
    if (!success) return;
    var msg = success.querySelector('[data-success-msg]');
    if (msg) {
      var first = trim(values.first_name) || 'there';
      var text = {
        'service-request': 'Thanks ' + first + '! Your service request is in. We&rsquo;ll reach out shortly to confirm your appointment.',
        'contact': 'Thanks ' + first + '! Your message is in &mdash; we typically reply within the hour during business hours.',
        'job-application': 'Thank you for submitting your application. One of our HR associates will be with you shortly.',
        'investors': 'Thanks ' + first + '! Your inquiry is in &mdash; Austin will follow up with you personally.',
        'feedback': 'Thanks for telling us how we did &mdash; feedback like yours helps local folks find us.',
        /* WARRANTY_FORM_2026_11_03 */
        'warranty-request': 'Thanks ' + first + '! Your warranty request is in. Your repair is covered by our 1-year warranty on the parts we supplied, and we&rsquo;ll reach out using your preferred contact method to go over the next steps.'
      }[kind];
      if (text) msg.innerHTML = text;
    }
    success.hidden = false;
    /* SITE_DEADEND_MINORS_2026_10_30: the one-shot forms (Contact, Job
     * Application, Investors, Feedback) get a "send another" action on
     * the success panel that restores a fresh blank form in place — no
     * page reload. Not the service-request panel: its success carries
     * the Square payment step instead. All four forms use native
     * controls only, so form.reset() returns them to their blank
     * load state (star radios and the resume file input included). */
    var againLabel = {
      'contact': 'Send another message',
      'job-application': 'Submit another application',
      'investors': 'Send another inquiry',
      'feedback': 'Send more feedback',
      /* WARRANTY_FORM_2026_11_03 */
      'warranty-request': 'Submit another warranty request'
    }[kind];
    if (againLabel && !success.querySelector('[data-send-another]')) {
      var againP = document.createElement('p');
      againP.style.marginTop = '1rem';
      var againBtn = document.createElement('button');
      againBtn.type = 'button';
      againBtn.className = 'btn btn-outline';
      againBtn.setAttribute('data-send-another', '');
      againBtn.textContent = againLabel;
      againBtn.addEventListener('click', function () {
        form.reset();
        clearErrors(form);
        success.hidden = true;
        form.hidden = false;
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      againP.appendChild(againBtn);
      success.appendChild(againP);
    }
    success.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* SITE_PAYSTEP_2026_10_30: fill and reveal the payment-step panel
   * inside the service-request success block. Called only from the
   * real success path of handleServiceRequest (after the ticket
   * insert and the best-effort signature filing), never for the
   * honeypot fake success. Display only — nothing here writes data. */
  function showPayStep(form, isOneOnOne, opts) {
    var wrap = form.closest('[data-form-wrap]') || form.parentNode;
    var panel = wrap.querySelector('[data-paystep]');
    if (!panel) return;
    /* VIRTUAL_ONE_ON_ONE_2026_11_10: the virtual pay step. The guest
       pays the first hour ($25) now through Square and leaves the
       card on file; after the session, the time past the first hour
       is charged to that card at $25 an hour — stated plainly, with
       a required consent box, before the button can be used. ATR One
       members are not charged the $25 at all (their member key
       enables virtual sessions free) — the panel says so, and the
       real gate is the key check on the Virtual page at session
       time, so nothing here needs to know who is a member. No charge
       is faked: the button asks square-ticket-checkout for a
       'virtual-first-hour' session under the booker's own sign-in
       (v86 hardening), and if that call cannot be made the panel
       says so plainly and the booking stands saved — the same
       honesty as the $15 tier's text-the-link pattern. */
    if (opts && opts.virtual) {
      panel.innerHTML =
        '<h4>One last step to fully book your virtual session</h4>' +
        '<p>Your first hour is <strong>$25</strong>, paid now through Square. When you pay, you also leave your card on file with Square. ' +
        'After your session, we may charge that card $25 an hour for the time your session ran beyond the first hour &mdash; nothing more, and we will always tell you the total first.</p>' +
        '<label class="atr-check"><input type="checkbox" data-voo-waiver> ' +
        '<span><strong>Privacy waiver for a virtual session.</strong> When we meet on my screen, my associate can see what I show them and help me with my device. ' +
        'I am always in charge: I can stop sharing, mute, or end the session at any time, and nothing stays connected when it ends. The session is not recorded, and it is for help with my device only.</span></label>' +
        '<label class="atr-check"><input type="checkbox" data-voo-consent> ' +
        '<span>I agree: $25 now for the first hour, my card stays on file with Square, and time after the first hour may be charged to it at $25 an hour.</span></label>' +
        '<p><button type="button" class="btn btn-primary btn-lg" data-voo-pay disabled><i class="fas fa-lock"></i> Pay $25 with Square</button></p>' +
        '<p class="atr-paystep-note" data-voo-join>Or get this session free with ATR One &mdash; join for $9.99 and save $15 today. Remote service is included for members. <a href="' + ATR_ONE_JOIN_LINK + '" target="_blank" rel="noopener">Join ATR One</a></p>' +
        '<p class="atr-paystep-note" data-voo-note>ATR One member? Your member key covers virtual sessions &mdash; skip the payment and use your key when your session starts.</p>';
      panel.hidden = false;
      var waiverBox = panel.querySelector('[data-voo-waiver]');
      var consentBox = panel.querySelector('[data-voo-consent]');
      var payBtn = panel.querySelector('[data-voo-pay]');
      var note = panel.querySelector('[data-voo-note]');
      /* Both boxes, separately: the privacy waiver AND the payment
         consent. Either one alone leaves the button disabled. */
      var syncPayBtn = function () { payBtn.disabled = !(waiverBox.checked && consentBox.checked); };
      waiverBox.addEventListener('change', syncPayBtn);
      consentBox.addEventListener('change', syncPayBtn);
      payBtn.addEventListener('click', function () {
        /* Record the waiver agreement against this booking FIRST
           (fire-and-forget, like the alert emails — the booking and
           the disabled-until-agreed button are the on-page proof;
           the function's row is the record). */
        try {
          fetch(VIRTUAL_SESSION_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
              'apikey': SUPABASE_ANON_KEY
            },
            body: JSON.stringify({ action: 'waiver', kind: 'booking', ticket_id: opts.ticketId || null, email: opts.email || '', version: VIRTUAL_WAIVER_VERSION })
          }).catch(function () { /* best-effort record */ });
        } catch (e) { /* ignore */ }
        payBtn.disabled = true;
        payBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Opening Square&hellip;';
        /* SQUARE_SESSION_PAY_2026_11_10 (v86 hardening): the payment
           function only takes the $25 from the booker's own signed-in
           session (its Verify JWT is on and the booking email must
           match the account), so send the guest's session token —
           the same pattern the member-key check below already uses.
           A signed-out booker is told plainly to sign in first; the
           booking is already saved either way. */
        var payWithToken = function (token) {
          fetch(SQUARE_TICKET_CHECKOUT_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Authorization': 'Bearer ' + token,
              'apikey': SUPABASE_ANON_KEY
            },
            body: JSON.stringify({ mode: 'virtual-first-hour', ticket_id: opts.ticketId || null, email: opts.email || '', name: opts.name || '' })
          }).then(function (r) { return r.json().catch(function () { return null; }); })
            .then(function (j) {
              if (j && j.ok && j.url) {
                window.open(j.url, '_blank', 'noopener');
                note.textContent = 'Square is open in a new tab. Once the $25 is paid, your session is fully booked — keep the email we sent you; its link opens your Virtual One-on-One page when your session time comes.';
              } else {
                note.textContent = (j && j.error) ? j.error : 'The payment step is not connected yet. Your booking is saved — we will text you the payment link for the first hour.';
                payBtn.innerHTML = '<i class="fas fa-lock"></i> Pay $25 with Square';
                syncPayBtn();
              }
            })
            .catch(function () {
              note.textContent = 'The payment step is not connected yet. Your booking is saved — we will text you the payment link for the first hour.';
              payBtn.innerHTML = '<i class="fas fa-lock"></i> Pay $25 with Square';
              syncPayBtn();
            });
        };
        var askSignIn = function () {
          note.textContent = 'To pay the $25, sign in first (or make your free account) with the same email you booked with, then tap Pay again. Your booking is saved.';
          payBtn.innerHTML = '<i class="fas fa-lock"></i> Pay $25 with Square';
          syncPayBtn();
        };
        var payClient = createClient();
        if (payClient && payClient.auth && payClient.auth.getSession) {
          try {
            payClient.auth.getSession().then(function (res) {
              var t = res && res.data && res.data.session && res.data.session.access_token;
              if (t) { payWithToken(t); } else { askSignIn(); }
            }).catch(function () { askSignIn(); });
          } catch (e) { askSignIn(); }
        } else { askSignIn(); }
      });
      /* CONNECT_MEMBER_KEY_2026_11_10 (owner law, Nov 10, 2026):
         a signed-in PAID ATR One member is never charged here.
         The virtual-session function answers 'mykey' only for a
         signed-in caller with an active paid membership (the free
         tier has no membership rows, so it never answers with a
         key). If the key comes back, swap the whole panel to the
         covered message — no pay step, no pay waiver boxes: the
         member starts at session time with their key, and the
         session-start waiver on the Connect page still gates the
         session itself. Signed-out bookers and non-members hear
         nothing back and keep the pay panel above, word for word. */
      (function checkMemberKey() {
        var client = createClient();
        function ask(token) {
          try {
            fetch(VIRTUAL_SESSION_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': 'Bearer ' + token,
                'apikey': SUPABASE_ANON_KEY
              },
              body: JSON.stringify({ action: 'mykey' })
            }).then(function (r) { return r.json().catch(function () { return null; }); })
              .then(function (j) {
                if (!j || !j.ok || !j.key) return;
                panel.innerHTML =
                  '<h4>You are covered &mdash; no payment needed</h4>' +
                  '<p>Your ATR One membership covers virtual sessions, so there is nothing to pay for this booking. ' +
                  'When your session time comes, open ATRG Connect at the top of your account and use your member key &mdash; it is shown there when you are signed in.</p>' +
                  '<p class="atr-paystep-note">Your booking is saved.</p>';
                panel.hidden = false;
              })
              .catch(function () { /* not a signed-in member: the pay panel stands */ });
          } catch (e) { /* same */ }
        }
        if (client && client.auth && client.auth.getSession) {
          try {
            client.auth.getSession().then(function (res) {
              var t = res && res.data && res.data.session && res.data.session.access_token;
              ask(t || SUPABASE_ANON_KEY);
            }).catch(function () { ask(SUPABASE_ANON_KEY); });
          } catch (e) { ask(SUPABASE_ANON_KEY); }
        } else { ask(SUPABASE_ANON_KEY); }
      })();
      return;
    }
    /* SUPPORT_BOOKING_2026_11_06: a one-on-one booking is always the
       $15 tier (no diagnostics) — its panel is the $15 pattern only:
       confirm the booking and text the payment link. The booked time
       ($25 an hour) is settled at the visit. */
    if (isOneOnOne) {
      panel.innerHTML =
        '<h4>One last step to fully book your visit</h4>' +
        '<p>Your visit is fully booked once your $15.00 visit fee is paid. It covers the trip to you, is due at scheduling, and is non-refundable. ' +
        'We will confirm your booking and text you the payment link for that amount &mdash; your one-on-one time ($25 an hour) is settled at the visit.</p>' +
        '<p class="atr-paystep-note">If you close this page first, your booking is still saved and we will text you the payment link.</p>';
      panel.hidden = false;
      return;
    }
    panel.innerHTML =
      '<h4>One last step to fully book your appointment</h4>' +
      '<p>Your appointment is fully booked once your visit fee is paid. ' +
      'The visit fee is $15.00 when your repair is already known, or $35.00 if your device needs a full diagnosis first &mdash; either way it covers travel to you and is non-refundable. ' +
      'If your device needs the full diagnosis, you can pay that fee now: $35.00 plus Square&rsquo;s processing fee of $1.32, a total of $36.32. ' +
      'If your repair is already known, your fee is the $15.00 one &mdash; we will confirm it and text you the payment link for that amount.</p>' +
      '<p><a class="btn btn-primary btn-lg" href="' + SQUARE_HOUSECALL_LINK + '" target="_blank" rel="noopener">' +
      '<i class="fas fa-lock"></i> Pay $36.32 with Square</a></p>' +
      '<p class="atr-paystep-note">If you close this page before paying, your request is still saved ' +
      'and we will text you this payment link &mdash; your appointment is fully booked once the fee is paid.</p>';
    panel.hidden = false;
  }

  /* Honeypot: a hidden field real people never fill.
   * HONEYPOT_FAKESUCCESS_REMOVED_2026_11_04: the old trap faked a
   * success and wrote nothing when the field had any value — but
   * browser autofill can fill it for real people, and on Nov 4, 2026
   * it silently ate the owner's own warranty test submission
   * (success screen, no database row, no alert email). The Cloudflare
   * human check (Turnstile) already gates every form, so the trap is
   * retired: isSpam always returns false and the field is ignored. */
  function isSpam(form) {
    return false;
  }

  /* ---------------- email alert (fire-and-forget) ----------------
   * FORM_ALERTS_INHOUSE_2026_11_05 (Austin, Nov 5, 2026: form email
   * leaves every outside form service - our own forms, our own
   * server, our own backend): the alert is sent by the form-alert
   * Edge Function on the project's own Supabase backend, which
   * mails it through the business's own Zoho SMTP (From the
   * no-reply system mailbox, Reply-To service@). The function
   * picks the recipient from the form key server-side - the
   * browser never names an address. The call carries the project's
   * public anon key as the bearer, the same key the Supabase
   * client above already uses. Runs in parallel with the database
   * insert and is never awaited: the database insert alone decides
   * success or failure. */
  function sendAlert(subject, rows, formKey) {
    var clean = rows.map(function (r) {
      return [String(r[0]), r[1] === '' || r[1] == null ? '(not provided)' : String(r[1])];
    });
    try {
      fetch(FORM_ALERT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ kind: formKey, subject: subject, rows: clean })
      }).catch(function () { /* alert is best-effort; DB is the record */ });
    } catch (e) { /* ignore */ }
  }

  function firstInvalid(form, errors) {
    for (var name in errors) {
      if (Object.prototype.hasOwnProperty.call(errors, name)) {
        var el = form.elements[name];
        if (el && el.focus) { el.focus(); return; }
        if (el && el.length && el[0] && el[0].focus) { el[0].focus(); return; }
      }
    }
  }

  function applyErrors(form, errors) {
    var any = false;
    for (var name in errors) {
      if (Object.prototype.hasOwnProperty.call(errors, name)) {
        showFieldError(form, name, errors[name]);
        any = true;
      }
    }
    if (any) firstInvalid(form, errors);
    return any;
  }

  /* ================= WEB SIGNATURE (Repair Authorization) =================
   * SITE_AUDIT_FIXES_2026_10_30. The service-request form ends with an
   * "I authorize" button that opens the signature popup in index.html
   * (full published Repair Authorization text, signature pad, printed
   * name — the same pattern as the portal's sign flow). The completed
   * signature is held in webSignature; the submit handler refuses to
   * send without it. After the ticket insert succeeds, the signing is
   * uploaded to web-signatures/<ticketId>/ in the ticket-documents
   * bucket and a ticket_documents row (doc_type 'repair_authorization')
   * is filed against the ticket. Anon access for exactly that path is
   * granted by web-signature-filings.sql (run at publish time).
   * SITE_SIGNEDDOC_2026_10_30 (Oct 30, 2026): the filed artifact is no
   * longer the bare signature PNG — it is the COMPLETE signed document
   * composed as one self-contained HTML file (header, customer /
   * phone / device, the published authorization text, and the
   * signature affixed in a signature block; see
   * buildWebSignedAuthorizationHtml). The bare PNG upload remains only
   * as a fallback if composition is impossible, so a completed
   * signature is never lost. */
  var webSignature = null; // { signerName: string, dataUrl: string }
  var signWired = false;

  function newTicketId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    var d = new Date().getTime();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (d + Math.random() * 16) % 16 | 0;
      d = Math.floor(d / 16);
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function dataUrlToBlob(dataUrl) {
    try {
      var parts = String(dataUrl || '').split(',');
      var bin = window.atob(parts[1] || '');
      var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return new Blob([arr], { type: 'image/png' });
    } catch (e) { return null; }
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* SITE_SIGNEDDOC_2026_10_30: compose the complete signed Repair
   * Authorization as one self-contained HTML document — ATRG header,
   * the customer / phone / device and signing date, the site's own
   * published authorization text (the same #service-agreement
   * .legal-doc markup the signature popup clones at runtime, never a
   * second hand-kept copy), and the signature image affixed in a
   * signature block with the printed name and date. Returns null when
   * the published text cannot be found, so the caller can fall back
   * to the bare signature PNG instead of losing the signing. */
  function buildWebSignedAuthorizationHtml(meta, signerName, signatureDataUrl, signedAt) {
    var srcDoc = document.querySelector('#service-agreement .legal-doc');
    if (!srcDoc || !srcDoc.innerHTML) return null;
    var when = signedAt.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    var lines = [
      ['Customer', meta.customerName],
      ['Phone', meta.phone],
      ['Device', meta.device]
    ].filter(function (r) { return String(r[1] == null ? '' : r[1]).trim() !== ''; }).map(function (r) {
      return '<tr><th style="text-align:left;padding:0.3rem 0.9rem 0.3rem 0;color:#6B5B43;font-weight:600;vertical-align:top;">' + escHtml(r[0]) + '</th>' +
        '<td style="padding:0.3rem 0;">' + escHtml(r[1]) + '</td></tr>';
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
      '<div style="font-size:0.95rem;line-height:1.55;">' + srcDoc.innerHTML + '</div>' +
      '<h2 style="font-size:1.1rem;margin:1.75rem 0 0.5rem;">Signature</h2>' +
      '<div style="border:1px solid #E6D9C0;border-radius:8px;padding:1rem;background:#fff;">' +
      '<img alt="Customer signature" src="' + signatureDataUrl + '" style="display:block;max-width:100%;width:420px;height:auto;">' +
      '<div style="border-top:2px solid #2C231A;margin-top:0.4rem;padding-top:0.5rem;font-size:0.95rem;">Signed by: ' + escHtml(signerName || '') + '</div>' +
      '<div style="font-size:0.95rem;margin-top:0.25rem;">Date: ' + escHtml(when) + '</div>' +
      '</div>' +
      '<p style="font-size:0.8rem;color:#6B5B43;margin-top:1.5rem;">Signed electronically through austinstechrepairgroup.com and filed on the customer\u2019s repair ticket by Austin\u2019s Tech Repair Group.</p>' +
      '</div></body></html>';
  }

  function fileWebSignature(client, ticketId, meta, done) {
    if (!webSignature || !client) { done(); return; }
    var stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    var signedAt = new Date();
    function fileArtifact(fileName, content, contentType, displayName) {
      var path = 'web-signatures/' + ticketId + '/' + fileName;
      client.storage.from('ticket-documents').upload(path, content, { contentType: contentType, upsert: false }).then(function (up) {
        if (up.error) { done(); return; }
        var row = {
          ticket_id: ticketId, doc_type: 'repair_authorization', storage_path: path,
          file_name: displayName || fileName, signer_name: webSignature.signerName, signed_at: signedAt.toISOString()
        };
        client.from('ticket_documents').insert(row).then(function () { done(); }).catch(function () { done(); });
      }).catch(function () { done(); });
    }
    var html = null;
    try { html = buildWebSignedAuthorizationHtml(meta || {}, webSignature.signerName, webSignature.dataUrl, signedAt); } catch (e) { html = null; }
    if (html) {
      var displayName = 'Repair Authorization \u2014 signed ' + signedAt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) + '.html';
      fileArtifact('repair_authorization-' + stamp + '.html', new Blob([html], { type: 'text/html' }), 'text/html', displayName);
      return;
    }
    var blob = dataUrlToBlob(webSignature.dataUrl);
    if (!blob) { done(); return; }
    fileArtifact('repair_authorization-' + stamp + '.png', blob, 'image/png', null);
  }

  function wireSignature(form) {
    var btn = form.querySelector('#sr-authorize-btn');
    if (!btn) return;
    btn.addEventListener('click', function () { openSignPopup(form); });
  }

  function openSignPopup(form) {
    var overlay = document.getElementById('atr-sign-overlay');
    if (!overlay) return;
    var textBox = document.getElementById('atr-sign-text');
    if (textBox && !textBox.getAttribute('data-filled')) {
      /* The popup shows the site's own published Repair Authorization
         & Service Agreement verbatim — cloned from the legal page, so
         the text can never drift from what the site publishes. */
      var srcDoc = document.querySelector('#service-agreement .legal-doc');
      if (srcDoc) { textBox.innerHTML = srcDoc.innerHTML; }
      else { textBox.textContent = 'The full Repair Authorization & Service Agreement is linked in the footer of this page (Service Agreement & Waiver).'; }
      textBox.setAttribute('data-filled', '1');
    }
    var errBox = document.getElementById('atr-sign-err');
    function showSignErr(msg) { if (errBox) { errBox.textContent = msg; errBox.hidden = !msg; } }
    function close() { overlay.classList.remove('open'); }
    overlay.classList.add('open');
    showSignErr('');

    if (!signWired) {
      signWired = true;
      var canvas = document.getElementById('atr-sign-pad');
      var ctx = canvas.getContext('2d');
      ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#2b2118';
      var drawing = false, last = null;
      var hasDrawn = false;
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
      document.getElementById('atr-sign-clear').addEventListener('click', function () {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        hasDrawn = false;
      });
      document.getElementById('atr-sign-cancel').addEventListener('click', close);
      document.getElementById('atr-sign-close').addEventListener('click', close);
      overlay.addEventListener('click', function (e) {
        /* SITE_DEADEND_2026_10_30: a stray backdrop tap must not throw
           away a drawn signature — confirm first when the pad has been
           used; an untouched pad still closes instantly. The Cancel,
           Close, and Clear buttons keep their existing behavior. */
        if (e.target !== overlay) return;
        if (hasDrawn && !window.confirm('Discard this signature? It will be lost.')) return;
        close();
      });
      document.getElementById('atr-sign-save').addEventListener('click', function () {
        var nameInput = document.getElementById('atr-sign-name');
        var name = trim(nameInput ? nameInput.value : '');
        if (!name) { showSignErr('Type your printed name first.'); return; }
        if (!hasDrawn) { showSignErr('Sign in the box first.'); return; }
        webSignature = { signerName: name, dataUrl: canvas.toDataURL('image/png') };
        close();
        var status = document.getElementById('sr-signature-status');
        if (status) status.textContent = 'Signed by ' + name + ' \u2014 now tap "Send Service Request" to finish.';
        var slot = document.querySelector('form[data-form="service-request"] [data-error-for="signature"]');
        if (slot) slot.textContent = '';
      });
    }
    var nameInput = document.getElementById('atr-sign-name');
    if (nameInput && !nameInput.value) {
      var fn = field(form, 'first_name'), ln = field(form, 'last_name');
      var full = (fn + ' ' + ln).trim();
      if (full) nameInput.value = full;
    }
  }

  /* ================= SERVICE REQUEST =================
   * Replicates JotForm "Service Request" 261955946010055 (22 cataloged
   * fields). Writes to public.tickets; source is the composed lead
   * source (see leadSource above), falling back to 'website'.
   * Mapping notes / exceptions (see README.md for the full table):
   *  - Email maps to tickets.customer_email (column added 2026-10-20).
   *  - The JotForm form's built-in "how was your experience" rating
   *    has no tickets column — alert payload only (superseded by the
   *    dedicated feedback table / "How Did We Do" form).
   *  - The "(Dispatch Use Only)" staff checkbox is intentionally NOT
   *    reproduced on the public form.
   *  - JotForm's CAPTCHA is replaced by the honeypot above. */
  function handleServiceRequest(form) {
    wireSignature(form);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      clearErrors(form);
      if (isSpam(form)) { showSuccess(form, 'service-request', { first_name: field(form, 'first_name') }); return; }

      var v = {
        first_name: field(form, 'first_name'),
        last_name: field(form, 'last_name'),
        phone: field(form, 'phone'),
        email: field(form, 'email'),
        device_type: field(form, 'device_type'),
        device_info: field(form, 'device_info'),
        repair_needed: field(form, 'repair_needed'),
        problem: field(form, 'problem')
      };

      /* SUPPORT_BOOKING_2026_11_06 (design pivot): the same form, the
         same submit — when the wizard is in One-on-One mode the guided
         selection says so, and this handler writes the [SERVICE]
         ticket instead of a repair ticket. */
      var guidedEarly = window.atrGuidedSelection || null;
      var isOO = !!(guidedEarly && guidedEarly.mode === 'oneonone');
      /* VIRTUAL_ONE_ON_ONE_2026_11_10: the How will we meet? pick,
         carried from the wizard/pane through atrGuidedSelection. */
      var isVirtual = !!(isOO && guidedEarly.ooPlace === 'virtual');

      var errors = {};
      if (!v.first_name) errors.first_name = 'Please enter your first name.';
      if (!v.last_name) errors.last_name = 'Please enter your last name.';
      if (!validPhone(v.phone)) errors.phone = 'Please enter a valid phone number.';
      if (!validEmail(v.email)) errors.email = 'Please enter a valid email address.';
      if (!v.device_type) errors.device_type = 'Please choose a device category.';
      if (!isOO && !v.repair_needed && !v.problem) errors.problem = 'Tell us what repair you need, or describe the problem.';
      if (isOO && !guidedEarly.serviceKind) errors.problem = 'Please go back to step 2 and pick the kind of one-on-one help you need.';
      if (!field(form, 'terms_accepted')) errors.terms_accepted = 'Please accept the Terms and Conditions to continue.';
      if (!field(form, 'dispatch_acknowledged')) errors.dispatch_acknowledged = 'Please check the acknowledgment box to continue.';
      /* THREE_FORMS_2026_11_11 (Austin, Nov 11, 2026): the
         acknowledgment gate applies to all three forms alike. The
         row is never hidden — script.js applyVirtualFormEffects
         words it per form: Repair keeps the $15/$35 visit-fee text,
         One-on-One in person names the $15 visit fee and the $25
         collected upon arrival, and Virtual says the $25 is due at
         the time of the connect. (VIRTUAL_FEE_APPLIES still records
         that a virtual booking has no visit fee at all — the $25 is
         the session's first hour, collected at connect time through
         the pay step, not a fee due at scheduling.) */
      /* A one-on-one visit has no repair work to authorize, so the
         work-order authorization and the Repair Authorization signature
         are not gates in this mode (their rows are hidden too). */
      if (!isOO && !field(form, 'work_auth_accepted')) errors.work_auth_accepted = 'Please authorize the work order to continue.';
      if (!isOO && !webSignature) errors.signature = 'Please tap "I authorize" and sign the Repair Authorization to continue.';
      if (applyErrors(form, errors)) return;

      var address = composeAddress(form, 'address');
      /* REPAIR_FLOW_UPDATE_2026_11_05: the form now collects a visit date + 2-hour arrival window
         instead of an exact time. The stored appointment_at is the window
         START on that date, so the portal timeline keeps working; the
         window itself rides the alert below. The legacy appointment_at
         field is still honored if a cached page submits it. */
      var appointmentRaw = field(form, 'appointment_at');
      var appointmentAt = null;
      if (appointmentRaw) {
        var d = new Date(appointmentRaw);
        if (!isNaN(d.getTime())) appointmentAt = d.toISOString();
      }
      var visitDate = field(form, 'visit_date');
      var arrivalWindow = field(form, 'arrival_window');
      if (!appointmentAt && visitDate) {
        var startHour = { '8:00 AM \u2013 10:00 AM': 8, '10:00 AM \u2013 12:00 PM': 10, '12:00 PM \u2013 2:00 PM': 12, '2:00 PM \u2013 4:00 PM': 14, '4:00 PM \u2013 6:00 PM': 16, '6:00 PM \u2013 8:00 PM': 18 }[arrivalWindow];
        var vd = new Date(visitDate + 'T' + (typeof startHour === 'number' ? String(startHour).padStart(2, '0') : '09') + ':00:00');
        if (!isNaN(vd.getTime())) appointmentAt = vd.toISOString();
      }
      var atrOneCovered = field(form, 'atr_one_covered');
      var issue = v.repair_needed
        ? (v.problem ? v.repair_needed + ' — ' + v.problem : v.repair_needed)
        : v.problem;

      /* SITE_AUDIT_FIXES_2026_10_30: when the customer arrived through
         the guided wizard (steps 1–3), merge their selections in —
         the guided issue and the estimate they were shown lead the
         ticket's issue text, exactly like the retired mini contact
         form did. The ticket id is generated here so the signed
         authorization can be filed against the ticket afterwards
         (the anon role cannot read the row back). */
      var guided = window.atrGuidedSelection || null;
      if (isOO) {
        /* SUPPORT_BOOKING_2026_11_06 ticket contract: the issue leads
           with the [SERVICE] marker the portal and the account split
           read, issue_reason carries the service kind (set on the row
           below), and the composed line carries device/brand/model +
           kind + hours at the pure price, with the visit fee as its
           own segment. The goal text (the form's describe field, fed
           by step 2's "What do you want to get done?") rides along. */
        var brandModel = [guidedEarly.brand, guidedEarly.model].filter(Boolean).join(' ');
        var ooHours = guidedEarly.ooHours || 1;
        var ooTime = ooHours * 25;
        if (isVirtual) {
          /* VIRTUAL_ONE_ON_ONE_2026_11_10: VIRTUAL leads the service
             segment, plainly, so the portal ticket shows it at a
             glance. No visit-fee segment — the switch is off. The
             ticket still carries the full service address (owner:
             the address stays, in case the session switches to in
             person halfway). */
          issue = '[SERVICE] ' + guidedEarly.serviceKind + ' \u2014 ' + (brandModel || guidedEarly.device || v.device_type) +
            ' \u00b7 VIRTUAL session \u00b7 ' + ooHours + (ooHours === 1 ? ' hour' : ' hours') + ' one-on-one ($' + ooTime + ')';
        } else {
          issue = '[SERVICE] ' + guidedEarly.serviceKind + ' \u2014 ' + (brandModel || guidedEarly.device || v.device_type) +
            ' \u00b7 ' + ooHours + (ooHours === 1 ? ' hour' : ' hours') + ' one-on-one ($' + ooTime + ') | Visit fee: $15';
        }
        if (v.problem) issue += ' \u00b7 ' + v.problem;
      } else if (guided && guided.issue) {
        var guidedIssues = (guided.issues && guided.issues.length) ? guided.issues.join(', ') : guided.issue;
        issue = guidedIssues + ' \u2014 ' + issue + ' (Estimate shown: ' + guided.priceRange + ')';
      }
      /* REPAIR_FLOW_UPDATE_2026_11_05: no atr_one column exists on tickets and none is invented —
         the answer (form field first, guided flow as fallback) is recorded
         in the ticket's issue text, where staff see it on the ticket. */
      if (!atrOneCovered && guided && guided.atrOne) atrOneCovered = guided.atrOne;
      if (atrOneCovered) issue = issue + ' (ATR One covered: ' + atrOneCovered + ')';
      var ticketId = newTicketId();

      var row = {
        id: ticketId,
        customer_name: fullName(form, 'first_name', 'last_name'),
        customer_phone: v.phone,
        customer_email: v.email,
        device_type: v.device_type,
        brand: guided && guided.brand ? guided.brand : null, // guided wizard brand when present; the JotForm-era form collected brand+model as one "Device Information" text
        model: v.device_info || null,
        issue: issue,
        service_address: address || null,
        contact_method: field(form, 'contact_method') || null,
        appointment_at: appointmentAt,
        serial_imei: field(form, 'serial_imei') || null,
        power_on: field(form, 'power_on') || null,
        backed_up: field(form, 'backed_up') || null,
        prior_repair: field(form, 'prior_repair') || null,
        warranty_status: field(form, 'warranty_status') || null,
        terms_accepted: !!field(form, 'terms_accepted'),
        dispatch_acknowledged: !!field(form, 'dispatch_acknowledged'),
        work_auth_accepted: webSignature ? true : !!field(form, 'work_auth_accepted'), // set from the completed signature (the submit gate above guarantees it)
        marketing_opt_in: !!field(form, 'marketing_opt_in'),
        source: leadSource(form) || 'website',
        status: 'Awaiting Estimate'
        // customer_id intentionally omitted: anonymous web submission.
      };

      /* SUPPORT_BOOKING_2026_11_06: the [SERVICE] ticket's status and
         reason. issue_reason is the service kind, verbatim. */
      if (isOO) {
        row.status = 'Support Requested';
        row.issue_reason = guidedEarly.serviceKind;
      }

      setBusy(form, true);
      if (isOO && isVirtual) {
        /* VIRTUAL_ONE_ON_ONE_2026_11_10: the internal alert keeps the
           same 'service-request' kind (service@), with the trip rows
           swapped for the session rows — How first, so nobody reads
           this as a trip to dispatch. The full service address still
           rides along (owner: it stays). */
        sendAlert('New VIRTUAL one-on-one booking: ' + guidedEarly.serviceKind, [
          ['Name', row.customer_name],
          ['Phone', v.phone],
          ['Email', v.email],
          ['Preferred contact method', row.contact_method],
          ['How', 'Virtual \u2014 on the guest\u2019s screen'],
          ['Service address (on file)', address],
          ['Session date', visitDate],
          ['Session start window (2-hour)', arrivalWindow],
          ['Covered by ATR One', atrOneCovered],
          ['Device', [guidedEarly.device, guidedEarly.brand, guidedEarly.model].filter(Boolean).join(' ')],
          ['Service kind', guidedEarly.serviceKind],
          ['What they want to get done', v.problem],
          ['One-on-one time', ooHours + (ooHours === 1 ? ' hour' : ' hours') + ' \u2014 $' + ooTime],
          ['Visit fee', 'None \u2014 virtual session'],
          ['Heard about us', row.source],
          ['Marketing emails opt-in', row.marketing_opt_in ? 'Yes' : 'No']
        ], 'service-request');
        /* VIRTUAL_ONE_ON_ONE_2026_11_10: the guest's own confirmation
           email — a NEW form-alert kind, 'virtual-booking', spec'd
           in the build report as a deploy companion (recipient: the
           guest, from the Email row; From no-reply@, Reply-To
           service@). Fire-and-forget like every alert: until the
           kind is deployed the booking stands on the ticket alone,
           and the pay step tells the guest to keep "the email we
           sent" only after Square opens — the report flags this
           dependency for the publisher. */
        sendAlert('Your Virtual One-on-One is booked', [
          ['Email', v.email],
          ['Name', row.customer_name],
          ['Session date', visitDate],
          ['Session start window', arrivalWindow],
          ['Your Virtual One-on-One page', 'https://austinstechrepairgroup.com/#virtual-oneonone'],
          ['Your code', 'Your associate will give you your code when your session starts.']
        ], 'virtual-booking');
      } else if (isOO) {
        /* SUPPORT_BOOKING_2026_11_06: same form-alert, same existing
           'service-request' kind (routes to service@) — rows carry the
           one-on-one contract with the fee on its own line. */
        sendAlert('New one-on-one booking: ' + guidedEarly.serviceKind, [
          ['Name', row.customer_name],
          ['Phone', v.phone],
          ['Email', v.email],
          ['Preferred contact method', row.contact_method],
          ['Service address', address],
          ['Appointment requested', appointmentAt ? new Date(appointmentAt).toLocaleString() : ''],
          ['Preferred visit date', visitDate],
          ['Arrival window (2-hour)', arrivalWindow],
          ['Covered by ATR One', atrOneCovered],
          ['Device', [guidedEarly.device, guidedEarly.brand, guidedEarly.model].filter(Boolean).join(' ')],
          ['Service kind', guidedEarly.serviceKind],
          ['What they want to get done', v.problem],
          ['One-on-one time', ooHours + (ooHours === 1 ? ' hour' : ' hours') + ' \u2014 $' + ooTime],
          ['Visit fee', '$15'],
          ['Heard about us', row.source],
          ['Marketing emails opt-in', row.marketing_opt_in ? 'Yes' : 'No']
        ], 'service-request');
      } else {
      sendAlert('New service request: ' + v.device_type + ' – ' + (v.repair_needed || 'Service request'), [
          ['Name', row.customer_name],
          ['Phone', v.phone],
          ['Email', v.email],
          ['Preferred contact method', row.contact_method],
          ['Service address', address],
          ['Appointment requested', appointmentAt ? new Date(appointmentAt).toLocaleString() : ''],
          ['Preferred visit date', visitDate],
          ['Arrival window (2-hour)', arrivalWindow],
          ['Covered by ATR One', atrOneCovered],
          ['Device category', v.device_type],
          ['Device information', v.device_info],
          ['Repair needed', v.repair_needed],
          ['Describe the problem', v.problem],
          ['Serial Number / IMEI', row.serial_imei],
          ['Does it power on?', row.power_on],
          ['Is it backed up?', row.backed_up],
          ['Has it been repaired before?', row.prior_repair],
          ['Under manufacturer warranty?', row.warranty_status],
          ['Heard about us', row.source],
          ['Marketing emails opt-in', row.marketing_opt_in ? 'Yes' : 'No'],
          ['Authorization signed by', webSignature ? webSignature.signerName : ''],
          ['Guided estimate shown', guided ? guided.priceRange : '']
        ], 'service-request');
      }

      withClient(function (client) {
        if (!client) { setBusy(form, false); showFormError(form, dbFailMessage()); return; }
        // No .select() — see the return=minimal note at the top of this file.
        /* GUEST_FOR_EVERY_TICKET_2026_11_09: find-or-create the
         * guest record first and link it on the row; on any
         * guest-step failure the ticket inserts exactly as it did
         * before (no customer_id), so a booking can never be
         * stranded by the guest step. */
        var doInsert = function () {
        client.from('tickets').insert(row).then(function (res) {
          setBusy(form, false);
          if (res.error) { showFormError(form, dbFailMessage()); return; }
          /* File the signed authorization on the new ticket (upload,
             then the ticket_documents row), then show success. Filing
             is best-effort like the alert email: the ticket insert
             above is the record that decides success. */
          var afterInsert = function () {
            showSuccess(form, 'service-request', v);
            /* SITE_PAYSTEP_2026_10_30: route the customer to Square
               to pay the visit fee. Runs whether the signature
               filing above landed or not — filing is best-effort and
               the ticket insert already decided success.
               SUPPORT_BOOKING_2026_11_06: one-on-one bookings get the
               $15-tier panel (no Square link for that tier). */
            /* VIRTUAL_ONE_ON_ONE_2026_11_10: a virtual booking's pay
               step needs the ticket + guest for the Square hand-off. */
            showPayStep(form, isOO, isVirtual ? { virtual: true, ticketId: ticketId, email: v.email, name: row.customer_name } : undefined);
            /* ATRONE_QR_2026_11_05: one-time create-a-password offer for
               guests, so this repair lands in an account they can track.
               The account module in index.html owns the offer and
               decides who sees it — signed-in customers never do.
               Best-effort like the alert email: the ticket insert above
               already decided success. SUPPORT_BOOKING_2026_11_06: routed
               through the one shared helper so every booking path offers
               it the same way. */
            offerSignupAfterSubmit(v, row);
          };
          /* SUPPORT_BOOKING_2026_11_06: a one-on-one booking has no
             signed authorization to file — it goes straight to the
             success path. Repairs keep the filing exactly as before. */
          if (isOO) afterInsert();
          else fileWebSignature(client, ticketId, { customerName: row.customer_name, phone: v.phone, device: [v.device_type, v.device_info].filter(Boolean).join(' \u00b7 ') }, afterInsert);
        }).catch(function () {
          setBusy(form, false);
          showFormError(form, dbFailMessage());
        });
        };
        ensureGuestRecord(client, { name: row.customer_name, email: v.email, phone: v.phone, address: address }).then(function (guestId) {
          if (guestId) row.customer_id = guestId;
          doInsert();
        }, doInsert);
      });
    });
  }

  /* One shared post-submit account offer for every booking path
   * (repair + support) — a single call site by design. */
  function offerSignupAfterSubmit(v, row) {
    if (window.atrOfferAccountSignup) {
      try { window.atrOfferAccountSignup({ email: v.email, name: row.customer_name, phone: v.phone }); } catch (e) {}
    }
  }

  /* ================= CONTACT =================
   * Simple "send us a message" form. Also lands in public.tickets
   * (source='contact', device_type='Contact message', issue = the
   * message body) so messages show up alongside repair tickets.
   * Sender email maps to tickets.customer_email (added 2026-10-20). */
  function handleContact(form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      clearErrors(form);
      if (isSpam(form)) { showSuccess(form, 'contact', { first_name: field(form, 'name') }); return; }

      var v = {
        name: field(form, 'name'),
        first_name: field(form, 'name').split(/\s+/)[0],
        phone: field(form, 'phone'),
        email: field(form, 'email'),
        message: field(form, 'message')
      };

      var errors = {};
      if (!v.name) errors.name = 'Please enter your name.';
      if (!v.message) errors.message = 'Please write a short message.';
      if (v.email && !validEmail(v.email)) errors.email = 'That email address doesn&rsquo;t look right.';
      if (v.phone && !validPhone(v.phone)) errors.phone = 'Please enter a valid phone number.';
      if (!v.email && !v.phone) errors.email = 'Give us an email or a phone number so we can reply.';
      if (applyErrors(form, errors)) return;

      var row = {
        customer_name: v.name,
        customer_phone: v.phone || null,
        customer_email: v.email || null,
        device_type: 'Contact message',
        issue: v.message,
        source: 'contact',
        status: 'Awaiting Estimate'
      };

      setBusy(form, true);
      sendAlert('New contact message from the website', [
        ['Name', v.name],
        ['Phone', v.phone],
        ['Email', v.email],
        ['Message', v.message]
      ], 'contact');

      withClient(function (client) {
        if (!client) { setBusy(form, false); showFormError(form, dbFailMessage()); return; }
        // No .select() — see the return=minimal note at the top of this file.
        /* GUEST_FOR_EVERY_TICKET_2026_11_09: a contact message
         * lands in tickets like any other ticket, so its sender
         * gets the same find-or-create guest link; on any failure
         * the message inserts exactly as it did before. */
        var doInsert = function () {
        client.from('tickets').insert(row).then(function (res) {
          setBusy(form, false);
          if (res.error) { showFormError(form, dbFailMessage()); return; }
          showSuccess(form, 'contact', v);
        }).catch(function () {
          setBusy(form, false);
          showFormError(form, dbFailMessage());
        });
        };
        ensureGuestRecord(client, { name: v.name, email: v.email || null, phone: v.phone || null }).then(function (guestId) {
          if (guestId) row.customer_id = guestId;
          doInsert();
        }, doInsert);
      });
    });
  }

  /* ================= JOB APPLICATION =================
   * Replicates JotForm "Job Application" 262347488023056 (15 cataloged
   * fields). Resume uploads FIRST to the private 'resumes' storage
   * bucket, then the application row is inserted into
   * public.job_applications with resume_url = the storage path.
   * Mapping exceptions (see README.md):
   *  - Current Address maps to job_applications.address (added 2026-10-20).
   *  - Education column combines level + field of study.
   *  - Recent employer column combines employer + job title.
   *  - cover_notes combines relevant experience + cover letter. */
  function handleJobApplication(form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      clearErrors(form);
      if (isSpam(form)) { showSuccess(form, 'job-application', { first_name: field(form, 'first_name') }); return; }

      var v = {
        first_name: field(form, 'first_name'),
        last_name: field(form, 'last_name'),
        email: field(form, 'email'),
        phone: field(form, 'phone'),
        position: field(form, 'position'),
        education: field(form, 'education'),
        field_of_study: field(form, 'field_of_study'),
        recent_employer: field(form, 'recent_employer'),
        job_title: field(form, 'job_title'),
        employment_dates: field(form, 'employment_dates'),
        experience: field(form, 'experience'),
        reference_name: field(form, 'reference_name'),
        reference_contact: field(form, 'reference_contact'),
        cover_notes: field(form, 'cover_notes')
      };

      var errors = {};
      if (!v.first_name) errors.first_name = 'Please enter your first name.';
      if (!v.last_name) errors.last_name = 'Please enter your last name.';
      if (!validEmail(v.email)) errors.email = 'Please enter a valid email address.';
      if (v.phone && !validPhone(v.phone)) errors.phone = 'Please enter a valid phone number.';
      if (!v.position) errors.position = 'Please choose the position you are applying for.';

      var fileInput = form.querySelector('input[type="file"][name="resume"]');
      var file = fileInput && fileInput.files && fileInput.files.length ? fileInput.files[0] : null;
      if (file && file.size > MAX_RESUME_BYTES) {
        errors.resume = 'That file is over 10 MB. Please upload a smaller resume.';
      }
      if (applyErrors(form, errors)) return;

      var address = composeAddress(form, 'address');
      var educationFull = joinParts([v.education, v.field_of_study], ' — ');
      var employerFull = joinParts([v.recent_employer, v.job_title], ' — ');
      var notesParts = [];
      if (v.experience) notesParts.push('Relevant experience:\n' + v.experience);
      if (v.cover_notes) notesParts.push('Cover letter / additional information:\n' + v.cover_notes);

      setBusy(form, true);
      withClient(function (client) {
        if (!client) { setBusy(form, false); showFormError(form, dbFailMessage()); return; }

        var finish = function (resumePath) {
          var row = {
            full_name: fullName(form, 'first_name', 'last_name'),
            email: v.email,
            phone: v.phone || null,
            position: v.position,
            education: educationFull || null,
            recent_employer: employerFull || null,
            employment_dates: v.employment_dates || null,
            reference_name: v.reference_name || null,
            reference_contact: v.reference_contact || null,
            address: address || null,
            resume_url: resumePath || null,
            cover_notes: notesParts.length ? notesParts.join('\n\n') : null
            // status intentionally omitted: DB default 'New' applies.
          };

          sendAlert('New job application: ' + v.position, [
            ['Name', row.full_name],
            ['Email', v.email],
            ['Phone', v.phone],
            ['Current address', address],
            ['Position applying for', v.position],
            ['Highest level of education', educationFull],
            ['Most recent employer', employerFull],
            ['Employment dates', v.employment_dates],
            ['Relevant experience', v.experience],
            ['Reference name', v.reference_name],
            ['Reference contact', v.reference_contact],
            ['Resume', resumePath ? 'Uploaded (storage path: ' + resumePath + ')' : 'Not provided'],
            ['Cover letter / additional info', v.cover_notes]
          ], 'job-application');

          // No .select() — see the return=minimal note at the top of this file.
          client.from('job_applications').insert(row).then(function (res) {
            setBusy(form, false);
            if (res.error) { showFormError(form, dbFailMessage()); return; }
            showSuccess(form, 'job-application', v);
          }).catch(function () {
            setBusy(form, false);
            showFormError(form, dbFailMessage());
          });
        };

        if (file) {
          var path = 'applications/' + Date.now() + '-' + sanitizeFilename(file.name);
          client.storage.from('resumes').upload(path, file, { cacheControl: '3600', upsert: false })
            .then(function (res) {
              if (res.error) {
                setBusy(form, false);
                showFieldError(form, 'resume', 'We couldn&rsquo;t upload that file. Try a PDF under 10 MB, or apply without it.');
                showFormError(form, dbFailMessage());
                return;
              }
              finish(path);
            })
            .catch(function () {
              setBusy(form, false);
              showFormError(form, dbFailMessage());
            });
        } else {
          finish(null);
        }
      });
    });
  }

  /* ================= INVESTORS =================
   * Replicates JotForm "Investors connect" 262354967610058 (8 cataloged
   * fields). Writes to public.investor_inquiries.
   * Mapping exceptions (see README.md): Company Name maps to
   * company_name and the "Connect me" consent checkbox maps to
   * consent_contact (both columns added 2026-10-20).
   * The JotForm form collects no phone number, so phone stays null. */
  function handleInvestors(form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      clearErrors(form);
      if (isSpam(form)) { showSuccess(form, 'investors', { first_name: field(form, 'first_name') }); return; }

      var v = {
        first_name: field(form, 'first_name'),
        last_name: field(form, 'last_name'),
        company: field(form, 'company'),
        investor_type: field(form, 'investor_type'),
        amount: field(form, 'amount_usd'),
        email: field(form, 'email'),
        focus: field(form, 'focus'),
        message: field(form, 'message')
      };

      var errors = {};
      if (!v.first_name) errors.first_name = 'Please enter your first name.';
      if (!v.last_name) errors.last_name = 'Please enter your last name.';
      if (!validEmail(v.email)) errors.email = 'Please enter a valid email address.';
      if (!field(form, 'connect_opt_in')) errors.connect_opt_in = 'Please check the box so we can connect with you.';
      if (applyErrors(form, errors)) return;

      var amount = v.amount === '' ? null : parseFloat(v.amount);
      if (amount !== null && (isNaN(amount) || amount < 0)) amount = null;

      var row = {
        full_name: fullName(form, 'first_name', 'last_name'),
        email: v.email,
        phone: null,
        company_name: v.company || null,
        consent_contact: !!field(form, 'connect_opt_in'),
        investor_type: v.investor_type || null,
        amount_usd: amount,
        focus: v.focus || null,
        message: v.message || null
        // status intentionally omitted: DB default 'New' applies.
      };

      setBusy(form, true);
      sendAlert('New investor inquiry from the website', [
        ['Name', row.full_name],
        ['Company', v.company],
        ['Investor type', v.investor_type],
        ['Amount willing to invest (USD)', v.amount],
        ['Email', v.email],
        ['Investment focus / interest', v.focus],
        ['Message / background', v.message]
      ], 'investors');

      withClient(function (client) {
        if (!client) { setBusy(form, false); showFormError(form, dbFailMessage()); return; }
        // No .select() — see the return=minimal note at the top of this file.
        client.from('investor_inquiries').insert(row).then(function (res) {
          setBusy(form, false);
          if (res.error) { showFormError(form, dbFailMessage()); return; }
          showSuccess(form, 'investors', v);
        }).catch(function () {
          setBusy(form, false);
          showFormError(form, dbFailMessage());
        });
      });
    });
  }

  /* ================= FEEDBACK — "HOW DID WE DO" =================
   * Native replacement for the JotForm "How Did We Do Today?" form
   * (its field list was never cataloged — see inventory §2.4). Writes
   * to public.feedback: 1–5 rating, overall experience, would-recommend,
   * comments. Designed to be the link target of the Google-review
   * request email; the success panel also carries the Google review
   * link used elsewhere on the site. */
  function handleFeedback(form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      clearErrors(form);
      if (isSpam(form)) { showSuccess(form, 'feedback', {}); return; }

      var v = {
        customer_name: field(form, 'customer_name'),
        customer_email: field(form, 'customer_email'),
        rating: field(form, 'rating'),
        experience: field(form, 'experience'),
        would_recommend: field(form, 'would_recommend'),
        comments: field(form, 'comments')
      };

      var errors = {};
      if (!v.rating) errors.rating = 'Please tap a star rating.';
      if (v.customer_email && !validEmail(v.customer_email)) errors.customer_email = 'That email address doesn&rsquo;t look right.';
      if (!v.would_recommend) errors.would_recommend = 'Please tell us if you&rsquo;d recommend us.';
      if (applyErrors(form, errors)) return;

      var ratingNum = parseInt(v.rating, 10);
      var row = {
        customer_name: v.customer_name || null,
        customer_email: v.customer_email || null,
        rating: isNaN(ratingNum) ? null : ratingNum,
        experience: v.experience || null,
        would_recommend: v.would_recommend || null,
        comments: v.comments || null
      };

      setBusy(form, true);
      sendAlert('New "How Did We Do" feedback: ' + (row.rating ? row.rating + ' / 5' : 'no rating'), [
        ['Name', v.customer_name],
        ['Email', v.customer_email],
        ['Rating', row.rating ? row.rating + ' / 5' : ''],
        ['Overall experience', v.experience],
        ['Would recommend us?', v.would_recommend],
        ['Comments', v.comments]
      ], 'feedback');

      withClient(function (client) {
        if (!client) { setBusy(form, false); showFormError(form, dbFailMessage()); return; }
        // No .select() — see the return=minimal note at the top of this file.
        client.from('feedback').insert(row).then(function (res) {
          setBusy(form, false);
          if (res.error) { showFormError(form, dbFailMessage()); return; }
          showSuccess(form, 'feedback', v);
        }).catch(function () {
          setBusy(form, false);
          showFormError(form, dbFailMessage());
        });
      });
    });
  }

  /* ================= WARRANTY REQUEST — WARRANTY_FORM_2026_11_03 =================
   * Customer warranty replacement requests from the site's Warranty
   * Request page (#warranty-request). Writes to public.warranty_requests;
   * that table is the system of record (staff work the requests from
   * the portal). Addressed to the business's warranty mailbox
   * (warranty@austinstechrepairgroup.com) — see the
   * REPORT in website-warranty-form-2026-11-03 for the gated email leg;
   * the in-house form-alert call below follows the same pattern as every other
   * form here and is best-effort only. The ticket number from the
   * customer's receipt is optional on purpose: a customer who lost the
   * receipt can still file, and staff can look them up. */
  function handleWarrantyRequest(form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      clearErrors(form);
      if (isSpam(form)) { showSuccess(form, 'warranty-request', {}); return; }

      var v = {
        customer_name: field(form, 'customer_name'),
        phone: field(form, 'phone'),
        email: field(form, 'email'),
        device: field(form, 'device'),
        ticket_ref: field(form, 'ticket_ref'),
        repair_date: field(form, 'repair_date'),
        part_service: field(form, 'part_service'),
        problem: field(form, 'problem'),
        contact_pref: field(form, 'contact_pref')
      };
      v.first_name = v.customer_name ? v.customer_name.split(' ')[0] : '';

      var errors = {};
      if (!v.customer_name) errors.customer_name = 'Please tell us your name.';
      if (!v.phone) errors.phone = 'Please add a phone number so we can reach you.';
      else if (!validPhone(v.phone)) errors.phone = 'That phone number doesn&rsquo;t look right.';
      if (!v.email) errors.email = 'Please add your email address.';
      else if (!validEmail(v.email)) errors.email = 'That email address doesn&rsquo;t look right.';
      if (!v.device) errors.device = 'Please tell us the device brand and model.';
      if (!v.repair_date) errors.repair_date = 'Please pick the closest date you can.';
      if (!v.part_service) errors.part_service = 'Please tell us which part or service this is about.';
      if (!v.problem) errors.problem = 'Please describe what is happening with the device.';
      if (!v.contact_pref) errors.contact_pref = 'Please choose how you would like us to reach you.';
      if (applyErrors(form, errors)) return;

      var row = {
        customer_name: v.customer_name,
        phone: v.phone,
        email: v.email,
        device: v.device,
        repair_date: v.repair_date || null,
        ticket_ref: v.ticket_ref || null,
        part_service: v.part_service,
        problem: v.problem,
        contact_pref: v.contact_pref
      };

      setBusy(form, true);
      sendAlert('New warranty request: ' + v.device, [
        ['Name', v.customer_name],
        ['Phone', v.phone],
        ['Email', v.email],
        ['Device', v.device],
        ['Ticket number (on your receipt)', v.ticket_ref],
        ['Date of original repair (approx.)', v.repair_date],
        ['Part or service under warranty', v.part_service],
        ['Problem', v.problem],
        ['Preferred contact method', v.contact_pref]
      ], 'warranty-request');

      withClient(function (client) {
        if (!client) { setBusy(form, false); showFormError(form, dbFailMessage()); return; }
        // No .select() — see the return=minimal note at the top of this file.
        client.from('warranty_requests').insert(row).then(function (res) {
          setBusy(form, false);
          if (res.error) { showFormError(form, dbFailMessage()); return; }
          showSuccess(form, 'warranty-request', v);
        }).catch(function () {
          setBusy(form, false);
          showFormError(form, dbFailMessage());
        });
      });
    });
  }

  /* ---------------- binding ---------------- */
  var HANDLERS = {
    'service-request': handleServiceRequest,
    'contact': handleContact,
    'job-application': handleJobApplication,
    'investors': handleInvestors,
    'feedback': handleFeedback,
    /* WARRANTY_FORM_2026_11_03 */
    'warranty-request': handleWarrantyRequest
  };

  function init() {
    document.querySelectorAll('form[data-form]').forEach(function (form) {
      var kind = form.getAttribute('data-form');
      if (!HANDLERS[kind]) return;
      /* SITE_TURNSTILE_2026_11_02: one widget per form, injected
       * just above the submit button (the service-request form is
       * also the repair wizard's step 4, so the wizard intake is
       * covered by this same gate), and the gate listener is
       * registered BEFORE the real handler so it can hold the
       * submit until the server confirms the token. If turnstile.js
       * failed to load, the gate is skipped rather than breaking
       * the form outright — the publish checklist requires
       * turnstile.js to be live alongside this file. */
      var slot = document.createElement('div');
      slot.className = 'atr-turnstile';
      var btn = form.querySelector('[type="submit"]');
      if (btn && btn.parentNode === form) form.insertBefore(slot, btn);
      else if (btn && btn.parentNode) btn.parentNode.insertBefore(slot, btn);
      else form.appendChild(slot);
      if (window.atrTurnstile) {
        window.atrTurnstile.mount(slot);
        window.atrTurnstile.gate(form, slot, {
          onBlocked: function (reason) {
            showFormError(form, reason === 'failed'
              ? 'The human check did not pass. Please complete it again, or call or text us at (937) 280-6243.'
              : 'Please complete the quick human check above the button, then send again. Stuck? Call or text us at (937) 280-6243.');
          }
        });
      }
      HANDLERS[kind](form);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
