/* ==========================================================================
   AUSTIN'S TECH REPAIR GROUP — SITE SCRIPT
   Router + repair wizard + lead capture.
   SITE_AUDIT_FIXES_2026_10_30: wizard step 4 is now the full intake
   form (one form, one insert path — see atr-forms.js).
   ========================================================================== */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {

    /* ---------------- Page router ---------------- */
    var pages = document.querySelectorAll('.page');
    var navLinks = document.querySelectorAll('[data-page]');

    function switchPage(targetId) {
      var cleanId = String(targetId || '').replace('#', '');
      /* ACCOUNT_FIX_PASS_3_2026_11_06: remember the page the visitor
         was on when they step onto the account page, so the header
         account button can take them back to it (its toggle — see
         window.atrAccountToggleLeave in the accounts module). */
      if (cleanId === 'account') {
        var curPage = document.querySelector('.page.active');
        if (curPage && curPage.id && curPage.id !== 'account') window.__atrAcctReturn = curPage.id;
      }
      var found = false;
      pages.forEach(function (page) {
        if (page.id === cleanId) { page.classList.add('active'); found = true; }
        else { page.classList.remove('active'); }
      });
      if (!found && pages.length > 0) {
        document.getElementById('home').classList.add('active');
        cleanId = 'home';
      }
      navLinks.forEach(function (link) {
        link.classList.toggle('active', link.getAttribute('data-page') === cleanId);
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    document.body.addEventListener('click', function (e) {
      var target = e.target.closest('[data-page]');
      if (target) {
        var href = target.getAttribute('href');
        if (href && href.charAt(0) === '#') {
          e.preventDefault();
          closeMobileMenu();
          if (window.location.hash !== href) { window.location.hash = href; }
          switchPage(href);
          var guideId = target.getAttribute('data-guide');
          if (guideId) { setTimeout(function () { var el = document.getElementById(guideId); if (el) el.scrollIntoView({ behavior: 'auto', block: 'start' }); }, 800); }
        }
      }
    });

    if (window.location.hash) { switchPage(window.location.hash); }
    window.addEventListener('hashchange', function () {
      if (window.location.hash) { switchPage(window.location.hash); }
    });

    /* ---------------- Mobile menu ---------------- */
    /* SITE_NAV_FIX_2026_10_30: two fixes. (1) Tapping the dimmed area
       outside the panel now closes the menu — the cart drawer and account
       modal already close on overlay click; the menu never had a handler
       on #mobile-menu itself, which IS the dim layer here. (2) The page
       behind the menu is scroll-locked while it is open, using the same
       body-overflow pattern as openCart/openModal, extended to <html>
       plus a touchmove guard because iOS Safari still scrolls the page
       behind a fixed overlay with body overflow alone. Every close path
       (X, backdrop tap, menu link, Escape, resize to desktop) funnels
       through closeMobileMenu so the lock is always released. */
    var bottomMenuToggle = document.getElementById('bottom-menu-toggle');
    var mobileMenu = document.getElementById('mobile-menu');
    var menuClose = document.getElementById('menu-close');

    function menuIsOpen() {
      return !!mobileMenu && mobileMenu.getAttribute('aria-hidden') === 'false';
    }

    function lockPageScroll() {
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    }
    function unlockPageScroll() {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    }

    /* While the menu is open, stop touch drags from scrolling the page
       behind it. Drags that start inside the link list still scroll the
       list itself; taps (clicks) are unaffected either way. */
    function onMenuTouchMove(e) {
      var t = e.target;
      if (t && t.closest && !t.closest('.menu-links')) e.preventDefault();
    }

    function openMobileMenu() {
      if (!mobileMenu || menuIsOpen()) return;
      mobileMenu.setAttribute('aria-hidden', 'false');
      lockPageScroll();
      mobileMenu.addEventListener('touchmove', onMenuTouchMove, { passive: false });
    }

    function closeMobileMenu() {
      if (!mobileMenu || !menuIsOpen()) return;
      mobileMenu.setAttribute('aria-hidden', 'true');
      unlockPageScroll();
      mobileMenu.removeEventListener('touchmove', onMenuTouchMove);
    }

    if (bottomMenuToggle && mobileMenu) {
      bottomMenuToggle.addEventListener('click', openMobileMenu);
    }
    if (menuClose && mobileMenu) {
      menuClose.addEventListener('click', closeMobileMenu);
    }
    if (mobileMenu) {
      /* A tap whose target is the nav element itself landed on the dimmed
         backdrop outside .menu-panel (panel taps target panel children). */
      mobileMenu.addEventListener('click', function (e) {
        if (e.target === mobileMenu) closeMobileMenu();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeMobileMenu();
      });
      /* The toggle that opens this menu only exists at mobile widths
         (<= 920px). If the viewport grows past that while the menu is
         open, close it so the scroll lock is never left behind. */
      window.addEventListener('resize', function () {
        if (window.innerWidth > 920) closeMobileMenu();
      });
    }

    /* ---------------- Repair wizard ---------------- */
    var repairState = { device: '', brand: '', model: '', issue: '', issues: [], atrOne: '', describe: '', modelState: 'pending', priceRange: '$50 \u2013 $150', priceExact: null };

    /* REPAIR_FLOW_UPDATE_2026_11_05: persistent summary panel + step-2 gating.
       The summary is clean text rows only — NO device picture. Austin ruled
       Nov 5, 2026 (~1:51 PM): "leave the pics out, just keep the standard
       flow." The category-photo map from the earlier draft was removed
       entirely; nothing renders an image from flow selections. */
    function rfVal(id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
    function rfSet(id, txt) { var el = document.getElementById(id); if (el) el.textContent = txt; }
    function rfRenderSummary() {
      rfSet('rf-sum-device', repairState.device || 'Not picked yet');
      rfSet('rf-sum-brand', repairState.brand || '\u2014');
      rfSet('rf-sum-model', repairState.model || (repairState.modelState === 'notlisted' ? 'Not listed' : (repairState.modelState === 'na' ? 'Not applicable' : '\u2014')));
      var repairs = repairState.issues.length ? repairState.issues.map(function (i) { return i.name; }).join(', ') : (repairState.issue || '\u2014');
      rfSet('rf-sum-repair', repairs);
      /* REPAIR_WIZARD_ESTIMATE_FIX_2026_11_06: with more than one
         repair picked, the summary shows the COMBINED estimate (the
         summed priceRange rfToggleIssue maintains) instead of
         "Starting at" a single repair's figure. One repair keeps the
         exact wording it always had. */
      rfSet('rf-sum-estimate', repairState.issues.length ? (repairState.priceExact !== null && repairState.priceExact !== undefined ? (repairState.issues.length > 1 ? repairState.priceRange : 'Starting at ' + repairState.priceRange) : (repairState.issues.length > 1 && repairState.priceRange && (repairState.priceRange.charAt(0) === '$' || repairState.priceRange.indexOf('From ') === 0) ? repairState.priceRange : 'Confirmed up front')) : '\u2014');
      rfSet('rf-sum-atrone', repairState.atrOne ? ('Covered by ATR One: ' + repairState.atrOne) : 'Not answered yet');
      var loc = [rfVal('sr-address-street'), rfVal('sr-address-line2'), rfVal('sr-address-city'), rfVal('sr-address-state'), rfVal('sr-address-zip')].filter(Boolean).join(', ');
      rfSet('rf-sum-location', loc || '\u2014');
      var when = [rfVal('sr-visit-date'), rfVal('sr-arrival-window')].filter(Boolean).join(' \u00b7 ');
      rfSet('rf-sum-visit', when || '\u2014');
      var contact = [[rfVal('sr-first-name'), rfVal('sr-last-name')].filter(Boolean).join(' '), rfVal('sr-phone'), rfVal('sr-email')].filter(Boolean).join(' \u00b7 ');
      rfSet('rf-sum-contact', contact || '\u2014');
    }
    function rfGate() {
      var cont = document.getElementById('bk-continue');
      if (!cont) return;
      var modelOk = repairState.modelState === 'chosen' || repairState.modelState === 'notlisted' || repairState.modelState === 'na';
      var ready = !!(repairState.device && repairState.brand && modelOk && repairState.issues.length && repairState.atrOne);
      cont.disabled = !ready;
    }
    function rfShowFlowExtras() {
      var d = document.getElementById('bk-describe-wrap'); if (d) d.hidden = false;
      var a = document.getElementById('bk-atrone-wrap'); if (a) a.hidden = false;
    }
    var DEFAULT_ESTIMATE_NOTE = '';

    /* SITE_FORM_BACKNAV_2026_10_30: step-navigation state. currentRepairStep
       is the step on screen; furthestRepairStep is the furthest step the
       customer has legitimately reached through the flow's own forward
       path. The progress steps at the top can be tapped to revisit any
       step up to furthestRepairStep, but never to skip ahead into a step
       that has not been reached yet. */
    var currentRepairStep = 1;
    var furthestRepairStep = 1;

    var deviceData = {
      'Phone': {
        brands: ['Apple iPhone', 'Samsung Galaxy', 'Google Pixel', 'Other'],
        issues: [
          { name: 'Screen replacement', price: '$89 \u2013 $450' },
          { name: 'Battery replacement', price: '$69 \u2013 $119' },
          { name: 'Charging port repair', price: '$79 \u2013 $129' },
          { name: 'Camera / speaker fix', price: '$79 \u2013 $150' },
          { name: 'Water damage / diagnostic', price: '$49 \u2013 $120' }
        ]
      },
      'Tablet': {
        brands: ['Apple iPad', 'Samsung Galaxy Tab', 'Microsoft Surface', 'Other'],
        issues: [
          { name: 'Screen / digitizer repair', price: '$119 \u2013 $299' },
          { name: 'Battery service', price: '$89 \u2013 $159' },
          { name: 'Charging port repair', price: '$99 \u2013 $149' },
          { name: 'Diagnostic / software', price: '$50 \u2013 $100' }
        ]
      },
      'Computer': {
        brands: ['Apple Mac', 'Dell', 'HP', 'Lenovo', 'Custom PC'],
        issues: [
          { name: 'Laptop screen replacement', price: '$149 \u2013 $320' },
          { name: 'SSD upgrade & OS install', price: '$120 \u2013 $250' },
          { name: 'Virus cleanup & tuneup', price: '$79 \u2013 $130' },
          { name: 'Power / DC jack repair', price: '$110 \u2013 $220' }
        ]
      },
      'Game Console': {
        brands: ['Sony PlayStation', 'Microsoft Xbox', 'Nintendo Switch'],
        issues: [
          { name: 'HDMI port repair', price: '$130 \u2013 $180' },
          { name: 'Overheating / power fault', price: '$90 \u2013 $160' },
          { name: 'Disc drive / storage fix', price: '$80 \u2013 $150' }
        ]
      },
      'Smart Watch': {
        brands: ['Apple Watch', 'Samsung Galaxy Watch', 'Other'],
        issues: [
          { name: 'Screen replacement', price: '$99 \u2013 $199' },
          { name: 'Battery replacement', price: '$79 \u2013 $120' }
        ]
      },
      'Business / Other': {
        brands: ['Office / Network', 'POS system', 'Printer / peripheral', 'Other device'],
        issues: [
          { name: 'On-site diagnostic & support', price: '$95/hr + house call' },
          { name: 'Setup / install / cabling', price: 'Custom quote' }
        ]
      }
    };

    var repairCard = document.querySelector('.repair-card');
    if (repairCard) {
      var estNoteEl = document.getElementById('estimate-note');
      if (estNoteEl) DEFAULT_ESTIMATE_NOTE = estNoteEl.innerHTML;
      document.querySelectorAll('[data-device]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          repairState.device = btn.getAttribute('data-device');
          repairState.brand = '';
          repairState.model = '';
          repairState.issue = '';
          repairState.issues = [];
          repairState.atrOne = '';
          repairState.modelState = 'pending';
          repairState.priceExact = null;
          document.querySelectorAll('input[name="bk-atrone"]').forEach(function (r) { r.checked = false; });
          rfRenderSummary(); rfGate();
          document.querySelectorAll('[data-device]').forEach(function (b) { b.classList.remove('selected'); });
          btn.classList.add('selected');
          populateBookingOrFallback(repairState.device);
          /* SITE_FORM_BACKNAV_2026_10_30: picking a device resets the
             brand/issue picks, so steps 3\u20134 must be re-earned before
             their progress steps become tappable again. */
          furthestRepairStep = 2;
          goToRepairStep(2);
        });
      });

      document.querySelectorAll('.repair-card [data-back]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          goToRepairStep(parseInt(btn.getAttribute('data-back'), 10));
        });
      });

      /* REPAIR_FLOW_UPDATE_2026_11_05: step-2 Continue, describe box, ATR One radios, summary
         Change links, and live summary updates from the step-4 fields. */
      var bkContinue = document.getElementById('bk-continue');
      if (bkContinue) {
        bkContinue.addEventListener('click', function () {
          rfUpdateEstimate();
          furthestRepairStep = Math.max(furthestRepairStep, 3);
          goToRepairStep(3);
        });
      }
      var bkDescribe = document.getElementById('bk-describe');
      if (bkDescribe) {
        bkDescribe.addEventListener('input', function () {
          repairState.describe = bkDescribe.value.trim();
        });
      }
      document.querySelectorAll('input[name="bk-atrone"]').forEach(function (r) {
        r.addEventListener('change', function () {
          if (r.checked) { repairState.atrOne = r.value; rfRenderSummary(); rfGate(); }
        });
      });
      var srAtrOneSel = document.getElementById('sr-atr-one');
      if (srAtrOneSel) {
        srAtrOneSel.addEventListener('change', function () {
          repairState.atrOne = srAtrOneSel.value || repairState.atrOne;
          rfRenderSummary();
        });
      }
      document.querySelectorAll('[data-rf-change]').forEach(function (b) {
        b.addEventListener('click', function () {
          var n = parseInt(b.getAttribute('data-rf-change'), 10);
          if (n) { furthestRepairStep = Math.max(furthestRepairStep, n); goToRepairStep(n); }
        });
      });
      ['sr-first-name','sr-last-name','sr-phone','sr-email','sr-address-street','sr-address-line2','sr-address-city','sr-address-state','sr-address-zip','sr-visit-date','sr-arrival-window'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) { el.addEventListener('input', rfRenderSummary); el.addEventListener('change', rfRenderSummary); }
      });
      rfRenderSummary(); rfGate();

      var contBtn = document.querySelector('[data-action="continue-contact"]');
      if (contBtn) {
        contBtn.addEventListener('click', function () {
          /* SITE_FORM_BACKNAV_2026_10_30: reaching step 4 through Continue
             is what makes its progress step tappable on later revisits. */
          furthestRepairStep = 4;
          goToRepairStep(4);
        });
      }

      /* SITE_FORM_BACKNAV_2026_10_30: tapping a progress step jumps to any
         step the customer has already reached — backwards to fix a wrong
         pick, or forwards again to a reached step. A step that has not
         been reached yet is inert: the only way into a new step is the
         flow's own forward path (device \u2192 issue \u2192 Continue). */
      document.querySelectorAll('.progress-step').forEach(function (p) {
        function jump() {
          var n = parseInt(p.getAttribute('data-step'), 10);
          if (n && n !== currentRepairStep && n <= furthestRepairStep) goToRepairStep(n);
        }
        p.addEventListener('click', jump);
        p.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); jump(); }
        });
      });

      /* Lead source: the "How did you hear about us?" dropdown choice, plus
         automatic signals (external referrer hostname, utm_source param).
         Exposed on window so the account ticket insert reuses the same value.
         Format: "google-search", "yelp | ref: yelp.com", "flyer | utm: fb". */
      window.atrLeadSource = function () {
        var parts = [];
        var sel = document.getElementById('leadSourceIntake') || document.getElementById('leadSource');
        var choice = sel ? String(sel.value || '').trim() : '';
        if (choice) parts.push(choice);
        var refHost = '';
        try {
          if (document.referrer) refHost = new URL(document.referrer).hostname.replace(/^www\./, '');
        } catch (err) { refHost = ''; }
        if (refHost && refHost !== window.location.hostname) parts.push('ref: ' + refHost);
        var utm = '';
        try { utm = new URLSearchParams(window.location.search).get('utm_source') || ''; } catch (err) { utm = ''; }
        if (utm) parts.push('utm: ' + String(utm).trim());
        return parts.join(' | ');
      };

    }

    function populateBrandsAndIssues(deviceKey) {
      var data = deviceData[deviceKey] || { brands: ['Standard'], issues: [{ name: 'General repair', price: '$50 \u2013 $150' }] };
      var brandSel = document.getElementById('bk-brand-select');
      var issueList = document.getElementById('issue-list');
      var bkMW = document.getElementById('bk-model-wrap');
      var bkRW = document.getElementById('bk-repair-wrap');
      if (bkMW) bkMW.hidden = true;
      if (bkRW) bkRW.hidden = true;

      /* CHECKIN_DROPDOWNS_2026_11_05: fallback brands use the same single dropdown. */
      if (brandSel) {
        bkFillSelect(brandSel,
          data.brands.map(function (brand) { return [brand, brand]; }),
          'Choose your brand\u2026');
        brandSel.onchange = function () {
          if (brandSel.value) { repairState.brand = brandSel.value; repairState.modelState = 'na'; rfRenderSummary(); rfGate(); }
        };
      }
      repairState.modelState = 'na';
      rfShowFlowExtras();

      if (issueList) {
        issueList.innerHTML = '';
        var grid = document.createElement('div');
        grid.className = 'option-grid';
        data.issues.forEach(function (issue) {
          var iBtn = document.createElement('button');
          iBtn.type = 'button';
          iBtn.className = 'option-btn';
          iBtn.style.alignItems = 'flex-start';
          iBtn.style.textAlign = 'left';
          iBtn.innerHTML = '<strong>' + escapeHtml(issue.name) + '</strong><span style="font-size:0.78rem; color: var(--brand-deep); font-weight:800;">' + escapeHtml(issue.price) + '</span>';
          /* REPAIR_FLOW_UPDATE_2026_11_05: fallback issues are multi-select too; the step-2
             Continue button (gated on brand + issue + ATR One) advances. */
          iBtn.addEventListener('click', function () {
            rfToggleIssue(issue.name, null, iBtn, issue.price);
          });
          grid.appendChild(iBtn);
        });
        issueList.appendChild(grid);
      }
    }

    /* SITE_BOOKING_PICKER_2026_10_31: the booking flow now runs the
       same type -> brand -> model -> repair picker as the Prices page,
       fed by the shared price book the lookup exposes as
       window.ATR_PRICE_DATA. Priced repairs show their book price;
       unpriced ones carry the confirmed-up-front wording, never an
       invented number. Business / Other keeps the brand + issue path
       above (custom-quoted work). */
    var BK_TYPE_MAP = { 'Smart Watch': 'Smartwatch' };
    var BK_FRIENDLY = { 'Screen': 'Screen replacement', 'Battery': 'Battery replacement', 'Charging port': 'Charging port repair', 'Charging': 'Charging port repair' };
    var BK_REPAIR_ORDER = ['Screen', 'Battery', 'Charging port', 'Back glass', 'Camera', 'Speaker / Mic', 'HDMI port', 'Disc drive', 'Fan / Overheat', 'Controller repair', 'Storage upgrade', 'RAM upgrade', 'Keyboard / Trackpad', 'Keyboard', 'Virus / Software cleanup', 'Charging', 'Band / Button', 'Board / Solder'];

    function bkData() { return window.ATR_PRICE_DATA || null; }
    function bkTypeKey(device) { return BK_TYPE_MAP[device] || device; }
    function bkFmt(p) { return (p % 1 === 0) ? '$' + p : '$' + p.toFixed(2); }
    function bkTile(label, sub) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'option-btn';
      b.style.padding = '0.85rem 0.5rem';
      if (sub) {
        b.style.alignItems = 'flex-start';
        b.style.textAlign = 'left';
        b.innerHTML = '<strong>' + escapeHtml(label) + '</strong><span style="font-size:0.78rem; color: var(--brand-deep); font-weight:800;">' + escapeHtml(sub) + '</span>';
      } else {
        b.innerHTML = '<span>' + escapeHtml(label) + '</span>';
      }
      return b;
    }
    /* CHECKIN_DROPDOWNS_2026_11_05: fill a Brand/Model <select> — placeholder first, then
       [value,label] pairs. Programmatic fill never fires change. */
    function bkFillSelect(sel, pairs, placeholder) {
      if (!sel) return;
      sel.innerHTML = '';
      var ph = document.createElement('option');
      ph.value = ''; ph.textContent = placeholder;
      sel.appendChild(ph);
      pairs.forEach(function (pr) {
        var o = document.createElement('option');
        o.value = pr[0]; o.textContent = pr[1];
        sel.appendChild(o);
      });
      sel.value = '';
    }
    function bkSelect(container, btn) {
      container.querySelectorAll('.option-btn').forEach(function (x) { x.classList.remove('selected'); });
      btn.classList.add('selected');
    }
    function populateBookingOrFallback(device) {
      var DATA = bkData();
      if (DATA && DATA[bkTypeKey(device)]) populateBookingPicker(device);
      else populateBrandsAndIssues(device);
    }
    function populateBookingPicker(device) {
      var DATA = bkData();
      var typeKey = bkTypeKey(device);
      var brandSel = document.getElementById('bk-brand-select');
      var issueList = document.getElementById('issue-list');
      var modelWrap = document.getElementById('bk-model-wrap');
      var repairWrap = document.getElementById('bk-repair-wrap');
      if (issueList) issueList.innerHTML = '';
      if (modelWrap) modelWrap.hidden = true;
      if (repairWrap) repairWrap.hidden = true;
      if (!brandSel) { populateBrandsAndIssues(device); return; }
      bkFillSelect(brandSel,
        Object.keys(DATA[typeKey]).map(function (k) { return [k, k]; }).concat([['__other__', 'Other brand']]),
        'Choose your brand\u2026');
      brandSel.onchange = function () {
        if (!brandSel.value) return;
        var brandKey = brandSel.value;
        repairState.brand = brandKey === '__other__' ? 'Other' : brandKey;
        repairState.model = '';
        repairState.issue = '';
        repairState.issues = [];
        repairState.modelState = 'pending';
        repairState.priceExact = null;
        rfRenderSummary(); rfGate();
        renderBkModels(typeKey, brandKey);
      };
    }
    function renderBkModels(typeKey, brandKey) {
      var DATA = bkData();
      var modelWrap = document.getElementById('bk-model-wrap');
      var repairWrap = document.getElementById('bk-repair-wrap');
      var modelSel = document.getElementById('bk-model-select');
      if (!modelSel) return;
      if (repairWrap) repairWrap.hidden = true;
      var names = brandKey === '__other__' ? [] : Object.keys(DATA[typeKey][brandKey]);
      bkFillSelect(modelSel,
        names.map(function (k) { return [k, k]; }).concat([['__notlisted__', "My model isn't listed"]]),
        'Choose your model\u2026');
      modelSel.onchange = function () {
        if (!modelSel.value) return;
        var modelKey = modelSel.value;
        repairState.model = modelKey === '__notlisted__' ? '' : modelKey;
        repairState.modelState = modelKey === '__notlisted__' ? 'notlisted' : 'chosen';
        repairState.issue = '';
        repairState.issues = [];
        repairState.priceExact = null;
        rfRenderSummary(); rfGate();
        renderBkRepairs(typeKey, brandKey, modelKey);
      };
      if (modelWrap) { modelWrap.hidden = false; try { modelWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {} }
    }
    function bkGenericRepairs(typeKey) {
      var DATA = bkData();
      var seen = {};
      Object.keys(DATA[typeKey]).forEach(function (br) {
        Object.keys(DATA[typeKey][br]).forEach(function (mo) {
          Object.keys(DATA[typeKey][br][mo]).forEach(function (r) { seen[r] = true; });
        });
      });
      return BK_REPAIR_ORDER.filter(function (r) { return seen[r]; });
    }
    function renderBkRepairs(typeKey, brandKey, modelKey) {
      var DATA = bkData();
      var repairWrap = document.getElementById('bk-repair-wrap');
      var repairGrid = document.getElementById('bk-repair-grid');
      if (!repairGrid) return;
      repairGrid.innerHTML = '';
      var repairs, priceOf;
      if (brandKey !== '__other__' && modelKey !== '__notlisted__') {
        repairs = Object.keys(DATA[typeKey][brandKey][modelKey]);
        priceOf = function (r) { return DATA[typeKey][brandKey][modelKey][r]; };
      } else {
        repairs = bkGenericRepairs(typeKey);
        priceOf = function () { return null; };
      }
      repairs.forEach(function (r) {
        var price = priceOf(r);
        var b = bkTile(BK_FRIENDLY[r] || r, (typeof price === 'number') ? bkFmt(price) : 'Price confirmed up front');
        /* REPAIR_FLOW_UPDATE_2026_11_05: repairs are multi-select — tapping toggles, nothing
           auto-advances; Continue is gated below the ATR One question. */
        b.addEventListener('click', function () {
          rfToggleIssue(BK_FRIENDLY[r] || r, (typeof price === 'number') ? price : null, b, null);
        });
        repairGrid.appendChild(b);
      });
      rfShowFlowExtras();
      if (repairWrap) { repairWrap.hidden = false; try { repairWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {} }
    }
    /* REPAIR_WIZARD_ESTIMATE_FIX_2026_11_06: the estimate now ADDS UP.
       Until today it was driven by the FIRST selected repair only, so
       picking screen + battery showed just the first repair's price
       (owner, live tap-through Nov 6, 2026: MacBook Pro screen $547 +
       battery $117 showed $547, never $664). rfEstimateTotals walks
       every selected repair: an exact book price counts at face value;
       a range figure ("$149 \u2013 $320" from the fallback lists) counts
       at both ends, so ranges sum into a combined range on the same
       basis the single-repair view uses. Repairs with no figure at
       all count as unpriced and keep confirmed-after-diagnostics
       wording \u2014 no number is ever invented for them. */
    function rfParseRange(txt) {
      if (!txt) return null;
      var s = String(txt);
      /* Only a bare price or price range counts as a figure. Anything
         wordier ("$95/hr + house call", "Custom quote") is not a
         figure and stays unpriced. */
      if (!/^[\s$,.\d\u2013\u2014-]+$/.test(s)) return null;
      var nums = s.replace(/[$,]/g, '').match(/\d+(?:\.\d+)?/g);
      if (!nums || !nums.length) return null;
      var lo = parseFloat(nums[0]);
      var hi = nums.length > 1 ? parseFloat(nums[nums.length - 1]) : lo;
      return { lo: lo, hi: hi };
    }
    function rfEstimateTotals() {
      var lo = 0, hi = 0, any = false, unpriced = 0;
      repairState.issues.forEach(function (it) {
        if (typeof it.price === 'number') { lo += it.price; hi += it.price; any = true; return; }
        var r = rfParseRange(it.priceRange);
        if (r) { lo += r.lo; hi += r.hi; any = true; } else { unpriced++; }
      });
      return { any: any, unpriced: unpriced, lo: lo, hi: hi };
    }
    function rfCombinedText(t) {
      return t.lo === t.hi ? bkFmt(t.lo) : bkFmt(t.lo) + ' \u2013 ' + bkFmt(t.hi);
    }
    /* Multi-select issue toggling (REPAIR_FLOW_UPDATE_2026_11_05).
       REPAIR_WIZARD_ESTIMATE_FIX_2026_11_06: repairState's priceExact
       / priceRange stay synced to the COMBINED estimate, so the live
       summary, the estimate step, and the intake handoff
       (window.atrGuidedSelection) all read the same total. */
    function rfToggleIssue(name, price, btn, priceRangeText) {
      var found = -1;
      repairState.issues.forEach(function (it, i) { if (it.name === name) found = i; });
      if (found >= 0) { repairState.issues.splice(found, 1); if (btn) btn.classList.remove('selected'); }
      else { repairState.issues.push({ name: name, price: (typeof price === 'number') ? price : null, priceRange: priceRangeText || null }); if (btn) btn.classList.add('selected'); }
      var first = repairState.issues[0] || null;
      repairState.issue = first ? first.name : '';
      var t = rfEstimateTotals();
      if (t.any && t.unpriced === 0 && t.lo === t.hi) {
        repairState.priceExact = t.lo;
        repairState.priceRange = bkFmt(t.lo);
      } else if (t.any && t.unpriced === 0) {
        repairState.priceExact = null;
        repairState.priceRange = rfCombinedText(t);
      } else if (t.any) {
        repairState.priceExact = null;
        repairState.priceRange = 'From ' + rfCombinedText(t);
      } else {
        repairState.priceExact = null;
        if (first && first.priceRange) repairState.priceRange = first.priceRange;
      }
      rfRenderSummary(); rfGate();
    }
    function rfUpdateEstimate() {
      var friendly = repairState.issue;
      if (!friendly) return;
      var modelLabel = repairState.model || ((repairState.brand && repairState.brand !== 'Other') ? repairState.brand : repairState.device);
      var lbl = document.getElementById('estimate-label');
      var amt = document.getElementById('estimate-price');
      var note = document.getElementById('estimate-note');
      var allIssues = repairState.issues.map(function (i) { return i.name; }).join(', ');
      /* REPAIR_WIZARD_ESTIMATE_FIX_2026_11_06: the amount is the SUM
         of every selected repair's figure (rfEstimateTotals), and the
         wording is the owner's (Nov 6, 2026): it is "your estimated
         repair price" \u2014 nothing in this flow may call an estimate
         a flat price. The step also carries a standing disclaimer
         (#estimate-disclaimer in index.html): estimates only, exact
         price after diagnostics, final price may be smaller or
         larger than the estimate. */
      var feeNote = 'A separate visit fee applies to the visit &mdash; $15 when the repair is already known, or $35 if your device needs diagnostics first &mdash; due at booking and non-refundable. Estimates are always free. ATR One members pay no visit fee for devices covered under their subscription.';
      var t = rfEstimateTotals();
      if (lbl) lbl.textContent = 'Your estimated repair price';
      if (t.any && t.unpriced === 0) {
        var combined = rfCombinedText(t);
        repairState.priceRange = combined;
        repairState.priceExact = (t.lo === t.hi) ? t.lo : null;
        if (amt) amt.textContent = combined;
        if (note) note.innerHTML = escapeHtml(allIssues) + ' for ' + escapeHtml(modelLabel) + ' &mdash; ' + (repairState.issues.length > 1 ? 'estimated total for the repairs you picked' : 'estimated price') + ', parts and labor included. ' + feeNote;
      } else if (t.any) {
        var pricedNames = [], unpricedNames = [];
        repairState.issues.forEach(function (it) {
          if (typeof it.price === 'number' || rfParseRange(it.priceRange)) pricedNames.push(it.name); else unpricedNames.push(it.name);
        });
        var partial = rfCombinedText(t);
        repairState.priceRange = 'From ' + partial;
        repairState.priceExact = null;
        if (amt) amt.textContent = 'From ' + partial;
        if (note) note.innerHTML = escapeHtml(pricedNames.join(', ')) + ' for ' + escapeHtml(modelLabel) + ' &mdash; estimated from ' + escapeHtml(partial) + ', parts and labor included. ' + escapeHtml(unpricedNames.join(', ')) + ' ' + (unpricedNames.length > 1 ? 'do' : 'does') + ' not have a set price yet &mdash; we confirm the exact price after diagnostics, before any work starts. ' + feeNote;
      } else {
        repairState.priceRange = 'Confirmed after diagnostics';
        if (amt) amt.textContent = 'Confirmed after diagnostics';
        if (note) note.innerHTML = 'There is no set price for ' + escapeHtml(allIssues.toLowerCase()) + ' on the ' + escapeHtml(modelLabel) + ' yet. Book the visit and we confirm your exact price after diagnostics, before any work starts. The visit fee covers the trip &mdash; $15 when the repair is already known, or $35 if your device needs diagnostics first &mdash; due at booking, non-refundable. Estimates are always free. ATR One members pay no visit fee for devices covered under their subscription.';
      }
      var summary = document.getElementById('estimate-summary');
      if (summary) {
        summary.innerHTML =
          '<span class="pill"><i class="fas fa-mobile-screen"></i> ' + escapeHtml(repairState.device) + '</span>' +
          '<span class="pill"><i class="fas fa-tag"></i> ' + escapeHtml(repairState.model ? (repairState.brand + ' ' + repairState.model) : (repairState.brand || 'Any brand')) + '</span>' +
          '<span class="pill"><i class="fas fa-wrench"></i> ' + escapeHtml(allIssues) + '</span>' +
          (repairState.atrOne ? '<span class="pill"><i class="fas fa-shield-halved"></i> ATR One: ' + escapeHtml(repairState.atrOne) + '</span>' : '');
      }
      rfRenderSummary();
    }

    /* SITE_AUDIT_FIXES_2026_10_30: the guided selections (steps 1-3)
       carry into the intake form at step 4. Fields the customer has
       already filled are never overwritten, and the exact guided issue
       + estimate are exposed on window.atrGuidedSelection so the
       intake submit (atr-forms.js) merges them into the one ticket. */
    var REPAIR_NEEDED_MAP = {
      'Screen replacement': 'Screen replacement',
      'Battery replacement': 'Battery replacement',
      'Charging port repair': 'Charging port repair',
      'Camera / speaker fix': 'Camera / speaker fix',
      'Water damage / diagnostic': 'Water damage / diagnostic',
      'Laptop screen replacement': 'Laptop screen replacement',
      'SSD upgrade & OS install': 'SSD upgrade & OS install',
      'Virus cleanup & tuneup': 'Virus cleanup & tuneup',
      'HDMI port repair': 'HDMI port repair',
      'Overheating / power fault': 'Overheating / power fault',
      'Screen / digitizer repair': 'Screen replacement',
      'Battery service': 'Battery replacement',
      'Power / DC jack repair': 'Charging port repair',
      'Back glass': 'Other / not sure',
      'Camera': 'Camera / speaker fix',
      'Speaker / Mic': 'Camera / speaker fix',
      'HDMI port': 'HDMI port repair',
      'Disc drive': 'Other / not sure',
      'Fan / Overheat': 'Overheating / power fault',
      'Controller repair': 'Other / not sure',
      'Storage upgrade': 'Other / not sure',
      'RAM upgrade': 'Other / not sure',
      'Keyboard / Trackpad': 'Other / not sure',
      'Keyboard': 'Other / not sure',
      'Virus / Software cleanup': 'Virus cleanup & tuneup',
      'Charging': 'Charging port repair',
      'Band / Button': 'Other / not sure',
      'Board / Solder': 'Other / not sure'
    };
    function prefillIntakeFromGuided() {
      window.atrGuidedSelection = {
        device: repairState.device || '',
        brand: repairState.brand || '',
        model: repairState.model || '',
        issue: repairState.issue || '',
        issues: repairState.issues.map(function (i) { return i.name; }),
        atrOne: repairState.atrOne || '',
        describe: repairState.describe || '',
        priceRange: repairState.priceRange || '',
        price: (typeof repairState.priceExact === 'number') ? repairState.priceExact : null
      };
      var g = window.atrGuidedSelection;
      var typeSel = document.getElementById('sr-device-type');
      if (typeSel && !typeSel.value && g.device) typeSel.value = g.device;
      var info = document.getElementById('sr-device-info');
      if (info && !info.value && (g.model || g.brand)) info.value = g.model || g.brand;
      var needSel = document.getElementById('sr-repair-needed');
      if (needSel && !needSel.value && REPAIR_NEEDED_MAP[g.issue]) needSel.value = REPAIR_NEEDED_MAP[g.issue];
      /* REPAIR_FLOW_UPDATE_2026_11_05: ATR One answer + describe text carry
         into the intake; signed-in My Account customers (localStorage
         'atr-account' mirror written by the account module in index.html:
         id/name/email/phone) get contact fields prefilled — never
         overwriting anything already typed. The account mirror carries no
         street address; the profile form's address field is used when it
         has been populated, otherwise address stays a follow-on (REPORT). */
      var atrSel = document.getElementById('sr-atr-one');
      if (atrSel && !atrSel.value && g.atrOne) atrSel.value = g.atrOne;
      var prob = document.getElementById('sr-problem');
      if (prob && !prob.value && g.describe) prob.value = g.describe;
      try {
        var acct = JSON.parse(localStorage.getItem('atr-account') || 'null');
        if (acct) {
          var fn = document.getElementById('sr-first-name'), ln = document.getElementById('sr-last-name');
          var nm = String(acct.name || '').trim().split(/\s+/);
          if (fn && !fn.value && nm[0]) fn.value = nm[0];
          if (ln && !ln.value && nm.length > 1) ln.value = nm.slice(1).join(' ');
          var ph = document.getElementById('sr-phone');
          if (ph && !ph.value && acct.phone) ph.value = acct.phone;
          var em = document.getElementById('sr-email');
          if (em && !em.value && acct.email) em.value = acct.email;
          var profAddr = document.getElementById('authx-profile-address');
          var street = document.getElementById('sr-address-street');
          if (street && !street.value && profAddr && profAddr.value) street.value = profAddr.value;
        }
      } catch (e) {}
      rfRenderSummary();
      var recap = document.getElementById('estimate-recap');
      if (recap && g.issue) {
        recap.hidden = false;
        recap.innerHTML =
          '<span class="pill"><i class="fas fa-mobile-screen"></i> ' + escapeHtml(g.device) + '</span>' +
          '<span class="pill"><i class="fas fa-tag"></i> ' + escapeHtml(g.model ? (g.brand + ' ' + g.model) : (g.brand || 'Any brand')) + '</span>' +
          '<span class="pill"><i class="fas fa-wrench"></i> ' + escapeHtml(g.issue) + '</span>' +
          /* REPAIR_WIZARD_ESTIMATE_FIX_2026_11_06: the recap pill said
             "Flat $X" for priced picks — an estimate is never flat.
             It reads "Est." for every case now. */
          '<span class="pill"><i class="fas fa-dollar-sign"></i> ' + 'Est. ' + escapeHtml(g.priceRange) + '</span>' +
          (g.atrOne ? '<span class="pill"><i class="fas fa-shield-halved"></i> ATR One: ' + escapeHtml(g.atrOne) + '</span>' : '');
      }
    }

    function goToRepairStep(stepNum) {
      var ids = { 1: 'step-device', 2: 'step-issue', 3: 'step-estimate', 4: 'step-contact' };
      document.querySelectorAll('.repair-step').forEach(function (s) { s.classList.remove('active'); });
      var stepEl = document.getElementById(ids[stepNum]);
      if (stepEl) stepEl.classList.add('active');
      document.querySelectorAll('.progress-step').forEach(function (p) {
        var n = parseInt(p.getAttribute('data-step'), 10);
        p.classList.toggle('active', n === stepNum);
        p.classList.toggle('done', n < stepNum);
        /* SITE_FORM_BACKNAV_2026_10_30: steps that can be tapped to
           revisit (reached, not current) get the pointer affordance and
           keyboard focus; unreached and current steps stay inert. */
        var canNav = n !== stepNum && n <= furthestRepairStep;
        p.classList.toggle('nav-enabled', canNav);
        if (canNav) { p.setAttribute('tabindex', '0'); p.setAttribute('role', 'button'); }
        else { p.removeAttribute('tabindex'); p.removeAttribute('role'); }
      });
      currentRepairStep = stepNum;
      var card = document.querySelector('.repair-card');
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (stepNum === 4) prefillIntakeFromGuided();
    }

    function escapeHtml(str) {
      return String(str).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
  });
})();

