/* =====================================================================
 * ATR Forms — native website forms for Austin's Tech Repair Group
 * =====================================================================
 * Replaces the JotForm embeds (Service Request 261955946010055,
 * Job Application 262347488023056, Investors 262354967610058) and adds
 * a native Contact form and "How Did We Do" feedback form.
 *
 * Every submission is written to Austin's own Supabase database
 * (project atr-customer-accounts) — that insert is the system of
 * record and the success criterion. A parallel FormSubmit AJAX email
 * alert goes to the business inbox so Austin is notified instantly,
 * exactly like the old lead emails.
 *
 * IMPORTANT (return=minimal): all inserts below intentionally use
 * supabase-js .insert() WITHOUT .select(). With no .select(), the
 * request carries "Prefer: return=minimal" and PostgREST does not try
 * to RETURN the row. The public (anon) role has INSERT-only access —
 * no SELECT policy — so an insert that asks for the row back would
 * FAIL even though the row was written. Never chain .select() here.
 *
 * NOTE (FormSubmit activation): the email alert endpoint below only
 * starts delivering after FormSubmit's one-time activation for this
 * address is completed (activation email link click). The alert
 * activates on first successful delivery; until then the database
 * insert still succeeds silently, so verify the alert separately
 * during go-live testing.
 *
 * Style: ES5, matching the rest of script.js on the site.
 *
 * SITE_AUDIT_FIXES_2026_10_30: the service-request form now also
 * lives at step 4 of the repair wizard (one form, one insert path),
 * carries the guided selections in, and requires the customer's
 * signature on the Repair Authorization before it can send.
 * ===================================================================== */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://lyujxpuicarblpkdzuuc.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5dWp4cHVpY2FyYmxwa2R6dXVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNjAxMjQsImV4cCI6MjEwNzczNjEyNH0.io4qD7pw878Xx97yoS6xzclO33aa4QYKENpwIyZ06xg';
  var SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  var ALERT_ENDPOINT = 'https://formsubmit.co/ajax/austin.caudill@austinstechrepairgroup.com';
  var BUSINESS_PHONE_DISPLAY = '937-280-6243';
  var BUSINESS_PHONE_TEL = 'tel:9372806243';
  var MAX_RESUME_BYTES = 10 * 1024 * 1024; // 10 MB client-side guard

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
        'job-application': 'Thanks ' + first + '! Your application is in. We&rsquo;ll review it and reach out if it&rsquo;s a fit.',
        'investors': 'Thanks ' + first + '! Your inquiry is in &mdash; Austin will follow up with you personally.',
        'feedback': 'Thanks for telling us how we did &mdash; feedback like yours helps local folks find us.'
      }[kind];
      if (text) msg.innerHTML = text;
    }
    success.hidden = false;
    success.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* Honeypot: a hidden field real people never fill. If it has a value,
   * treat the submit as spam: fake a success, write nothing. */
  function isSpam(form) {
    var hp = form.querySelector('.atr-honeypot input, input[name="_honey"]');
    return !!(hp && trim(hp.value) !== '');
  }

  /* ---------------- email alert (fire-and-forget) ----------------
   * Runs in parallel with the database insert and is never awaited:
   * the database insert alone decides success or failure. */
  function sendAlert(subject, rows) {
    var payload = { _subject: subject, _template: 'table' };
    rows.forEach(function (r) { payload[r[0]] = r[1] === '' || r[1] == null ? '(not provided)' : r[1]; });
    try {
      fetch(ALERT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
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
   * send without it. After the ticket insert succeeds, the PNG is
   * uploaded to web-signatures/<ticketId>/ in the ticket-documents
   * bucket and a ticket_documents row (doc_type 'repair_authorization')
   * is filed against the ticket. Anon access for exactly that path is
   * granted by web-signature-filings.sql (run at publish time). */
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

  function fileWebSignature(client, ticketId, done) {
    if (!webSignature || !client) { done(); return; }
    var stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    var fileName = 'repair_authorization-' + stamp + '.png';
    var path = 'web-signatures/' + ticketId + '/' + fileName;
    var blob = dataUrlToBlob(webSignature.dataUrl);
    if (!blob) { done(); return; }
    client.storage.from('ticket-documents').upload(path, blob, { contentType: 'image/png', upsert: false }).then(function (up) {
      if (up.error) { done(); return; }
      var row = {
        ticket_id: ticketId, doc_type: 'repair_authorization', storage_path: path,
        file_name: fileName, signer_name: webSignature.signerName, signed_at: new Date().toISOString()
      };
      client.from('ticket_documents').insert(row).then(function () { done(); }).catch(function () { done(); });
    }).catch(function () { done(); });
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
      overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
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

      var errors = {};
      if (!v.first_name) errors.first_name = 'Please enter your first name.';
      if (!v.last_name) errors.last_name = 'Please enter your last name.';
      if (!validPhone(v.phone)) errors.phone = 'Please enter a valid phone number.';
      if (!validEmail(v.email)) errors.email = 'Please enter a valid email address.';
      if (!v.device_type) errors.device_type = 'Please choose a device category.';
      if (!v.repair_needed && !v.problem) errors.problem = 'Tell us what repair you need, or describe the problem.';
      if (!field(form, 'terms_accepted')) errors.terms_accepted = 'Please accept the Terms and Conditions to continue.';
      if (!field(form, 'dispatch_acknowledged')) errors.dispatch_acknowledged = 'Please acknowledge the dispatch fee to continue.';
      if (!field(form, 'work_auth_accepted')) errors.work_auth_accepted = 'Please authorize the work order to continue.';
      if (!webSignature) errors.signature = 'Please tap "I authorize" and sign the Repair Authorization to continue.';
      if (applyErrors(form, errors)) return;

      var address = composeAddress(form, 'address');
      var appointmentRaw = field(form, 'appointment_at');
      var appointmentAt = null;
      if (appointmentRaw) {
        var d = new Date(appointmentRaw);
        if (!isNaN(d.getTime())) appointmentAt = d.toISOString();
      }
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
      if (guided && guided.issue) {
        issue = guided.issue + ' — ' + issue + ' (Estimate shown: ' + guided.priceRange + ')';
      }
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

      setBusy(form, true);
      sendAlert('New service request: ' + v.device_type + ' – ' + (v.repair_needed || 'Service request'), [
        ['Name', row.customer_name],
        ['Phone', v.phone],
        ['Email', v.email],
        ['Preferred contact method', row.contact_method],
        ['Service address', address],
        ['Appointment requested', appointmentAt ? new Date(appointmentAt).toLocaleString() : ''],
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
      ]);

      withClient(function (client) {
        if (!client) { setBusy(form, false); showFormError(form, dbFailMessage()); return; }
        // No .select() — see the return=minimal note at the top of this file.
        client.from('tickets').insert(row).then(function (res) {
          setBusy(form, false);
          if (res.error) { showFormError(form, dbFailMessage()); return; }
          /* File the signed authorization on the new ticket (upload,
             then the ticket_documents row), then show success. Filing
             is best-effort like the alert email: the ticket insert
             above is the record that decides success. */
          fileWebSignature(client, ticketId, function () {
            showSuccess(form, 'service-request', v);
          });
        }).catch(function () {
          setBusy(form, false);
          showFormError(form, dbFailMessage());
        });
      });
    });
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
      ]);

      withClient(function (client) {
        if (!client) { setBusy(form, false); showFormError(form, dbFailMessage()); return; }
        // No .select() — see the return=minimal note at the top of this file.
        client.from('tickets').insert(row).then(function (res) {
          setBusy(form, false);
          if (res.error) { showFormError(form, dbFailMessage()); return; }
          showSuccess(form, 'contact', v);
        }).catch(function () {
          setBusy(form, false);
          showFormError(form, dbFailMessage());
        });
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
          ]);

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
      ]);

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
      ]);

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

  /* ---------------- binding ---------------- */
  var HANDLERS = {
    'service-request': handleServiceRequest,
    'contact': handleContact,
    'job-application': handleJobApplication,
    'investors': handleInvestors,
    'feedback': handleFeedback
  };

  function init() {
    document.querySelectorAll('form[data-form]').forEach(function (form) {
      var kind = form.getAttribute('data-form');
      if (HANDLERS[kind]) HANDLERS[kind](form);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