/* ==================== THEME TOGGLE & COOKIE CONSENT ==================== */
(function () {
  document.addEventListener('DOMContentLoaded', function () {

    // ---- Dark/Light mode ----
    var root = document.documentElement;
    var toggle = document.getElementById('theme-toggle');
    var icon = document.getElementById('theme-icon');

    function setTheme(theme) {
      root.setAttribute('data-theme', theme);
      if (icon) {
        icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
      }
    }
    function applyTheme(theme) {
      setTheme(theme);
      try { localStorage.setItem('atr-theme', theme); } catch (e) {}
    }

    // Saved choice wins. Otherwise follow the device's own dark/light
    // setting — and keep following it live until the visitor picks manually.
    var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    function systemTheme() { return mq && mq.matches ? 'dark' : 'light'; }
    var saved = null;
    try { saved = localStorage.getItem('atr-theme'); } catch (e) {}
    if (saved === 'dark' || saved === 'light') {
      setTheme(saved);
    } else {
      setTheme(systemTheme());
    }
    if (mq && mq.addEventListener) {
      mq.addEventListener('change', function () {
        var s2 = null;
        try { s2 = localStorage.getItem('atr-theme'); } catch (e) {}
        if (s2 !== 'dark' && s2 !== 'light') setTheme(systemTheme());
      });
    }

    if (toggle) {
      toggle.addEventListener('click', function () {
        var current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        applyTheme(current === 'dark' ? 'light' : 'dark');
      });
    }

    // ---- Cookie consent ----
    var banner = document.getElementById('cookie-banner');
    var prefs = document.getElementById('cookie-prefs');
    var acceptBtn = document.getElementById('cookie-accept');
    var rejectBtn = document.getElementById('cookie-reject');
    var customizeBtn = document.getElementById('cookie-customize');
    var functionalBox = document.getElementById('cookie-pref-functional');
    var analyticsBox = document.getElementById('cookie-pref-analytics');

    function getConsent() {
      try {
        var raw = localStorage.getItem('atr-cookie-consent');
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    }

    function saveConsent(consent) {
      try {
        localStorage.setItem('atr-cookie-consent', JSON.stringify(consent));
      } catch (e) {}
      if (banner) banner.hidden = true;
      if (consent && consent.analytics) loadAnalytics();
    }

    // Google Analytics, loaded ONLY when the visitor allows Analytics.
    // No ads, no other tracker. Measurement ID G-HHV6TS3M5J.
    function loadAnalytics() {
      if (window.__atrGaLoaded) return;
      window.__atrGaLoaded = true;
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', 'G-HHV6TS3M5J');
      var s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=G-HHV6TS3M5J';
      document.head.appendChild(s);
    }

    // Show banner only if no consent recorded; honor a past Analytics yes
    var storedConsent = getConsent();
    if (banner && !storedConsent) {
      banner.hidden = false;
    }
    if (storedConsent && storedConsent.analytics) loadAnalytics();

    if (customizeBtn && prefs) {
      customizeBtn.addEventListener('click', function () {
        var isHidden = prefs.hidden;
        prefs.hidden = !isHidden;
        customizeBtn.textContent = isHidden ? 'Save Choices' : 'Customize';
        if (!isHidden) {
          // Save the customized choices
          saveConsent({
            essential: true,
            functional: !!(functionalBox && functionalBox.checked),
            analytics: !!(analyticsBox && analyticsBox.checked),
            at: new Date().toISOString()
          });
        }
      });
    }

    if (acceptBtn) {
      acceptBtn.addEventListener('click', function () {
        saveConsent({ essential: true, functional: true, analytics: true, at: new Date().toISOString() });
      });
    }

    if (rejectBtn) {
      rejectBtn.addEventListener('click', function () {
        saveConsent({ essential: true, functional: false, analytics: false, at: new Date().toISOString() });
      });
    }
  });
})();

/* ==================== ATR SHOP: PRODUCTS & CART ==================== */
(function () {
  document.addEventListener('DOMContentLoaded', function () {

    /* ACCOUNT_FIX_PASS_3_4_2026_11_06 (owner shop redesign, Nov 6,
       2026): the catalog is CONSOLIDATED — the 24 per-device listings
       became 13 generic listings, and the choices that used to be
       separate listings (regular vs privacy glass, clear vs rugged
       case, cable connector/length, wall-charger style, adapter
       type, SSD capacity, iPad vs Galaxy Tab fit) now live in each
       product's variants, chosen in the pop-up. Every variant keeps
       the price/points of the listing it came from (variant.sku is
       that original listing's id, so checkout keeps a real catalog
       id). Every product carries BOTH a money price and a points
       value; the ones the old catalog left points-less (cables,
       mouse, hub, dongles, storage) got a points value from the
       nearest sibling tier in Austin's existing points menu
       (chargers 3,500; general accessories 2,500; premium gear
       3,500) — flagged for owner review in REPORT.md. block assigns
       each listing to one shop-landing block. Options with no
       grounded price in the source data (a wired mouse; hard-drive
       and M.2 storage) are present but marked unavailable rather
       than priced by invention. */
    var PRODUCTS = [
      { id: 'glass-iphone', name: 'Tempered Glass Screen Protector', cat: 'Phone Screen Protectors', block: 'phone', price: 14.99, pts: 1000, featured: true, imageId: 'glass-iphone', fit: 'Phone', defaultVariant: 'Regular',
        desc: 'Tempered glass that takes the everyday hits so your screen doesn\u2019t have to. Choose regular or privacy glass, then tell us the phone it has to fit.',
        variants: [
          { label: 'Regular', price: 14.99, pts: 1000, sku: 'glass-iphone', skuByBrand: { Samsung: 'glass-samsung' } },
          { label: 'Privacy', price: 19.99, pts: 1000, sku: 'glass-privacy' }
        ] },
      { id: 'case-clear-iphone', name: 'Phone Case', cat: 'Phone Cases', block: 'phone', price: 14.99, pts: 2500, featured: true, imageId: 'case-clear-iphone', fit: 'Phone', defaultVariant: 'Clear case',
        desc: 'Choose a clear case for a slim everyday hold, or a rugged shockproof case for harder knocks — then tell us the phone it has to fit.',
        variants: [
          { label: 'Clear case', price: 14.99, pts: 2500, sku: 'case-clear-iphone', skuByBrand: { Samsung: 'case-clear-samsung' } },
          { label: 'Rugged case', price: 24.99, pts: 2500, sku: 'case-rugged-iphone' }
        ] },
      { id: 'cable-lightning-usbc', name: 'Charging Cable', cat: 'Charging Cables', block: 'phone', price: 14.99, pts: 3500, featured: true, imageId: 'cable-lightning-usbc', defaultVariant: 'Lightning to USB-C — 1.2m',
        desc: 'Pick the connector pair you need. The lengths listed are the ones we stock and stand behind.',
        variants: [
          { label: 'Lightning to USB-C — 1.2m', price: 14.99, pts: 3500, sku: 'cable-lightning-usbc' },
          { label: 'Lightning to USB-A — 1.2m', price: 12.99, pts: 3500, sku: 'cable-lightning-usba' },
          { label: 'USB-C to USB-C — 1m', price: 12.99, pts: 3500, sku: 'cable-usbc-usbc' }
        ] },
      { id: 'wall-pd-20w', name: 'Wall Charging Block', cat: 'Wall Chargers', block: 'phone', price: 17.99, pts: 3500, featured: true, imageId: 'wall-pd-20w', defaultVariant: '20W USB-C fast charge',
        desc: 'Compact 20W wall charging blocks. Go single USB-C for the simplest fast charge, or dual-port to run a USB-C and a USB-A cable at once.',
        variants: [
          { label: '20W USB-C fast charge', price: 17.99, pts: 3500, sku: 'wall-pd-20w' },
          { label: '20W dual port — USB-C + USB-A', price: 19.99, pts: 3500, sku: 'wall-dual-20w' }
        ] },
      { id: 'mag-pad-15w', name: 'MagSafe Wireless Charger', cat: 'Wireless Chargers', block: 'phone', price: 29.99, pts: 3500, imageId: 'mag-pad-15w',
        desc: 'A 15W magnetic wireless charging pad that snaps into place on compatible phones — set the phone down and it charges.' },
      { id: 'tab-glass-ipad-109', name: 'Tempered Glass Screen Protector', cat: 'Tablet Screen Protectors', block: 'tablet', price: 19.99, pts: 1000, featured: true, imageId: 'tab-glass-ipad-109', fit: 'Tablet', defaultVariant: 'iPad fit',
        desc: 'Tempered glass screen protection, matched to the tablet you choose — pick the fit family, then the brand and model.',
        variants: [
          { label: 'iPad fit', price: 19.99, pts: 1000, sku: 'tab-glass-ipad-109', deviceBrands: ['Apple'] },
          { label: 'Galaxy Tab fit', price: 24.99, pts: 1000, sku: 'tab-glass-galaxy-a9plus', deviceBrands: ['Samsung'] }
        ] },
      { id: 'tab-case-ipad-pro129', name: 'Tablet Case', cat: 'Tablet Cases', block: 'tablet', price: 29.99, pts: 2500, imageId: 'tab-case-ipad-pro129', fit: 'Tablet', defaultVariant: 'iPad folio case',
        desc: 'Cover-style tablet cases that protect the screen in a bag and fold back when you\u2019re using the tablet. Pick the fit family, then the brand and model.',
        variants: [
          { label: 'iPad folio case', price: 29.99, pts: 2500, sku: 'tab-case-ipad-pro129', deviceBrands: ['Apple'] },
          { label: 'Galaxy Tab book cover', price: 59.99, pts: 2500, sku: 'tab-case-galaxy-a9plus', deviceBrands: ['Samsung'] }
        ] },
      { id: 'acc-mouse-m510', name: 'Wireless Mouse (Full Size)', cat: 'Computer Accessories', block: 'computer', price: 34.99, pts: 3500, featured: true, imageId: 'acc-mouse-m510', defaultVariant: 'Wireless',
        desc: 'Logitech M510 full-size wireless mouse — the one customers ask for by name. A wired option isn\u2019t a stocked listing yet; ask us and we\u2019ll line one up.',
        variants: [
          { label: 'Wireless', price: 34.99, pts: 3500, sku: 'acc-mouse-m510' },
          { label: 'Wired — ask us for current options', price: null, pts: null, unavailable: true }
        ] },
      { id: 'acc-hub-usb3-4port', name: '4-Port USB 3.0 Hub', cat: 'Computer Accessories', block: 'computer', price: 19.99, pts: 2500, imageId: 'acc-hub-usb3-4port',
        desc: 'Anker 4-port USB 3.0 hub with 5Gbps data transfer — one port becomes four.' },
      { id: 'dng-usbc-usba-2pk', name: 'Dongles & Adapters', cat: 'Dongles & Adapters', block: 'computer', price: 16.99, pts: 2500, imageId: 'dng-usbc-usba-2pk', defaultVariant: 'USB-C to USB-A Adapter (2-Pack)',
        desc: 'The little adapters that make new and old gear work together — USB-C to USB-A for older USB gear, or USB-C to HDMI for a display, up to 4K.',
        variants: [
          { label: 'USB-C to USB-A Adapter (2-Pack)', price: 16.99, pts: 2500, sku: 'dng-usbc-usba-2pk' },
          { label: 'USB-C to HDMI Adapter (4K)', price: 19.99, pts: 2500, sku: 'dng-usbc-hdmi' }
        ] },
      { id: 'sto-ssd-512', name: 'Storage Drive', cat: 'Storage', block: 'computer', price: 129.99, pts: 3500, featured: true, imageId: 'sto-ssd-512', defaultVariant: 'SSD — 512GB (2.5" SATA)',
        desc: 'Internal upgrade drives. The stocked listings are Apollo 2.5-inch SATA SSDs; hard-drive and M.2 options are sourced per machine, so ask us before ordering those.',
        variants: [
          { label: 'SSD — 512GB (2.5" SATA)', price: 129.99, pts: 3500, sku: 'sto-ssd-512' },
          { label: 'SSD — 1TB (2.5" SATA)', price: 189.99, pts: 3500, sku: 'sto-ssd-1tb' },
          { label: 'Hard drive — ask us for current options', price: null, pts: null, unavailable: true },
          { label: 'M.2 SSD — ask us for current options', price: null, pts: null, unavailable: true }
        ] },
      { id: 'car-dual-usb', name: 'Dual USB Car Charger (Fast Charge)', cat: 'Car Chargers', block: 'other', price: 14.99, pts: 3500, imageId: 'car-dual-usb',
        desc: 'Two USB ports for charging in the car, with fast-charge support for the drive.' },
      { id: 'station-3in1', name: '3-in-1 Wireless Charging Station', cat: 'Wireless Chargers', block: 'other', price: 44.99, pts: 3500, imageId: 'station-3in1',
        desc: 'A three-in-one wireless charging station for a nightstand or desk — one spot that charges your everyday carry together.' }
    ];

    /* NAV_SEARCH_CLEANUP_2026_11_06: the site-wide search module at
       the end of this file reads the same catalog through this one
       handle — no second copy of the listings is kept anywhere. */
    window.ATR_SHOP_PRODUCTS = PRODUCTS;

    var grid = document.getElementById('product-grid');
    var cartCount = document.getElementById('cart-count');
    var cartItems = document.getElementById('cart-items');
    var cartTotal = document.getElementById('cart-total');
    var drawer = document.getElementById('cart-drawer');
    var overlay = document.getElementById('cart-overlay');

    function money(n) { return '$' + n.toFixed(2); }
    function fmtPts(n) { return Number(n || 0).toLocaleString('en-US'); }

    /* ACCOUNT_FIX_PASS_3_4_2026_11_06: cart LINE keys. A plain key is
       just the product id — the shape every older cart already uses,
       and it stands for the product's default variant. A configured
       line (a non-default variant, and/or a chosen fit device) adds
       ::v=<variant> and ::d=<device> suffixes, so the exact variant
       and device the customer picked ride on the line through the
       drawer, the glances, the account Cart section, and checkout.
       All pricing/points lookups go through the helpers below, which
       resolve a key back to its product + variant. */
    function productById(id) { return PRODUCTS.find(function (x) { return x.id === id; }) || null; }
    function cartBaseId(key) { return String(key).split('::')[0]; }
    function cartKeyPart(key, tag) {
      var parts = String(key).split('::');
      for (var i = 1; i < parts.length; i++) {
        if (parts[i].indexOf(tag + '=') === 0) {
          try { return decodeURIComponent(parts[i].slice(tag.length + 1)); } catch (e) { return parts[i].slice(tag.length + 1); }
        }
      }
      return '';
    }
    function cartVariantFor(key) {
      var p = productById(cartBaseId(key));
      if (!p || !p.variants) return null;
      var label = cartKeyPart(key, 'v');
      var found = null;
      p.variants.forEach(function (v) { if (v.label === label) found = v; });
      if (found) return found;
      p.variants.forEach(function (v) { if (v.label === p.defaultVariant) found = v; });
      return found || p.variants[0];
    }
    function cartDeviceFor(key) { return cartKeyPart(key, 'd'); }
    function cartUnitPrice(key) {
      var p = productById(cartBaseId(key));
      if (!p) return 0;
      var v = cartVariantFor(key);
      return v && v.price != null ? v.price : p.price;
    }
    function cartUnitPts(key) {
      var p = productById(cartBaseId(key));
      if (!p) return 0;
      var v = cartVariantFor(key);
      return v && v.pts != null ? v.pts : (p.pts || 0);
    }
    function cartOptionText(key) {
      var bits = [];
      var v = cartVariantFor(key);
      var p = productById(cartBaseId(key));
      if (v && p && p.variants) bits.push(v.label);
      var dev = cartDeviceFor(key);
      if (dev) bits.push(dev);
      return bits.join(' \u00b7 ');
    }
    function cartCheckoutId(key) {
      var p = productById(cartBaseId(key));
      if (!p) return cartBaseId(key);
      var v = cartVariantFor(key);
      if (!v) return p.id;
      var brand = cartDeviceFor(key).split(' ')[0];
      if (brand && v.skuByBrand && v.skuByBrand[brand]) return v.skuByBrand[brand];
      return v.sku || p.id;
    }
    function makeCartKey(p, variant, device) {
      var key = p.id;
      var parts = [];
      if (variant && (device || variant.label !== p.defaultVariant)) parts.push('v=' + encodeURIComponent(variant.label));
      if (device) parts.push('d=' + encodeURIComponent(device));
      return parts.length ? key + '::' + parts.join('::') : key;
    }

    function getCart() {
      var cart;
      try { cart = JSON.parse(localStorage.getItem('atr-cart') || '{}'); }
      catch (e) { return {}; }
      /* CART_STORAGE_GUARD_2026_11_06: a stored value that parses but
         is NOT a plain object (a number, a string, null, an array —
         left behind by any older or interrupted write) makes every
         later add a silent no-op: assigning a property on a primitive
         does nothing, so the cart never changes and the badge sits
         at 0 forever on that device, with no error anywhere. Treat
         anything that is not a plain object as an empty cart and
         store the clean shape back. */
      if (!cart || typeof cart !== 'object' || Array.isArray(cart)) {
        try { localStorage.setItem('atr-cart', '{}'); } catch (e) {}
        return {};
      }
      // Prune entries the current catalog no longer sells (e.g. left in
      // storage from an older catalog): they inflate the cart count, hide
      // from the drawer, and make checkout fail on an unknown item.
      var changed = false;
      Object.keys(cart).forEach(function (k) {
        var known = PRODUCTS.some(function (p) { return p.id === cartBaseId(k); });
        if (!known || !(cart[k] > 0)) { delete cart[k]; changed = true; }
      });
      if (changed) { try { localStorage.setItem('atr-cart', JSON.stringify(cart)); } catch (e) {} }
      return cart;
    }
    function saveCart(cart) {
      try { localStorage.setItem('atr-cart', JSON.stringify(cart)); } catch (e) {}
      renderCart();
    }

    /* SITE_POINTS_SPEND_2026_10_30: "pay with points" choices per cart
     * line live in their own storage map, so the cash cart's shape is
     * unchanged. A line can be points-paid only when the product carries
     * a points price (p.pts). The map is pruned against the live cart on
     * every read, exactly like the cart itself. */
    var PTS_KEY = 'atr-cart-points';
    function getPtsMap() {
      var map;
      try { map = JSON.parse(localStorage.getItem(PTS_KEY) || '{}'); } catch (e) { return {}; }
      /* CART_STORAGE_GUARD_2026_11_06: same non-object guard as getCart. */
      if (!map || typeof map !== 'object' || Array.isArray(map)) {
        try { localStorage.setItem(PTS_KEY, '{}'); } catch (e) {}
        return {};
      }
      var cart = getCart();
      var changed = false;
      Object.keys(map).forEach(function (k) {
        var p = productById(cartBaseId(k));
        if (!cart[k] || !p || !cartUnitPts(k)) { delete map[k]; changed = true; }
      });
      if (changed) { try { localStorage.setItem(PTS_KEY, JSON.stringify(map)); } catch (e) {} }
      return map;
    }
    function savePtsMap(map) {
      try { localStorage.setItem(PTS_KEY, JSON.stringify(map)); } catch (e) {}
      renderCart();
    }
    function ptsLines() {
      var cart = getCart();
      var map = getPtsMap();
      return Object.keys(map).map(function (id) {
        var p = productById(cartBaseId(id));
        var qty = cart[id] || 0;
        return p && qty > 0 ? { id: id, p: p, qty: qty, pts: cartUnitPts(id) * qty, optionText: cartOptionText(id) } : null;
      }).filter(function (x) { return !!x; });
    }
    function ptsTotal() {
      return ptsLines().reduce(function (sum, l) { return sum + l.pts; }, 0);
    }
    function cashSum() {
      var cart = getCart();
      var map = getPtsMap();
      return Object.keys(cart).reduce(function (sum, k) {
        if (map[k]) return sum;
        return sum + cartUnitPrice(k) * cart[k];
      }, 0);
    }

    /* ACCOUNT_FIX_PASS_3_4_2026_11_06 (owner shop redesign, Nov 6,
       2026 — supersedes the same-day tap-to-detail-only shape):
       cards KEEP an Add button, with the money price on its own row
       and the points value on a separate row above the actions row,
       so the points text can never overlap or cover the button at
       any width. Tapping a card (anywhere but the Add button) opens
       the pop-up detail view: image, name, full description, price
       + points, variant selectors where the product varies, and —
       for fit-dependent products (cases, screen protectors) — a
       device selector built like the repair flow's brand → model
       picker, reading the wizard's own device data
       (window.ATR_PRICE_DATA). The chosen variant + device ride on
       the cart line (see makeCartKey) so staff know exactly what to
       bring. A fit product's card Add opens the pop-up instead of
       adding blind — a case or protector is no use without its
       device. */
    var SHOP_BLOCKS = {
      phone: { title: 'Phone accessories', copy: 'Protectors, cases, cables and charging for your phone.' },
      computer: { title: 'Computer accessories', copy: 'Mice, hubs, adapters, storage and desktop gear.' },
      tablet: { title: 'Tablet accessories', copy: 'Cases and screen protection for your tablet.' },
      gaming: { title: 'Gaming accessories', special: 'gaming' },
      smartwatch: { title: 'Smartwatch accessories', special: 'smartwatch' },
      other: { title: 'Other', copy: 'Car charging, charging stations, and the rest of the gear shelf.' },
      refurbished: { title: 'Refurbished phones', special: 'refurbished' },
      featured: { title: 'Featured deals', copy: 'A short list of shop favorites at their regular fair prices.' },
      all: { title: 'Shop all accessories', copy: 'Every accessory in one view.' }
    };
    var SHOP_SPECIAL_HTML = {
      refurbished: '<h4>Refurbished phones, when they\u2019re on the shelf</h4><p>We sell pre-owned and refurbished phones — tested, checked over, and ready to use. Stock changes as devices come in, so there\u2019s no fixed list here: <a href="#contact" data-page="contact">ask us what\u2019s in stock</a> and we\u2019ll tell you exactly what we have.</p>',
      gaming: '<h4>Sourced for your setup</h4><p>Gaming coolers and console accessories depend on the console and the setup you run, so we source them per setup instead of listing one-size-fits-all versions. <a href="#contact" data-page="contact">Tell us what you\u2019re playing on</a> and we\u2019ll line up the right gear.</p>',
      smartwatch: '<h4>Matched to your watch</h4><p>Watch bands, chargers and protection are model-specific — the right one depends on your watch\u2019s brand, model and size. <a href="#contact" data-page="contact">Tell us your watch</a> and we\u2019ll line up accessories that fit it.</p>'
    };
    var shopTiles = document.getElementById('shop-categories');
    var shopHead = document.getElementById('shop-listing-head');
    var shopBlockTitle = document.getElementById('shop-block-title');
    var shopBlockCopy = document.getElementById('shop-block-copy');
    var shopSpecial = document.getElementById('shop-special');
    var shopSearch = document.getElementById('shop-search');

    function shopShowHome() {
      if (shopTiles) shopTiles.hidden = false;
      if (shopHead) shopHead.hidden = true;
      if (shopSpecial) shopSpecial.hidden = true;
      if (grid) grid.hidden = true;
    }
    function shopShowListing(title, copy) {
      if (shopTiles) shopTiles.hidden = true;
      if (shopHead) shopHead.hidden = false;
      if (shopBlockTitle) shopBlockTitle.textContent = title;
      if (shopBlockCopy) shopBlockCopy.textContent = copy || '';
    }
    function openShopBlock(block) {
      var meta = SHOP_BLOCKS[block];
      if (!meta) return;
      if (shopSearch) shopSearch.value = '';
      if (meta.special) {
        shopShowListing(meta.title, '');
        if (grid) grid.hidden = true;
        if (shopSpecial) { shopSpecial.innerHTML = SHOP_SPECIAL_HTML[meta.special] || ''; shopSpecial.hidden = false; }
        return;
      }
      if (shopSpecial) shopSpecial.hidden = true;
      var list = block === 'all' ? PRODUCTS.slice()
        : block === 'featured' ? PRODUCTS.filter(function (p) { return !!p.featured; })
        : PRODUCTS.filter(function (p) { return p.block === block; });
      shopShowListing(meta.title, meta.copy);
      renderProductCards(list);
      if (grid) grid.hidden = false;
    }
    function shopSearchRun() {
      if (!shopSearch) return;
      var q = shopSearch.value.trim().toLowerCase();
      if (!q) { shopShowHome(); return; }
      var list = PRODUCTS.filter(function (p) {
        var hay = (p.name + ' ' + p.cat + ' ' + p.block + ' ' + (p.desc || '') + ' ' +
          (p.variants ? p.variants.map(function (v) { return v.label; }).join(' ') : '')).toLowerCase();
        return hay.indexOf(q) > -1;
      });
      shopShowListing('Search results', list.length
        ? 'Across every shop category — ' + list.length + (list.length === 1 ? ' match.' : ' matches.')
        : 'No matches — try a shorter word, or head back and browse the categories.');
      if (shopSpecial) shopSpecial.hidden = true;
      renderProductCards(list);
      if (grid) grid.hidden = false;
    }

    function cardPriceHtml(p) {
      if (p.variants) {
        var min = null;
        p.variants.forEach(function (v) { if (v.price != null && (min === null || v.price < min)) min = v.price; });
        if (min !== null && min !== p.price) return 'From ' + money(min);
      }
      return money(p.price);
    }
    function renderProductCards(list) {
      if (!grid) return;
      grid.innerHTML = '';
      list.forEach(function (p) {
        var card = document.createElement('article');
        card.className = 'product-card';
        card.setAttribute('data-id', p.id);
        card.setAttribute('data-block', p.block);
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', p.name + ' — view details');
        card.innerHTML =
          '<div class="product-media"><img src="images/products/' + (p.imageId || p.id) + '.jpg" alt="' + p.name + '" loading="lazy"></div>' +
          '<div class="product-body">' +
            '<span class="product-cat">' + p.cat + '</span>' +
            '<h3 class="product-name">' + p.name + '</h3>' +
            (p.desc ? '<p class="product-desc">' + p.desc + '</p>' : '') +
            '<div class="product-price-row"><span class="product-price">' + cardPriceHtml(p) + '</span></div>' +
            '<div class="product-points-row"><span class="product-pts">or ' + fmtPts(p.pts) + ' pts</span></div>' +
            '<div class="product-card-actions">' +
              '<span class="product-view-hint">View details <i class="fas fa-arrow-right"></i></span>' +
              '<button class="add-btn" type="button" data-add-id="' + p.id + '">Add</button>' +
            '</div>' +
          '</div>';
        card.addEventListener('click', function () { openProductDetail(p.id); });
        card.addEventListener('keydown', function (e) {
          if (e.target !== card) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProductDetail(p.id); }
        });
        var addBtn = card.querySelector('.add-btn');
        if (addBtn) addBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          addFromCard(p, addBtn);
        });
        grid.appendChild(card);
      });
    }
    /* Kept name/signature for any older caller: a category name now
       resolves to its landing block; 'all' opens the all view. */
    function renderProducts(filter) {
      if (!filter || filter === 'all') { openShopBlock('all'); return; }
      var byBlock = PRODUCTS.filter(function (p) { return p.block === filter; });
      if (byBlock.length) { shopShowListing(filter, ''); if (shopSpecial) shopSpecial.hidden = true; renderProductCards(byBlock); if (grid) grid.hidden = false; return; }
      var byCat = PRODUCTS.filter(function (p) { return p.cat === filter; });
      shopShowListing(filter, ''); if (shopSpecial) shopSpecial.hidden = true; renderProductCards(byCat); if (grid) grid.hidden = false;
    }
    function flashAdded(btn, label) {
      if (!btn) return;
      btn.classList.add('added');
      var original = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-check"></i> ' + (label || 'Added');
      setTimeout(function () { btn.classList.remove('added'); btn.innerHTML = original; }, 1200);
    }
    function addFromCard(p, btn) {
      /* A case or protector added without its device is a wasted
         trip — its Add opens the pop-up, where the device picker
         lives, instead of adding a bare line. */
      if (p.fit) { openProductDetail(p.id); return; }
      addToCart(p.id);
      flashAdded(btn, 'Added');
    }

    /* The pop-up detail view. It rides the cart drawer's conventions
       (overlay + fixed panel, body scroll locked) and always has a
       way back: the close button, a tap on the overlay, and Esc. */
    var pdOverlay = document.getElementById('product-overlay');
    var pdPanel = document.getElementById('product-detail');
    var pdCurrent = null;
    function addToCart(key) {
      var cart = getCart();
      cart[key] = (cart[key] || 0) + 1;
      saveCart(cart);
    }
    function pdEl(id) { return document.getElementById(id); }
    function pdSelectedVariant() {
      if (!pdCurrent || !pdCurrent.variants) return null;
      var sel = pdEl('pd-variant');
      var idx = sel ? parseInt(sel.value, 10) : 0;
      return pdCurrent.variants[isNaN(idx) ? 0 : idx] || null;
    }
    function pdShowError(msg) {
      var err = pdEl('pd-error');
      if (!err) return;
      err.textContent = msg || '';
      err.hidden = !msg;
    }
    function pdDeviceData() {
      if (!pdCurrent || !pdCurrent.fit) return null;
      var all = window.ATR_PRICE_DATA;
      return all && all[pdCurrent.fit] ? all[pdCurrent.fit] : null;
    }
    function pdAllowedBrands() {
      var data = pdDeviceData();
      if (!data) return [];
      var brands = Object.keys(data);
      var v = pdSelectedVariant();
      if (v && v.deviceBrands) brands = brands.filter(function (b) { return v.deviceBrands.indexOf(b) > -1; });
      return brands;
    }
    function pdPopulateBrands() {
      var brandSel = pdEl('pd-device-brand');
      var modelSel = pdEl('pd-device-model');
      if (!brandSel || !modelSel) return;
      var brands = pdAllowedBrands();
      brandSel.innerHTML = '<option value="">Choose a brand</option>' + brands.map(function (b) {
        return '<option value="' + b + '">' + b + '</option>';
      }).join('');
      modelSel.innerHTML = '<option value="">Choose a brand first</option>';
      modelSel.disabled = true;
      if (!brands.length) pdShowError('The device list isn\u2019t available right now — text us at (937) 280-6243 and we\u2019ll get the right fit.');
    }
    function pdPopulateModels() {
      var brandSel = pdEl('pd-device-brand');
      var modelSel = pdEl('pd-device-model');
      var data = pdDeviceData();
      if (!brandSel || !modelSel || !data) return;
      var models = brandSel.value && data[brandSel.value] ? Object.keys(data[brandSel.value]) : [];
      modelSel.innerHTML = '<option value="">Choose a model</option>' + models.map(function (m) {
        return '<option value="' + m + '">' + m + '</option>';
      }).join('');
      modelSel.disabled = !models.length;
    }
    function pdUpdatePrice() {
      var price = pdEl('product-detail-price');
      if (!price || !pdCurrent) return;
      var v = pdSelectedVariant();
      if (v && v.unavailable) {
        price.textContent = 'Ask us — not a stocked listing yet';
        var addBtn = pdEl('product-detail-add');
        if (addBtn) addBtn.disabled = true;
        return;
      }
      var addBtn2 = pdEl('product-detail-add');
      if (addBtn2) addBtn2.disabled = false;
      var unit = v && v.price != null ? v.price : pdCurrent.price;
      var pts = v && v.pts != null ? v.pts : pdCurrent.pts;
      price.innerHTML = money(unit) + ' <span class="product-pts">or ' + fmtPts(pts) + ' pts</span>';
    }
    function openProductDetail(id) {
      var p = productById(id);
      if (!p || !pdPanel) return;
      pdCurrent = p;
      pdShowError('');
      var img = pdEl('product-detail-img');
      if (img) { img.src = 'images/products/' + (p.imageId || p.id) + '.jpg'; img.alt = p.name; }
      var cat = pdEl('product-detail-cat');
      if (cat) cat.textContent = p.cat;
      var name = pdEl('product-detail-name');
      if (name) name.textContent = p.name;
      var desc = pdEl('product-detail-desc');
      if (desc) { desc.textContent = p.desc || ''; desc.hidden = !p.desc; }
      var variantWrap = pdEl('pd-variant-wrap');
      var variantSel = pdEl('pd-variant');
      if (variantWrap && variantSel) {
        if (p.variants) {
          variantWrap.hidden = false;
          variantSel.innerHTML = p.variants.map(function (v, i) {
            return '<option value="' + i + '"' + (v.unavailable ? ' disabled' : '') + '>' + v.label +
              (v.price != null ? ' — ' + money(v.price) : '') + '</option>';
          }).join('');
          var def = 0;
          p.variants.forEach(function (v, i) { if (v.label === p.defaultVariant) def = i; });
          variantSel.value = String(def);
        } else {
          variantWrap.hidden = true;
          variantSel.innerHTML = '';
        }
      }
      var deviceWrap = pdEl('pd-device-wrap');
      if (deviceWrap) {
        deviceWrap.hidden = !p.fit;
        if (p.fit) pdPopulateBrands();
      }
      pdUpdatePrice();
      var addBtn = pdEl('product-detail-add');
      if (addBtn) {
        addBtn.classList.remove('added');
        addBtn.innerHTML = '<i class="fas fa-plus"></i> Add to cart';
      }
      pdPanel.hidden = false;
      if (pdOverlay) pdOverlay.hidden = false;
      document.body.style.overflow = 'hidden';
    }
    function closeProductDetail() {
      if (pdPanel) pdPanel.hidden = true;
      if (pdOverlay) pdOverlay.hidden = true;
      pdCurrent = null;
      document.body.style.overflow = '';
    }
    if (!window.__atrShopUiWired) {
      window.__atrShopUiWired = true;
      var pdClose = pdEl('product-detail-close');
      if (pdClose) pdClose.addEventListener('click', closeProductDetail);
      if (pdOverlay) pdOverlay.addEventListener('click', closeProductDetail);
      var pdAdd = pdEl('product-detail-add');
      if (pdAdd) pdAdd.addEventListener('click', function () {
        if (!pdCurrent) return;
        var variant = pdSelectedVariant();
        if (variant && variant.unavailable) {
          pdShowError('That option isn\u2019t a stocked listing yet — text us at (937) 280-6243 and we\u2019ll line it up.');
          return;
        }
        var device = '';
        if (pdCurrent.fit) {
          var b = pdEl('pd-device-brand');
          var m = pdEl('pd-device-model');
          if (!b || !m || !b.value || !m.value) {
            pdShowError('Choose your device brand and model first — that\u2019s how we bring exactly the right fit.');
            return;
          }
          device = b.value + ' ' + m.value;
        }
        pdShowError('');
        addToCart(makeCartKey(pdCurrent, variant, device));
        flashAdded(pdAdd, 'Added to cart');
        pdAdd.innerHTML = '<i class="fas fa-check"></i> Added to cart';
      });
      var pdVariantSel = pdEl('pd-variant');
      if (pdVariantSel) pdVariantSel.addEventListener('change', function () {
        pdShowError('');
        if (pdCurrent && pdCurrent.fit) pdPopulateBrands();
        pdUpdatePrice();
      });
      var pdBrandSel = pdEl('pd-device-brand');
      if (pdBrandSel) pdBrandSel.addEventListener('change', function () { pdShowError(''); pdPopulateModels(); });
      var pdModelSel = pdEl('pd-device-model');
      if (pdModelSel) pdModelSel.addEventListener('change', function () { pdShowError(''); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && pdPanel && !pdPanel.hidden) closeProductDetail();
      });
      if (shopTiles) shopTiles.querySelectorAll('[data-shop-block]').forEach(function (tile) {
        tile.addEventListener('click', function () { openShopBlock(tile.getAttribute('data-shop-block')); });
      });
      var shopBack = pdEl('shop-back');
      if (shopBack) shopBack.addEventListener('click', function () {
        if (shopSearch) shopSearch.value = '';
        shopShowHome();
      });
      if (shopSearch) shopSearch.addEventListener('input', shopSearchRun);
    }

    function cartQty() {
      var cart = getCart();
      return Object.keys(cart).reduce(function (s, k) { return s + cart[k]; }, 0);
    }

    function cartSum() {
      var cart = getCart();
      return Object.keys(cart).reduce(function (s, k) {
        return s + cartUnitPrice(k) * cart[k];
      }, 0);
    }

    function paintCartPointsSummary(lines) {
      var box = document.getElementById('cart-points-lines');
      if (box) {
        if (!lines.length) {
          box.innerHTML = '';
        } else {
          var html = lines.map(function (l) {
            return '<div class="cart-points-line"><span>' + l.p.name + (l.optionText ? ' — ' + l.optionText : '') + ' &times; ' + l.qty + '</span><strong>' + fmtPts(l.pts) + ' pts</strong></div>';
          }).join('');
          html += '<div class="cart-points-line cart-points-total"><span>Paid with points</span><strong>' + fmtPts(ptsTotal()) + ' pts</strong></div>';
          html += '<div class="cart-points-line"><span>Due at checkout</span><strong>' + money(cashSum()) + '</strong></div>';
          box.innerHTML = html;
        }
      }
      if (window.atrPoints && window.atrPoints.cartChanged) {
        window.atrPoints.cartChanged({ sum: cartSum(), qty: cartQty() });
      }
    }

    function renderCart() {
      var cart = getCart();
      var ids = Object.keys(cart);
      var lines = ptsLines();
      if (cartCount) cartCount.textContent = cartQty();
      // #cart-total is always the amount the Square checkout will
      // charge: points-paid lines come off the cash bill entirely.
      if (cartTotal) {
        cartTotal.textContent = money(lines.length ? cashSum() : cartSum());
        var totalLabel = cartTotal.parentElement ? cartTotal.parentElement.querySelector('span') : null;
        if (totalLabel) totalLabel.textContent = lines.length ? 'Due at checkout' : 'Subtotal';
      }
      paintCartPointsSummary(lines);
      if (!cartItems) return;
      if (!ids.length) {
        cartItems.innerHTML = '<p class="cart-empty">Your cart is empty.<br>Add some accessories to get started.</p>';
        /* ACCOUNT_FIX_PASS_3_3_2026_11_06: the glance-style panels
           repaint on the empty transition too — this branch used to
           return before renderCartGlance() ran, so emptying the cart
           left stale rows standing in any open panel (the account
           page's new Cart section made that visible). */
        renderCartGlance();
        return;
      }
      cartItems.innerHTML = '';
      var ptsMap = getPtsMap();
      ids.forEach(function (id) {
        var p = productById(cartBaseId(id));
        if (!p) return;
        var payPts = !!ptsMap[id];
        var unitPrice = cartUnitPrice(id);
        var unitPts = cartUnitPts(id);
        var optionText = cartOptionText(id);
        var div = document.createElement('div');
        div.className = 'cart-item';
        div.innerHTML =
          '<div class="cart-item-info">' +
            '<div class="cart-item-name">' + p.name + '</div>' +
            (optionText ? '<div class="cart-item-options">' + optionText + '</div>' : '') +
            '<div class="cart-item-price">' + (payPts ? fmtPts(unitPts * cart[id]) + ' pts' + (cart[id] > 1 ? ' for ' + cart[id] : '') : money(unitPrice) + ' each') + '</div>' +
            (unitPts ? '<button class="cart-pts-toggle' + (payPts ? ' is-on' : '') + '" data-pts-id="' + id + '" type="button">' + (payPts ? '<i class="fas fa-check"></i> Paying with points' : '<i class="fas fa-star"></i> Pay with points &mdash; ' + fmtPts(unitPts) + ' pts') + '</button>' : '') +
          '</div>' +
          '<div class="cart-qty">' +
            '<button class="qty-btn" data-act="dec" data-id="' + id + '">&minus;</button>' +
            '<span class="qty-num">' + cart[id] + '</span>' +
            '<button class="qty-btn" data-act="inc" data-id="' + id + '">+</button>' +
          '</div>' +
          '<button class="cart-remove" data-id="' + id + '" aria-label="Remove"><i class="fas fa-trash"></i></button>';
        cartItems.appendChild(div);
      });
      cartItems.querySelectorAll('.qty-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var c = getCart();
          var id = btn.getAttribute('data-id');
          if (btn.getAttribute('data-act') === 'inc') c[id]++;
          else { c[id]--; if (c[id] <= 0) delete c[id]; }
          saveCart(c);
        });
      });
      cartItems.querySelectorAll('.cart-remove').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var c = getCart();
          delete c[btn.getAttribute('data-id')];
          saveCart(c);
        });
      });
      cartItems.querySelectorAll('.cart-pts-toggle').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.getAttribute('data-pts-id');
          var map = getPtsMap();
          if (map[id]) delete map[id]; else map[id] = 1;
          savePtsMap(map);
        });
      });
      /* ACCOUNT_FIX_PASS_3_2026_11_06 (owner add-on 7): keep an open
         cart glance truthful — it re-renders from the same state. */
      renderCartGlance();
    }

    function openCart() {
      if (drawer) drawer.hidden = false;
      if (overlay) overlay.hidden = false;
      document.body.style.overflow = 'hidden';
    }
    function closeCart() {
      if (drawer) drawer.hidden = true;
      if (overlay) overlay.hidden = true;
      document.body.style.overflow = '';
    }

    /* ACCOUNT_FIX_PASS_3_2026_11_06 (owner add-on 7, Nov 6, 2026):
       the cart button opens a quick glance first — a compact panel
       with the cart's current items (name, qty, line price), the
       subtotal, View cart, and Checkout — instead of going straight
       to the full cart drawer. It renders from this module's own
       getCart() / PRODUCTS / points state, the same source of truth
       renderCart() paints (no second cart store), and renderCart()
       re-renders it on every cart change. It closes on an outside
       tap, on Esc, and on any navigation, and never navigates by
       itself: View cart opens the drawer exactly as the button used
       to, and Checkout fires the drawer's own checkout button, so
       the payment flow is the existing one end to end. An empty cart
       shows the plain empty note with a Browse the shop link instead
       of items. window.atrOpenCart stays exported as this module's
       public drawer opener; the account page's Cart section (pass
       3.3) calls openCart() directly from inside this module. */
    var cartGlance = document.getElementById('cart-glance');
    var cartGlanceItems = document.getElementById('cart-glance-items');
    /* ACCOUNT_FIX_PASS_3_3_2026_11_06 (owner correction, Nov 6, 2026):
       the header cart glance pass 3.2 added is REMOVED again — the
       owner ruled there is no separate cart button in the header.
       Two panels remain fed by this one painter: the Shop toolbar's
       glance (pass 3) and the Cart section inside My Account (this
       pass, els below). Same state, same figures, same empty
       wording; the shop panel keeps its own stored anchor element
       for outside-tap math. */
    var shopGlanceEls = {
      panel: cartGlance, items: cartGlanceItems,
      totalRow: document.getElementById('cart-glance-total-row'),
      totalEl: document.getElementById('cart-glance-total'),
      totalLabel: document.getElementById('cart-glance-total-label'),
      emptyEl: document.getElementById('cart-glance-empty'),
      actionsEl: document.getElementById('cart-glance-actions')
    };
    /* ACCOUNT_FIX_PASS_3_3_2026_11_06 (owner correction, Nov 6, 2026):
       another panel fed by this same painter — the Cart section
       inside My Account, which the owner expected to find among the
       account drop-downs all along. Same els shape, same figures,
       same empty wording. It is not a glance: it sits in the account
       menu's drop-down set (see wireAcctMenu) and is painted on every
       cart change like the glances, so it is simply current whenever
       its section is open. */
    var acctCartEls = {
      panel: document.getElementById('acct-view-cart'),
      items: document.getElementById('acct-cart-items'),
      totalRow: document.getElementById('acct-cart-total-row'),
      totalEl: document.getElementById('acct-cart-total'),
      totalLabel: document.getElementById('acct-cart-total-label'),
      emptyEl: document.getElementById('acct-cart-empty'),
      actionsEl: document.getElementById('acct-cart-actions')
    };
    function paintCartGlance(els) {
      if (!els.panel || !els.items) return;
      var cart = getCart();
      var ids = Object.keys(cart);
      if (!ids.length) {
        els.items.innerHTML = '';
        if (els.totalRow) els.totalRow.hidden = true;
        if (els.actionsEl) els.actionsEl.hidden = true;
        if (els.emptyEl) els.emptyEl.hidden = false;
        return;
      }
      if (els.emptyEl) els.emptyEl.hidden = true;
      if (els.totalRow) els.totalRow.hidden = false;
      if (els.actionsEl) els.actionsEl.hidden = false;
      var ptsMap = getPtsMap();
      els.items.innerHTML = '';
      ids.forEach(function (id) {
        var p = productById(cartBaseId(id));
        if (!p) return;
        var optionText = cartOptionText(id);
        var row = document.createElement('div');
        row.className = 'cart-glance-row';
        row.innerHTML = '<span class="cart-glance-name">' + p.name +
            (optionText ? '<span class="cart-glance-options">' + optionText + '</span>' : '') + '</span>' +
          '<span class="cart-glance-qty">&times;' + cart[id] + '</span>' +
          '<strong class="cart-glance-price">' + (ptsMap[id] ? fmtPts(cartUnitPts(id) * cart[id]) + ' pts' : money(cartUnitPrice(id) * cart[id])) + '</strong>';
        els.items.appendChild(row);
      });
      var lines = ptsLines();
      if (els.totalEl) els.totalEl.textContent = money(lines.length ? cashSum() : cartSum());
      if (els.totalLabel) els.totalLabel.textContent = lines.length ? 'Due at checkout' : 'Subtotal';
    }
    function renderCartGlance() {
      paintCartGlance(shopGlanceEls);
      paintCartGlance(acctCartEls); /* ACCOUNT_FIX_PASS_3_3_2026_11_06: the account page's Cart section rides the same repaint */
    }
    function openCartGlance() {
      renderCartGlance();
      if (cartGlance) cartGlance.hidden = false;
      if (openBtn) openBtn.setAttribute('aria-expanded', 'true');
    }
    function closeCartGlance() {
      if (cartGlance) cartGlance.hidden = true;
      if (openBtn) openBtn.setAttribute('aria-expanded', 'false');
    }
    function toggleCartGlance() {
      if (!cartGlance) { openCart(); return; }
      if (cartGlance.hidden) openCartGlance(); else closeCartGlance();
    }
    window.atrOpenCart = openCart;

    var openBtn = document.getElementById('cart-open-btn');
    var closeBtn = document.getElementById('cart-close');
    /* One-shot (same pattern as the points wiring below): if this
       module's init ever runs twice, a second toggle listener would
       undo the first inside the same tap — the glance would open and
       close in one click and look dead. Wire once. */
    if (!window.__atrCartGlanceWired) {
      window.__atrCartGlanceWired = true;
      if (openBtn) openBtn.addEventListener('click', toggleCartGlance);
      var cartGlanceView = document.getElementById('cart-glance-view');
      if (cartGlanceView) cartGlanceView.addEventListener('click', function () { closeCartGlance(); openCart(); });
      var cartGlanceCheckout = document.getElementById('cart-glance-checkout');
      if (cartGlanceCheckout) cartGlanceCheckout.addEventListener('click', function () {
        closeCartGlance();
        var co = document.getElementById('cart-checkout');
        if (co) co.click();
      });
      /* ACCOUNT_FIX_PASS_3_3_2026_11_06: the account Cart section's
         Open cart row — the glance rows' behavior: ride the router
         to the Shop page and open the full drawer through the
         drawer's own open. */
      var acctCartOpen = document.getElementById('acct-cart-open');
      if (acctCartOpen) acctCartOpen.addEventListener('click', function () {
        /* NAV_SEARCH_CLEANUP_2026_11_06: the nav and menu Shop links
           are gone (owner direction), so the ride to the Shop page
           falls back to the footer Shop Accessories link. */
        var link = document.querySelector('.nav-link[data-page="shop"], .menu-link[data-page="shop"], .footer-link[data-page="shop"]');
        if (link) link.click();
        openCart();
      });
      /* ACCOUNT_FIX_PASS_3_3_2026_11_06: this judge listens in the
         CAPTURE phase. The account glance's chevron stops
         propagation on its own tap, so a bubble-phase judge never
         saw that tap at all and the Shop glance stayed open behind
         the account glance — two glances open at once. Judging on
         the way down keeps one consistent rule (a tap outside a
         glance's own anchor closes it) for every tap, the toggle
         buttons' own handlers included: they run after, on the
         target, and their own anchor math here leaves their taps
         alone. */
      document.addEventListener('click', function (e) {
        /* The panel judges "outside" against its OWN stored anchor
           (see the note at the panel lookups above). Only the Shop
           glance is in this registry — the account page's Cart
           section is a menu drop-down with its own show/hide, not a
           glance. */
        var panels = [
          { panel: cartGlance, anchor: cartGlance ? cartGlance.closest('.cart-glance-anchor') : null, close: closeCartGlance }
        ];
        panels.forEach(function (p) {
          if (!p.panel || p.panel.hidden) return;
          if (p.anchor && p.anchor.contains(e.target)) {
            /* a navigation link inside the panel (Browse the shop)
               still closes the glance on its way through */
            if (e.target.closest && e.target.closest('[data-page]')) p.close();
            return;
          }
          p.close();
        });
      }, true);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeCartGlance(); } });
      window.addEventListener('hashchange', function () { closeCartGlance(); });
    }
    if (closeBtn) closeBtn.addEventListener('click', closeCart);
    if (overlay) overlay.addEventListener('click', closeCart);

    var clearBtn = document.getElementById('cart-clear');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      /* SITE_DEADEND_MINORS_2026_10_30: confirm before emptying the
       * whole cart (one stray tap used to remove every item with no
       * undo); renderCart already paints the empty-cart state. */
      if (!Object.keys(getCart()).length) return;
      if (window.confirm('Remove everything from your cart?')) saveCart({});
    });

    // Checkout: real payment via the Square checkout function (prices are
    // set server-side; the browser only sends product ids + quantities).
    // SITE_POINTS_SPEND_2026_10_30: lines the customer toggled to points
    // are settled for real BEFORE the redirect and are never sent to
    // Square, so the cash total drops by exactly those lines. Commit
    // order is deliberate:
    //   1. Ask Square for the cash checkout URL first — nothing has been
    //      deducted yet, so a failure here costs the customer nothing.
    //   2. Deduct through window.atrPoints.spendOnShop: a guarded
    //      balance update plus a points_redemptions row, rolled back if
    //      the row cannot be recorded. If the balance cannot cover the
    //      points lines, the whole checkout stops — no partial
    //      deduction, no silent discount.
    //   3. Only then leave for Square (or finish in place when the
    //      whole cart was points-paid).
    var SQ_CHECKOUT_URL = 'https://lyujxpuicarblpkdzuuc.supabase.co/functions/v1/square-checkout';
    var SQ_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5dWp4cHVpY2FyYmxwa2R6dXVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNjAxMjQsImV4cCI6MjEwNzczNjEyNH0.io4qD7pw878Xx97yoS6xzclO33aa4QYKENpwIyZ06xg';
    var checkoutBtn = document.getElementById('cart-checkout');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', function () {
        var cart = getCart();
        var lineKeys = Object.keys(cart).filter(function (k) {
          return cart[k] > 0 && !!productById(cartBaseId(k));
        });
        if (!lineKeys.length) return;
        var map = getPtsMap();
        /* ACCOUNT_FIX_PASS_3_4_2026_11_06: Square prices by catalog
           id, and a configured line's catalog id is its variant's
           original listing id (cartCheckoutId) — cash lines aggregate
           by that id; points lines keep their cart key for removal. */
        var ptsItems = lineKeys.filter(function (k) { return !!map[k]; })
          .map(function (k) { return { key: k, id: cartCheckoutId(k), qty: cart[k] }; });
        var cashBySku = {};
        lineKeys.filter(function (k) { return !map[k]; }).forEach(function (k) {
          var sku = cartCheckoutId(k);
          cashBySku[sku] = (cashBySku[sku] || 0) + cart[k];
        });
        var cashItems = Object.keys(cashBySku).map(function (sku) {
          return { id: sku, qty: cashBySku[sku] };
        });
        var total = ptsTotal();
        var original = checkoutBtn.innerHTML;
        function restore(msg) {
          checkoutBtn.disabled = false;
          checkoutBtn.innerHTML = original;
          if (msg) alert(msg);
        }
        if (ptsItems.length) {
          if (!window.atrPoints || !window.atrPoints.getSession()) {
            alert('Sign in to pay with points — tap your account at the top of the page and sign in, then check out. Your cart is saved.');
            return;
          }
          if (!(total > 0)) return;
        }
        checkoutBtn.disabled = true;
        checkoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Taking you to secure checkout&hellip;';

        function finishWithPoints(squareUrl) {
          if (!ptsItems.length) {
            if (squareUrl) window.location.href = squareUrl;
            return;
          }
          window.atrPoints.spendOnShop(total, ptsItems.map(function (x) {
            var p = productById(cartBaseId(x.key));
            var optionText = cartOptionText(x.key);
            return { id: x.id, name: (p ? p.name : x.id) + (optionText ? ' — ' + optionText : ''), qty: x.qty, pts: cartUnitPts(x.key) * x.qty };
          })).then(function (res) {
            if (!res || !res.ok) {
              restore(res && res.message ? res.message : 'Points checkout hit a snag — nothing was charged. Please try again.');
              return;
            }
            // Points are spent and recorded: drop those lines from the
            // cart so nothing is bought twice.
            var c = getCart();
            var m = getPtsMap();
            ptsItems.forEach(function (x) { delete c[x.key]; delete m[x.key]; });
            try { localStorage.setItem('atr-cart', JSON.stringify(c)); } catch (e) {}
            savePtsMap(m); // re-renders the now cash-only (or empty) cart
            if (window.atrPoints.refreshAccountSurfaces) window.atrPoints.refreshAccountSurfaces();
            if (squareUrl) { window.location.href = squareUrl; return; }
            checkoutBtn.disabled = false;
            checkoutBtn.innerHTML = original;
            var done = document.getElementById('cart-points-success');
            if (done) {
              done.hidden = false;
              done.innerHTML = '<strong>Paid with points — thank you!</strong><br>Your items are on order with us. We will bring them at your repair visit, or text you to coordinate pickup or delivery.';
            }
            renderCart();
          }).catch(function () {
            restore('Points checkout hit a snag — nothing was charged. Please try again, or text us at (937) 280-6243.');
          });
        }

        if (cashItems.length) {
          fetch(SQ_CHECKOUT_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + SQ_ANON_KEY,
              'apikey': SQ_ANON_KEY
            },
            body: JSON.stringify({ items: cashItems })
          }).then(function (r) { return r.json(); }).then(function (d) {
            if (d && d.url) { finishWithPoints(d.url); return; }
            throw new Error('no checkout url');
          }).catch(function () {
            restore('Checkout hit a snag — please try again, or text us at (937) 280-6243 and we will take your order.');
          });
        } else {
          finishWithPoints(null);
        }
      });
    }

    shopShowHome();
    renderCart();
  });
})();

/* ==================== PRICE LOOKUP TOOL ==================== */
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    // Flat-rate pricing from ATRG Master Repair List
    var PRICES = {
      'iphone':           { screen: 89, battery: 68, backglass: 49, chargeport: 59, label: 'iPhone' },
      'ipad':             { screen: 99, battery: 79, backglass: 99, chargeport: 89, label: 'iPad' },
      'watch':            { screen: 119, battery: 49, backglass: 119, chargeport: 89, label: 'Apple Watch' },
      'samsung-budget':   { screen: 67, battery: 39, backglass: 45, chargeport: 49, label: 'Samsung Galaxy (A / M / F series)' },
      'samsung-mid':      { screen: 176, battery: 67, backglass: 49, chargeport: 59, label: 'Samsung Galaxy (S series)' },
      'samsung-premium':  { screen: 349, battery: 59, backglass: 59, chargeport: 69, label: 'Samsung Galaxy (Fold / Flip)' },
      'pixel':            { screen: 100, battery: 39, backglass: 49, chargeport: 59, label: 'Google Pixel' },
      'motorola':         { screen: 69, battery: 39, backglass: 45, chargeport: 49, label: 'Motorola' }
    };
    var REPAIR_LABELS = {
      screen: 'Screen Replacement',
      battery: 'Battery Replacement',
      backglass: 'Back Glass Replacement',
      chargeport: 'Charging Port Repair'
    };

    var brandSel = document.getElementById('pl-brand');
    var repairSel = document.getElementById('pl-repair');
    var result = document.getElementById('pl-result');
    var amount = document.getElementById('pl-amount');
    var note = document.getElementById('pl-note');
    var bookBtn = document.getElementById('pl-book');

    if (!brandSel || !repairSel) return;

    brandSel.addEventListener('change', function () {
      repairSel.disabled = !brandSel.value;
      if (!brandSel.value) {
        repairSel.value = '';
        if (result) { result.hidden = true; result.classList.remove('show'); }
      }
      updateQuote();
    });

    repairSel.addEventListener('change', updateQuote);

    function updateQuote() {
      var brand = brandSel.value;
      var repair = repairSel.value;
      if (!brand || !repair || !PRICES[brand]) {
        if (result) { result.hidden = true; result.classList.remove('show'); }
        return;
      }
      var price = PRICES[brand][repair];
      if (amount) amount.textContent = 'From $' + price;
      if (note) note.textContent = REPAIR_LABELS[repair] + ' for ' + PRICES[brand].label + ' — starting price, parts and labor included. Your exact price is confirmed for your exact model after diagnostics. A separate visit fee applies to the visit — $15 for a known repair, or $35 if diagnostics are needed first — due at booking, non-refundable.';
      if (result) { result.hidden = false; result.classList.add('show'); }
      // Store the quote for the repair form
      try {
        sessionStorage.setItem('atr-quote', JSON.stringify({
          device: PRICES[brand].label,
          repair: REPAIR_LABELS[repair],
          price: price
        }));
      } catch (e) {}
    }

    // If user clicks "Book This Repair", the repair page can pick up the quote
    if (bookBtn) {
      bookBtn.addEventListener('click', function () {
        // The data-page handler will navigate; quote is in sessionStorage
      });
    }
  });
})();

/* ==================== ATR CUSTOMER ACCOUNTS & REWARDS ==================== */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://lyujxpuicarblpkdzuuc.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5dWp4cHVpY2FyYmxwa2R6dXVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNjAxMjQsImV4cCI6MjEwNzczNjEyNH0.io4qD7pw878Xx97yoS6xzclO33aa4QYKENpwIyZ06xg';
  var SESSION_KEY = 'atr-account';

  document.addEventListener('DOMContentLoaded', function () {

    /* QR_FIX_PASS_2_2026_11_05: the account overlay/modal elements are
       retired — My Account is a page (#account) now. */
    var openBtn = document.getElementById('account-open-btn');
    var acctLabel = document.getElementById('account-label');

    var authView = document.getElementById('acct-auth-view');
    var dashView = document.getElementById('acct-dash-view');
    var tabLogin = document.getElementById('acct-tab-login');
    var tabSignup = document.getElementById('acct-tab-signup');
    var loginForm = document.getElementById('acct-login-form');
    var signupForm = document.getElementById('acct-signup-form');
    var loginEmail = document.getElementById('acct-login-email');
    var signupName = document.getElementById('acct-signup-name');
    var signupEmail = document.getElementById('acct-signup-email');
    var signupPhone = document.getElementById('acct-signup-phone');
    var loginError = document.getElementById('acct-login-error');
    var signupError = document.getElementById('acct-signup-error');
    var dashError = document.getElementById('acct-dash-error');
    var dashName = document.getElementById('acct-dash-name');
    var pointsNum = document.getElementById('acct-points-num');
    var logoutBtn = document.getElementById('acct-logout');

    if (!authView || !dashView) return; // account UI not present

    var sb = null;
    if (window.supabase && window.supabase.createClient) {
      try { sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); }
      catch (e) { sb = null; }
    }

    /* ---------- session helpers ---------- */
    function getSession() {
      try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
      catch (e) { return null; }
    }
    function setSession(s) {
      try {
        if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
        else localStorage.removeItem(SESSION_KEY);
      } catch (e) {}
    }
    function showError(el, msg) {
      if (!el) return;
      el.textContent = msg;
      el.hidden = !msg;
    }

    /* ---------- header state ---------- */
    function firstName(full) {
      return String(full || '').trim().split(/\s+/)[0] || 'there';
    }
    function renderHeader() {
      var s = getSession();
      if (s && acctLabel) {
        /* NAV_SEARCH_CLEANUP_2026_11_06 (addendum 11): header account
           button shows the signed-in person's full NAME (no points). */
        acctLabel.textContent = String(s.name || '').trim() || firstName(s.name);
        if (openBtn) openBtn.classList.add('logged-in');
      } else if (acctLabel) {
        acctLabel.textContent = 'Account';
        if (openBtn) openBtn.classList.remove('logged-in');
      }
    }

    /* ---------- account page open --------------------------------
       QR_FIX_PASS_2_2026_11_05: My Account is a page now, not an
       overlay — "opening" it shows the right view and switches to the
       #account page like any other navigation. There is nothing to
       close and no scroll to lock or restore. closeModal survives as a
       harmless error-clear for its one remaining caller (logout). */
    /* ACCOUNT_FIX_PASS_3_2026_11_06 (owner, Nov 6, 2026): the header
       account button is a toggle. From any other page it opens the
       account page (goAccount below, unchanged); tapped while the
       account page is already showing, it LEAVES — back to the page
       the visitor came from (recorded by the router in
       window.__atrAcctReturn), or Home when there is none. Before
       this, the tap re-set the hash to the value it already had, so
       nothing happened at all and the button looked dead.
       The button carries TWO click handlers (this module's goAccount
       and the account-box handler in index.html, kept in step since
       QR_FIX_PASS_2) — the leave stamps window.__atrAcctLeaveAt so
       the twin handler, firing on the same tap a moment later, sees
       the leave already happened and does not undo it by navigating
       straight back. */
    window.atrAccountToggleLeave = function () {
      var now = Date.now();
      var sec = document.getElementById('account');
      var onAcct = (window.location.hash === '#account') || (sec && sec.classList.contains('active'));
      if (!onAcct) return false; // not on the account page: this tap is an open, never a leave
      if (now - (window.__atrAcctLeaveAt || 0) < 60) return true; // twin handler already left (doubled handlers fire inside the same dispatch, a few ms apart — the window only has to cover that, so a deliberate second tap still reads as a toggle)
      if (now - (window.__atrAcctEnterAt || 0) < 60) return false; // this very tap is the one opening it (a doubled handler must not read the just-set hash as "already here" and bounce back)
      window.__atrAcctLeaveAt = now;
      var back = window.__atrAcctReturn;
      if (!back || back === 'account' || !document.getElementById(back)) back = 'home';
      if (window.location.hash !== '#' + back) { window.location.hash = '#' + back; }
      return true;
    };
    function goAccount() {
      if (window.atrAccountToggleLeave()) return; // already on the account page: this tap leaves it
      window.__atrAcctEnterAt = Date.now();
      var s = getSession();
      if (s) { showDashboard(s); }
      else { showAuth(); }
      if (window.location.hash !== '#account') { window.location.hash = '#account'; }
    }
    function closeModal() {
      showError(loginError, '');
      showError(signupError, '');
      showError(dashError, '');
    }

    function showAuth() {
      authView.hidden = false;
      dashView.hidden = true;
    }
    function showDashboard(s) {
      authView.hidden = true;
      dashView.hidden = false;
      dashName.textContent = 'Hi, ' + firstName(s.name) + '!';
      pointsNum.textContent = (typeof s.points === 'number') ? s.points : 0;
    }

    if (openBtn) openBtn.addEventListener('click', goAccount);
    /* QR_FIX_PASS_2_2026_11_05: no close button, no overlay, and no
       Escape-to-close — a page is left by navigating, like every other
       page on the site. */

    /* ---------- tabs ---------- */
    function selectTab(which) {
      var isLogin = which === 'login';
      tabLogin.classList.toggle('active', isLogin);
      tabSignup.classList.toggle('active', !isLogin);
      loginForm.hidden = !isLogin;
      signupForm.hidden = isLogin;
      showError(loginError, '');
      showError(signupError, '');
    }
    if (tabLogin) tabLogin.addEventListener('click', function () { selectTab('login'); });
    if (tabSignup) tabSignup.addEventListener('click', function () { selectTab('signup'); });

    /* ---------- supabase helpers ---------- */
    function validEmail(v) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
    }

    function fetchPoints(customerId, cb) {
      if (!sb) { cb(0); return; }
      sb.from('rewards').select('points').eq('customer_id', customerId).limit(1)
        .then(function (res) {
          var pts = 0;
          if (res.data && res.data.length > 0) pts = res.data[0].points || 0;
          cb(pts);
        })
        .catch(function () { cb(0); });
    }

    function finishLogin(customer) {
      fetchPoints(customer.id, function (pts) {
        var session = {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone || '',
          points: pts
        };
        setSession(session);
        renderHeader();
        showDashboard(session);
      });
    }

    /* ---------- login ---------- */
    if (loginForm) loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      showError(loginError, '');
      var email = String(loginEmail.value || '').trim().toLowerCase();
      if (!validEmail(email)) { showError(loginError, 'Please enter a valid email address.'); return; }
      if (!sb) { showError(loginError, 'Account service is unavailable right now. Please try again later.'); return; }

      var btn = loginForm.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.innerHTML = 'Looking you up…'; }

      sb.from('customers').select('id, name, email, phone').eq('email', email).limit(1)
        .then(function (res) {
          if (btn) { btn.disabled = false; btn.innerHTML = 'Log In <i class="fas fa-arrow-right"></i>'; }
          if (res.error) throw res.error;
          if (!res.data || res.data.length === 0) {
            showError(loginError, 'No account found for that email. Try signing up instead.');
            return;
          }
          finishLogin(res.data[0]);
        })
        .catch(function (err) {
          if (btn) { btn.disabled = false; btn.innerHTML = 'Log In <i class="fas fa-arrow-right"></i>'; }
          showError(loginError, 'Something went wrong. Please try again.');
        });
    });

    /* ---------- signup ---------- */
    if (signupForm) signupForm.addEventListener('submit', function (e) {
      e.preventDefault();
      showError(signupError, '');
      var name = String(signupName.value || '').trim();
      var email = String(signupEmail.value || '').trim().toLowerCase();
      var phone = String(signupPhone.value || '').trim();
      if (!name) { showError(signupError, 'Please enter your name.'); return; }
      if (!validEmail(email)) { showError(signupError, 'Please enter a valid email address.'); return; }
      if (!sb) { showError(signupError, 'Account service is unavailable right now. Please try again later.'); return; }

      var btn = signupForm.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.innerHTML = 'Creating account…'; }

      // Check for existing account first
      sb.from('customers').select('id').eq('email', email).limit(1)
        .then(function (check) {
          if (check.data && check.data.length > 0) {
            throw new Error('exists');
          }
          return sb.from('customers').insert({ name: name, email: email, phone: phone || null }).select('id, name, email, phone').single();
        })
        .then(function (res) {
          if (res.error) throw res.error;
          var customer = res.data;
          // Create rewards row with 0 points
          return sb.from('rewards').insert({ customer_id: customer.id, points: 0 })
            .then(function () { return customer; });
        })
        .then(function (customer) {
          if (btn) { btn.disabled = false; btn.innerHTML = 'Create Account <i class="fas fa-arrow-right"></i>'; }
          finishLogin(customer);
        })
        .catch(function (err) {
          if (btn) { btn.disabled = false; btn.innerHTML = 'Create Account <i class="fas fa-arrow-right"></i>'; }
          if (err && err.message === 'exists') {
            showError(signupError, 'An account already exists for that email. Try logging in instead.');
          } else {
            showError(signupError, 'Something went wrong. Please try again.');
          }
        });
    });

    /* ---------- logout ---------- */
    if (logoutBtn) logoutBtn.addEventListener('click', function () {
      setSession(null);
      renderHeader();
      selectTab('login');
      showAuth();
      closeModal();
    });

    /* ---------- refresh points for existing session ---------- */
    (function refreshSessionPoints() {
      var s = getSession();
      if (s && s.id && sb) {
        fetchPoints(s.id, function (pts) {
          s.points = pts;
          setSession(s);
          renderHeader();
        });
      } else {
        renderHeader();
      }
    })();

    renderHeader();
  });
})();

/* ==================== ATR MY REPAIRS: TICKETS & MESSAGING ====================
   DISABLED 2026-10-29: this legacy module duplicated the account module in
   index.html — both rendered into the same containers (#acct-ticket-list,
   #acct-thread, #acct-messages) with different presentation. The index.html
   inline "ATRG Account Rebuild" module is now the single owner of the
   customer Repairs view. The early return below keeps this IIFE inert: its
   DOMContentLoaded listener is never registered. The module is fully
   self-contained (closure-private, no exports), and nothing else in this
   file calls into it — the separate account/rewards module above and the
   employee hub below are untouched. */
(function () {
  'use strict';
  return; // disabled — see note above

  var SUPABASE_URL = 'https://lyujxpuicarblpkdzuuc.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5dWp4cHVpY2FyYmxwa2R6dXVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNjAxMjQsImV4cCI6MjEwNzczNjEyNH0.io4qD7pw878Xx97yoS6xzclO33aa4QYKENpwIyZ06xg';
  var SESSION_KEY = 'atr-account';

  var STATUSES = ['Awaiting Estimate', 'Awaiting Diagnostics', 'Awaiting Customer Response', 'Awaiting Parts', 'En Route to Customer', 'In Progress', 'Quality Control', 'Ready', 'Job Complete'];
  var STATUS_CLASS = {
    'Awaiting Diagnostics': 'acct-st-waiting',
    'Awaiting Estimate': 'acct-st-waiting',
    'Awaiting Customer Response': 'acct-st-progress',
    'Awaiting Parts': 'acct-st-parts',
    'En Route to Customer': 'acct-st-progress',
    'In Progress': 'acct-st-progress',
    'Quality Control': 'acct-st-progress',
    'Ready': 'acct-st-ready',
    'Job Complete': 'acct-st-done'
  };

  document.addEventListener('DOMContentLoaded', function () {

    var repairsSection = document.getElementById('acct-repairs');
    var ticketList = document.getElementById('acct-ticket-list');
    var newTicketBtn = document.getElementById('acct-new-ticket-btn');
    var threadView = document.getElementById('acct-thread');
    var threadBack = document.getElementById('acct-thread-back');
    var threadInfo = document.getElementById('acct-thread-info');
    var messagesBox = document.getElementById('acct-messages');
    var msgForm = document.getElementById('acct-msg-form');
    var msgInput = document.getElementById('acct-msg-input');
    var msgError = document.getElementById('acct-msg-error');
    var newTicketView = document.getElementById('acct-newticket');
    var newTicketBack = document.getElementById('acct-newticket-back');
    var ticketForm = document.getElementById('acct-ticket-form');
    var ticketError = document.getElementById('acct-ticket-error');

    if (!repairsSection) return; // repairs UI not present

    var sb = null;
    if (window.supabase && window.supabase.createClient) {
      try { sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); }
      catch (e) { sb = null; }
    }

    var currentTicketId = null;
    var pollTimer = null;

    function getSession() {
      try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
      catch (e) { return null; }
    }
    function showError(el, msg) {
      if (!el) return;
      el.textContent = msg;
      el.hidden = !msg;
    }
    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    function initialsOf(name) {
      var parts = String(name == null ? '' : name).trim().split(/\s+/).filter(Boolean);
      if (!parts.length) return '';
      var first = parts[0].charAt(0);
      var last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
      return (first + last).toUpperCase();
    }
    function fmtDate(iso) {
      try {
        var d = new Date(iso);
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
               d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      } catch (e) { return ''; }
    }

    /* ---------- views ---------- */
    function showRepairsList() {
      stopPolling();
      currentTicketId = null;
      repairsSection.hidden = false;
      threadView.hidden = true;
      newTicketView.hidden = true;
      loadTickets();
    }
    function showThread() {
      repairsSection.hidden = true;
      newTicketView.hidden = true;
      threadView.hidden = false;
      /* ACCOUNT_FIX_PASS_3_2026_11_06: the thread is on screen now —
         this is the moment the message form's human check renders,
         so it is born visible (see the gate wiring below). mount()
         is idempotent: later opens are no-ops. */
      if (window.atrTurnstile) window.atrTurnstile.mount(document.getElementById('ts-acct-msg'));
    }
    function showNewTicket() {
      stopPolling();
      repairsSection.hidden = true;
      threadView.hidden = true;
      newTicketView.hidden = false;
      showError(ticketError, '');
      /* ACCOUNT_FIX_PASS_3_2026_11_06: same as showThread — the
         new-request human check renders when its view opens, not at
         page load inside the hidden view. */
      if (window.atrTurnstile) window.atrTurnstile.mount(document.getElementById('ts-acct-ticket'));
    }

    /* ---------- ticket list ---------- */
    function loadTickets() {
      var s = getSession();
      if (!s || !s.id) {
        ticketList.innerHTML = '<p class="acct-muted">Log in to see your repairs.</p>';
        return;
      }
      if (!sb) {
        ticketList.innerHTML = '<p class="acct-muted">Repair tracking is unavailable right now.</p>';
        return;
      }
      ticketList.innerHTML = '<p class="acct-muted">Loading your repairs…</p>';
      sb.from('tickets').select('id, device_type, brand, model, issue, status, created_at')
        .eq('customer_id', s.id).order('created_at', { ascending: false })
        .then(function (res) {
          if (res.error) throw res.error;
          var tickets = res.data || [];
          if (!tickets.length) {
            ticketList.innerHTML = '<p class="acct-muted">No repairs yet. Tap <strong>New Request</strong> to book one.</p>';
            return;
          }
          ticketList.innerHTML = tickets.map(function (t) {
            var dev = [t.device_type, t.brand, t.model].filter(Boolean).join(' ');
            var cls = STATUS_CLASS[t.status] || 'acct-st-waiting';
            return '<div class="acct-ticket" data-ticket-id="' + t.id + '">' +
              '<div class="acct-ticket-top"><strong>' + esc(dev || 'Repair') + '</strong>' +
              '<span class="acct-status ' + cls + '">' + esc(t.status) + '</span></div>' +
              '<div class="acct-ticket-meta">' + esc(String(t.issue).slice(0, 90)) +
              (String(t.issue).length > 90 ? '…' : '') + '<br>Opened ' + fmtDate(t.created_at) + '</div>' +
              '</div>';
          }).join('');
        })
        .catch(function () {
          ticketList.innerHTML = '<p class="acct-muted">Could not load repairs. Please try again.</p>';
        });
    }

    ticketList.addEventListener('click', function (e) {
      var card = e.target.closest ? e.target.closest('[data-ticket-id]') : null;
      if (!card) return;
      openThread(card.getAttribute('data-ticket-id'));
    });

    /* ---------- thread ---------- */
    function openThread(ticketId) {
      currentTicketId = ticketId;
      showError(msgError, '');
      msgInput.value = '';
      if (!sb) return;
      sb.from('tickets').select('id, device_type, brand, model, issue, status, created_at')
        .eq('id', ticketId).limit(1).single()
        .then(function (res) {
          if (res.error) throw res.error;
          var t = res.data;
          var dev = [t.device_type, t.brand, t.model].filter(Boolean).join(' ');
          var cls = STATUS_CLASS[t.status] || 'acct-st-waiting';
          threadInfo.innerHTML = '<strong>' + esc(dev || 'Repair') + '</strong> ' +
            '<span class="acct-status ' + cls + '">' + esc(t.status) + '</span><br>' +
            esc(t.issue) + '<br><span style="color:var(--muted)">Opened ' + fmtDate(t.created_at) + '</span>';
          /* AVATARS_2026_11_03: "Your technician" — who is on this repair.
           * The RPC returns a row only for the signed-in customer's own
           * ticket with someone assigned; anything else shows nobody. */
          sb.rpc('ticket_technician', { p_ticket_id: t.id })
            .then(function (r) {
              var tech = (!r.error && r.data && r.data[0]) || null;
              var old = document.getElementById('acct-tech');
              if (old) old.remove();
              if (!tech) return;
              var live = (t.status === 'En Route to Customer' || t.status === 'In Progress');
              var pic = tech.tech_avatar_url
                ? '<img class="acct-tech-pic" src="' + esc(tech.tech_avatar_url) + '" alt="" loading="lazy">'
                : '<span class="acct-tech-pic acct-tech-disc">' + esc(initialsOf(tech.tech_name)) + '</span>';
              var box = document.createElement('div');
              box.id = 'acct-tech';
              box.className = 'acct-tech' + (live ? ' acct-tech-live' : '');
              box.innerHTML = pic +
                '<span class="acct-tech-text"><span class="acct-tech-label">Your technician</span>' +
                '<strong>' + esc(tech.tech_name) + '</strong></span>';
              threadInfo.appendChild(box);
            })
            .catch(function () { /* no technician block — never break the thread over it */ });
          showThread();
          loadMessages();
          startPolling();
        })
        .catch(function () {
          showError(msgError, 'Could not open this repair. Please try again.');
        });
    }

    function loadMessages() {
      if (!sb || !currentTicketId) return;
      sb.from('messages').select('sender, message, created_at')
        .eq('ticket_id', currentTicketId).order('created_at', { ascending: true })
        .then(function (res) {
          if (res.error) throw res.error;
          var msgs = res.data || [];
          if (!msgs.length) {
            messagesBox.innerHTML = '<p class="acct-muted">No messages yet. Say hello — Austin will reply here.</p>';
            return;
          }
          messagesBox.innerHTML = msgs.map(function (m) {
            var who = m.sender === 'tech' ? 'acct-msg-tech' : 'acct-msg-customer';
            return '<div class="acct-msg ' + who + '">' + esc(m.message) +
              '<span class="acct-msg-time">' + fmtDate(m.created_at) + '</span></div>';
          }).join('');
          messagesBox.scrollTop = messagesBox.scrollHeight;
        })
        .catch(function () { /* keep existing messages on poll failure */ });
    }

    function startPolling() {
      stopPolling();
      pollTimer = setInterval(loadMessages, 8000);
    }
    function stopPolling() {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }

    if (threadBack) threadBack.addEventListener('click', showRepairsList);
    if (newTicketBack) newTicketBack.addEventListener('click', showRepairsList);
    if (newTicketBtn) newTicketBtn.addEventListener('click', showNewTicket);

    /* ---------- SITE_TURNSTILE_2026_11_02 (staged): Turnstile gate
       * for both account forms. Registered BEFORE the real submit
       * handlers below so the shared gate (turnstile.js) can hold a
       * submit until the verify-turnstile Edge Function confirms the
       * token server-side. These forms are signed-in only, so the
       * session JWT is passed as the bearer when one is available.
       * Containers (#ts-acct-msg / #ts-acct-ticket) live in
       * index.html next to each form's submit button. */
    if (window.atrTurnstile) {
      var tsBearer = function (cb) {
        if (sb && sb.auth && sb.auth.getSession) {
          sb.auth.getSession().then(function (r) {
            cb(r && r.data && r.data.session ? r.data.session.access_token : null);
          }).catch(function () { cb(null); });
        } else cb(null);
      };
      var tsMsgSlot = document.getElementById('ts-acct-msg');
      if (msgForm && tsMsgSlot) {
        /* ACCOUNT_FIX_PASS_3_2026_11_06: no eager mount here any
           more. This block runs at page load, when the message form
           sits inside the hidden thread view, inside the hidden
           dashboard, inside the not-yet-active account page — and
           turnstile.js mount() renders exactly once and can never
           re-render, so the widget was born inside a display:none
           stack and never recovered when the thread opened (owner,
           Nov 6, 2026: the human check "is not popping up… waiting
           for Cloudflare"). The mount now happens when the view
           opens (showThread / showNewTicket below), and the gate
           still mounts at submit time as a backstop. */
        window.atrTurnstile.gate(msgForm, tsMsgSlot, {
          getBearer: tsBearer,
          onBlocked: function () { showError(msgError, 'Please complete the quick human check, then send again.'); }
        });
      }
      var tsTicketSlot = document.getElementById('ts-acct-ticket');
      if (ticketForm && tsTicketSlot) {
        window.atrTurnstile.gate(ticketForm, tsTicketSlot, {
          getBearer: tsBearer,
          onBlocked: function () { showError(ticketError, 'Please complete the quick human check above the button, then submit again.'); }
        });
      }
    }

    /* ---------- send message ---------- */
    if (msgForm) msgForm.addEventListener('submit', function (e) {
      e.preventDefault();
      showError(msgError, '');
      var s = getSession();
      var text = String(msgInput.value || '').trim();
      if (!text) return;
      if (!s || !currentTicketId || !sb) {
        showError(msgError, 'Could not send. Please try again.');
        return;
      }
      var btn = msgForm.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      sb.from('messages').insert({ ticket_id: currentTicketId, sender: 'customer', message: text })
        .then(function (res) {
          if (btn) btn.disabled = false;
          if (res.error) throw res.error;
          msgInput.value = '';
          loadMessages();
        })
        .catch(function () {
          if (btn) btn.disabled = false;
          showError(msgError, 'Message failed to send. Please try again.');
        });
    });

    /* ---------- new ticket ---------- */
    if (ticketForm) ticketForm.addEventListener('submit', function (e) {
      e.preventDefault();
      showError(ticketError, '');
      var s = getSession();
      var deviceType = document.getElementById('acct-t-device').value;
      var brand = String(document.getElementById('acct-t-brand').value || '').trim();
      var model = String(document.getElementById('acct-t-model').value || '').trim();
      var issue = String(document.getElementById('acct-t-issue').value || '').trim();
      if (!issue) { showError(ticketError, 'Please describe the problem.'); return; }
      if (!s || !s.id || !sb) { showError(ticketError, 'Please log in again, then try.'); return; }

      var btn = ticketForm.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.innerHTML = 'Submitting…'; }

      sb.from('tickets').insert({
        customer_id: s.id,
        customer_name: s.name || null,
        customer_phone: s.phone || null,
        device_type: deviceType,
        brand: brand || null,
        model: model || null,
        issue: issue,
        status: 'Awaiting Estimate',
        source: (window.atrLeadSource ? window.atrLeadSource() : '') || 'website'
      }).select('id').single()
        .then(function (res) {
          if (btn) { btn.disabled = false; btn.innerHTML = 'Submit Request <i class="fas fa-arrow-right"></i>'; }
          if (res.error) throw res.error;
          // Reset form and open the new ticket thread
          document.getElementById('acct-t-brand').value = '';
          document.getElementById('acct-t-model').value = '';
          document.getElementById('acct-t-issue').value = '';
          openThread(res.data.id);
        })
        .catch(function () {
          if (btn) { btn.disabled = false; btn.innerHTML = 'Submit Request <i class="fas fa-arrow-right"></i>'; }
          showError(ticketError, 'Could not submit. Please try again.');
        });
    });

    /* ---------- refresh ticket list whenever dashboard opens ---------- */
    // Hook into the account modal: when it opens and user is logged in, load tickets.
    var openBtn = document.getElementById('account-open-btn');
    if (openBtn) openBtn.addEventListener('click', function () {
      setTimeout(function () {
        var s = getSession();
        var dashView = document.getElementById('acct-dash-view');
        if (s && dashView && !dashView.hidden) {
          showRepairsList();
        }
      }, 50);
    });

    // If modal closes, stop polling
    var closeBtn = document.getElementById('acct-close');
    var overlay = document.getElementById('acct-overlay');
    if (closeBtn) closeBtn.addEventListener('click', stopPolling);
    if (overlay) overlay.addEventListener('click', stopPolling);
  });
})();

/* SITE_AUDIT_BATCH2_2026_10_30: the dead in-page employee hub (login
   modal + dashboard wiring) was removed. portal.html is the one staff
   portal; the header Portal link and the footer Employee Portal link
   in index.html are unchanged. */

/* ===== Logo color picker ===== */
(function () {
  'use strict';
  var VARIANTS = {
    original: { img: 'logo-duo.png', fav: 'favicon-32.png' },
    teal: { img: 'images/atr-logo-teal.png', fav: 'images/atr-logo-teal-64.png' },
    orange: { img: 'images/atr-logo-orange.png', fav: 'images/atr-logo-orange-64.png' },
    violet: { img: 'images/atr-logo-violet.png', fav: 'images/atr-logo-violet-64.png' }
  };
  var KEY = 'atr-logo-variant';
  function applyVariant(name) {
    var v = VARIANTS[name] || VARIANTS.original;
    var img = document.getElementById('brand-logo-img');
    if (img) img.src = v.img;
    var links = document.querySelectorAll('link[rel="icon"]');
    for (var i = 0; i < links.length; i++) links[i].href = v.fav;
    var sw = document.querySelectorAll('.logo-swatch');
    for (var j = 0; j < sw.length; j++) {
      sw[j].classList.toggle('is-active', sw[j].getAttribute('data-logo-variant') === name);
    }
    try { localStorage.setItem(KEY, name); } catch (e) {}
  }
  function initLogoPicker() {
    var saved = 'original';
    try { saved = localStorage.getItem(KEY) || 'original'; } catch (e) {}
    if (!VARIANTS[saved]) saved = 'original';
    applyVariant(saved);
    var sw = document.querySelectorAll('.logo-swatch');
    for (var i = 0; i < sw.length; i++) {
      sw[i].addEventListener('click', function () {
        applyVariant(this.getAttribute('data-logo-variant'));
      });
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLogoPicker);
  } else {
    initLogoPicker();
  }
})();

/* ===== Add to Home Screen prompt ===== */
(function () {
  'use strict';
  var DISMISS_KEY = 'atr-install-dismissed';
  var deferredPrompt = null;

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
  }
  function isDismissed() {
    try { return !!localStorage.getItem(DISMISS_KEY); } catch (e) { return false; }
  }
  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) {}
  }
  function show() {
    if (isStandalone() || isDismissed()) return;
    var el = document.getElementById('install-prompt');
    if (el) el.hidden = false;
  }
  function hide() {
    var el = document.getElementById('install-prompt');
    if (el) el.hidden = true;
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    show();
  });
  window.addEventListener('appinstalled', function () { dismiss(); hide(); });

  document.addEventListener('DOMContentLoaded', function () {
    var closeBtn = document.getElementById('install-close');
    var actionBtn = document.getElementById('install-action');
    var steps = document.getElementById('install-steps');
    if (!document.getElementById('install-prompt')) return;

    var ua = navigator.userAgent || '';
    var isIOS = /iphone|ipad|ipod/i.test(ua);

    if (closeBtn) closeBtn.addEventListener('click', function () { dismiss(); hide(); });
    if (actionBtn) {
      if (isIOS && !deferredPrompt) actionBtn.textContent = 'Show me how';
      actionBtn.addEventListener('click', function () {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then(function () { deferredPrompt = null; hide(); });
        } else if (steps) {
          steps.hidden = !steps.hidden;
          actionBtn.textContent = steps.hidden ? (isIOS ? 'Show me how' : 'Add') : 'Hide steps';
        }
      });
    }

    // iOS has no beforeinstallprompt event — offer the steps version instead.
    // (Covers Safari and iOS in-app browsers, where the steps start with Safari.)
    if (isIOS) setTimeout(show, 5000);
  });
})();

/* Service worker registration (enables Add to Home Screen / install) */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js").catch(function () {});
  });
}

/* ==================== ACCESSIBILITY MENU ==================== */
(function () {
  var KEY = 'atr-a11y';
  var prefs = { text: false, contrast: false, motion: false, links: false };
  try {
    var raw = localStorage.getItem(KEY);
    if (raw) prefs = JSON.parse(raw) || prefs;
    else if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) prefs.motion = true;
  } catch (e) {}
  function apply() {
    var r = document.documentElement;
    r.classList.toggle('a11y-bigtext', !!prefs.text);
    r.classList.toggle('a11y-contrast', !!prefs.contrast);
    r.classList.toggle('a11y-motion', !!prefs.motion);
    r.classList.toggle('a11y-links', !!prefs.links);
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) {}
    var map = { 'a11y-text': 'text', 'a11y-contrast': 'contrast', 'a11y-motion': 'motion', 'a11y-links': 'links' };
    Object.keys(map).forEach(function (id) { var el = document.getElementById(id); if (el) el.checked = !!prefs[map[id]]; });
  }
  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('a11y-btn');
    var panel = document.getElementById('a11y-panel');
    if (!btn || !panel) return;
    apply();
    btn.addEventListener('click', function () {
      var open = panel.hidden;
      panel.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
      if (!panel.hidden && !panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
        panel.hidden = true; btn.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.focus(); }
    });
    ['text', 'contrast', 'motion', 'links'].forEach(function (k) {
      var el = document.getElementById('a11y-' + k);
      if (el) el.addEventListener('change', function () { prefs[k] = el.checked; apply(); });
    });
    var reset = document.getElementById('a11y-reset');
    if (reset) reset.addEventListener('click', function () {
      prefs = { text: false, contrast: false, motion: false, links: false };
      try { localStorage.removeItem(KEY); } catch (e) {}
      apply();
    });
  });
})();

/* ==================== SHARE BUTTON (FOOTER) ==================== */
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('share-btn');
    if (!btn) return;
    var shareData = {
      title: document.title,
      text: "Austin's Tech Repair Group \u2014 phone, tablet, computer, game console and smartwatch repair. We come to you.",
      url: 'https://austinstechrepairgroup.com/'
    };
    function showCopied() {
      var label = btn.querySelector('.share-label');
      if (!label) return;
      var orig = label.textContent;
      label.textContent = 'Link copied';
      btn.setAttribute('aria-label', 'Link copied');
      setTimeout(function () {
        label.textContent = orig;
        btn.setAttribute('aria-label', 'Share this page');
      }, 2000);
    }
    function fallbackCopy() {
      var ta = document.createElement('textarea');
      ta.value = shareData.url;
      ta.setAttribute('readonly', '');
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      showCopied();
    }
    btn.addEventListener('click', function () {
      /* FOOTER_BOTTOM_DELTA_2026_11_06: both paths guarded — navigator.share may
         return a non-promise or throw synchronously in some
         browsers/jsdom; the click must never die on it. */
      if (navigator.share) {
        try { var p = navigator.share(shareData); if (p && p.catch) p.catch(function () {}); } catch (e) {}
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareData.url).then(showCopied, fallbackCopy);
      } else {
        fallbackCopy();
      }
    });
  });
})();

/* ==================== HERO CAROUSEL, APPLE STYLE ==================== */
/* One slide at a time, 7 seconds each, with a visible fill timer on the
   active dot and a play/pause button. Pausing stops the timer exactly
   where it is, so a reader can take as long as they need. Autoplay also
   pauses on hover/focus and when the tab is hidden, and stays off when
   the visitor prefers reduced motion. */
(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', function () {
    var slides = document.querySelectorAll('.hero-slide');
    var dots = document.querySelectorAll('[data-hero-dot]');
    var prevBtn = document.querySelector('[data-hero-prev]');
    var nextBtn = document.querySelector('[data-hero-next]');
    var playBtn = document.querySelector('[data-hero-playpause]');
    var playIcon = document.querySelector('[data-hero-playpause-icon]');
    var carousel = document.querySelector('.hero-carousel');
    if (!slides.length || !dots.length) return;
    var DURATION = 7000;
    var current = 0;
    var playing = true;
    var startTime = 0;
    var elapsed = 0;
    var rafId = null;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) playing = false;
    function fillFor(i) {
      var dot = dots[i];
      return dot ? dot.querySelector('.hero-dot-fill') : null;
    }
    function show(index) {
      current = (index + slides.length) % slides.length;
      slides.forEach(function (s, i) { s.classList.toggle('is-active', i === current); });
      dots.forEach(function (d, i) {
        d.classList.toggle('is-active', i === current);
        var f = d.querySelector('.hero-dot-fill');
        if (f) f.style.width = i < current ? '100%' : '0%';
      });
      elapsed = 0;
      startTime = performance.now();
    }
    function tick(now) {
      if (!playing) return;
      var fill = fillFor(current);
      var pct = Math.min(100, ((elapsed + (now - startTime)) / DURATION) * 100);
      if (fill) fill.style.width = pct + '%';
      if (pct >= 100) { show(current + 1); }
      rafId = requestAnimationFrame(tick);
    }
    function start() {
      cancelAnimationFrame(rafId);
      startTime = performance.now();
      rafId = requestAnimationFrame(tick);
    }
    function pauseTimer() {
      if (!playing) return;
      elapsed += performance.now() - startTime;
      playing = false;
      cancelAnimationFrame(rafId);
      if (playBtn) { playBtn.setAttribute('aria-label', 'Play slideshow'); playBtn.setAttribute('aria-pressed', 'true'); }
      if (playIcon) playIcon.textContent = '\u25B6';
    }
    function playTimer() {
      if (playing) return;
      playing = true;
      startTime = performance.now();
      if (playBtn) { playBtn.setAttribute('aria-label', 'Pause slideshow'); playBtn.setAttribute('aria-pressed', 'false'); }
      if (playIcon) playIcon.textContent = '\u275A\u275A';
      rafId = requestAnimationFrame(tick);
    }
    dots.forEach(function (d) {
      d.addEventListener('click', function () {
        show(parseInt(d.getAttribute('data-hero-dot'), 10) || 0);
        if (playing) start();
      });
    });
    if (prevBtn) prevBtn.addEventListener('click', function () { show(current - 1); if (playing) start(); });
    if (nextBtn) nextBtn.addEventListener('click', function () { show(current + 1); if (playing) start(); });
    if (playBtn) playBtn.addEventListener('click', function () { if (playing) pauseTimer(); else playTimer(); });
    if (carousel) {
      carousel.addEventListener('mouseenter', function () { if (playing) { elapsed += performance.now() - startTime; cancelAnimationFrame(rafId); } });
      carousel.addEventListener('mouseleave', function () { if (playing) startTime = performance.now(), rafId = requestAnimationFrame(tick); });
      carousel.addEventListener('focusin', function () { if (playing) { elapsed += performance.now() - startTime; cancelAnimationFrame(rafId); } });
      carousel.addEventListener('focusout', function () { if (playing) startTime = performance.now(), rafId = requestAnimationFrame(tick); });
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && playing) { elapsed += performance.now() - startTime; cancelAnimationFrame(rafId); }
      else if (!document.hidden && playing) { startTime = performance.now(); rafId = requestAnimationFrame(tick); }
    });
    show(0);
    if (playing) start();
    else if (playBtn) { playBtn.setAttribute('aria-label', 'Play slideshow'); playBtn.setAttribute('aria-pressed', 'true'); if (playIcon) playIcon.textContent = '\u25B6'; }
  });
})();

/* ==================== MY ACCOUNT MENU ==================== */
/* The logged-in account page is one My Account tab with a menu:
   Repairs, Rewards & Vouchers, Cart, Account Settings, Sign Out.
   Repairs shows the repair list, thread, and new-request views;
   Account Settings shows profile, birthday, and password. Sign Out
   is the existing logout button, moved into the menu, so its wiring
   is unchanged.
   SITE_ACCT_FIX_2026_10_30 / SITE_CART_BADGE_2026_10_30: the wiring
   now runs through wireAcctMenu() — idempotent, and it fires
   immediately when the document is already parsed instead of only
   on DOMContentLoaded — and it publishes window.__atrAcctMenuWired
   so the account-box safety net in index.html can tell this module
   is alive and stay out of its way. (On Austin's iPad the rows
   rendered but did nothing: the device was running an older cached
   script.js whose menu module predates the Rewards view and the
   Cart row entirely.) */
(function () {
  'use strict';
  var acctMenuWired = false;
  function wireAcctMenu() {
    if (acctMenuWired) return;
    var menuItems = document.querySelectorAll('[data-acct-menu]');
    var repairsView = document.getElementById('acct-view-repairs');
    var settingsView = document.getElementById('acct-view-settings');
    var rewardsView = document.getElementById('acct-view-rewards');
    var messagesView = document.getElementById('acct-view-messages');
    /* ACCOUNT_FIX_PASS_3_2_2026_11_06 (ITEM C): the Orders view joins
       the toggle set, same as Messages did. */
    var ordersView = document.getElementById('acct-view-orders');
    /* ACCOUNT_FIX_PASS_3_3_2026_11_06: the Cart view joins the
       toggle set too — the cart as a drop-down inside My Account,
       directly before Account Settings. */
    var cartView = document.getElementById('acct-view-cart');
    /* ATRONE_POINTS_TIERS_2026_11_06: the Manage Membership view joins the toggle set. */
    var membershipView = document.getElementById('acct-view-membership');
    if (!menuItems.length || !repairsView || !settingsView) return;
    acctMenuWired = true;
    window.__atrAcctMenuWired = true;
    /* CUSTOMER_INBOX_2026_11_05: a fourth view — Messages.
       Owner bug fix (Nov 5, 2026): show() is a TOGGLE. Tapping a
       closed row opens it and closes the others; tapping the OPEN
       row closes it and leaves every section closed. Before this,
       show() only ever opened, so a section could not be closed by
       tapping its own row — it took a tap on a different row. The
       safety net in index.html carries the identical toggle. */
    function show(view) {
      var panels = { repairs: repairsView, settings: settingsView, rewards: rewardsView, messages: messagesView, orders: ordersView, cart: cartView, membership: membershipView };
      var target = (panels[view] && !panels[view].hidden) ? null : view;
      repairsView.hidden = target !== 'repairs';
      settingsView.hidden = target !== 'settings';
      /* SITE_POINTS_SPEND_2026_10_30: third view — Rewards & Vouchers. */
      if (rewardsView) rewardsView.hidden = target !== 'rewards';
      if (messagesView) messagesView.hidden = target !== 'messages';
      if (ordersView) ordersView.hidden = target !== 'orders';
      if (cartView) cartView.hidden = target !== 'cart';
      if (membershipView) membershipView.hidden = target !== 'membership';
      menuItems.forEach(function (btn) {
        var on = btn.getAttribute('data-acct-menu') === target;
        btn.classList.toggle('is-active', on);
        /* QR_FIX_PASS_2026_11_05: the sections are a simple drop-down
           now (each panel sits directly under its row in the menu),
           so the row also reports itself expanded/collapsed. */
        btn.setAttribute('aria-expanded', on ? 'true' : 'false');
      });
      if (target === 'repairs') {
        var r = document.getElementById('acct-repairs');
        var th = document.getElementById('acct-thread');
        var nt = document.getElementById('acct-newticket');
        if (r) r.hidden = false;
        if (th) th.hidden = true;
        if (nt) nt.hidden = true;
      }
      if (target === 'messages') {
        var ib = document.getElementById('acct-inbox');
        var th2 = document.getElementById('acct-thread');
        if (ib) ib.hidden = false;
        if (th2) th2.hidden = true;
      }
    }
    menuItems.forEach(function (btn) {
      btn.addEventListener('click', function () { show(btn.getAttribute('data-acct-menu')); });
    });
    var pwBtn = document.getElementById('acct-change-password');
    if (pwBtn) pwBtn.addEventListener('click', function () {
      var msg = document.getElementById('acct-password-msg');
      if (window.atrOpenReset) { window.atrOpenReset(); return; }
      if (msg) msg.textContent = 'Use Forgot your password on the sign in screen to change it by email.';
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireAcctMenu);
  } else {
    wireAcctMenu();
  }
})();

/* ==================== POINTS SPENDING ====================
   SITE_POINTS_SPEND_2026_10_30. Earning already exists (the portal
   credits the rewards table when a ticket reaches Job Complete). This
   module is the spending half, and window.atrPoints is the money API
   every surface shares:
     getSession()          the localStorage 'atr-account' mirror, or null
     fetchBalance(id)      fresh rewards.points read -> Promise<number>
     claimSpend(id, n)     guarded deduction -> Promise<result>
     createVoucher(blocks) claim + voucher row + redemption row
     spendOnShop(total, items)  claim + redemption row (kind 'shop'),
                           called by the cart at its commit point
   Atomicity mirrors the portal's earning claim: a spend first READS
   the balance, then UPDATEs rewards setting points = balance - spend
   WHERE points is still exactly balance (a compare-and-swap). If the
   claim lands, the points_redemptions audit row is written; if that
   write fails, the points are credited back with the mirror-image
   guarded update before the customer hears anything. Two tabs or a
   portal adjustment racing a spend can only make it fail cleanly —
   never double-spend, never half-apply.
   Graceful degradation: if points_vouchers / points_redemptions do
   not exist yet (schema.sql runs separately, before publish), the
   exchange surfaces hide behind an honest "not available online yet"
   note and checkout falls back to cash-only with the points intact. */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://lyujxpuicarblpkdzuuc.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5dWp4cHVpY2FyYmxwa2R6dXVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNjAxMjQsImV4cCI6MjEwNzczNjEyNH0.io4qD7pw878Xx97yoS6xzclO33aa4QYKENpwIyZ06xg';
  var BLOCK_POINTS = 100;  // 100 points = $5 — the published rate
  var BLOCK_VALUE = 5;
  var PHONE_TEXT = '(937) 280-6243';

  var sb = null;
  function client() {
    if (sb) return sb;
    if (window.supabase && window.supabase.createClient) {
      try { sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); } catch (e) { sb = null; }
    }
    return sb;
  }
  function $(id) { return document.getElementById(id); }
  function fmtPts(n) { return Number(n || 0).toLocaleString('en-US'); }
  function escX(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function firstName(full) { return String(full || '').trim().split(/\s+/)[0] || 'there'; }

  function getSession() {
    try { return JSON.parse(localStorage.getItem('atr-account') || 'null'); } catch (e) { return null; }
  }

  function patchSessionPoints(pts) {
    try {
      var s = getSession();
      if (s) { s.points = pts; localStorage.setItem('atr-account', JSON.stringify(s)); }
    } catch (e) {}
    var num = $('acct-points-num');
    if (num) num.textContent = pts;
    var s2 = getSession();
    var label = $('account-label');
    /* NAV_SEARCH_CLEANUP_2026_11_06 (addendum 11): keep the header
       account button on the person's NAME when points refresh. */
    if (label && s2) label.textContent = String(s2.name || '').trim() || firstName(s2.name);
  }

  function fetchBalance(customerId) {
    var c = client();
    if (!c || !customerId) return Promise.resolve(0);
    return c.from('rewards').select('points').eq('customer_id', customerId).limit(1)
      .then(function (res) {
        if (res.error) throw res.error;
        return (res.data && res.data.length) ? (res.data[0].points || 0) : 0;
      });
  }

  function claimSpend(customerId, amount) {
    var c = client();
    if (!c) return Promise.resolve({ ok: false, reason: 'unavailable' });
    return fetchBalance(customerId).then(function (bal) {
      if (bal < amount) return { ok: false, reason: 'insufficient', balance: bal };
      var next = bal - amount;
      return c.from('rewards').update({ points: next })
        .eq('customer_id', customerId).eq('points', bal).select('customer_id')
        .then(function (res) {
          if (res.error) throw res.error;
          if (!res.data || !res.data.length) return { ok: false, reason: 'changed', balance: bal };
          return { ok: true, balance: next, previous: bal };
        });
    }).catch(function () { return { ok: false, reason: 'error' }; });
  }

  function creditBack(customerId, amount, expectedCurrent) {
    var c = client();
    if (!c) return Promise.resolve(false);
    return c.from('rewards').update({ points: expectedCurrent + amount })
      .eq('customer_id', customerId).eq('points', expectedCurrent).select('customer_id')
      .then(function (res) { return !res.error && !!(res.data && res.data.length); })
      .catch(function () { return false; });
  }

  function recordRedemption(row) {
    var c = client();
    if (!c) return Promise.reject(new Error('no client'));
    return c.from('points_redemptions').insert(row).select('id').single()
      .then(function (res) {
        if (res.error) throw res.error;
        return res.data;
      });
  }

  var CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function makeCode() {
    var out = 'ATRG-';
    for (var i = 0; i < 6; i++) out += CODE_ALPHABET.charAt(Math.floor(Math.random() * CODE_ALPHABET.length));
    return out;
  }

  /* Exchange $5 blocks for a voucher. One commit: claim the points,
   * insert the voucher, write the audit row. Any failure after the
   * claim rolls the points back before the customer hears about it. */
  function createVoucher(blocks) {
    var s = getSession();
    if (!s || !s.id) return Promise.resolve({ ok: false, message: 'Please sign in first.' });
    blocks = Math.max(0, Math.floor(Number(blocks) || 0));
    if (!blocks) return Promise.resolve({ ok: false, message: 'Choose at least one $5 block.' });
    var spend = blocks * BLOCK_POINTS;
    var c = client();
    if (!c) return Promise.resolve({ ok: false, message: 'Points are unavailable right now — please try again later.' });
    return claimSpend(s.id, spend).then(function (claim) {
      if (!claim.ok) {
        if (claim.reason === 'insufficient') {
          return { ok: false, message: 'Your balance is ' + fmtPts(claim.balance) + ' points — not enough for ' + blocks + ' block' + (blocks > 1 ? 's' : '') + '. Nothing was exchanged.' };
        }
        return { ok: false, message: 'Your balance just changed — please try again. Nothing was exchanged.' };
      }
      var attempts = 0;
      function tryInsert() {
        attempts++;
        var code = makeCode();
        return c.from('points_vouchers').insert({
          customer_id: s.id, code: code, blocks: blocks,
          value_dollars: blocks * BLOCK_VALUE, points_spent: spend, status: 'active'
        }).select('id, code').single().then(function (res) {
          if (res.error) {
            // 23505 = the random code already exists: mint another.
            if (res.error.code === '23505' && attempts < 3) return tryInsert();
            throw res.error;
          }
          return recordRedemption({
            customer_id: s.id, kind: 'voucher', points_spent: spend,
            blocks: blocks, voucher_id: res.data.id,
            details: { code: res.data.code, value_dollars: blocks * BLOCK_VALUE }
          }).then(function () { return { code: res.data.code }; });
        });
      }
      return tryInsert().then(function (done) {
        patchSessionPoints(claim.balance);
        return { ok: true, code: done.code, balance: claim.balance, value: blocks * BLOCK_VALUE };
      }).catch(function () {
        return creditBack(s.id, spend, claim.balance).then(function (back) {
          if (back) patchSessionPoints(claim.previous);
          return { ok: false, message: back
            ? 'The exchange hit a snag and your points were put back. Please try again.'
            : 'The exchange hit a snag. Text us at ' + PHONE_TEXT + ' and we will sort out your points.' };
        });
      });
    });
  }

  /* Shop checkout commit for points-paid lines (called by the cart). */
  function spendOnShop(total, items) {
    var s = getSession();
    if (!s || !s.id) return Promise.resolve({ ok: false, message: 'Please sign in to pay with points.' });
    total = Math.floor(Number(total) || 0);
    if (!(total > 0)) return Promise.resolve({ ok: false, message: 'Nothing to pay with points.' });
    return claimSpend(s.id, total).then(function (claim) {
      if (!claim.ok) {
        if (claim.reason === 'insufficient') {
          return { ok: false, message: 'Your points balance is ' + fmtPts(claim.balance) + ' — not enough for the items you marked (' + fmtPts(total) + ' pts). Nothing was charged. Unmark an item or two and try again.' };
        }
        return { ok: false, message: 'Your points balance just changed — please review your cart and try again. Nothing was charged.' };
      }
      return recordRedemption({
        customer_id: s.id, kind: 'shop', points_spent: total,
        details: { items: items }
      }).then(function () {
        patchSessionPoints(claim.balance);
        return { ok: true, balance: claim.balance };
      }).catch(function () {
        return creditBack(s.id, total, claim.balance).then(function (back) {
          if (back) patchSessionPoints(claim.previous);
          return { ok: false, message: back
            ? 'Points checkout hit a snag and your points were put back. Please try again.'
            : 'Points checkout hit a snag. Text us at ' + PHONE_TEXT + ' and we will sort out your points.' };
        });
      });
    });
  }

  function fetchVouchers(customerId) {
    var c = client();
    if (!c || !customerId) return Promise.resolve(null);
    return c.from('points_vouchers').select('id, code, value_dollars, blocks, status, created_at')
      .eq('customer_id', customerId).eq('status', 'active')
      .order('created_at', { ascending: false }).limit(50)
      .then(function (res) {
        if (res.error) throw res.error;
        return res.data || [];
      }).catch(function () { return null; }); // null = table unavailable
  }

  /* ---------------- shared surface state ---------------- */
  var cartSnapshot = { sum: 0, qty: 0 };
  var lastBalance = null;
  var vouchersKnown = null; // null = unprobed, true/false after first read
  var exchangeBlocks = 1;
  var cartBlocks = 1;

  /* ACCOUNT_FIX_PASS_3_3_2026_11_06: refreshCartBadge() retired with
     the plain Cart row whose count badge it painted — the Cart
     drop-down that replaced the row is painted by the shop module. */

  function paintExchange() {
    var balEl = $('pts-balance-num');
    var s = getSession();
    var bal = (lastBalance !== null) ? lastBalance : (s ? (s.points || 0) : 0);
    if (balEl) balEl.textContent = fmtPts(bal);
    var max = Math.floor(bal / BLOCK_POINTS);
    if (exchangeBlocks > max) exchangeBlocks = Math.max(1, max);
    if (exchangeBlocks < 1) exchangeBlocks = 1;
    var num = $('pts-blocks');
    if (num) num.textContent = exchangeBlocks;
    var sub = $('pts-blocks-sub');
    if (sub) sub.textContent = fmtPts(exchangeBlocks * BLOCK_POINTS) + ' points = $' + (exchangeBlocks * BLOCK_VALUE) + ' voucher';
    var minus = $('pts-minus'), plus = $('pts-plus'), btn = $('pts-exchange-btn');
    if (minus) minus.disabled = exchangeBlocks <= 1;
    if (plus) plus.disabled = exchangeBlocks >= max;
    if (btn) {
      btn.disabled = max < 1 || vouchersKnown === false;
      btn.innerHTML = max < 1
        ? 'You need ' + BLOCK_POINTS + ' points for a $5 block'
        : '<i class="fas fa-ticket"></i> Exchange for a $' + (exchangeBlocks * BLOCK_VALUE) + ' voucher';
    }
    var wrap = $('pts-exchange'), un = $('pts-exchange-unavailable');
    if (wrap && un && vouchersKnown !== null) {
      wrap.hidden = vouchersKnown === false;
      un.hidden = vouchersKnown !== false;
    }
  }

  function paintCartPanel() {
    var panel = $('cart-points-panel');
    if (!panel) return;
    var s = getSession();
    var signin = $('cart-points-signin'), main = $('cart-points-main');
    if (!s) {
      panel.hidden = false;
      if (signin) signin.hidden = false;
      if (main) main.hidden = true;
      return;
    }
    if (signin) signin.hidden = true;
    if (main) main.hidden = false;
    panel.hidden = false;
    var bal = (lastBalance !== null) ? lastBalance : (s.points || 0);
    var balEl = $('cart-points-balance');
    if (balEl) balEl.textContent = fmtPts(bal);
    var maxByBalance = Math.floor(bal / BLOCK_POINTS);
    var maxByCart = Math.floor((cartSnapshot.sum || 0) / BLOCK_VALUE);
    var max = Math.min(maxByBalance, maxByCart);
    if (cartBlocks > max) cartBlocks = Math.max(1, max);
    if (cartBlocks < 1) cartBlocks = 1;
    var num = $('cart-pts-blocks');
    if (num) num.textContent = cartBlocks;
    var minus = $('cart-pts-minus'), plus = $('cart-pts-plus'), btn = $('cart-pts-convert-btn');
    if (minus) minus.disabled = cartBlocks <= 1;
    if (plus) plus.disabled = cartBlocks >= max;
    if (btn) {
      btn.disabled = max < 1 || vouchersKnown === false;
      btn.innerHTML = '<i class="fas fa-ticket"></i> Turn ' + fmtPts(cartBlocks * BLOCK_POINTS) + ' points into a $' + (cartBlocks * BLOCK_VALUE) + ' voucher';
    }
    var conv = $('cart-points-convert');
    if (conv && vouchersKnown === false) conv.hidden = true;
    else if (conv) conv.hidden = false;
  }

  function refreshVoucherSurfaces() {
    var s = getSession();
    var strip = $('acct-voucher-strip');
    if (!s || !s.id) { if (strip) strip.hidden = true; return Promise.resolve(); }
    return fetchVouchers(s.id).then(function (list) {
      if (list === null) {
        vouchersKnown = false;
        if (strip) strip.hidden = true;
        var vl0 = $('pts-voucher-list');
        if (vl0) vl0.innerHTML = '<p class="acct-muted">Vouchers are not available online yet.</p>';
        paintExchange(); paintCartPanel();
        return;
      }
      vouchersKnown = true;
      if (strip) {
        if (list.length) {
          strip.hidden = false;
          var total = list.reduce(function (n, v) { return n + (v.value_dollars || 0); }, 0);
          var txt = $('acct-voucher-strip-text');
          if (txt) txt.textContent = 'You have ' + list.length + ' voucher' + (list.length > 1 ? 's' : '') + ' worth $' + total + ' — tap to view';
        } else {
          strip.hidden = true;
        }
      }
      var vl = $('pts-voucher-list');
      if (vl) {
        vl.innerHTML = list.length ? list.map(function (v) {
          /* ACCOUNT_FIX_PASS_3_2026_11_06: the card names the status
             too (this list only ever holds active vouchers — the
             fetch filters on it — so the word is read from the row). */
          var st = String(v.status || 'active');
          st = st.charAt(0).toUpperCase() + st.slice(1);
          return '<div class="pts-voucher-card"><div><div class="pts-voucher-code">' + escX(v.code) + '</div>' +
            '<div class="acct-muted" style="text-align:left;padding:0;">Show this code at your visit to use it. Status: ' + escX(st) + '</div></div>' +
            '<div class="pts-voucher-value">$' + escX(v.value_dollars) + '</div></div>';
        }).join('') : '<p class="acct-muted">No vouchers yet — exchange points above and they will show up here.</p>';
      }
      paintExchange(); paintCartPanel();
    });
  }

  function refreshBalances() {
    var s = getSession();
    if (!s || !s.id) { lastBalance = null; paintExchange(); paintCartPanel(); return Promise.resolve(); }
    return fetchBalance(s.id).then(function (bal) {
      lastBalance = bal;
      patchSessionPoints(bal);
      paintExchange(); paintCartPanel();
    }).catch(function () { paintExchange(); paintCartPanel(); });
  }

  function refreshAccountSurfaces() {
    return Promise.all([refreshBalances(), refreshVoucherSurfaces()]);
  }

  function refreshTicketPoints() {
    var wrap = $('acct-t-points-wrap');
    if (!wrap) return;
    var s = getSession();
    if (!s || !s.id) { wrap.hidden = true; return; }
    fetchBalance(s.id).then(function (bal) {
      lastBalance = bal;
      var max = Math.floor(bal / BLOCK_POINTS);
      if (max < 1) { wrap.hidden = true; return; }
      wrap.hidden = false;
      var det = $('acct-t-points-detail');
      if (det) det.textContent = 'You have ' + fmtPts(bal) + ' points — up to $' + (max * BLOCK_VALUE) + ' off this repair.';
      var sel = $('acct-t-points-blocks');
      if (sel) {
        var cur = sel.value;
        sel.innerHTML = '';
        for (var i = 1; i <= max; i++) {
          var o = document.createElement('option');
          o.value = i;
          o.textContent = '$' + (i * BLOCK_VALUE) + ' off — ' + fmtPts(i * BLOCK_POINTS) + ' points';
          sel.appendChild(o);
        }
        if (cur && Number(cur) <= max) sel.value = cur;
      }
    }).catch(function () { wrap.hidden = true; });
  }

  /* Public API — assigned synchronously at parse time, because the
   * shop module's DOMContentLoaded handlers (registered earlier in
   * this file) call cartChanged/checkout helpers. */
  window.atrPoints = {
    getSession: getSession,
    fetchBalance: fetchBalance,
    claimSpend: claimSpend,
    createVoucher: createVoucher,
    spendOnShop: spendOnShop,
    refreshAccountSurfaces: refreshAccountSurfaces,
    cartChanged: function (snapshot) {
      if (snapshot) cartSnapshot = snapshot;
      paintCartPanel();
    }
  };

  /* ACCOUNT_FIX_PASS_3_2026_11_06: this wiring block is one-shot.
     Every sibling wiring on the account page already guards itself
     (wireAcctMenu, the index.html safety net) because a doubled
     wiring is invisible until a handler's effect cancels itself —
     and this block's strip handler was the one left unguarded: with
     two copies attached, one tap on the voucher strip clicked the
     Rewards row twice, and since CUSTOMER_INBOX_2026_11_05 made the
     rows toggle, the section opened and instantly closed again.
     The tap looked completely dead (owner, Nov 6, 2026: "they have
     one voucher worth five dollars, tap to view — that's not
     working"). The steppers double-stepped the same way. */
  var pointsWired = false;
  document.addEventListener('DOMContentLoaded', function () {
    if (pointsWired) return;
    pointsWired = true;
    /* Tappable points balance -> the Shop. The anchor carries
     * data-page="shop", so the router navigates — and since
     * QR_FIX_PASS_2_2026_11_05 the account is a page, that navigation
     * is all it takes to leave it; there is no sheet to close first. */
    var ptsLink = $('acct-points-link');
    if (ptsLink) ptsLink.addEventListener('click', function () { /* navigation only — see above */ });

    /* ACCOUNT_FIX_PASS_3_3_2026_11_06: the account page's old plain
       Cart row (go to the Shop, open the drawer) is gone — the Cart
       drop-down in the account menu replaced it, wired by the
       [data-acct-menu] handling like every other row, and its Open
       cart row opens the drawer from inside the panel. */

    /* Voucher strip -> the Rewards view. ACCOUNT_FIX_PASS_3:
       after the row opens the section, bring it into view — the
       strip sits at the top of the dashboard and the Rewards panel
       is far below it in the menu, so on a phone the open panel
       could land entirely off-screen and the tap still looked
       dead even with the wiring right. */
    var strip = $('acct-voucher-strip');
    if (strip) strip.addEventListener('click', function () {
      var item = document.querySelector('[data-acct-menu="rewards"]');
      if (item) item.click();
      var rewardsView = $('acct-view-rewards');
      if (rewardsView && !rewardsView.hidden && rewardsView.scrollIntoView) {
        try { rewardsView.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
      }
    });

    /* Rewards view: refresh every time it is opened. */
    var rewardsItem = document.querySelector('[data-acct-menu="rewards"]');
    if (rewardsItem) rewardsItem.addEventListener('click', function () {
      refreshBalances();
      refreshVoucherSurfaces();
    });

    /* Exchange steppers + button (account Rewards view). */
    var exMinus = $('pts-minus'), exPlus = $('pts-plus'), exBtn = $('pts-exchange-btn');
    if (exMinus) exMinus.addEventListener('click', function () { exchangeBlocks = Math.max(1, exchangeBlocks - 1); paintExchange(); });
    if (exPlus) exPlus.addEventListener('click', function () { exchangeBlocks = exchangeBlocks + 1; paintExchange(); });
    if (exBtn) exBtn.addEventListener('click', function () {
      var err = $('pts-exchange-error'), ok = $('pts-exchange-success');
      if (err) err.hidden = true;
      if (ok) ok.hidden = true;
      exBtn.disabled = true;
      exBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exchanging…';
      createVoucher(exchangeBlocks).then(function (res) {
        if (res.ok) {
          if (ok) {
            ok.hidden = false;
            ok.innerHTML = '<strong>Your $' + res.value + ' voucher is ready: ' + escX(res.code) + '</strong><br>Show this code at your visit to use it. It is saved below under My vouchers.';
          }
          exchangeBlocks = 1;
          refreshBalances();
          refreshVoucherSurfaces();
        } else {
          if (err) { err.textContent = res.message; err.hidden = false; }
          paintExchange();
        }
      });
    });

    /* Cart panel: sign-in nudge + voucher conversion. */
    var signinBtn = $('cart-points-signin-btn');
    if (signinBtn) signinBtn.addEventListener('click', function () {
      var cc = $('cart-close');
      if (cc) cc.click();
      var ab = $('account-open-btn');
      if (ab) ab.click();
    });
    var cMinus = $('cart-pts-minus'), cPlus = $('cart-pts-plus'), cBtn = $('cart-pts-convert-btn');
    if (cMinus) cMinus.addEventListener('click', function () { cartBlocks = Math.max(1, cartBlocks - 1); paintCartPanel(); });
    if (cPlus) cPlus.addEventListener('click', function () { cartBlocks = cartBlocks + 1; paintCartPanel(); });
    if (cBtn) cBtn.addEventListener('click', function () {
      var err = $('cart-pts-error'), ok = $('cart-pts-success');
      if (err) err.hidden = true;
      if (ok) ok.hidden = true;
      cBtn.disabled = true;
      createVoucher(cartBlocks).then(function (res) {
        if (res.ok) {
          if (ok) {
            ok.hidden = false;
            ok.innerHTML = '<strong>Voucher ' + escX(res.code) + ' — $' + res.value + '</strong><br>Show this code when you see us and we will apply its value then. It is also saved under My vouchers in your account.';
          }
          cartBlocks = 1;
          refreshBalances();
          refreshVoucherSurfaces();
        } else {
          if (err) { err.textContent = res.message; err.hidden = false; }
          paintCartPanel();
        }
      });
    });

    /* New Request form: points block appears with a fresh balance. */
    var ntBtn = $('acct-new-ticket-btn');
    if (ntBtn) ntBtn.addEventListener('click', function () { refreshTicketPoints(); });
    var usePts = $('acct-t-use-points');
    if (usePts) usePts.addEventListener('change', function () {
      var amt = $('acct-t-points-amount');
      if (amt) amt.hidden = !usePts.checked;
    });

    /* Refresh the account surfaces whenever the account page becomes
     * the active page (QR_FIX_PASS_2_2026_11_05: this watched the old
     * modal's hidden attribute; the page system marks the visible page
     * with .active instead). Covers sign-in, when renderDash swaps the
     * views in. */
    var acctPage = $('account');
    if (acctPage && window.MutationObserver) {
      var mo = new MutationObserver(function () {
        if (acctPage.classList.contains('active') && getSession()) refreshAccountSurfaces();
      });
      mo.observe(acctPage, { attributes: true, attributeFilter: ['class'] });
    }
    var openBtn = $('account-open-btn');
    if (openBtn) openBtn.addEventListener('click', function () {
      if (getSession()) refreshAccountSurfaces();
    });

    paintCartPanel();
    if (getSession()) { refreshBalances(); refreshVoucherSurfaces(); }
  });
})();


/* ==================== NAV_SEARCH_CLEANUP_2026_11_06: SITE-WIDE SEARCH ====================
   Owner direction (Nov 6, 2026): a search button in the header that
   searches ANYTHING on the website. The index is built at runtime
   from what is actually on the page — nothing is invented:
   - Pages: every section.page, titled with the site's own names,
     keyed by the real headings inside that section.
   - Repairs & prices: window.ATR_PRICE_DATA (the same book the
     repair wizard and the Prices lookup read). A tap drives the
     Prices lookup itself — type tile, brand and model dropdowns,
     repair tile — so the visitor lands on the real starting price.
   - Shop items: window.ATR_SHOP_PRODUCTS (the shop module's own
     catalog, exposed above). A tap opens the Shop page with the
     shop's own search applied to that item.
   Navigation reuses the site's existing router: results carry the
   same data-page anchors the nav uses, clicked through the normal
   delegated handler. Escape, the close button, and a tap on the
   dimmed area all close the panel — nobody is ever trapped. */
(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', function () {
    var openBtn = document.getElementById('site-search-open');
    var overlay = document.getElementById('site-search');
    var input = document.getElementById('site-search-input');
    var resultsBox = document.getElementById('site-search-results');
    var closeBtn = document.getElementById('site-search-close');
    if (!openBtn || !overlay || !input || !resultsBox) return;

    var PAGE_NAMES = {
      home: 'Home', repair: 'Repair', prices: 'Prices', whatwedo: 'What We Fix',
      about: 'About', shop: 'Store', b2b: 'B2B', 'atr-one': 'ATR One Membership',
      careers: 'Careers', investors: 'Investors', contact: 'Contact',
      warranty: 'Warranty', 'warranty-request': 'Warranty Request',
      privacy: 'Privacy Policy', terms: 'Terms of Service',
      'service-agreement': 'Service Agreement', review: 'Leave a Review',
      values: 'Our Values', account: 'My Account', phones: 'Phones',
      tablets: 'Tablets', computers: 'Computers', consoles: 'Game Consoles',
      smartwatches: 'Smartwatches', websites: 'Websites',
      network: 'Network Installs', cabling: 'Internet Cabling',
      classes: 'One-on-One Classes'
    };
    var GROUP_LABELS = { page: 'Pages', repair: 'Repairs & prices', shop: 'Store items' };
    var GROUP_CAPS = { page: 8, repair: 10, shop: 8 };
    /* NAV_SEARCH_CLEANUP_2026_11_06 (addendum 4): the storefront's
     * customer-facing name is "Store" (PAGE_NAMES above); "shop" stays
     * behind as a search alias so the old word still finds the page.
     * Internal ids (data-page="shop", section id) are unchanged. */
    var PAGE_ALIASES = { shop: 'shop', b2b: 'business enterprise pos small business' };

    function norm(s) { return String(s == null ? '' : s).toLowerCase(); }
    function fmtPrice(p) { return (p % 1 === 0) ? '$' + p : '$' + p.toFixed(2); }

    var index = null;
    function buildIndex() {
      if (index) return index;
      index = [];
      document.querySelectorAll('section.page').forEach(function (sec) {
        if (!sec.id) return;
        var heads = [];
        sec.querySelectorAll('h1, h2, h3').forEach(function (h) {
          var t = h.textContent.trim().replace(/\s+/g, ' ');
          if (t) heads.push({ text: t, el: h });
        });
        var title = PAGE_NAMES[sec.id] || (heads.length ? heads[0].text : sec.id);
        index.push({
          kind: 'page', title: title, sub: 'Page', page: sec.id, heads: heads,
          hay: norm(title + ' ' + (PAGE_ALIASES[sec.id] || '') + ' ' + heads.map(function (h) { return h.text; }).join(' '))
        });
      });
      var D = window.ATR_PRICE_DATA || {};
      Object.keys(D).forEach(function (type) {
        Object.keys(D[type]).forEach(function (brand) {
          Object.keys(D[type][brand]).forEach(function (model) {
            var repairs = D[type][brand][model] || {};
            Object.keys(repairs).forEach(function (rname) {
              var price = repairs[rname];
              var title = brand + ' ' + model + ' \u2014 ' + rname;
              index.push({
                kind: 'repair', title: title,
                sub: (typeof price === 'number') ? 'Starting at ' + fmtPrice(price) : 'Price confirmed up front',
                type: type, brand: brand, model: model, repair: rname,
                price: (typeof price === 'number') ? price : null,
                hay: norm(title + ' ' + type)
              });
            });
          });
        });
      });
      (window.ATR_SHOP_PRODUCTS || []).forEach(function (p) {
        var hay = norm(p.name + ' ' + (p.cat || '') + ' ' + (p.desc || '') + ' ' +
          (p.variants ? p.variants.map(function (v) { return v.label; }).join(' ') : ''));
        index.push({
          kind: 'shop', title: p.name, sub: 'Store item \u00B7 ' + (p.cat || 'Accessories'),
          name: p.name, hay: hay
        });
      });
      return index;
    }

    function runSearch(qRaw) {
      var q = norm(qRaw).trim();
      if (!q) return [];
      var toks = q.split(/\s+/).filter(Boolean);
      var scored = [];
      buildIndex().forEach(function (e) {
        var ok = true;
        for (var i = 0; i < toks.length; i++) {
          if (e.hay.indexOf(toks[i]) === -1) { ok = false; break; }
        }
        if (!ok) return;
        var lt = norm(e.title);
        var score = 0;
        if (lt === q) score += 100;
        if (lt.indexOf(q) === 0) score += 40;
        if (lt.indexOf(q) > -1) score += 25;
        toks.forEach(function (t) { if (lt.indexOf(t) > -1) score += 5; });
        if (e.kind === 'page') score += 2;
        scored.push({ e: e, score: score });
      });
      scored.sort(function (a, b) { return b.score - a.score; });
      var counts = { page: 0, repair: 0, shop: 0 };
      var out = [];
      scored.forEach(function (s) {
        if (counts[s.e.kind] < GROUP_CAPS[s.e.kind]) { counts[s.e.kind]++; out.push(s.e); }
      });
      return out;
    }

    function goToPage(pageId) {
      var a = document.createElement('a');
      a.setAttribute('href', '#' + pageId);
      a.setAttribute('data-page', pageId);
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    function pickTileText(boxId, text) {
      var box = document.getElementById(boxId);
      if (!box) return false;
      var tiles = box.querySelectorAll('button');
      for (var i = 0; i < tiles.length; i++) {
        if (tiles[i].textContent.trim().replace(/\s+/g, ' ') === text) { tiles[i].click(); return true; }
      }
      return false;
    }
    function setSelect(id, value) {
      var sel = document.getElementById(id);
      if (!sel) return false;
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === value) {
          sel.value = value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      return false;
    }

    function openRepairResult(e) {
      goToPage('prices');
      var steps = [
        function () { pickTileText('dt-types', e.type); },
        function () { setSelect('dt-brands', e.brand); },
        function () { setSelect('dt-models', e.model); },
        function () {
          pickTileText('dt-repairs', e.repair);
          var r = document.getElementById('dt-result');
          if (r) { try { r.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (err) {} }
        }
      ];
      steps.forEach(function (fn, i) { setTimeout(fn, 200 + i * 150); });
    }

    function openShopResult(e) {
      goToPage('shop');
      setTimeout(function () {
        var s = document.getElementById('shop-search');
        if (s) {
          s.value = e.name;
          s.dispatchEvent(new Event('input', { bubbles: true }));
        }
        var sec = document.getElementById('shop');
        if (sec) { try { sec.scrollIntoView({ behavior: 'auto', block: 'start' }); } catch (err) {} }
      }, 250);
    }

    function openPageResult(e, q) {
      goToPage(e.page);
      var target = null;
      var lq = norm(q).trim();
      if (lq && norm(e.title) !== lq) {
        for (var i = 0; i < e.heads.length; i++) {
          if (norm(e.heads[i].text).indexOf(lq) > -1) { target = e.heads[i].el; break; }
        }
      }
      if (target) {
        setTimeout(function () { try { target.scrollIntoView({ behavior: 'auto', block: 'start' }); } catch (err) {} }, 850);
      }
    }

    function activate(e, q) {
      closeSearch();
      if (e.kind === 'repair') openRepairResult(e);
      else if (e.kind === 'shop') openShopResult(e);
      else openPageResult(e, q);
    }

    function render(qRaw) {
      var q = String(qRaw || '');
      resultsBox.innerHTML = '';
      if (!q.trim()) {
        var hint = document.createElement('p');
        hint.className = 'site-search-hint';
        hint.textContent = 'Start typing \u2014 search looks across every page, the repair price book, and the store.';
        resultsBox.appendChild(hint);
        return;
      }
      var list = runSearch(q);
      if (!list.length) {
        var none = document.createElement('p');
        none.className = 'site-search-none';
        none.textContent = 'No matches for \u201C' + q.trim() + '\u201D. Try a shorter word \u2014 a device, a repair, or a page name \u2014 or close search and use the menu.';
        resultsBox.appendChild(none);
        return;
      }
      ['page', 'repair', 'shop'].forEach(function (kind) {
        var items = list.filter(function (e) { return e.kind === kind; });
        if (!items.length) return;
        var h = document.createElement('p');
        h.className = 'site-search-group';
        h.textContent = GROUP_LABELS[kind];
        resultsBox.appendChild(h);
        items.forEach(function (e) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'site-search-item';
          b.setAttribute('data-kind', e.kind);
          var t = document.createElement('span');
          t.className = 'site-search-item-title';
          t.textContent = e.title;
          var s = document.createElement('span');
          s.className = 'site-search-item-sub';
          s.textContent = e.sub;
          b.appendChild(t); b.appendChild(s);
          b.addEventListener('click', function () { activate(e, q); });
          resultsBox.appendChild(b);
        });
      });
    }

    function lockScroll() {
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    }
    function unlockScroll() {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    }
    function isOpen() { return !overlay.hidden; }
    function openSearch() {
      buildIndex();
      overlay.hidden = false;
      lockScroll();
      render(input.value);
      setTimeout(function () { try { input.focus(); } catch (e) {} }, 30);
    }
    function closeSearch() {
      if (!isOpen()) return;
      overlay.hidden = true;
      unlockScroll();
    }

    openBtn.addEventListener('click', openSearch);
    if (closeBtn) closeBtn.addEventListener('click', closeSearch);
    overlay.addEventListener('click', function (ev) { if (ev.target === overlay) closeSearch(); });
    document.addEventListener('keydown', function (ev) {
      if (isOpen() && (ev.key === 'Escape' || ev.keyCode === 27)) closeSearch();
    });
    input.addEventListener('input', function () { render(input.value); });
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        var first = resultsBox.querySelector('.site-search-item');
        if (first) { ev.preventDefault(); first.click(); }
      }
    });

    /* Test/verification handle (same pattern as the lookup's own
       session hand-off): lets the harness drive the real module. */
    window.atrSiteSearch = { open: openSearch, close: closeSearch, run: runSearch, isOpen: isOpen };
  });
})();

/* =====================================================================
   NAV_SEARCH_CLEANUP_2026_11_06 (addendum 2) — PORTAL BUTTON VISIBILITY
   Owner's "second layer of security": the header Portal link
   (#emp-dash-link) ships with the hidden attribute in index.html and is
   unhidden ONLY after the website's own Supabase session verifies the
   signed-in user is staff — the same employee_profiles row check
   portal.html's verifyEmployee gate performs (portal.js reads
   employee_profiles with the signed-in user's JWT; this module mirrors
   that read with the website session's client). Fail CLOSED at every
   step: no session, no client, a read error, or no row all leave the
   button hidden, and sign-out hides it again. RLS check (verified
   from the schema record, hidden_files/supabase-employee-hub.sql):
   employee_profiles carries the SELECT policy "Employees read own
   profile" (TO authenticated, USING auth.uid() = id), so the direct
   read is allowed for the caller's own row from the website session.
   If that read ever errors, the module falls back to the EXISTING
   public.is_employee() SECURITY DEFINER boolean — no new SQL is
   needed for this gate (see is_staff.sql in this build folder).
   ===================================================================== */
(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', function () {
    var link = document.getElementById('emp-dash-link');
    if (!link) return;
    var SUPABASE_URL = 'https://lyujxpuicarblpkdzuuc.supabase.co';
    var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5dWp4cHVpY2FyYmxwa2R6dXVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNjAxMjQsImV4cCI6MjEwNzczNjEyNH0.io4qD7pw878Xx97yoS6xzclO33aa4QYKENpwIyZ06xg';
    var sb = null;
    function getClient() {
      if (sb) return sb;
      if (window.supabase && window.supabase.createClient) {
        try { sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); } catch (e) { sb = null; }
      }
      return sb;
    }
    function show() { link.hidden = false; }
    function hide() { link.hidden = true; }
    hide(); /* fail closed from the first frame */
    function rpcFallback(client) {
      if (!client || typeof client.rpc !== 'function') { hide(); return; }
      try {
        client.rpc('is_employee').then(function (res) {
          if (res && !res.error && res.data === true) { show(); } else { hide(); }
        }).catch(function () { hide(); });
      } catch (e) { hide(); }
    }
    function check(user) {
      var client = getClient();
      if (!user || !client) { hide(); return; }
      try {
        client.from('employee_profiles').select('id').eq('id', user.id).maybeSingle()
          .then(function (res) {
            if (res && res.error) { rpcFallback(client); return; }
            if (res && res.data && res.data.id) { show(); } else { hide(); }
          })
          .catch(function () { rpcFallback(client); });
      } catch (e) { rpcFallback(client); }
    }
    var client = getClient();
    if (!client) return;
    try {
      client.auth.getSession().then(function (res) {
        var session = res && res.data ? res.data.session : null;
        check(session ? session.user : null);
      }).catch(function () { hide(); });
      if (client.auth && typeof client.auth.onAuthStateChange === 'function') {
        client.auth.onAuthStateChange(function (_event, session) {
          check(session ? session.user : null);
        });
      }
    } catch (e) { hide(); }
  });
})();

/* ==================== FOOTER_AUDIENCE_PAGES_2026_11_06: FOOTER ACCOUNT LINK ====================
   The footer Account column's "Manage Your ATR One Account" link
   opens My Account through the header account button itself — it
   clicks #account-open-btn, so the tap runs the exact routing that
   button uses (script.js goAccount + the index.html twin handler:
   signed-in visitors land on their dashboard, signed-out visitors
   on the sign-in view, the quick glance closes, and the human
   checks mount after the page switch). There is deliberately no
   data-page attribute on the link: the generic router would switch
   the page without choosing the right account view. If the header
   button is ever missing, the fallback is a plain hash navigation
   to the account page. */
(function () {
  'use strict';
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('#footer-account-link') : null;
    if (!t) return;
    e.preventDefault();
    var btn = document.getElementById('account-open-btn');
    if (btn) { btn.click(); }
    else if (window.location.hash !== '#account') { window.location.hash = '#account'; }
  });
})();
