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
      /* SERVICES_SINGLE_DOOR_2026_11_09: the Prices page is gone —
         old #prices bookmarks and links land on Services instead
         of a dead view. */
      if (cleanId === 'prices') cleanId = 'whatwedo';
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
      /* V63_LOGIN_FOCUS_2026_11_09: arriving on the account page
         starts with NOTHING in the sign-in view focused. This site
         never unloads (pages are shown and hidden, not replaced),
         so a field a guest tapped on an earlier visit keeps its
         focus while the page is hidden - and the moment the page
         shows again, iOS resurrects that focused email/password
         field and re-throws its Face ID password prompt,
         uninvited, on every open. Clearing the focus here, at the
         one funnel every arrival passes through (header account
         button, footer account link, checkout sign-in prompt,
         direct #account link), means the guest taps the field
         when THEY are ready and the prompt comes once, on their
         terms. Nothing else about the sign-in view changes. */
      if (cleanId === 'account') {
        var ae = document.activeElement, av = document.getElementById('acct-auth-view');
        if (ae && av && av.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) ae.blur();
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
          /* SEARCH_CLOSE_ON_NAV_2026_11_11 (owner bug report, Nov 11,
             2026): choosing any destination closes the search sheet
             first. Before this, tapping Services / Store / Support /
             Home in the thumb bar switched the page UNDERNEATH the
             open sheet and the sheet stayed up - the guest saw the
             new item light up behind a sheet that would not move.
             close() is a no-op when the sheet is already closed, and
             search results close first in activate() either way. */
          if (window.atrSiteSearch && window.atrSiteSearch.isOpen()) window.atrSiteSearch.close();
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
    var repairState = { device: '', brand: '', model: '', issue: '', issues: [], atrOne: '', describe: '', modelState: 'pending', priceRange: '$50 \u2013 $150', priceExact: null,
      /* SUPPORT_BOOKING_2026_11_06 (design pivot): One-on-One mode of this
         same wizard — serviceKind is one of the eight service bubbles,
         ooHours is 1 or 2 (pure $25/hr). */
      mode: 'repair', serviceKind: '', ooHours: 0,
      /* VIRTUAL_ONE_ON_ONE_2026_11_10: how the session happens —
         '' (not picked), 'inperson', or 'virtual'. Picked early in
         One-on-One mode (the How will we meet? tiles) and carried
         into the ticket through atrGuidedSelection. */
      ooPlace: '',
      /* COMPUTER_YEAR_2026_11_10 (owner, Nov 10, 2026): computers
         carry a year pick (make, model, then year — like searching
         for a vehicle; parts are listed by year). '' until picked;
         'Not sure' is a real pick, so nobody is trapped. */
      year: '',
      /* SERVICES_TWO_PAGES_2026_11_12 (owner, Nov 12, 2026):
         business bookings — business is set when the guest enters
         from Business Services (data-business) or picks Business /
         Other; ein is the scheduling gate, shown on the ticket. */
      business: false, ein: '' };

    /* REPAIR_FLOW_UPDATE_2026_11_05: persistent summary panel + step-2 gating.
       The summary is clean text rows only — NO device picture. Austin ruled
       Nov 5, 2026 (~1:51 PM): "leave the pics out, just keep the standard
       flow." The category-photo map from the earlier draft was removed
       entirely; nothing renders an image from flow selections. */
    function rfVal(id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
    function rfSet(id, txt) { var el = document.getElementById(id); if (el) el.textContent = txt; }
    /* COMPUTER_YEAR_2026_11_10: the model as the guest and the
       ticket see it — with the picked year riding on it, e.g.
       "MacBook Air (2021)". repairState.model itself stays the
       plain model name (the learning stats key off it). */
    function rfModelWithYear() {
      if (!repairState.model) return '';
      return repairState.year ? repairState.model + ' (' + repairState.year + ')' : repairState.model;
    }
    function rfRenderSummary() {
      rfSet('rf-sum-device', repairState.device || 'Not picked yet');
      rfSet('rf-sum-brand', repairState.brand || '\u2014');
      rfSet('rf-sum-model', repairState.model ? rfModelWithYear() : (repairState.modelState === 'notlisted' ? ('Not listed' + (repairState.year ? ' (' + repairState.year + ')' : '')) : (repairState.modelState === 'na' ? 'Not applicable' : '\u2014')));
      var repairs = repairState.issues.length ? repairState.issues.map(function (i) { return i.name; }).join(', ') : (repairState.issue || '\u2014');
      if (repairState.mode === 'oneonone') {
        /* SUPPORT_BOOKING_2026_11_06: the same two summary rows carry the
           one-on-one instead — kind on the Service row, booked time on
           the Time row, fee kept out of both (it is its own line at the
           summary step and the pay step). */
        rfSet('rf-sum-repair-label', 'Service');
        rfSet('rf-sum-repair', repairState.serviceKind || '\u2014');
        rfSet('rf-sum-estimate-label', 'Time');
        rfSet('rf-sum-estimate', repairState.ooHours ? (repairState.ooHours + (repairState.ooHours === 1 ? ' hour' : ' hours') + ' one-on-one \u2014 $' + (repairState.ooHours * 25)) : '\u2014');
      } else {
        /* SERVICES_FLOW_V58_2026_11_09: one word — the summary row
           reads "Service" in repair mode too, as it already did in
           One-on-One mode. The flow is a service from entry to summary. */
        rfSet('rf-sum-repair-label', 'Service');
        rfSet('rf-sum-repair', repairs);
        rfSet('rf-sum-estimate-label', 'Estimate');
      }
      /* REPAIR_WIZARD_ESTIMATE_FIX_2026_11_06: with more than one
         repair picked, the summary shows the COMBINED estimate (the
         summed priceRange rfToggleIssue maintains) instead of
         "Starting at" a single repair's figure. One repair keeps the
         exact wording it always had. */
      if (repairState.mode !== 'oneonone') rfSet('rf-sum-estimate', repairState.issues.length ? (repairState.priceExact !== null && repairState.priceExact !== undefined ? (repairState.issues.length > 1 ? repairState.priceRange : 'Starting at ' + repairState.priceRange) : (repairState.issues.length > 1 && repairState.priceRange && (repairState.priceRange.charAt(0) === '$' || repairState.priceRange.indexOf('From ') === 0) ? repairState.priceRange : 'Confirmed up front')) : '\u2014');
      rfSet('rf-sum-atrone', repairState.atrOne ? ('Covered by ATR One: ' + repairState.atrOne) : 'Not answered yet');
      /* SERVICES_TWO_PAGES_2026_11_12: the business EIN rides the
         summary when this is a business booking; the row stays
         hidden for guest bookings. */
      var einRow = document.getElementById('rf-sum-ein-row');
      if (einRow) einRow.hidden = !repairState.business;
      rfSet('rf-sum-ein', repairState.ein || '\u2014');
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
      /* SUPPORT_BOOKING_2026_11_06: One-on-One mode gates on the service
         kind + booked hours instead of repair tiles. */
      /* COMPUTER_YEAR_2026_11_10: a computer in repair mode needs
         its year pick before Continue ('Not sure' counts). */
      var yearOk = repairState.mode === 'oneonone' || repairState.device !== 'Computer' || !!repairState.year;
      /* SERVICES_TWO_PAGES_2026_11_12: a business booking cannot
         continue without its EIN — the scheduling gate, repair and
         one-on-one alike. */
      var einOk = !repairState.business || !!repairState.ein;
      var ready = repairState.mode === 'oneonone'
        ? !!(repairState.device && repairState.brand && modelOk && repairState.serviceKind && repairState.ooHours && repairState.atrOne && repairState.ooPlace && einOk)
        : !!(repairState.device && repairState.brand && modelOk && yearOk && repairState.issues.length && repairState.atrOne && einOk);
      cont.disabled = !ready;
    }
    function rfShowFlowExtras() {
      var d = document.getElementById('bk-describe-wrap'); if (d) d.hidden = false;
      var a = document.getElementById('bk-atrone-wrap'); if (a) a.hidden = false;
    }
    /* SERVICES_TWO_PAGES_2026_11_12 (owner, Nov 12, 2026): flip a
       booking into business mode — the EIN field appears on step 2
       and the Continue gate requires it. Sticky for the session:
       a Business Services entry stays business even if the guest
       changes device; leaving business mode clears the EIN. */
    function rfSetBusiness(on) {
      repairState.business = !!on;
      if (!on) {
        repairState.ein = '';
        var e = document.getElementById('bk-ein');
        if (e) e.value = '';
      }
      var w = document.getElementById('bk-ein-wrap');
      if (w) w.hidden = !repairState.business;
      try { sessionStorage.setItem('atr-business', repairState.business ? '1' : ''); } catch (err) {}
      rfRenderSummary(); rfGate();
    }
    window.atrSetBusiness = rfSetBusiness;
    var DEFAULT_ESTIMATE_NOTE = '';

    /* SITE_FORM_BACKNAV_2026_10_30: step-navigation state. currentRepairStep
       is the step on screen; furthestRepairStep is the furthest step the
       customer has legitimately reached through the flow's own forward
       path. The progress steps at the top can be tapped to revisit any
       step up to furthestRepairStep, but never to skip ahead into a step
       that has not been reached yet. */
    var currentRepairStep = 1;
    var furthestRepairStep = 1;
    /* SERVICES_FLOW_V58_2026_11_09 held a carried-in device pick on
       step 1 (rfSuppressAdvance). SUPERSEDED by
       PRESET_ADVANCE_2026_11_10 (owner, Nov 10, 2026): a device
       carried in from a detail page's Start a Service button now
       advances to step 2 on its own — the guest already picked the
       device once and must not have to tap it again. The suppress
       flag is gone; the tile click always advances. */

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
      /* COMPUTER_MAKES_2026_11_10 (owner, Nov 10, 2026): the Computer
         make list is Apple, Microsoft, HP, Dell, Lenovo, Chromebook,
         Other — "Windows PC" and "Custom PC" are gone from the make
         list (Microsoft is the Windows PC maker; two names for one
         thing confused guests). Same seven as the price book. */
      'Computer': {
        brands: ['Apple', 'Microsoft', 'HP', 'Dell', 'Lenovo', 'Chromebook', 'Other'],
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
          { name: 'Setup / install / cabling', price: 'Custom quote' },
          { name: 'Websites for Business', price: 'Custom quote' }
        ]
      },
      /* SERVICES_FLOW_V58_2026_11_09: two device types the wizard was
         missing. Their setup work (printer setup, router & mesh setup,
         Wi-Fi help) is one-on-one service work — it lives in the
         device-filtered topic list (data-devices in index.html, TOPICS
         in the Services flow), priced pure at $25/hr with the $15
         visit fee as its own line, exactly like every other topic.
         These fallback lists carry only the custom-quote work and the
         truthful type lists — no part prices exist for these devices
         and none are invented. */
      'Printers & Peripherals': {
        brands: ['HP', 'Canon', 'Epson', 'Brother', 'Other'],
        issues: [
          { name: 'Printer repair', price: 'Custom quote' }
        ]
      },
      'Networking': {
        brands: ['Router', 'Mesh Wi-Fi', 'Wi-Fi extender / access point', 'Other'],
        issues: [
          { name: 'Internet cabling', price: 'Custom quote' }
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
          /* SERVICES_TWO_PAGES_2026_11_12: picking Business / Other
             is a business booking — the EIN gate comes on. Any other
             device leaves the business flag where the entry point
             put it (a Business Services entry stays business). */
          if (repairState.device === 'Business / Other') rfSetBusiness(true);
          repairState.brand = '';
          repairState.model = '';
          repairState.year = '';
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
          /* BOOKING_OO_TILE_2026_11_09: the device just changed while
             One-on-One mode is on — re-filter the topics for the new
             device (a pick the new device cannot have is dropped),
             then re-render the summary and the gate. */
          if (repairState.mode === 'oneonone') { ooFilterTopics(); rfRenderSummary(); rfGate(); }
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
          /* SUPPORT_BOOKING_2026_11_06: One-on-One mode renders its own
             summary block at step 3 — no estimate in this mode. */
          if (repairState.mode === 'oneonone') { if (window.atrOoRender) window.atrOoRender(); }
          else rfUpdateEstimate();
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
          if (r.checked) { repairState.atrOne = r.value; rfRenderSummary(); rfGate(); refreshDispatchAck(); }
        });
      });
      /* SERVICES_TWO_PAGES_2026_11_12: the business EIN field — the
         typed EIN is the gate; the summary and Continue follow it. */
      var bkEin = document.getElementById('bk-ein');
      if (bkEin) {
        bkEin.addEventListener('input', function () {
          repairState.ein = bkEin.value.trim();
          rfRenderSummary(); rfGate();
        });
      }
      var srAtrOneSel = document.getElementById('sr-atr-one');
      if (srAtrOneSel) {
        srAtrOneSel.addEventListener('change', function () {
          repairState.atrOne = srAtrOneSel.value || repairState.atrOne;
          rfRenderSummary();
          refreshDispatchAck();
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

      /* CHECKIN_DROPDOWNS_2026_11_05: fallback brands use the same single dropdown.
         MAKE_NOT_BRAND_2026_11_10 (owner, Nov 10, 2026): guest-facing flow labels say Make, not Brand. */
      if (brandSel) {
        bkFillSelect(brandSel,
          data.brands.map(function (brand) { return [brand, brand]; }),
          'Choose your make\u2026');
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
          iBtn.innerHTML = bkIconHtmlForName(issue.name) + '<strong>' + escapeHtml(issue.name) + '</strong><span style="font-size:0.78rem; color: var(--brand-deep); font-weight:800;">' + escapeHtml(issue.price) + '</span>';
          /* REPAIR_FLOW_UPDATE_2026_11_05: fallback issues are multi-select too; the step-2
             Continue button (gated on brand + issue + ATR One) advances. */
          iBtn.addEventListener('click', function () {
            rfToggleIssue(issue.name, null, iBtn, issue.price);
          });
          grid.appendChild(iBtn);
        });
        /* SERVICES_SINGLE_DOOR_2026_11_09 (icon amendment): the
           fallback grid carries the same catch-all — an unpriced
           "Something else" pick, so every device path offers it. */
        var seBtn = document.createElement('button');
        seBtn.type = 'button';
        seBtn.className = 'option-btn';
        seBtn.setAttribute('data-bk-something-else', '1');
        seBtn.style.alignItems = 'flex-start';
        seBtn.style.textAlign = 'left';
        seBtn.innerHTML = bkIconHtml('Something else') + '<strong>Something else</strong><span style="font-size:0.78rem; color: var(--brand-deep); font-weight:800;">Price confirmed up front</span>';
        seBtn.addEventListener('click', function () {
          rfToggleIssue('Something else', null, seBtn, null);
        });
        grid.appendChild(seBtn);
        /* BOOKING_OO_TILE_2026_11_09: the fallback grid (Business /
           Other) ends with the same One-on-One tile, so this path
           offers the mode inside its grid too. */
        var ooBtn = document.createElement('button');
        ooBtn.type = 'button';
        ooBtn.className = 'option-btn';
        ooBtn.setAttribute('data-oo-tile', '1');
        ooBtn.style.alignItems = 'flex-start';
        ooBtn.style.textAlign = 'left';
        ooBtn.innerHTML = '<i class="fas fa-graduation-cap"></i><strong>One-on-One</strong><span style="font-size:0.78rem; color: var(--brand-deep); font-weight:800;">Lessons &amp; help on this device \u2014 $25 an hour</span>';
        ooBtn.addEventListener('click', function () { setOneOnOneMode(true); });
        grid.appendChild(ooBtn);
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
    /* SERVICES_SINGLE_DOOR_2026_11_09 (icon amendment, owner, Nov 9,
       2026): every repair tile carries a little icon above its label,
       matching the One-on-One topic tiles — icon first, sized and
       colored by the shared .option-btn i rules (brand blue). Every
       glyph verified present in the Font Awesome 6.4.0 build the
       site loads. Speaker / Mic pairs the speaker with a microphone,
       as the owner asked; Board / Solder is the microchip (there is
       no soldering-iron glyph in the free set). A '|' in a value
       renders two glyphs side by side. */
    var BK_TILE_ICONS = {
      'Screen': 'fas fa-display',
      'Back glass': 'fas fa-mobile-screen-button',
      'Battery': 'fas fa-battery-full',
      'Charging port': 'fas fa-plug',
      'Charging': 'fas fa-plug',
      'Camera': 'fas fa-camera',
      'Speaker / Mic': 'fas fa-volume-high|fas fa-microphone',
      'Board / Solder': 'fas fa-microchip',
      'HDMI port': 'fas fa-plug-circle-bolt',
      'Disc drive': 'fas fa-compact-disc',
      'Fan / Overheat': 'fas fa-fan',
      'Controller repair': 'fas fa-gamepad',
      'Storage upgrade': 'fas fa-hard-drive',
      'RAM upgrade': 'fas fa-memory',
      'Keyboard / Trackpad': 'fas fa-keyboard',
      'Keyboard': 'fas fa-keyboard',
      'Virus / Software cleanup': 'fas fa-bug',
      'Band / Button': 'fas fa-clock',
      'Something else': 'fas fa-circle-question'
    };
    function bkIconHtml(rawName) {
      var spec = BK_TILE_ICONS[rawName] || 'fas fa-wrench';
      return spec.split('|').map(function (cls) { return '<i class="' + cls + '"></i>'; }).join(' ');
    }
    /* Fallback issue lists carry friendly full names, not book keys —
       resolve those to the same icons. */
    function bkIconHtmlForName(friendlyName) {
      var n = String(friendlyName || '');
      for (var k in BK_TILE_ICONS) { if ((BK_FRIENDLY[k] || k) === n) return bkIconHtml(k); }
      if (/screen|display|digitizer/i.test(n)) return bkIconHtml('Screen');
      if (/battery/i.test(n)) return bkIconHtml('Battery');
      if (/charg|power|dc jack/i.test(n)) return bkIconHtml('Charging port');
      if (/camera|speaker|mic/i.test(n)) return bkIconHtml('Speaker / Mic');
      if (/virus|software|cleanup|diagnostic/i.test(n)) return bkIconHtml('Virus / Software cleanup');
      if (/hdmi/i.test(n)) return bkIconHtml('HDMI port');
      if (/overheat|fan/i.test(n)) return bkIconHtml('Fan / Overheat');
      if (/disc|storage|ssd/i.test(n)) return bkIconHtml('Storage upgrade');
      if (/website/i.test(n)) return '<i class="fas fa-globe"></i>';
      if (/printer/i.test(n)) return '<i class="fas fa-print"></i>';
      if (/cabling|cable/i.test(n)) return '<i class="fas fa-plug"></i>';
      if (/water/i.test(n)) return '<i class="fas fa-droplet"></i>';
      return bkIconHtml('');
    }
    function bkTile(label, sub, iconHtml) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'option-btn';
      b.style.padding = '0.85rem 0.5rem';
      if (sub) {
        b.style.alignItems = 'flex-start';
        b.style.textAlign = 'left';
        b.innerHTML = (iconHtml || '') + '<strong>' + escapeHtml(label) + '</strong><span style="font-size:0.78rem; color: var(--brand-deep); font-weight:800;">' + escapeHtml(sub) + '</span>';
      } else {
        b.innerHTML = (iconHtml || '') + '<span>' + escapeHtml(label) + '</span>';
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
    /* COMPUTER_YEAR_2026_11_10 (owner, Nov 10, 2026): the year
       list for computers — current and older machines, newest
       first, 'Not sure' last so nobody is trapped. The year never
       changes a price; it pins down the machine (parts are listed
       by year). The Services panes carry the same list. */
    var BK_YEARS = ['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016', '2015', 'Not sure'];
    function bkShowYearStep() {
      var yearWrap = document.getElementById('bk-year-wrap');
      var repairWrap = document.getElementById('bk-repair-wrap');
      if (repairWrap) repairWrap.hidden = true;
      if (yearWrap) { yearWrap.hidden = false; try { yearWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {} }
    }
    function populateBookingPicker(device) {
      var DATA = bkData();
      var typeKey = bkTypeKey(device);
      var brandSel = document.getElementById('bk-brand-select');
      var issueList = document.getElementById('issue-list');
      var modelWrap = document.getElementById('bk-model-wrap');
      var repairWrap = document.getElementById('bk-repair-wrap');
      var yearWrap = document.getElementById('bk-year-wrap');
      if (issueList) issueList.innerHTML = '';
      if (modelWrap) modelWrap.hidden = true;
      if (repairWrap) repairWrap.hidden = true;
      if (yearWrap) yearWrap.hidden = true;
      /* COMPUTER_YEAR_2026_11_10: the year select is filled and
         wired here, once per device pick like the rest of step 2.
         A year pick sets the state and renders the service tiles
         (renderBkRepairs scrolls them into view itself). */
      var yearSel = document.getElementById('bk-year-select');
      if (yearSel) {
        bkFillSelect(yearSel,
          BK_YEARS.map(function (y) { return [y, y]; }),
          'Choose the year\u2026');
        yearSel.onchange = function () {
          if (!yearSel.value) return;
          repairState.year = yearSel.value;
          rfRenderSummary(); rfGate();
          var mSel = document.getElementById('bk-model-select');
          renderBkRepairs(typeKey, brandSel.value, mSel ? mSel.value : '');
        };
      }
      if (!brandSel) { populateBrandsAndIssues(device); return; }
      bkFillSelect(brandSel,
        Object.keys(DATA[typeKey]).map(function (k) { return [k, k]; }).concat([['__other__', 'Other make']]),
        'Choose your make\u2026');
      brandSel.onchange = function () {
        if (!brandSel.value) return;
        var brandKey = brandSel.value;
        repairState.brand = brandKey === '__other__' ? 'Other' : brandKey;
        repairState.model = '';
        repairState.year = '';
        var ywReset = document.getElementById('bk-year-wrap');
        if (ywReset) ywReset.hidden = true;
        repairState.issue = '';
        repairState.issues = [];
        repairState.modelState = 'pending';
        repairState.priceExact = null;
        rfRenderSummary(); rfGate();
        /* BOOKING_OO_TILE_2026_11_09: brand changed while One-on-One
           mode is on — the model pick was just cleared above, so the
           Learn label falls back to the device word. */
        if (repairState.mode === 'oneonone') ooFilterTopics();
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
        repairState.year = '';
        var ySelReset = document.getElementById('bk-year-select');
        if (ySelReset) ySelReset.value = '';
        rfRenderSummary(); rfGate();
        /* BOOKING_OO_TILE_2026_11_09: model changed while One-on-One
           mode is on — the Learn topic takes the new model's name. */
        if (repairState.mode === 'oneonone') ooFilterTopics();
        /* COMPUTER_YEAR_2026_11_10: a computer in repair mode goes
           to the year step next — the service tiles wait for the
           year pick. Every other path renders its tiles as before;
           One-on-One has no year step (lessons order no parts). */
        if (repairState.mode !== 'oneonone' && typeKey === 'Computer') bkShowYearStep();
        else renderBkRepairs(typeKey, brandKey, modelKey);
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
        /* LEARNING_SYSTEM_2026_11_09: with >= 3 real completed jobs
           behind this model, its tiles order by how often each repair
           was actually booked for it; below that (or with no stats)
           the book order stands. The One-on-One tile is appended
           after this array renders, so it stays last regardless. */
        if (window.atrLearn) repairs = window.atrLearn.orderNames(typeKey, brandKey, modelKey, repairs, function (r) { return BK_FRIENDLY[r] || r; });
        priceOf = function (r) { return DATA[typeKey][brandKey][modelKey][r]; };
      } else {
        repairs = bkGenericRepairs(typeKey);
        priceOf = function () { return null; };
      }
      repairs.forEach(function (r) {
        var price = priceOf(r);
        /* V127_2026_11_12 (owner, Nov 12, 2026): iPad service prices read as estimates — the tile shows "Starting at $X" for Apple tablets (iPads). Every other device keeps the bare price, as before. */
        var isIpad = (typeKey === 'Tablet' && brandKey === 'Apple');
        var b = bkTile(BK_FRIENDLY[r] || r, (typeof price === 'number') ? (isIpad ? 'Starting at ' + bkFmt(price) : bkFmt(price)) : 'Price confirmed up front', bkIconHtml(r));
        /* REPAIR_FLOW_UPDATE_2026_11_05: repairs are multi-select — tapping toggles, nothing
           auto-advances; Continue is gated below the ATR One question. */
        b.addEventListener('click', function () {
          rfToggleIssue(BK_FRIENDLY[r] || r, (typeof price === 'number') ? price : null, b, null);
        });
        repairGrid.appendChild(b);
      });
      /* SERVICES_SINGLE_DOOR_2026_11_09 (icon amendment, owner, Nov 9,
         2026): "Something else" — the catch-all repair tile, so the
         standard grid reads eight buttons like the lesson grid. It
         is an unpriced pick exactly like Board / Solder ("Price
         confirmed up front"), toggles through rfToggleIssue like any
         other pick, and always renders, for every device and model,
         right before the One-on-One tile (which stays last). */
      var seTile = bkTile('Something else', 'Price confirmed up front', bkIconHtml('Something else'));
      seTile.setAttribute('data-bk-something-else', '1');
      seTile.addEventListener('click', function () {
        rfToggleIssue('Something else', null, seTile, null);
      });
      repairGrid.appendChild(seTile);
      /* BOOKING_OO_TILE_2026_11_09 (Austin, Nov 9, 2026): One-on-One is
         the LAST tile in this grid — same tile family as the repairs
         (strong label, brand-deep subline, like Board / Solder), not a
         separate box under the grid. Tapping it flips step 2 into
         One-on-One mode. It renders with every brand/model grid. */
      var ooTile = document.createElement('button');
      ooTile.type = 'button';
      ooTile.className = 'option-btn';
      ooTile.setAttribute('data-oo-tile', '1');
      ooTile.style.padding = '0.85rem 0.5rem';
      ooTile.style.alignItems = 'flex-start';
      ooTile.style.textAlign = 'left';
      ooTile.innerHTML = '<i class="fas fa-graduation-cap"></i><strong>One-on-One</strong><span style="font-size:0.78rem; color: var(--brand-deep); font-weight:800;">Lessons &amp; help on this device \u2014 $25 an hour</span>';
      ooTile.addEventListener('click', function () { setOneOnOneMode(true); });
      repairGrid.appendChild(ooTile);
      rfShowFlowExtras();
      if (repairWrap) { repairWrap.hidden = false; try { repairWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {} }
    }
    /* SERVICES_SINGLE_DOOR_2026_11_09: the Services flow at the top
       of #whatwedo reads the SAME bookkeeping this wizard uses — the
       shared price book (window.ATR_PRICE_DATA via bkData), the
       friendly-name map, the book order, the type-key map, the price
       formatter, the tile icons, and the fallback device data. One
       store, no fork. */
    window.atrBkShared = {
      friendly: BK_FRIENDLY,
      order: BK_REPAIR_ORDER,
      typeKey: bkTypeKey,
      fmt: bkFmt,
      data: bkData,
      fallback: deviceData,
      iconHtml: bkIconHtml,
      iconForName: bkIconHtmlForName
    };
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
      var modelLabel = rfModelWithYear() || ((repairState.brand && repairState.brand !== 'Other') ? repairState.brand : repairState.device);
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
      /* LEARNING_SYSTEM_2026_11_09: exactly one repair picked, with
         >= 5 priced real jobs behind this model + repair — add the
         factual line from those jobs under the estimate. It informs
         only; the book estimate above is unchanged. */
      if (note && repairState.issues.length === 1 && window.atrLearn) {
        var lsSentence = window.atrLearn.sentence(bkTypeKey(repairState.device), repairState.brand, repairState.model, repairState.issues[0].name);
        if (lsSentence) note.innerHTML += ' ' + escapeHtml(lsSentence);
      }
      var summary = document.getElementById('estimate-summary');
      if (summary) {
        summary.innerHTML =
          '<span class="pill"><i class="fas fa-mobile-screen"></i> ' + escapeHtml(repairState.device) + '</span>' +
          '<span class="pill"><i class="fas fa-tag"></i> ' + escapeHtml(repairState.model ? (repairState.brand + ' ' + rfModelWithYear()) : (repairState.brand || 'Any make')) + '</span>' +
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
      'Board / Solder': 'Other / not sure',
      /* SERVICES_SINGLE_DOOR_2026_11_09: the catch-all tile maps to
         the same intake bucket as Board / Solder. */
      'Something else': 'Other / not sure'
    };
    function prefillIntakeFromGuided() {
      window.atrGuidedSelection = {
        device: repairState.device || '',
        brand: repairState.brand || '',
        model: repairState.model || '',
        year: repairState.year || '',
        issue: repairState.issue || '',
        issues: repairState.issues.map(function (i) { return i.name; }),
        atrOne: repairState.atrOne || '',
        describe: repairState.describe || '',
        priceRange: repairState.priceRange || '',
        price: (typeof repairState.priceExact === 'number') ? repairState.priceExact : null,
        /* SUPPORT_BOOKING_2026_11_06: the One-on-One contract the intake
           submit (atr-forms.js) branches on — mode, service kind, booked
           hours, and the pure time price. */
        mode: repairState.mode || 'repair',
        serviceKind: repairState.serviceKind || '',
        /* VIRTUAL_ONE_ON_ONE_2026_11_10: the How will we meet? pick,
           read by atr-forms.js for the ticket text, the fee gates,
           and the pay step. */
        ooPlace: repairState.ooPlace || '',
        ooHours: repairState.ooHours || 0,
        ooTime: (repairState.ooHours || 0) * 25,
        /* SERVICES_TWO_PAGES_2026_11_12: the business flag and EIN
           ride the same contract — atr-forms.js files the EIN on
           the ticket's issue text (no ein column exists, none is
           invented, mirroring the ATR One pattern). */
        business: !!repairState.business,
        ein: repairState.ein || ''
      };
      var g = window.atrGuidedSelection;
      var typeSel = document.getElementById('sr-device-type');
      if (typeSel && !typeSel.value && g.device) typeSel.value = g.device;
      var info = document.getElementById('sr-device-info');
      /* COMPUTER_YEAR_2026_11_10: the model text is what travels
         into the ticket (atr-forms.js files it as the ticket's
         model), so the picked year rides on it — "MacBook Air
         (2021)". With no model named, it rides on the brand. */
      if (info && !info.value && (g.model || g.brand)) info.value = g.model ? (g.year ? g.model + ' (' + g.year + ')' : g.model) : (g.year ? g.brand + ' (' + g.year + ')' : g.brand);
      var needSel = document.getElementById('sr-repair-needed');
      if (needSel && !needSel.value && g.mode !== 'oneonone' && REPAIR_NEEDED_MAP[g.issue]) needSel.value = REPAIR_NEEDED_MAP[g.issue];
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
      if (recap && g.mode === 'oneonone' && g.serviceKind) {
        recap.hidden = false;
        recap.innerHTML =
          '<span class="pill"><i class="fas fa-mobile-screen"></i> ' + escapeHtml(g.device) + '</span>' +
          '<span class="pill"><i class="fas fa-tag"></i> ' + escapeHtml(g.model ? (g.brand + ' ' + g.model) : (g.brand || 'Any make')) + '</span>' +
          '<span class="pill"><i class="fas fa-graduation-cap"></i> ' + escapeHtml(g.serviceKind) + '</span>' +
          '<span class="pill"><i class="fas fa-clock"></i> ' + g.ooHours + (g.ooHours === 1 ? ' hour' : ' hours') + ' one-on-one \u2014 $' + g.ooTime + '</span>' +
          (g.atrOne ? '<span class="pill"><i class="fas fa-shield-halved"></i> ATR One: ' + escapeHtml(g.atrOne) + '</span>' : '');
      } else if (recap && g.issue) {
        recap.hidden = false;
        recap.innerHTML =
          '<span class="pill"><i class="fas fa-mobile-screen"></i> ' + escapeHtml(g.device) + '</span>' +
          '<span class="pill"><i class="fas fa-tag"></i> ' + escapeHtml(g.model ? (g.brand + ' ' + g.model) : (g.brand || 'Any make')) + '</span>' +
          '<span class="pill"><i class="fas fa-wrench"></i> ' + escapeHtml(g.issue) + '</span>' +
          /* REPAIR_WIZARD_ESTIMATE_FIX_2026_11_06: the recap pill said
             "Flat $X" for priced picks — an estimate is never flat.
             It reads "Est." for every case now. */
          '<span class="pill"><i class="fas fa-dollar-sign"></i> ' + 'Est. ' + escapeHtml(g.priceRange) + '</span>' +
          (g.atrOne ? '<span class="pill"><i class="fas fa-shield-halved"></i> ATR One: ' + escapeHtml(g.atrOne) + '</span>' : '');
      }
    }

    /* VIRTUAL_ONE_ON_ONE_2026_11_10: step 4 (the intake form) follows
       the How will we meet? pick. A virtual booking keeps EVERY field
       an in-person booking has — full contact and the service address
       included, because the address feeds the guest record and a
       session can switch to in person halfway (owner, Nov 10, 2026).
       The date/time pick is labeled as what it is for a virtual
       session — the session's day and start window, not a trip.
       THREE_FORMS_2026_11_11 (Austin, Nov 11, 2026): the fee
       acknowledgment no longer steps aside for virtual — each of the
       three forms carries its own. Virtual has no trip and no
       scheduling urgency: its box says the virtual one-on-one is
       $25, due at the time of the connect. In-person one-on-one
       carries the $15 visit fee + $25 collected upon arrival, and
       Repair keeps the original $15/$35 wording. */
    function applyVirtualFormEffects() {
      var g = window.atrGuidedSelection || {};
      var virtual = g.mode === 'oneonone' && g.ooPlace === 'virtual';
      var disp = document.querySelector('input[name="dispatch_acknowledged"]');
      var dispRow = disp ? disp.closest('label.atr-check') : null;
      if (dispRow) dispRow.hidden = false;
      var dispSpan = dispRow ? dispRow.querySelector('span') : null;
      if (dispSpan) {
        if (srDispatchOrigHtml === null) srDispatchOrigHtml = dispSpan.innerHTML;
        dispSpan.innerHTML = srDispatchAckHtml(virtual, g.mode);
      }
      var dateLbl = document.querySelector('label[for="sr-visit-date"]');
      if (dateLbl) dateLbl.innerHTML = virtual ? 'Session date' : 'Preferred visit date';
      var winLbl = document.querySelector('label[for="sr-arrival-window"]');
      if (winLbl) winLbl.innerHTML = virtual
        ? 'Session start time <span class="atr-optional">(we start your session inside this 2-hour window)</span>'
        : 'Arrival window <span class="atr-optional">(we arrive within this 2-hour window)</span>';
    }
    window.atrApplyVirtualFormEffects = applyVirtualFormEffects;

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
      /* BOOKING_OO_ESCAPE_2026_11_09 (Austin, Nov 9, 2026): arriving
         at step 1 leaves One-on-One mode. Every route back to the
         device step funnels through this function — step 2's Back
         button (data-back="1") and the progress-step taps both end
         up here — so the reset lives in this one place and no route
         can strand the customer in the lesson menu: Back out of
         One-on-One, change the device, come forward, and the repair
         tiles are showing again. Entry points are unaffected: they
         set pendingOneOnOne, which is only applied at step 2 below
         and is never cleared here. */
      if (stepNum === 1 && repairState.mode === 'oneonone') setOneOnOneMode(false);
      /* SUPPORT_BOOKING_2026_11_06: an entry point (Schedule a
         one-on-one, classes page, account) asked for One-on-One mode —
         it applies here, at the brand/model/service step, because the
         device is always picked first. */
      if (stepNum === 2 && pendingOneOnOne) { pendingOneOnOne = false; setOneOnOneMode(true); }
      if (stepNum === 4) { prefillIntakeFromGuided(); applyVirtualFormEffects(); }
    }

    function escapeHtml(str) {
      return String(str).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    /* ================= SUPPORT_BOOKING_2026_11_06 =================
       One-on-One mode (design pivot, Austin, Nov 6, 2026): the
       one-on-one is a MODE inside this same Schedule a repair form,
       not its own page — "we're using the same form, we're just adding
       features." Device, brand, and model are picked first; at the
       service step the One-on-One button swaps the repair tiles for
       eight service bubbles and two even hour buttons (1 hour $25 /
       2 hours $50, priced pure). The $15 visit fee stays its own
       separate line in the summary and the pay step. The step heading
       "What service does it need?" is universal — it never flips. */
    var pendingOneOnOne = false;
    function ooRender() {
      var h = repairState.ooHours || 0;
      var time = h * 25;
      var priceEl = document.getElementById('oo-price');
      if (priceEl) priceEl.textContent = h ? ('$' + time) : 'Pick a time';
      /* VIRTUAL_ONE_ON_ONE_2026_11_10: the summary note follows the
         pick too — a virtual session has no visit fee to mention
         (owner ruling, Nov 10, 2026). */
      var note = document.getElementById('rf-summary-note');
      if (note && repairState.mode === 'oneonone') {
        note.textContent = repairState.ooPlace === 'virtual'
          ? 'One-on-one help is $25 an hour. Virtual sessions have no visit fee \u2014 the first hour is paid when you book, and ATR One members pay nothing with their member key.'
          : 'One-on-one help is $25 an hour, plus the $15 visit fee. ATR One Plus (paid) members pay no visit fee on covered devices.';
      }
      var lines = document.getElementById('oo-lines');
      if (lines) {
        if (repairState.ooPlace === 'virtual') {
          /* VIRTUAL_ONE_ON_ONE_2026_11_10 (owner ruling, Nov 10,
             2026): virtual skips the $15 visit fee — the total is
             the time alone, the first hour paid at booking. */
          lines.innerHTML =
            (repairState.serviceKind ? (escapeHtml(repairState.serviceKind) + ' for your ' + escapeHtml([repairState.brand, repairState.model].filter(Boolean).join(' ') || repairState.device || 'device') + '<br>') : '') +
            'Virtual \u2014 we meet on your screen, no trip<br>' +
            'One-on-one time $25 per hour' + (h ? (' \u2014 ' + h + (h === 1 ? ' hour' : ' hours') + ' $' + time) : '') + '<br>' +
            (h ? ('<strong>Total $' + time + ' \u2014 the first hour ($25) is paid when you book</strong><br>') : '') +
            'If your session runs longer, the extra time is charged to your card on file at $25 an hour.<br>' +
            'ATR One members: your member key makes virtual sessions free.';
        } else {
          lines.innerHTML =
            (repairState.serviceKind ? (escapeHtml(repairState.serviceKind) + ' for your ' + escapeHtml([repairState.brand, repairState.model].filter(Boolean).join(' ') || repairState.device || 'device') + '<br>') : '') +
            'One-on-one time $25 per hour' + (h ? (' \u2014 ' + h + (h === 1 ? ' hour' : ' hours') + ' $' + time) : '') + '<br>' +
            'Visit fee $15<br>' +
            (h ? ('<strong>Total $' + (15 + time) + ' \u2014 the $' + time + ' time plus the $15 visit fee</strong><br>') : '') +
            'If your session runs longer, the extra time is settled at the visit at $25 an hour.<br>' +
            'ATR One Plus (paid) members pay no visit fee on covered devices.';
        }
      }
    }
    window.atrOoRender = ooRender;
    /* BOOKING_OO_TILE_2026_11_09 (Austin, Nov 9, 2026): the eight
       One-on-One topics REACT to the device picked at step 1. Each
       topic button in index.html carries data-devices — the step-1
       device values that may see it — so "Computer clean-up" (Computer
       only) can never appear for a phone again. A button with no
       data-devices shows for every device, and with no device picked
       yet nothing is hidden. If the picked topic is hidden for the
       current device, the pick is cleared, so the summary and the
       Continue gate never carry a topic the customer cannot see.
       Runs when the mode is entered (setOneOnOneMode) and again when
       the device, brand, or model changes while the mode is on. */
    function ooFilterTopics() {
      var dev = repairState.device || '';
      document.querySelectorAll('[data-service-kind]').forEach(function (btn) {
        var list = btn.getAttribute('data-devices');
        var show = true;
        if (list && dev) {
          show = list.split(',').map(function (s) { return s.trim(); }).indexOf(dev) >= 0;
        }
        btn.style.display = show ? '' : 'none';
        if (!show && repairState.serviceKind === btn.getAttribute('data-service-kind')) {
          repairState.serviceKind = '';
          btn.classList.remove('selected');
        }
      });
      /* The Learn topic is labeled for THIS device: the picked model
         when there is one ("Learn my iPad Pro", "Learn my iPhone 11
         Pro"), else the device word ("Learn my phone"). Only the
         visible text node changes — the icon stays, and the button's
         data-service-kind keeps its canonical value, so the summary,
         the intake, and the portal records read the same as always. */
      var learnBtn = document.querySelector('[data-service-kind="Learn my phone, computer, or tablet"]');
      if (learnBtn) {
        var word = { Phone: 'phone', Tablet: 'tablet', Computer: 'computer' }[dev] || '';
        var label = repairState.model ? ('Learn my ' + repairState.model)
          : (word ? ('Learn my ' + word) : 'Learn my phone, computer, or tablet');
        for (var nd = learnBtn.lastChild; nd; nd = nd.previousSibling) {
          if (nd.nodeType === 3) { nd.nodeValue = ' ' + label; break; }
        }
      }
    }
    /* FORM_REACTS_TO_SERVICE_2026_11_11: the intake form's original
       visit-fee wording, captured the first time One-on-One mode
       swaps it, so Repair mode restores it word for word.
       THREE_FORMS_2026_11_11 (Austin, Nov 11, 2026): there are three
       forms — Repair, One-on-One in person, One-on-One virtual — and
       each carries its own fee acknowledgment in the owner's words.
       In person: the $15 visit fee, and the $25 one-on-one collected
       upon arrival. Virtual: no trip, no scheduling urgency — the
       $25 is collected when the guest clicks the Connect link (a pay
       wall: pay to connect), and it is non-refundable, because it
       pays for our time and effort even if the issue is not solved. */
    var srDispatchOrigHtml = null;
    var SR_DISPATCH_OO_HTML = 'I understand the <strong>visit fee is $15</strong> and my <strong>one-on-one is $25</strong>, collected upon arrival. *';
    var SR_DISPATCH_VIRTUAL_HTML = 'I understand the <strong>virtual one-on-one is $25</strong>, due at the time of the connect. It is <strong>non-refundable</strong> — it pays for our time and effort, even if the issue is not solved. *';
    /* ATRONE_NO_FEE_2026_11_11 (Austin, Nov 11, 2026, found live on
       his phone): the if-then is his — if the guest answers Yes, this
       device is covered by ATR One, then there is NO visit fee, on a
       repair or on an in-person one-on-one. The fee acknowledgment
       swaps to the no-fee wording the moment the answer is Yes, and
       back the moment it is not. The virtual wording never changes:
       the $25 there is the session itself, not a visit fee, and paid
       members already skip that pay wall at the Connect page. */
    var SR_DISPATCH_OO_MEMBER_HTML = 'I understand my <strong>one-on-one is $25</strong>, collected upon arrival. My device is covered by ATR One, so there is <strong>no visit fee</strong>. *';
    var SR_DISPATCH_REPAIR_MEMBER_HTML = 'I understand my device is <strong>covered by ATR One</strong>, so there is <strong>no visit fee</strong> for this visit. *';
    var SR_DISPATCH_REPAIR_FALLBACK_HTML = 'I understand the <strong>visit fee</strong> &mdash; <strong>$15</strong> if my repair is already known, or <strong>$35</strong> if my device needs a full diagnosis &mdash; covers the trip to me, is due at scheduling, and is <strong>non-refundable</strong>. *';
    function srDispatchAckHtml(virtual, mode) {
      var member = repairState.atrOne === 'Yes';
      if (virtual) return SR_DISPATCH_VIRTUAL_HTML;
      if (mode === 'oneonone') return member ? SR_DISPATCH_OO_MEMBER_HTML : SR_DISPATCH_OO_HTML;
      if (member) return SR_DISPATCH_REPAIR_MEMBER_HTML;
      return srDispatchOrigHtml !== null ? srDispatchOrigHtml : SR_DISPATCH_REPAIR_FALLBACK_HTML;
    }
    function refreshDispatchAck() {
      var disp = document.querySelector('input[name="dispatch_acknowledged"]');
      var row = disp && disp.closest ? disp.closest('label.atr-check') : null;
      var span = row ? row.querySelector('span') : null;
      if (span) {
        var g = window.atrGuidedSelection || {};
        var mode = g.mode || repairState.mode;
        var place = g.ooPlace || repairState.ooPlace;
        span.innerHTML = srDispatchAckHtml(mode === 'oneonone' && place === 'virtual', mode);
      }
      var note = document.getElementById('rf-summary-note');
      if (note && repairState.mode === 'oneonone') {
        note.textContent = repairState.atrOne === 'Yes'
          ? 'One-on-one help is $25 an hour. Your device is covered by ATR One, so there is no visit fee.'
          : 'One-on-one help is $25 an hour, plus the $15 visit fee. ATR One Plus (paid) members pay no visit fee on covered devices.';
      }
    }
    window.atrRefreshDispatchAck = refreshDispatchAck;
    function setOneOnOneMode(on) {
      repairState.mode = on ? 'oneonone' : 'repair';
      /* VIRTUAL_ONE_ON_ONE_2026_11_10: the place pick belongs to the
         mode — leaving the mode clears it, so a later repair booking
         can never inherit a stale Virtual. */
      if (!on && repairState.ooPlace) {
        repairState.ooPlace = '';
        document.querySelectorAll('[data-oo-place]').forEach(function (b) { b.classList.remove('selected'); });
      }
      var card = document.querySelector('.repair-card');
      if (card) card.classList.toggle('oneonone-mode', on);
      var grid = document.getElementById('bk-repair-grid');
      if (grid) grid.style.display = on ? 'none' : '';
      var fallback = document.getElementById('issue-list');
      if (fallback) fallback.style.display = on ? 'none' : '';
      var svc = document.getElementById('bk-service-wrap');
      if (svc) svc.hidden = !on;
      var lbl = document.getElementById('bk-describe-label');
      if (lbl) lbl.textContent = on ? 'What do you want to get done?' : 'Anything else we should know?';
      var ta = document.getElementById('bk-describe');
      if (ta) ta.placeholder = on ? 'Tell us what you want to learn or get done during your visit.' : 'What happened, and what is the device doing (or not doing)?';
      var h3 = document.getElementById('step3-h3');
      if (h3) h3.textContent = on ? 'Your one-on-one' : 'Your instant estimate';
      var pl = document.getElementById('progress-label-3');
      if (pl) pl.textContent = on ? 'Summary' : 'Estimate';
      var note = document.getElementById('rf-summary-note');
      if (note) note.textContent = on
        ? (repairState.atrOne === 'Yes'
          ? 'One-on-one help is $25 an hour. Your device is covered by ATR One, so there is no visit fee.'
          : 'One-on-one help is $25 an hour, plus the $15 visit fee. ATR One Plus (paid) members pay no visit fee on covered devices.')
        : 'Estimates are always free. Your exact price is confirmed once we have checked your device.';
      /* A lesson or setup visit has no repair work to authorize: the
         authorization row and the signature block step aside in this
         mode, and atr-forms skips those gates for the [SERVICE] ticket. */
      var wa = document.getElementById('sr-workauth-row');
      if (wa) wa.hidden = on;
      var sig = document.getElementById('sr-signature-block');
      if (sig) sig.hidden = on;
      /* FORM_REACTS_TO_SERVICE_2026_11_11 (Austin, Nov 11, 2026):
         the intake form reacts to the service type. A one-on-one
         visit is not a repair, so the repair questions step aside —
         Repair needed, Does it power on?, Is it backed up?, Has it
         been repaired before?, the manufacturer-warranty question,
         and the serial number (it only speeds up parts ordering).
         Any answer already typed is cleared, so a repair answer can
         never ride along on a service ticket. The problem box asks
         the one-on-one question instead, and the fee acknowledgment
         carries the in-person one-on-one wording (the $15 visit fee
         and the $25 one-on-one collected upon arrival — never the
         $35 diagnosis fee). The virtual wording is applied at step 4
         by applyVirtualFormEffects. Repair mode restores every field
         and every word exactly as they were. */
      [['sr-repair-needed', '.atr-field'], ['sr-power-on', '.atr-row'],
       ['sr-prior-repair', '.atr-row'], ['sr-serial', '.atr-field']].forEach(function (pair) {
        var f = document.getElementById(pair[0]);
        var wrap = f && f.closest ? f.closest(pair[1]) : null;
        if (wrap) wrap.style.display = on ? 'none' : '';
      });
      if (on) {
        ['sr-repair-needed', 'sr-power-on', 'sr-backed-up', 'sr-prior-repair', 'sr-warranty', 'sr-serial'].forEach(function (id) {
          var f = document.getElementById(id);
          if (f) f.value = '';
        });
      }
      var probLbl = document.querySelector('label[for="sr-problem"]');
      if (probLbl) probLbl.textContent = on ? 'What do you want to get done? *' : 'Describe the problem *';
      var probTa = document.getElementById('sr-problem');
      if (probTa) probTa.placeholder = on
        ? 'Tell us what you want to learn or get done during your visit.'
        : 'What happened, and what is the device doing (or not doing)?';
      var dispInput = document.querySelector('input[name="dispatch_acknowledged"]');
      var dispRow = dispInput && dispInput.closest ? dispInput.closest('label.atr-check') : null;
      var dispSpan = dispRow ? dispRow.querySelector('span') : null;
      if (dispSpan) {
        if (srDispatchOrigHtml === null) srDispatchOrigHtml = dispSpan.innerHTML;
        dispSpan.innerHTML = srDispatchAckHtml(false, on ? 'oneonone' : 'repair');
      }
      /* BOOKING_OO_TILE_2026_11_09: entering the mode filters the
         topic bubbles to the device picked at step 1. */
      if (on) ooFilterTopics();
      ooRender(); rfRenderSummary(); rfGate();
    }
    window.atrSetOneOnOneMode = setOneOnOneMode;
    (function wireOneOnOne() {
      /* BOOKING_OO_TILE_2026_11_09: there is no toggle button to wire
         any more — the One-on-One tile inside the repair grid enters
         the mode and #bk-oo-off below leaves it. Nothing in this block
         may return early: the escape button, the topic buttons, the
         hour buttons, and the data-open-oneonone entry points are all
         wired here. */
      /* BOOKING_OO_ESCAPE_2026_11_09: #bk-oo-off is a full tile at
         the end of the topic grid now (it was a small text link below
         the hours buttons); it is still found by id, so the wiring
         below is unchanged. Landing on step 1 also leaves the mode —
         see the reset in goToRepairStep. */
      var off = document.getElementById('bk-oo-off');
      if (off) off.addEventListener('click', function () { setOneOnOneMode(false); });
      document.querySelectorAll('[data-service-kind]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          repairState.serviceKind = btn.getAttribute('data-service-kind');
          document.querySelectorAll('[data-service-kind]').forEach(function (b) { b.classList.remove('selected'); });
          btn.classList.add('selected');
          ooRender(); rfRenderSummary(); rfGate();
        });
      });
      document.querySelectorAll('[data-oo-hours]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          repairState.ooHours = parseInt(btn.getAttribute('data-oo-hours'), 10) || 0;
          document.querySelectorAll('[data-oo-hours]').forEach(function (b) { b.classList.remove('selected'); });
          btn.classList.add('selected');
          ooRender(); rfRenderSummary(); rfGate();
        });
      });
      /* VIRTUAL_ONE_ON_ONE_2026_11_10: the How will we meet? tiles.
         One pick, changeable any time before Continue; the pick
         re-renders the summary lines (the fee story differs) and
         re-runs the gate. */
      document.querySelectorAll('[data-oo-place]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          repairState.ooPlace = btn.getAttribute('data-oo-place') || '';
          document.querySelectorAll('[data-oo-place]').forEach(function (b) { b.classList.remove('selected'); });
          btn.classList.add('selected');
          ooRender(); rfRenderSummary(); rfGate();
        });
      });
      /* Entry points (Schedule a one-on-one in the account, the classes
         page button, the What We Service tile): they land on this same form;
         the mode applies when the customer reaches the service step,
         because the device is always picked first. */
      document.addEventListener('click', function (e) {
        var t = e.target && e.target.closest ? e.target.closest('[data-open-oneonone]') : null;
        if (!t) return;
        try { sessionStorage.setItem('atr-oneonone', '1'); } catch (err) {}
        pendingOneOnOne = true;
      });
      try {
        if (sessionStorage.getItem('atr-oneonone') === '1') {
          sessionStorage.removeItem('atr-oneonone');
          pendingOneOnOne = true;
        }
      } catch (err) {}
      /* SERVICES_FLOW_V58_2026_11_09 (owner, Nov 9, 2026): entry
         points that name a device — the service detail pages' Start
         a Service buttons carry data-wizard-device — hand their
         device to this same wizard, the way data-open-oneonone hands
         it a mode. The pick runs through the tile's own click, so
         every effect of picking (summary, gating, brand/model
         population) happens exactly once, through the one path.
         PRESET_ADVANCE_2026_11_10 (owner, Nov 10, 2026): the v58
         hold on step 1 is superseded — the click now advances to
         step 2 (make, model & service) on its own, because the
         guest already picked the device on the detail page and
         having to tap it again felt broken. Going back to step 1
         and changing the pick works exactly as before. No forked
         state, no second flow. */
      function rfPresetDevice(device) {
        var btn = document.querySelector('#step-device [data-device="' + device + '"]');
        if (!btn) return;
        btn.click();
      }
      window.atrPresetDevice = rfPresetDevice;
      document.addEventListener('click', function (e) {
        var t = e.target && e.target.closest ? e.target.closest('[data-wizard-device]') : null;
        if (!t) return;
        var device = t.getAttribute('data-wizard-device') || '';
        try { sessionStorage.setItem('atr-wizard-device', device); } catch (err) {}
        rfPresetDevice(device);
      });
      /* SERVICES_TWO_PAGES_2026_11_12 (owner, Nov 12, 2026): the
         search-carry driver, replacing the retired Services flow.
         Drives the booking form directly — device tile, make, model,
         then the repair tile — using the same synchronous select
         chain the old flow's driveFormPicker used (a change event on
         each select fills the next one). A computer needs its year
         before the tiles render, so a search-carried computer lands
         on 'Not sure' — a real pick the guest can change. Any step
         that cannot be matched stops quietly, leaving the guest at
         the furthest step reached instead of a broken pick. */
      window.atrBkOpenRepair = function (sel) {
        if (!sel || !sel.type) return;
        /* The price book keys the watch type 'Smartwatch'; the
           device tiles call it 'Smart Watch' — the old driver
           mapped it the same way. */
        var device = sel.type === 'Smartwatch' ? 'Smart Watch' : sel.type;
        var devBtn = document.querySelector('#step-device [data-device="' + device + '"]');
        if (!devBtn) return;
        devBtn.click();
        var brandSel = document.getElementById('bk-brand-select');
        if (brandSel && sel.brand) {
          var hasBrand = false;
          for (var i = 0; i < brandSel.options.length; i++) { if (brandSel.options[i].value === sel.brand) { hasBrand = true; break; } }
          if (!hasBrand) return;
          brandSel.value = sel.brand;
          brandSel.dispatchEvent(new Event('change', { bubbles: true }));
        } else { return; }
        var modelSel = document.getElementById('bk-model-select');
        if (modelSel && sel.model) {
          var hasModel = false;
          for (var j = 0; j < modelSel.options.length; j++) { if (modelSel.options[j].value === sel.model) { hasModel = true; break; } }
          if (!hasModel) return;
          modelSel.value = sel.model;
          modelSel.dispatchEvent(new Event('change', { bubbles: true }));
        } else { return; }
        var yearWrap = document.getElementById('bk-year-wrap');
        if (yearWrap && !yearWrap.hidden) {
          var ySel = document.getElementById('bk-year-select');
          if (ySel) {
            ySel.value = 'Not sure';
            ySel.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
        if (!sel.repair) return;
        var friendly = BK_FRIENDLY[sel.repair] || sel.repair;
        var tiles = document.querySelectorAll('#bk-repair-grid .option-btn');
        for (var k = 0; k < tiles.length; k++) {
          var strong = tiles[k].querySelector('strong');
          if (strong && strong.textContent === friendly) { tiles[k].click(); break; }
        }
        /* SEARCH_INTO_FLOW_2026_11_11: a search pick is a COMPLETE
           pick — scroll past the answered pickers to the one
           question still open, ATR One coverage. */
        setTimeout(function () {
          var wrap = document.getElementById('bk-atrone-wrap');
          if (wrap && !wrap.hidden) {
            try { wrap.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
          }
        }, 400);
      };
      /* SERVICES_TWO_PAGES_2026_11_12: Business Services entry —
         any [data-business] tap (business card, business bottom
         button) marks the session business before the tap's own
         navigation or device pick runs. */
      document.addEventListener('click', function (e) {
        var t = e.target && e.target.closest ? e.target.closest('[data-business]') : null;
        if (!t) return;
        try { sessionStorage.setItem('atr-business', '1'); } catch (err) {}
        rfSetBusiness(true);
      });
      try {
        var presetDevice = sessionStorage.getItem('atr-wizard-device');
        if (presetDevice) { sessionStorage.removeItem('atr-wizard-device'); rfPresetDevice(presetDevice); }
      } catch (err) {}
      /* SERVICES_TWO_PAGES_2026_11_12: a business entry that crossed
         a detail page (card -> detail page -> Start a Service) still
         lands business — the flag rides sessionStorage. */
      try {
        if (sessionStorage.getItem('atr-business') === '1') rfSetBusiness(true);
      } catch (err) {}
    })();

  });
})();

/* ==================== LEARNING_SYSTEM_2026_11_09 ====================
   The site learns from real completed jobs — and only from them.
   The public.service_stats view (learning-system.sql) aggregates
   finished tickets: per device / brand / model / service, how many
   real jobs listed the service, and the typical final price from
   single-service jobs. This module reads that view once per page
   load and offers two things to the surfaces that render services:
     - orderNames(): with >= 3 real jobs behind a model, its repair
       tiles order by how often each repair was actually booked for
       it (book order breaks ties). Below that, the book order is
       returned untouched.
     - sentence(): with >= 5 priced real jobs behind a model +
       repair, one factual line: "From our last N {model} {service}
       jobs, the typical final price was $X."
   FAIL SILENT BY DESIGN: no stats, a failed fetch, or a missing
   view leave every surface behaving exactly as it did before —
   every public method returns its input unchanged or an empty
   string. This module NEVER changes a price: tile order and one
   factual sentence are all it can do. Book prices change only
   when Austin edits them in the Price Book. */
(function () {
  'use strict';
  var LS_STATS_URL = 'https://lyujxpuicarblpkdzuuc.supabase.co/rest/v1/service_stats?select=device_type,brand,model,service,jobs,priced_jobs,typical_final_price&limit=10000';
  var LS_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5dWp4cHVpY2FyYmxwa2R6dXVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNjAxMjQsImV4cCI6MjEwNzczNjEyNH0.io4qD7pw878Xx97yoS6xzclO33aa4QYKENpwIyZ06xg';
  var LS_ORDER_MIN_JOBS = 3;
  var LS_TYPICAL_MIN_JOBS = 5;
  var lsModels = null;
  function lsNorm(s) { return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim(); }
  function lsModelKey(device, brand, model) { return lsNorm(device) + '|' + lsNorm(brand) + '|' + lsNorm(model); }
  function lsIndex(list) {
    var map = {};
    (list || []).forEach(function (r) {
      if (!r) return;
      var mk = lsModelKey(r.device_type, r.brand, r.model);
      var m = map[mk] || (map[mk] = { total: 0, services: {} });
      var jobs = Number(r.jobs) || 0;
      m.total += jobs;
      m.services[lsNorm(r.service)] = {
        jobs: jobs,
        pricedJobs: Number(r.priced_jobs) || 0,
        typical: (r.typical_final_price == null) ? null : Number(r.typical_final_price)
      };
    });
    lsModels = map;
  }
  function lsModel(device, brand, model) {
    if (!lsModels) return null;
    return lsModels[lsModelKey(device, brand, model)] || null;
  }
  function lsFmt(p) { return '$' + ((p % 1 === 0) ? String(p) : p.toFixed(2)); }
  window.atrLearn = {
    ready: function () { return !!lsModels; },
    modelJobs: function (device, brand, model) {
      var m = lsModel(device, brand, model);
      return m ? m.total : 0;
    },
    count: function (device, brand, model, service) {
      var m = lsModel(device, brand, model);
      var s = m ? m.services[lsNorm(service)] : null;
      return s ? s.jobs : 0;
    },
    orderNames: function (device, brand, model, names, friendlyOf) {
      var m = lsModel(device, brand, model);
      if (!m || m.total < LS_ORDER_MIN_JOBS || !names || names.length < 2) return names;
      var decorated = names.map(function (n, i) {
        var s = m.services[lsNorm(friendlyOf ? friendlyOf(n) : n)];
        return { n: n, i: i, c: s ? s.jobs : 0 };
      });
      decorated.sort(function (a, b) { return (b.c - a.c) || (a.i - b.i); });
      return decorated.map(function (d) { return d.n; });
    },
    typical: function (device, brand, model, service) {
      var m = lsModel(device, brand, model);
      var s = m ? m.services[lsNorm(service)] : null;
      if (!s || s.pricedJobs < LS_TYPICAL_MIN_JOBS || s.typical == null) return null;
      return { jobs: s.pricedJobs, price: s.typical };
    },
    sentence: function (device, brand, model, service) {
      var t = window.atrLearn.typical(device, brand, model, service);
      if (!t) return '';
      return 'From our last ' + t.jobs + ' ' + model + ' ' + service + ' jobs, the typical final price was ' + lsFmt(t.price) + '.';
    }
  };
  try {
    fetch(LS_STATS_URL, { headers: { 'apikey': LS_ANON_KEY, 'Authorization': 'Bearer ' + LS_ANON_KEY } })
      .then(function (r) { if (!r.ok) throw new Error('service_stats'); return r.json(); })
      .then(function (list) { if (Array.isArray(list)) lsIndex(list); })
      .catch(function () { /* fail silent — the site behaves as before */ });
  } catch (e) { /* fail silent */ }
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
        desc: 'Tempered glass screen protection, matched to the tablet you choose — pick the fit family, then the make and model.',
        variants: [
          { label: 'iPad fit', price: 19.99, pts: 1000, sku: 'tab-glass-ipad-109', deviceBrands: ['Apple'] },
          { label: 'Galaxy Tab fit', price: 24.99, pts: 1000, sku: 'tab-glass-galaxy-a9plus', deviceBrands: ['Samsung'] }
        ] },
      { id: 'tab-case-ipad-pro129', name: 'Tablet Case', cat: 'Tablet Cases', block: 'tablet', price: 29.99, pts: 2500, imageId: 'tab-case-ipad-pro129', fit: 'Tablet', defaultVariant: 'iPad folio case',
        desc: 'Cover-style tablet cases that protect the screen in a bag and fold back when you\u2019re using the tablet. Pick the fit family, then the make and model.',
        variants: [
          { label: 'iPad folio case', price: 29.99, pts: 2500, sku: 'tab-case-ipad-pro129', deviceBrands: ['Apple'] },
          { label: 'Galaxy Tab book cover', price: 59.99, pts: 2500, sku: 'tab-case-galaxy-a9plus', deviceBrands: ['Samsung'] }
        ] },
      { id: 'acc-mouse-m510', name: 'Wireless Mouse (Full Size)', cat: 'Computer Accessories', block: 'computer', price: 34.99, pts: 3500, featured: true, imageId: 'acc-mouse-m510', defaultVariant: 'Wireless',
        desc: 'Logitech M510 full-size wireless mouse — the one guests ask for by name. A wired option isn\u2019t a stocked listing yet; ask us and we\u2019ll line one up.',
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
        desc: 'Internal upgrade drives. The stocked listings are Apollo 2.5-inch SATA SSDs; hard-drive and M.2 options are not stocked listings, so ask us before ordering those.',
        variants: [
          { label: 'SSD — 512GB (2.5" SATA)', price: 129.99, pts: 3500, sku: 'sto-ssd-512' },
          { label: 'SSD — 1TB (2.5" SATA)', price: 189.99, pts: 3500, sku: 'sto-ssd-1tb' },
          { label: 'Hard drive — ask us for current options', price: null, pts: null, unavailable: true },
          { label: 'M.2 SSD — ask us for current options', price: null, pts: null, unavailable: true }
        ] },
      { id: 'car-dual-usb', name: 'Dual USB Car Charger (Fast Charge)', cat: 'Car Chargers', block: 'other', price: 14.99, pts: 3500, imageId: 'car-dual-usb',
        desc: 'Two USB ports for charging in the car, with fast-charge support for the drive.' },
      { id: 'station-3in1', name: '3-in-1 Wireless Charging Station', cat: 'Wireless Chargers', block: 'other', price: 44.99, pts: 3500, imageId: 'station-3in1',
        desc: 'A three-in-one wireless charging station for a nightstand or desk — one spot that charges your everyday carry together.' },
      /* STORE_SET_MERGE_2026_11_06 (Austin, Nov 6, 2026): GAMING and
         SMARTWATCH stop being ask-us panels and get real listings.
         Prices and points are DERIVED from the nearest comparable
         listing already in this catalog (the same tier method the
         3.4 pass used: protectors 1,000 pts, case-family 2,500 pts,
         chargers and premium gear 3,500 pts) — every derived value
         is listed in REPORT.md for owner review. New listings carry
         an icon instead of a photo: no product photo exists for them
         and a fake one would be worse than none. */
      { id: 'game-cooling-station', name: 'Console Cooling Station', cat: 'Gaming Accessories', block: 'gaming', price: 39.99, pts: 3500, icon: 'fa-fan', defaultVariant: 'PlayStation 5',
        desc: 'A cooling stand that pulls heat away from your console while you play, with a charging spot for a controller on the side. Pick your console.',
        variants: [
          { label: 'PlayStation 5', price: 39.99, pts: 3500, sku: 'game-cooling-ps5' },
          { label: 'Xbox Series X|S', price: 39.99, pts: 3500, sku: 'game-cooling-xbox' },
          { label: 'Nintendo Switch', price: 39.99, pts: 3500, sku: 'game-cooling-switch' }
        ] },
      { id: 'game-charge-dock', name: 'Dual Controller Charging Dock', cat: 'Gaming Accessories', block: 'gaming', price: 29.99, pts: 3500, icon: 'fa-battery-full', defaultVariant: 'PlayStation 5',
        desc: 'Charge two controllers at once and park them on the dock between sessions \u2014 no hunting for a cable mid-game. Pick your console.',
        variants: [
          { label: 'PlayStation 5', price: 29.99, pts: 3500, sku: 'game-dock-ps5' },
          { label: 'Xbox Series X|S', price: 29.99, pts: 3500, sku: 'game-dock-xbox' }
        ] },
      { id: 'game-controller', name: 'Wireless Controller', cat: 'Gaming Accessories', block: 'gaming', price: 69.99, pts: 3500, icon: 'fa-gamepad', defaultVariant: 'For PlayStation 5',
        desc: 'A spare or replacement wireless controller, matched to your console. Pick your platform.',
        variants: [
          { label: 'For PlayStation 5', price: 69.99, pts: 3500, sku: 'game-controller-ps5' },
          { label: 'For Xbox Series X|S', price: 64.99, pts: 3500, sku: 'game-controller-xbox' },
          { label: 'For Nintendo Switch', price: 59.99, pts: 3500, sku: 'game-controller-switch' }
        ] },
      { id: 'game-keyboard', name: 'Gaming Keyboard', cat: 'Gaming Accessories', block: 'gaming', price: 49.99, pts: 3500, icon: 'fa-keyboard', defaultVariant: 'Mechanical \u2014 wired',
        desc: 'A mechanical gaming keyboard with clicky, responsive keys. Go wired for zero lag, or wireless to clear the cables off the desk.',
        variants: [
          { label: 'Mechanical \u2014 wired', price: 49.99, pts: 3500, sku: 'game-keyboard-wired' },
          { label: 'Mechanical \u2014 wireless', price: 69.99, pts: 3500, sku: 'game-keyboard-wireless' }
        ] },
      { id: 'game-ps5-plates', name: 'PlayStation 5 Side Panels', cat: 'Gaming Accessories', block: 'gaming', price: 49.99, pts: 2500, icon: 'fa-layer-group', defaultVariant: 'Disc Edition',
        desc: 'Click-on replacement side panels for the PS5 \u2014 swap the look of the console in minutes, no tools needed. Pick your edition.',
        variants: [
          { label: 'Disc Edition', price: 49.99, pts: 2500, sku: 'game-ps5-plates-disc' },
          { label: 'Digital Edition', price: 49.99, pts: 2500, sku: 'game-ps5-plates-digital' }
        ] },
      { id: 'game-decal-skin', name: 'Console Decal Skin', cat: 'Gaming Accessories', block: 'gaming', price: 14.99, pts: 1000, icon: 'fa-shapes', defaultVariant: 'PlayStation 5',
        desc: 'A precision-cut decal skin that wraps your console in a new look and guards the shell against scuffs. Pick your console.',
        variants: [
          { label: 'PlayStation 5', price: 14.99, pts: 1000, sku: 'game-decal-ps5' },
          { label: 'Xbox Series X|S', price: 14.99, pts: 1000, sku: 'game-decal-xbox' },
          { label: 'Nintendo Switch', price: 14.99, pts: 1000, sku: 'game-decal-switch' }
        ] },
      { id: 'watch-glass', name: 'Apple Watch Screen Protector', cat: 'Smartwatch Accessories', block: 'smartwatch', price: 14.99, pts: 1000, icon: 'fa-shield-halved', fit: 'Smartwatch', defaultVariant: 'Apple Watch',
        desc: 'Tempered glass sized for your Apple Watch \u2014 it takes the knocks so the watch face does not have to. Pick your watch model so we bring the right size.',
        variants: [
          { label: 'Apple Watch', price: 14.99, pts: 1000, sku: 'watch-glass-apple', deviceBrands: ['Apple'] }
        ] },
      { id: 'watch-band', name: 'Apple Watch Band', cat: 'Smartwatch Accessories', block: 'smartwatch', price: 19.99, pts: 2500, icon: 'fa-clock', fit: 'Smartwatch', defaultVariant: 'Sport band',
        desc: 'Fresh bands for Apple Watch \u2014 a soft sport band for every day, a braided band for a dressier look, or a metal link band. Pick your watch model so the fit is right.',
        variants: [
          { label: 'Sport band', price: 19.99, pts: 2500, sku: 'watch-band-sport', deviceBrands: ['Apple'] },
          { label: 'Braided band', price: 29.99, pts: 2500, sku: 'watch-band-braided', deviceBrands: ['Apple'] },
          { label: 'Metal link band', price: 39.99, pts: 2500, sku: 'watch-band-metal', deviceBrands: ['Apple'] }
        ] },
      { id: 'watch-charger', name: 'Apple Watch Magnetic Charger', cat: 'Smartwatch Accessories', block: 'smartwatch', price: 24.99, pts: 3500, icon: 'fa-magnet',
        desc: 'The magnetic charging puck for Apple Watch \u2014 snap it on the back of the watch and it charges. A good spare for the nightstand or the car.' }
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
      gaming: { title: 'Gaming accessories', copy: 'Cooling, charging, controllers, keyboards and console extras.' },
      smartwatch: { title: 'Smartwatch accessories', copy: 'Screen protection, bands and charging for Apple Watch.' },
      other: { title: 'Other', copy: 'Car charging, charging stations, and the rest of the gear shelf.' },
      refurbished: { title: 'Refurbished phones', special: 'refurbished' },
      featured: { title: 'Featured deals', copy: 'A short list of shop favorites at their regular fair prices.' },
      cables: { title: 'Cables and Chargers', copy: 'Cables, wall blocks and wireless chargers for your devices.' },
      all: { title: 'Shop all accessories', copy: 'Every accessory in one view.' }
    };
    var SHOP_SPECIAL_HTML = {
      refurbished: '<h4>Refurbished phones, when they\u2019re on the shelf</h4><p>We sell pre-owned and refurbished phones — tested, checked over, and ready to use. Stock changes as devices come in, so there\u2019s no fixed list here: <a href="#contact" data-page="contact">ask us what\u2019s in stock</a> and we\u2019ll tell you exactly what we have.</p>',
    };
    var shopTiles = document.getElementById('shop-categories');
    var shopHead = document.getElementById('shop-listing-head');
    var shopBlockTitle = document.getElementById('shop-block-title');
    var shopBlockCopy = document.getElementById('shop-block-copy');
    var shopSpecial = document.getElementById('shop-special');
    var shopSearch = document.getElementById('shop-search');

    function shopShowHome() {
      if (shopRailWrap) shopRailWrap.hidden = false;
      if (shopTiles) shopTiles.hidden = false;
      if (shopHead) shopHead.hidden = true;
      if (shopSpecial) shopSpecial.hidden = true;
      if (grid) grid.hidden = true;
    }
    function shopShowListing(title, copy) {
      if (shopRailWrap) shopRailWrap.hidden = true;
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
        : block === 'cables' ? PRODUCTS.filter(function (p) { return /charg/i.test(p.cat || '') || /cable/i.test(p.name || ''); })
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
          '<div class="product-media">' + (p.icon ? '<span class="product-media-icon"><i class="fas ' + p.icon + '" aria-hidden="true"></i></span>' : '<img src="images/products/' + (p.imageId || p.id) + '.jpg" alt="' + p.name + '" loading="lazy">') + '</div>' +
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
    /* STORE_SET_MERGE_2026_11_06 (Austin, Nov 6, 2026): the
       Apple-style swipe rail at the top of the Store — big rounded
       cards in a horizontal row over the featured listings, the
       next card peeking at the edge. Native scroll gives the swipe
       on touch; pointer drag covers the desktop. Dots under a card
       step through that product's variants and the price follows;
       Add on a rail card adds the dotted variant (a fit product
       still opens the pop-up, same rule as the grid). Tapping a
       card opens the same pop-up detail view. This style lives in
       the Store only. */
    var shopRailWrap = document.getElementById('shop-rail-wrap');
    var shopRail = document.getElementById('shop-rail');
    var railDragMoved = false;
    function railVariant(p, card) {
      if (!p.variants) return null;
      var idx = parseInt(card.getAttribute('data-variant-idx') || '0', 10);
      return p.variants[isNaN(idx) ? 0 : idx] || p.variants[0];
    }
    function railPaintPrice(p, card) {
      var priceEl = card.querySelector('.rail-price');
      var ptsEl = card.querySelector('.rail-pts');
      var v = railVariant(p, card);
      var unit = v && v.price != null ? v.price : p.price;
      var pts = v && v.pts != null ? v.pts : p.pts;
      if (priceEl) priceEl.textContent = v && v.unavailable ? 'Ask us' : money(unit);
      if (ptsEl) ptsEl.textContent = pts ? 'or ' + fmtPts(pts) + ' pts' : '';
      card.querySelectorAll('.rail-dot').forEach(function (d, i) {
        d.classList.toggle('is-on', i === (parseInt(card.getAttribute('data-variant-idx') || '0', 10) || 0));
      });
    }
    function renderShopRail() {
      if (!shopRail) return;
      shopRail.innerHTML = '';
      PRODUCTS.filter(function (p) { return !!p.featured; }).forEach(function (p) {
        var card = document.createElement('article');
        card.className = 'rail-card';
        card.setAttribute('data-id', p.id);
        card.setAttribute('data-variant-idx', '0');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', p.name + ' \u2014 view details');
        var dots = '';
        if (p.variants && p.variants.length > 1) {
          dots = '<div class="rail-dots">' + p.variants.map(function (v, i) {
            return '<button class="rail-dot' + (i === 0 ? ' is-on' : '') + '" type="button" data-dot-idx="' + i + '" aria-label="Option: ' + v.label + '"></button>';
          }).join('') + '</div>';
        }
        card.innerHTML =
          '<div class="product-media rail-media">' + (p.icon ? '<span class="product-media-icon"><i class="fas ' + p.icon + '" aria-hidden="true"></i></span>' : '<img src="images/products/' + (p.imageId || p.id) + '.jpg" alt="' + p.name + '" loading="lazy">') + '</div>' +
          '<div class="rail-body">' +
            '<span class="product-cat">' + p.cat + '</span>' +
            '<h3 class="rail-name">' + p.name + '</h3>' +
            '<div class="product-price-row"><span class="product-price rail-price">' + cardPriceHtml(p) + '</span></div>' +
            '<div class="product-points-row"><span class="product-pts rail-pts">or ' + fmtPts(p.pts) + ' pts</span></div>' +
            dots +
            '<div class="product-card-actions">' +
              '<span class="product-view-hint">View details <i class="fas fa-arrow-right"></i></span>' +
              '<button class="add-btn" type="button" data-rail-add="' + p.id + '">Add</button>' +
            '</div>' +
          '</div>';
        card.addEventListener('click', function () {
          if (railDragMoved) { railDragMoved = false; return; }
          openProductDetail(p.id);
        });
        card.addEventListener('keydown', function (e) {
          if (e.target !== card) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProductDetail(p.id); }
        });
        card.querySelectorAll('.rail-dot').forEach(function (d) {
          d.addEventListener('click', function (e) {
            e.stopPropagation();
            card.setAttribute('data-variant-idx', d.getAttribute('data-dot-idx'));
            railPaintPrice(p, card);
          });
        });
        var addBtn = card.querySelector('[data-rail-add]');
        if (addBtn) addBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (p.fit) { openProductDetail(p.id); return; }
          var v = railVariant(p, card);
          if (v && v.unavailable) { openProductDetail(p.id); return; }
          addToCart(v ? makeCartKey(p, v, '') : p.id);
          flashAdded(addBtn, 'Added');
        });
        shopRail.appendChild(card);
      });
      /* Desktop drag-to-scroll. A real drag suppresses the click
         that follows it, so dragging never opens a pop-up. */
      var drag = { down: false, x: 0, scroll: 0 };
      shopRail.addEventListener('pointerdown', function (e) {
        drag.down = true; drag.x = e.clientX; drag.scroll = shopRail.scrollLeft;
      });
      shopRail.addEventListener('pointermove', function (e) {
        if (!drag.down) return;
        var dx = e.clientX - drag.x;
        if (Math.abs(dx) > 6) railDragMoved = true;
        shopRail.scrollLeft = drag.scroll - dx;
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) {
        shopRail.addEventListener(t, function () { drag.down = false; });
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
      brandSel.innerHTML = '<option value="">Choose a make</option>' + brands.map(function (b) {
        return '<option value="' + b + '">' + b + '</option>';
      }).join('');
      modelSel.innerHTML = '<option value="">Choose a make first</option>';
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
      var pdIcon = pdEl('product-detail-icon');
      if (p.icon) {
        if (img) { img.hidden = true; img.removeAttribute('src'); }
        if (pdIcon) { pdIcon.hidden = false; pdIcon.innerHTML = '<i class="fas ' + p.icon + '" aria-hidden="true"></i>'; }
      } else {
        if (img) { img.hidden = false; img.src = 'images/products/' + (p.imageId || p.id) + '.jpg'; img.alt = p.name; }
        if (pdIcon) pdIcon.hidden = true;
      }
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
        addBtn.innerHTML = '<i class="fas fa-plus"></i> Add to bag';
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
            pdShowError('Choose your device make and model first — that\u2019s how we bring exactly the right fit.');
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
      renderShopRail();
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
      /* HEADER_CART_BAG_2026_11_10: the header bag's badge rides the
         same repaint — same count, hidden at zero. */
      var bagCount = document.getElementById('cart-bag-count');
      if (bagCount) { var bq = cartQty(); bagCount.textContent = bq; bagCount.hidden = bq === 0; }
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
        cartItems.innerHTML = '<p class="cart-empty">Your bag is empty.<br>Add some accessories to get started.</p>';
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
      /* HEADER_CART_BAG_2026_11_10: the header bag (phones only,
         styles.css) opens the same cart drawer as everything else —
         this module's own openCart, the drawer the account Cart
         section's Open cart row also opens. No second cart. */
      var bagBtn = document.getElementById('cart-bag-btn');
      if (bagBtn) bagBtn.addEventListener('click', function () { openCart(); });
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
      if (window.confirm('Remove everything from your bag?')) saveCart({});
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
            alert('Sign in to pay with points — tap your account at the top of the page and sign in, then check out. Your bag is saved.');
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
      /* V53_GREETING_2026_11_09: the mobile top bar's greeting reads
         the SAME session this function already renders from — no new
         source, no new fetch. Name resolved -> "Hello, <first>";
         signed out or name not yet resolved -> "Welcome, Guest".
         renderHeader() re-runs on sign-in, sign-out and restore, so
         the greeting swaps in place inside its reserved bar space. */
      var greetEl = document.getElementById('header-greeting');
      if (greetEl) {
        var gName = s ? String(s.name || '').trim() : '';
        greetEl.textContent = gName ? ('Hello, ' + firstName(gName)) : 'Welcome, Guest';
        /* V54_GREETING_ASSOCIATE_2026_11_09: the associate state
           outranks both of the above (Austin's order: associate
           first, guest second). It can only upgrade the text set
           just now — synchronously from this browser session's
           cache, or asynchronously when the read-only employee
           check below resolves. */
        applyAssociateGreeting(greetEl);
      }
    }

    /* ---------- V54_GREETING_ASSOCIATE_2026_11_09 ----------
       Austin (Nov 9, 2026): the greeting welcomes ASSOCIATES as
       associates — his standing order is associate first, guest
       second — so a staffer browsing the public site on a device
       where they also use the Associate Hub is greeted
       "Welcome, Associate", outranking the customer and guest
       states renderHeader() sets above.

       How it works, and why it is built this way:
       - The Hub stores its Supabase session in localStorage under
         'sb-atrg-portal-auth-token' (portal.js
         PORTAL_AUTH_STORAGE_KEY). The stored value is the session
         JSON itself; it is parsed here exactly the way portal.js's
         own storedSessionMeta() parses it. NOTHING is written by
         this page: no storage writes, no token refresh, no
         sign-out — pure reading.
       - The employee test is the portal's own gate query
         (portal.js verifyEmployee): the caller's own row in
         employee_profiles, filtered id = the session user's id.
         supabase-js turns that into a PostgREST GET on
         /rest/v1/employee_profiles carrying the session's access
         token as the Bearer JWT; this code issues that identical
         request directly instead of building a second Supabase
         client, because a client bound to the portal's storage
         key would run its own auto-refresh against the portal's
         refresh-token family from this page (portal.js's storage
         comments document how two stored copies sharing one
         refresh token can get the family revoked), and a
         non-persisting client's setSession() would consume that
         refresh token without writing the rotated result back
         anywhere. The direct request is the same wire call with
         none of those side effects, and RLS sees the same
         auth.uid() it sees for the portal's own query.
       - An expired access token is never presented: the check
         simply does not run (the portal refreshes the session on
         its own next open). Every failure — no token, malformed
         token, offline, RLS refusal, non-employee — degrades
         silently to the customer/guest greeting renderHeader()
         already set. A positive result is cached in
         sessionStorage bound to the portal session's user id +
         expires_at, and the cache is re-validated against the
         live token on every render before it is trusted:
         sign-out removes the portal key so the cache is never
         consulted, and a different staffer or a refreshed token
         changes the binding and forces a fresh check. */
    var PORTAL_SESSION_KEY = 'sb-atrg-portal-auth-token';
    var ASSOC_GREETING_CACHE_KEY = 'atr-greeting-associate';
    var assocGreetingCheckStarted = false;

    function portalSessionMeta() {
      try {
        var raw = localStorage.getItem(PORTAL_SESSION_KEY);
        if (!raw) return null;
        var s = JSON.parse(raw);
        if (!s || !s.user || !s.user.id || !s.access_token) return null;
        return { userId: s.user.id, accessToken: s.access_token, expiresAt: Number(s.expires_at) || 0 };
      } catch (e) { return null; }
    }

    function assocGreetingCached(meta) {
      try {
        var raw = sessionStorage.getItem(ASSOC_GREETING_CACHE_KEY);
        if (!raw) return false;
        var c = JSON.parse(raw);
        return !!(c && c.userId === meta.userId && c.expiresAt === meta.expiresAt);
      } catch (e) { return false; }
    }

    function applyAssociateGreeting(greetEl) {
      try {
        if (!greetEl) return;
        var meta = portalSessionMeta();
        if (!meta) return;
        if (assocGreetingCached(meta)) {
          greetEl.textContent = 'Welcome, Associate';
          return;
        }
        if (assocGreetingCheckStarted) return;
        assocGreetingCheckStarted = true;
        checkAssociateGreeting(meta);
      } catch (e) {}
    }

    function checkAssociateGreeting(meta) {
      try {
        /* An expired JWT would only earn a 401 — and refreshing
           it is the portal's job, never this page's. */
        if (meta.expiresAt && meta.expiresAt * 1000 <= Date.now()) return;
        var url = SUPABASE_URL + '/rest/v1/employee_profiles?select=id&id=eq.' +
          encodeURIComponent(meta.userId) + '&limit=1';
        fetch(url, {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + meta.accessToken
          }
        }).then(function (res) {
          return res && res.ok ? res.json() : null;
        }).then(function (rows) {
          if (!rows || !rows.length) return;
          /* Re-validate before painting: the portal session must
             still be the exact one that was checked — a sign-out
             or a different sign-in in another tab must not inherit
             this greeting. */
          var now = portalSessionMeta();
          if (!now || now.userId !== meta.userId || now.expiresAt !== meta.expiresAt) return;
          try {
            sessionStorage.setItem(ASSOC_GREETING_CACHE_KEY,
              JSON.stringify({ userId: meta.userId, expiresAt: meta.expiresAt }));
          } catch (e) {}
          var el = document.getElementById('header-greeting');
          if (el) el.textContent = 'Welcome, Associate';
        }).catch(function () { /* silent: the customer/guest greeting stands */ });
      } catch (e) {}
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
      /* V63_LOGIN_FOCUS_2026_11_09: same rule as the router's
         account arrival - the sign-in view never (re)opens with a
         field already focused. This covers the in-place re-shows
         that never pass through a page switch. */
      var ae = document.activeElement;
      if (ae && authView.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) ae.blur();
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

  var STATUSES = ['Awaiting Estimate', 'Awaiting Scheduling', 'Awaiting Diagnostics', 'Awaiting Customer Response', 'Awaiting Parts', 'En Route to Customer', 'In Progress', 'Quality Control', 'Ready', 'Job Complete'];
  var STATUS_CLASS = {
    'Awaiting Diagnostics': 'acct-st-waiting',
    'Awaiting Estimate': 'acct-st-waiting',
    'Awaiting Scheduling': 'acct-st-waiting',
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
            if (/^\[SERVICE\]/.test(t.issue || '')) dev = 'One-on-one — ' + (t.issue_reason || t.model || 'help');
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
            if (/^\[SERVICE\]/.test(t.issue || '')) dev = 'One-on-one — ' + (t.issue_reason || t.model || 'help');
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
   Repairs, Rewards & Gift Cards, Cart, Account Settings, Sign Out.
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
    /* MY_DEVICES_2026_11_06: the My Devices view joins the toggle set. */
    var devicesView = document.getElementById('acct-view-devices');
    /* ATRG_CONNECT_2026_11_10: the ATRG Connect view joins the toggle set. */
    var connectView = document.getElementById('acct-view-connect');
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
      var panels = { repairs: repairsView, settings: settingsView, rewards: rewardsView, messages: messagesView, orders: ordersView, cart: cartView, membership: membershipView, devices: devicesView, connect: connectView };
      var target = (panels[view] && !panels[view].hidden) ? null : view;
      repairsView.hidden = target !== 'repairs';
      settingsView.hidden = target !== 'settings';
      /* SITE_POINTS_SPEND_2026_10_30: third view — Rewards & Gift Cards. */
      if (rewardsView) rewardsView.hidden = target !== 'rewards';
      if (messagesView) messagesView.hidden = target !== 'messages';
      if (ordersView) ordersView.hidden = target !== 'orders';
      if (cartView) cartView.hidden = target !== 'cart';
      if (membershipView) membershipView.hidden = target !== 'membership';
      if (devicesView) devicesView.hidden = target !== 'devices';
      if (connectView) connectView.hidden = target !== 'connect';
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
        return { ok: false, message: 'Your points balance just changed — please review your bag and try again. Nothing was charged.' };
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

    /* Voucher strip -> the Rewards view. ACCOUNT_FIX_PASS_3 first
       added the scroll-into-view here; VOUCHER_TAP_FIX_2026_11_06
       (owner, Nov 6, 2026: "Keep both, just fix the voucher tap")
       fixes the two ways the tap still failed:
       (1) NO SHARED ONE-SHOT FLAG. Every sibling wiring on this
       page guards itself with a window flag (__atrCartGlanceWired,
       __atrAcctMenuWired) because two live wirings cancel out —
       but the strip was wired HERE and again by the index.html
       safety net with no flag in common. Whenever the net is the
       wiring that arms (its whole reason to exist: a device whose
       script.js menu module never raised its flag), the strip
       carried both handlers, and since the account rows TOGGLE,
       one tap opened and instantly closed the view — the tap
       looked dead. The strip now has its own shared flag,
       window.__atrVoucherStripWired: whichever wiring runs first
       owns the strip and the other stands down.
       (2) THE TAP INHERITED THE ROW'S TOGGLE. The old handler
       clicked the row unconditionally, so a second tap — or a tap
       while the view was already open — closed the very view the
       strip exists to reveal. The tap now only ever OPENS: it
       clicks the row solely when the view is closed, then scrolls
       the view into view (the strip sits far above the panel, so
       without the scroll an opened panel can sit off-screen and
       the tap still looks dead).
       The listener is DELEGATED from document, so if the account
       markup is ever re-rendered and the strip node is replaced,
       the tap keeps working — no handler dies with the old node. */
    if (!window.__atrVoucherStripWired) {
      window.__atrVoucherStripWired = true;
      document.addEventListener('click', function (e) {
        var t = e.target;
        var stripEl = (t && t.closest) ? t.closest('#acct-voucher-strip')
          : (t && t.id === 'acct-voucher-strip' ? t : null);
        if (!stripEl) return;
        var rewardsView = $('acct-view-rewards');
        if (rewardsView && rewardsView.hidden) {
          var item = document.querySelector('[data-acct-menu="rewards"]');
          if (item) item.click();
        }
        if (rewardsView && !rewardsView.hidden && rewardsView.scrollIntoView) {
          try { rewardsView.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (err) {}
        }
      });
    }

    /* VOUCHER_TAP_FIX_2026_11_06: voucher cards in the panel answer
       taps too. The list is repainted with innerHTML on every
       refresh, so the tap is delegated from the stable
       #pts-voucher-list container (a listener on a card itself
       would die at the next repaint): tapping a card raises its
       show-at-the-visit state — big code, highlighted card, the
       state the customer holds up at the visit; tapping it again
       puts it back, and raising one card lowers any other. */
    var voucherList = $('pts-voucher-list');
    if (voucherList) voucherList.addEventListener('click', function (e) {
      var t = e.target;
      var card = (t && t.closest) ? t.closest('.pts-voucher-card') : null;
      if (!card || !voucherList.contains(card)) return;
      var wasShown = card.classList.contains('pts-voucher-card--show');
      var shown = voucherList.querySelectorAll('.pts-voucher-card--show');
      for (var vi = 0; vi < shown.length; vi++) shown[vi].classList.remove('pts-voucher-card--show');
      if (!wasShown) card.classList.add('pts-voucher-card--show');
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
   delegated handler. Escape and a tap on the dimmed area close the
   panel — nobody is ever trapped.
   SEARCH_RELEASE_2026_11_09 (owner, Nov 9, 2026): ONE X only — the
   circled #site-search-exit at the panel's top-right (the panel's
   first child). The Nov 6 in-field clear X is removed: on the
   empty field it closed the panel, so the two X's did the same
   job. Closing now RESETS the field, so every open starts on the
   empty state — the hint plus a labelled "Quick Links" section
   holding the retired mobile menu's five destinations (About,
   ATR One, One-on-One, Help Guides, Reviews), which also pin to
   the top of the results whenever they match a query. Voice
   search: a microphone is created inside the bar only where the
   Web Speech API exists, and its transcript drives the field's
   own 'input' path. The mobile thumb bar's Search slot opens this
   same panel; the header button stays. */
(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', function () {
    var openBtn = document.getElementById('site-search-open');
    var overlay = document.getElementById('site-search');
    var input = document.getElementById('site-search-input');
    var resultsBox = document.getElementById('site-search-results');
    var exitBtn = document.getElementById('site-search-exit');
    var clearBtn = document.getElementById('site-search-clear');
    var thumbSearchBtn = document.getElementById('bottom-search-toggle');
    var searchBar = overlay.querySelector('.site-search-bar');
    if (!openBtn || !overlay || !input || !resultsBox) return;

    var PAGE_NAMES = {
      home: 'Home', repair: 'Repair', whatwedo: 'Guest Services',
      about: 'About', shop: 'Store', b2b: 'Business Services', 'atr-one': 'ATR One Membership',
      careers: 'Careers', investors: 'Investors', contact: 'Contact',
      warranty: 'Warranty', 'warranty-request': 'Warranty Request',
      privacy: 'Privacy Policy', terms: 'Terms of Service',
      'service-agreement': 'Service Agreement', review: 'Leave a Review',
      values: 'Our Values', account: 'My Account', phones: 'Phones',
      tablets: 'Tablets', computers: 'Computers', consoles: 'Game Consoles',
      smartwatches: 'Smartwatches', websites: 'Websites',
      network: 'Network Installs', cabling: 'Internet Cabling',
      classes: 'One-on-One Classes',
      'questions-answers': 'Service and Repair'
    };
    var GROUP_LABELS = { page: 'Pages', repair: 'Repairs & prices', shop: 'Store items' };
    var GROUP_CAPS = { page: 8, repair: 10, shop: 8 };
    /* SEARCH_RELEASE_2026_11_09: the Quick Links destinations — the
       retired mobile menu's five, in the menu's own order. page is
       the router id the destination opens; oo routes through the
       site's data-open-oneonone entry; guide scrolls to a block on
       the named page. keys widens matching with the words people
       actually type. */
    var DESTS = [
      { title: 'About', page: 'about', keys: 'about us company austin owner story meet' },
      { title: 'ATR One', page: 'atr-one', keys: 'atr one membership plus points rewards plans join subscription' },
      { title: 'One-on-One', oo: true, keys: 'one-on-one one on one lessons classes tutoring learn training' },
      { title: 'Help Guides', page: 'help-guides', keys: 'help guides how to instructions do it yourself diy' },
      { title: 'Reviews', page: 'home', guide: 'home-reviews', keys: 'reviews ratings testimonials what local guests are saying stars feedback' }
    ];
    /* NAV_SEARCH_CLEANUP_2026_11_06 (addendum 4): the storefront's
     * customer-facing name is "Store" (PAGE_NAMES above); "shop" stays
     * behind as a search alias so the old word still finds the page.
     * Internal ids (data-page="shop", section id) are unchanged. */
    var PAGE_ALIASES = { shop: 'shop', b2b: 'business enterprise pos small business', 'questions-answers': 'service and repair questions answers faq warranty coverage track repair status' };

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
      /* SEARCH_RELEASE_2026_11_09: destinations. About, ATR One and
         Help Guides already have index entries (their own pages) —
         tag them and widen their hay. One-on-One and Reviews have
         no page entry of their own (One-on-One is the booking
         mode; Reviews is the home testimonials block), so they get
         explicit entries carrying their own routing. */
      DESTS.forEach(function (d) {
        if (d.oo || d.guide) {
          index.push({
            kind: 'page', title: d.title, sub: 'Page', page: d.page || '',
            heads: [], dest: d.title, oo: !!d.oo, guide: d.guide || '',
            hay: norm(d.title + ' ' + d.keys)
          });
          return;
        }
        for (var i = 0; i < index.length; i++) {
          if (index[i].kind === 'page' && index[i].page === d.page && !index[i].dest) {
            index[i].dest = d.title;
            index[i].hay += ' ' + norm(d.keys);
            break;
          }
        }
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
        if (e.dest) score += 30;
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
      /* SERVICES_TWO_PAGES_2026_11_12 (owner, Nov 12, 2026): the
         Services flow (#svc-flow) is gone — a repair result now
         drives the booking form directly (window.atrBkOpenRepair),
         so the sealed search-carry rule still holds: the pick lands
         applied on the booking form, never re-asked. The guest lands
         on the booking form itself (#repair), where the ATR One
         coverage question waits at step 2. Falls back to the old
         flow only if the new driver is missing. */
      goToPage('repair');
      setTimeout(function () {
        if (window.atrBkOpenRepair) {
          window.atrBkOpenRepair({ type: e.type, brand: e.brand, model: e.model, repair: e.repair });
        } else if (window.atrSvcOpenRepair) {
          window.atrSvcOpenRepair({ type: e.type, brand: e.brand, model: e.model, repair: e.repair });
        }
      }, 80);
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

    function clickTempAnchor(attrs) {
      var a = document.createElement('a');
      Object.keys(attrs).forEach(function (k) { a.setAttribute(k, attrs[k]); });
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    function activate(e, q) {
      closeSearch();
      if (e.oo) {
        /* The site's own one-on-one entry: a data-open-oneonone
           anchor, clicked through the same delegated handlers the
           door cards and guide buttons use. */
        clickTempAnchor({ href: '#repair', 'data-page': 'repair', 'data-open-oneonone': '' });
      } else if (e.guide) {
        clickTempAnchor({ href: '#' + e.page, 'data-page': e.page, 'data-guide': e.guide });
      }
      else if (e.kind === 'repair') openRepairResult(e);
      else if (e.kind === 'shop') openShopResult(e);
      else openPageResult(e, q);
    }

    function destEntry(title) {
      var idx = buildIndex();
      for (var i = 0; i < idx.length; i++) { if (idx[i].dest === title) return idx[i]; }
      return null;
    }

    function render(qRaw) {
      var q = String(qRaw || '');
      resultsBox.innerHTML = '';
      if (!q.trim()) {
        var hint = document.createElement('p');
        hint.className = 'site-search-hint';
        hint.textContent = 'Start typing \u2014 search looks across every page, the repair price book, and the store.';
        resultsBox.appendChild(hint);
        /* SEARCH_RELEASE_2026_11_09: the Quick Links section — the
           five destinations as arrow rows, Apple's treatment. A tap
           routes exactly like a result tap (activate). */
        var qh = document.createElement('p');
        qh.className = 'site-search-quicklinks-title';
        qh.textContent = 'Quick Links';
        resultsBox.appendChild(qh);
        DESTS.forEach(function (d) {
          var e = destEntry(d.title);
          if (!e) return;
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'site-search-item site-search-quicklink';
          b.setAttribute('data-dest', d.title);
          var ar = document.createElement('span');
          ar.className = 'ss-arrow';
          ar.setAttribute('aria-hidden', 'true');
          ar.innerHTML = '<i class="fas fa-arrow-right"></i>';
          var t = document.createElement('span');
          t.className = 'site-search-item-title';
          t.textContent = d.title;
          b.appendChild(ar); b.appendChild(t);
          b.addEventListener('click', function () { activate(e, ''); });
          resultsBox.appendChild(b);
        });
        return;
      }
      var list = runSearch(q);
      if (!list.length) {
        var none = document.createElement('p');
        none.className = 'site-search-none';
        none.textContent = 'No matches for \u201C' + q.trim() + '\u201D. Try a shorter word \u2014 a device, a repair, or a page name.';
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

    /* SEARCH_RELEASE_2026_11_09: on mobile the sheet rides the
       visual viewport, so the field sits directly above the
       on-screen keyboard. The CSS vars are consumed only by the
       (max-width: 920px) sheet rules; without a VisualViewport API
       the sheet falls back to its 100dvh anchor. */
    var vvHandler = null;
    function syncSearchViewport() {
      var vv = window.visualViewport;
      if (!vv) return;
      overlay.style.setProperty('--ss-vv-top', vv.offsetTop + 'px');
      overlay.style.setProperty('--ss-vv-height', vv.height + 'px');
    }
    function watchSearchViewport(on) {
      var vv = window.visualViewport;
      if (!vv) return;
      if (on && !vvHandler) {
        vvHandler = function () { syncSearchViewport(); };
        vv.addEventListener('resize', vvHandler);
        vv.addEventListener('scroll', vvHandler);
        syncSearchViewport();
      } else if (!on && vvHandler) {
        vv.removeEventListener('resize', vvHandler);
        vv.removeEventListener('scroll', vvHandler);
        vvHandler = null;
        overlay.style.removeProperty('--ss-vv-top');
        overlay.style.removeProperty('--ss-vv-height');
      }
    }

    /* SEARCH_RELEASE_2026_11_09: closing resets search — the field
       is emptied and the results return to the empty state, so the
       next open, from either trigger, starts fresh on Quick Links.
       (Before this release the query survived close and reopen.) */
    function resetSearch() {
      input.value = '';
      if (clearBtn) clearBtn.hidden = true;
      render('');
    }
    function openSearch() {
      buildIndex();
      overlay.hidden = false;
      lockScroll();
      watchSearchViewport(true);
      render(input.value);
      /* SEARCH_CENTER_2026_11_11 (owner, Nov 11, 2026): focus the
         field inside the tap itself, so the keyboard pops as the
         sheet opens — a delayed focus alone does not raise the
         keyboard on iPhone/iPad. The delayed retry stays for
         browsers that drop the first attempt. */
      try { input.focus(); } catch (e) {}
      setTimeout(function () { try { input.focus(); } catch (e) {} }, 30);
      /* THUMB_NAV_ACTIVE_2026_11_12 (owner, Nov 12, 2026): the thumb
         bar's Search slot is a button with no data-page, so the
         router never marks it active. Light it orange like the
         other thumb items while the sheet is open; closeSearch
         below takes it off again. */
      if (thumbSearchBtn) thumbSearchBtn.classList.add('active');
    }
    function closeSearch() {
      if (!isOpen()) return;
      stopVoice();
      resetSearch();
      overlay.hidden = true;
      unlockScroll();
      watchSearchViewport(false);
      if (thumbSearchBtn) thumbSearchBtn.classList.remove('active');
    }

    /* SEARCH_RELEASE_2026_11_09: the ONE X (#site-search-exit) is
       wired straight to closeSearch, and closeSearch resets (see
       above). The Nov 6 in-field clear X, its label sync, and its
       tap-again-to-exit behaviour are removed with their button —
       nothing inside the field closes the panel any more. */

    /* SEARCH_CLOSE_ON_NAV_2026_11_11: the Search buttons toggle -
       tapping Search again while the sheet is open closes it (and
       resets, like the X). Same sheet, same close as everywhere. */
    function toggleSearch() { if (isOpen()) closeSearch(); else openSearch(); }
    openBtn.addEventListener('click', toggleSearch);
    if (thumbSearchBtn) thumbSearchBtn.addEventListener('click', toggleSearch);
    if (exitBtn) exitBtn.addEventListener('click', closeSearch);
    overlay.addEventListener('click', function (ev) { if (ev.target === overlay) closeSearch(); });
    document.addEventListener('keydown', function (ev) {
      if (isOpen() && (ev.key === 'Escape' || ev.keyCode === 27)) closeSearch();
    });
    input.addEventListener('input', function () {
      render(input.value);
      if (clearBtn) clearBtn.hidden = !input.value;
    });
    /* SEARCH_CENTER_2026_11_11 (owner's drawing, Nov 11, 2026):
       the in-field X clears the typed text ONLY — the sheet stays
       open and the field keeps focus, so the guest can type the
       next try at once. The circled X up top closes the sheet. */
    if (clearBtn) clearBtn.addEventListener('click', function () {
      input.value = '';
      render('');
      clearBtn.hidden = true;
      try { input.focus(); } catch (e) {}
    });
    /* SEARCH_CLOSE_ON_KEYBOARD_DISMISS_2026_11_11 (owner, Nov 11,
       2026): on his iPhone, closing the keyboard with its check mark
       left the sheet hanging open over the page — "get rid of that."
       When the field loses focus and the tap that caused it did NOT
       land inside the sheet, the sheet closes too: the keyboard
       going away means the search is done. Taps inside the sheet (a
       result, a Quick Link, the clear X, the mic) stamp themselves
       and are left to their own handlers; the clear X refocuses the
       field, which also keeps the sheet up. */
    var sheetTapStamp = 0;
    overlay.addEventListener('pointerdown', function () { sheetTapStamp = Date.now(); }, true);
    input.addEventListener('blur', function () {
      setTimeout(function () {
        if (!isOpen()) return;
        if (document.activeElement === input) return;
        if (Date.now() - sheetTapStamp < 400) return;
        closeSearch();
      }, 300);
    });
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && input.value.trim()) {
        var first = resultsBox.querySelector('.site-search-item');
        if (first) { ev.preventDefault(); first.click(); }
      }
    });

    /* SEARCH_RELEASE_2026_11_09: voice search. The microphone
       button exists only where the browser exposes the Web Speech
       API — it is created here, never written in the markup, so
       there is no dead button where the API is missing. The
       transcript is written into the field and pushed through the
       field's own 'input' event, so voice and typing run the
       identical search path — the search logic is not forked. Any
       end or error, a denied microphone included, returns the
       button to idle quietly; nobody is trapped. stopVoice is a
       hoisted declaration: closeSearch (above) calls it too. */
    var micBtn = null;
    var recog = null;
    var listening = false;
    function stopVoice() {
      if (recog && listening) { try { recog.stop(); } catch (e) {} }
      listening = false;
      if (micBtn) {
        micBtn.classList.remove('is-listening');
        micBtn.setAttribute('aria-label', 'Search by voice');
      }
    }
    var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec && searchBar) {
      micBtn = document.createElement('button');
      micBtn.type = 'button';
      micBtn.className = 'site-search-mic';
      micBtn.id = 'site-search-mic';
      micBtn.setAttribute('aria-label', 'Search by voice');
      micBtn.setAttribute('title', 'Search by voice');
      micBtn.innerHTML = '<i class="fas fa-microphone" aria-hidden="true"></i>';
      searchBar.appendChild(micBtn);
      micBtn.addEventListener('click', function () {
        if (listening) { stopVoice(); return; }
        try {
          recog = new SpeechRec();
          recog.lang = 'en-US';
          recog.continuous = false;
          recog.interimResults = true;
          recog.onresult = function (ev) {
            var txt = '';
            for (var i = 0; i < ev.results.length; i++) { txt += ev.results[i][0].transcript; }
            input.value = txt;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          };
          recog.onend = function () { stopVoice(); };
          recog.onerror = function () { stopVoice(); };
          listening = true;
          micBtn.classList.add('is-listening');
          micBtn.setAttribute('aria-label', 'Stop voice search');
          recog.start();
        } catch (e) {
          stopVoice();
        }
      });
    }

    /* Test/verification handle (same pattern as the lookup's own
       session hand-off): lets the harness drive the real module.
       clear = empty the field and re-render the empty state while
       staying open (the reset half of close, exposed for tests). */
    window.atrSiteSearch = { open: openSearch, close: closeSearch, clear: resetSearch, exit: closeSearch, run: runSearch, isOpen: isOpen };
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
    /* STAFF_GATE_HARDEN_2026_11_10 (owner report, Nov 10, 2026):
       the owner's phone hid this button for a whole session because
       the one check at page load failed on his slow connection and
       nothing ever asked again. Two cures, fail-closed throughout:
       (1) a TRANSIENT failure — the profile read or the RPC coming
       back with an error, never a clean "no row" answer, which is a
       real guest and stays final — retries the whole check ONCE
       after a short delay; the retry re-reads the session and runs
       only while the same user is still signed in, so it can never
       resurrect the button after a sign-out. (2) Opening My Account
       asks again: window.atrStaffRecheck (called by the account
       button and the quick-glance Open row in index.html) re-runs
       the check with a fresh one-retry budget, so a staff member
       who landed on a hidden button gets a fresh answer the moment
       they open their account. A guest's clean answers are never
       retried, and nothing is ever shown on a maybe. */
    var sessionUser = null; /* the user the latest check belongs to */
    var retryTimer = null;
    var retriedFor = '';    /* user id that already used its one retry */
    function rpcFallback(client, user, allowRetry) {
      if (!client || typeof client.rpc !== 'function') { hide(); return; }
      try {
        client.rpc('is_employee').then(function (res) {
          if (res && !res.error && res.data === true) { show(); return; }
          if (res && res.error) { transient(user, allowRetry); return; }
          hide();
        }).catch(function () { transient(user, allowRetry); });
      } catch (e) { transient(user, allowRetry); }
    }
    function transient(user, allowRetry) {
      hide();
      if (!user || !allowRetry) return;
      if (retriedFor === user.id) return;
      retriedFor = user.id;
      if (retryTimer) return;
      retryTimer = setTimeout(function () {
        retryTimer = null;
        checkFresh(false);
      }, 2600);
    }
    function check(user, allowRetry) {
      if (user && sessionUser && sessionUser.id !== user.id) retriedFor = '';
      sessionUser = user || null;
      var client = getClient();
      if (!user || !client) { hide(); return; }
      try {
        client.from('employee_profiles').select('id').eq('id', user.id).maybeSingle()
          .then(function (res) {
            if (res && res.error) { rpcFallback(client, user, allowRetry); return; }
            if (res && res.data && res.data.id) { show(); } else { hide(); }
          })
          .catch(function () { rpcFallback(client, user, allowRetry); });
      } catch (e) { rpcFallback(client, user, allowRetry); }
    }
    function checkFresh(allowRetry) {
      var client = getClient();
      if (!client || !client.auth || typeof client.auth.getSession !== 'function') { hide(); return; }
      try {
        client.auth.getSession().then(function (res) {
          var session = res && res.data ? res.data.session : null;
          var user = session ? session.user : null;
          /* a late answer never crosses users: if the session now
             belongs to somebody else (or nobody), the check runs
             for THAT user — a sign-out lands on check(null) and
             the button stays hidden. */
          check(user, allowRetry);
        }).catch(function () {
          hide();
          /* the session read itself failed on a bad connection:
             one delayed re-ask, same one-retry budget. */
          if (allowRetry && !retryTimer) {
            retryTimer = setTimeout(function () {
              retryTimer = null;
              checkFresh(false);
            }, 2600);
          }
        });
      } catch (e) { hide(); }
    }
    window.atrStaffRecheck = function () { retriedFor = ''; checkFresh(true); };
    var wired = false;
    function wire() {
      if (wired) return;
      var client = getClient();
      if (!client) return;
      wired = true;
      try {
        if (client.auth && typeof client.auth.onAuthStateChange === 'function') {
          client.auth.onAuthStateChange(function (_event, session) {
            if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
            check(session ? session.user : null, true);
          });
        }
      } catch (e) { hide(); }
    }
    try {
      checkFresh(true);
      wire();
      if (!wired) setTimeout(wire, 1500); /* library a beat late: subscribe once more, then stop */
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

/* ==================== GIFT CARDS ====================
   GIFT_CARDS_2026_11_06 (Austin, Nov 6, 2026). E-gift cards only —
   no plastic, nothing to print, mail, or carry. A gift card lives
   in the customer's account in the Rewards & Gift Cards panel,
   right under their points vouchers, and works the same way: the
   code and the balance show there, and at the visit the customer
   shows the code and WE apply it. Redemption in v1 is in person,
   by staff, on the ticket — the Square checkout prices
   server-side, so this page never pretends a gift card discounts
   an online checkout (the points build established the browser
   cannot do that).
   Reads and the claim run through two narrow SECURITY DEFINER
   functions (gift-cards.sql in this build's folder — DRAFT, NOT
   RUN yet): my_gift_cards() returns only the caller's own cards,
   and claim_gift_card(code) attaches an unclaimed card to the
   caller and nothing else. Until that SQL runs, every surface
   here fails soft with honest wording — the same degradation
   pattern as points vouchers and the membership card.
   Buying runs through Square, like everything else we sell: the
   shop's Square eGift Card selling link goes in the ONE constant
   below and the Buy button appears; while it is empty, the panel
   routes buyers to Contact ("Ask us about gift cards") instead of
   showing a dead button. No placeholder link, ever. */
(function () {
  'use strict';

  /* THE ONE LINE TO FILL IN: the Square eGift Card selling link
     (Square Dashboard -> Gift Cards). Empty = buying is ask-us
     only for now; the list and add-a-code flows work either way. */
  var SQUARE_GIFT_CARD_URL = '';

  var SUPABASE_URL = 'https://lyujxpuicarblpkdzuuc.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5dWp4cHVpY2FyYmxwa2R6dXVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNjAxMjQsImV4cCI6MjEwNzczNjEyNH0.io4qD7pw878Xx97yoS6xzclO33aa4QYKENpwIyZ06xg'; // apply-edits.js fills this from the points module in script.js — never retyped by hand
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
  function escX(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtMoney(cents) { return '$' + (Number(cents || 0) / 100).toFixed(2); }
  function getSession() {
    try { return JSON.parse(localStorage.getItem('atr-account') || 'null'); } catch (e) { return null; }
  }

  var giftKnown = null; // null = unprobed, true/false after first read
  var giftCards = [];

  function fetchGiftCards() {
    var c = client();
    if (!c) return Promise.resolve(null);
    return c.rpc('my_gift_cards').then(function (res) {
      if (res.error) throw res.error;
      return res.data || [];
    }).catch(function () { return null; }); // null = not switched on yet
  }

  function paintGiftCards() {
    /* Buy side: a real Square link or an honest ask-us route —
       never a button that goes nowhere. */
    var buyWrap = $('gc-buy-wrap'), buyAsk = $('gc-buy-ask'), buyBtn = $('gc-buy-btn');
    if (SQUARE_GIFT_CARD_URL) {
      if (buyWrap) buyWrap.hidden = false;
      if (buyAsk) buyAsk.hidden = true;
      if (buyBtn) buyBtn.setAttribute('href', SQUARE_GIFT_CARD_URL);
    } else {
      if (buyWrap) buyWrap.hidden = true;
      if (buyAsk) buyAsk.hidden = false;
    }
    var list = $('gc-list');
    if (list) {
      if (giftKnown === false) {
        list.innerHTML = '<p class="acct-muted">Gift cards are not available online yet.</p>';
      } else if (!giftCards.length) {
        list.innerHTML = '<p class="acct-muted">No gift cards yet. If somebody gives you one, add its code below and it will live here.</p>';
      } else {
        list.innerHTML = giftCards.map(function (g) {
          var bal = Number(g.balance_cents || 0);
          var st = bal <= 0 ? 'Used up' : 'Active';
          return '<div class="pts-voucher-card"><div><div class="pts-voucher-code">' + escX(g.code) + '</div>' +
            '<div class="acct-muted" style="text-align:left;padding:0;">Show this code at your visit and we apply it. Status: ' + st + '</div></div>' +
            '<div class="pts-voucher-value">' + fmtMoney(bal) + '</div></div>';
        }).join('');
      }
    }
    /* Until the gift-cards.sql doors exist, the add-a-code form
       hides behind the honest note — the points pattern. */
    var claimWrap = $('gc-claim-wrap'), un = $('gc-unavailable');
    if (claimWrap && un && giftKnown !== null) {
      claimWrap.hidden = giftKnown === false;
      un.hidden = giftKnown !== false;
    }
  }

  function refreshGiftCards() {
    if (!getSession()) { giftCards = []; paintGiftCards(); return Promise.resolve(); }
    return fetchGiftCards().then(function (list) {
      if (list === null) { giftKnown = false; giftCards = []; }
      else { giftKnown = true; giftCards = list; }
      paintGiftCards();
    });
  }

  function claimGiftCard(code) {
    var c = client();
    if (!c) return Promise.resolve({ ok: false, reason: 'unavailable' });
    return c.rpc('claim_gift_card', { p_code: code }).then(function (res) {
      if (res.error) throw res.error;
      var d = res.data || {};
      if (d.claimed) return { ok: true, balance: d.balance_cents };
      return { ok: false, reason: d.reason || 'error' };
    }).catch(function () { return { ok: false, reason: 'unavailable' }; });
  }

  /* One-shot wiring, guarded like every sibling on this page: a
     doubled handler here would make one tap fire the claim twice. */
  var giftWired = false;
  function wireGiftCards() {
    if (giftWired) return;
    var listEl = $('gc-list');
    if (!listEl) return;
    giftWired = true;

    /* VOUCHER_TAP_FIX_2026_11_06: gift cards answer taps exactly
       like points vouchers — delegated from the stable #gc-list
       container, because paintGiftCards repaints it with innerHTML
       (a listener on a card itself would die at the next repaint):
       a tap raises the card's show-at-the-visit state, a second
       tap puts it back, and only one card is raised at a time. */
    listEl.addEventListener('click', function (e) {
      var t = e.target;
      var card = (t && t.closest) ? t.closest('.pts-voucher-card') : null;
      if (!card || !listEl.contains(card)) return;
      var wasShown = card.classList.contains('pts-voucher-card--show');
      var shown = listEl.querySelectorAll('.pts-voucher-card--show');
      for (var gi = 0; gi < shown.length; gi++) shown[gi].classList.remove('pts-voucher-card--show');
      if (!wasShown) card.classList.add('pts-voucher-card--show');
    });

    var rewardsItem = document.querySelector('[data-acct-menu="rewards"]');
    if (rewardsItem) rewardsItem.addEventListener('click', function () { refreshGiftCards(); });
    var openBtn = $('account-open-btn');
    if (openBtn) openBtn.addEventListener('click', function () { if (getSession()) refreshGiftCards(); });
    var acctPage = $('account');
    if (acctPage && window.MutationObserver) {
      var mo = new MutationObserver(function () {
        if (acctPage.classList.contains('active') && getSession()) refreshGiftCards();
      });
      mo.observe(acctPage, { attributes: true, attributeFilter: ['class'] });
    }

    var btn = $('gc-claim-btn');
    if (btn) btn.addEventListener('click', function () {
      var input = $('gc-claim-input');
      var err = $('gc-claim-error'), ok = $('gc-claim-success');
      if (err) err.hidden = true;
      if (ok) ok.hidden = true;
      var code = input ? String(input.value || '').trim().toUpperCase() : '';
      if (!code) {
        if (err) { err.textContent = 'Enter the gift card code first.'; err.hidden = false; }
        return;
      }
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding&hellip;';
      claimGiftCard(code).then(function (res) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-gift"></i> Add gift card';
        if (res.ok) {
          if (ok) {
            ok.hidden = false;
            ok.innerHTML = '<strong>Gift card added — ' + fmtMoney(res.balance) + ' is on your account.</strong><br>Show the code at your visit and we will apply it.';
          }
          if (input) input.value = '';
          refreshGiftCards();
        } else if (res.reason === 'unavailable') {
          giftKnown = false;
          paintGiftCards();
        } else if (res.reason === 'already_yours') {
          if (ok) { ok.hidden = false; ok.textContent = 'That gift card is already on your account — it is in the list above.'; }
        } else {
          var msgs = {
            not_found: 'We could not find that code. Check it and try again — nothing was changed.',
            already_claimed: 'That code has already been added to an account. If it was a gift meant for you, text us at ' + PHONE_TEXT + ' and we will sort it out.',
            used_up: 'That gift card has no balance left on it.',
            void: 'That gift card is no longer valid. Text us at ' + PHONE_TEXT + ' if you think that is wrong.',
            no_account: 'Your account is not fully set up yet. Sign out and back in once, then try again.',
            not_signed_in: 'Please sign in first.'
          };
          if (err) { err.textContent = msgs[res.reason] || 'That did not go through — please try again. Nothing was changed.'; err.hidden = false; }
        }
      });
    });

    paintGiftCards();
    if (getSession()) refreshGiftCards();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireGiftCards);
  } else {
    wireGiftCards();
  }
})();

/* ================= SERVICES_SINGLE_DOOR_2026_11_09 =================
   The Services flow (owner, Nov 9, 2026): Services is the single
   door. At the top of #whatwedo the customer picks Repair or
   One-on-One, descends device -> brand -> model -> service, and sees
   the free estimate on the spot; Continue hands off to the booking
   form with the picks pre-applied (the form itself is untouched —
   this module drives its real controls, the same pattern the site
   search uses). Prices come only from window.ATR_PRICE_DATA through
   window.atrBkShared — the same book the wizard reads; nothing is
   forked. Switching paths never traps: the repair grid ends with the
   One-on-One tile and the topic grid ends with the repair escape
   tile, exactly like the form. */
(function () {
  'use strict';
  function arm() { try { init(); } catch (e) {} }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm);
  else arm();

  function init() {
    if (!document.getElementById('svc-flow')) return;
    var shared = window.atrBkShared;
    var DATA = window.ATR_PRICE_DATA;
    if (!shared || !DATA) return;

    /* The One-on-One topics, mirroring the booking form's
       #bk-service-grid exactly — same canonical kinds, same icons,
       same device lists (Computer clean-up is Computer only).
       SERVICES_FLOW_V58_2026_11_09: Printer setup, Peripheral &
       accessory setup, and Router & mesh setup joined for the two
       new device types, in the same grid order as the form. */
    var TOPICS = [
      ['Set up a new device', 'fas fa-box-open', 'Phone, Tablet, Computer, Game Console, Smart Watch, Printers & Peripherals, Networking, Business / Other'],
      ['Learn my phone, computer, or tablet', 'fas fa-graduation-cap', 'Phone, Tablet, Computer'],
      ['Wi-Fi or internet help', 'fas fa-wifi', 'Phone, Tablet, Computer, Game Console, Smart Watch, Printers & Peripherals, Networking, Business / Other'],
      ['Router & mesh setup', 'fas fa-network-wired', 'Networking'],
      ['Printer or accessories', 'fas fa-print', 'Phone, Tablet, Computer, Printers & Peripherals, Business / Other'],
      ['Printer setup', 'fas fa-print', 'Printers & Peripherals'],
      ['Peripheral & accessory setup', 'fas fa-keyboard', 'Printers & Peripherals'],
      ['Move my stuff to a new device', 'fas fa-right-left', 'Phone, Tablet, Computer'],
      ['Computer clean-up', 'fas fa-broom', 'Computer'],
      ['Something else', 'fas fa-circle-question', 'Phone, Tablet, Computer, Game Console, Smart Watch, Printers & Peripherals, Networking, Business / Other'],
      ['Not sure yet', 'fas fa-clipboard-question', 'Phone, Tablet, Computer, Game Console, Smart Watch, Printers & Peripherals, Networking, Business / Other']
    ];
    var FEE_NOTE = 'A separate visit fee applies to the visit \u2014 $15 when the repair is already known, or $35 if your device needs diagnostics first \u2014 due at booking and non-refundable. Estimates are always free. ATR One members pay no visit fee for devices covered under their subscription.';
    /* COMPUTER_YEAR_2026_11_10 (owner, Nov 10, 2026): the same
       year list the booking form uses (BK_YEARS there) — computers
       in the repair pane pick a year after the model. */
    var SVC_YEARS = ['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016', '2015', 'Not sure'];

    function $(id) { return document.getElementById(id); }
    function esc(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    /* Same range rule as the wizard's rfParseRange: only a bare price
       or price range counts as a figure. */
    function parseRange(txt) {
      if (!txt) return null;
      var s = String(txt);
      if (!/^[\s$,.\d\u2013\u2014-]+$/.test(s)) return null;
      var nums = s.replace(/[$,]/g, '').match(/\d+(?:\.\d+)?/g);
      if (!nums || !nums.length) return null;
      var lo = parseFloat(nums[0]);
      var hi = nums.length > 1 ? parseFloat(nums[nums.length - 1]) : lo;
      return { lo: lo, hi: hi };
    }
    function combinedText(t) { return t.lo === t.hi ? shared.fmt(t.lo) : shared.fmt(t.lo) + ' \u2013 ' + shared.fmt(t.hi); }

    function newState() {
      return { device: '', brandKey: '', brandLabel: '', modelKey: '', modelLabel: '', modelState: 'pending', picks: [], kind: '', hours: 0, year: '', place: '' };
    }

    /* ---------------- pane scaffolding ----------------
       A pane is one path's stack: device grid, brand select, model
       select, then its own grid (repairs or topics). The cascade
       setters are callable so path switches and the site search can
       drive a pane to a pick programmatically. */
    function makePane(prefix, kind) {
      return {
        prefix: prefix, kind: kind, state: newState(),
        devGrid: $(prefix + '-dev-grid'),
        brandWrap: $(prefix + '-brand-wrap'), brandSel: $(prefix + '-brand-select'),
        modelWrap: $(prefix + '-model-wrap'), modelSel: $(prefix + '-model-select'),
        yearWrap: $(prefix + '-year-wrap'), yearSel: $(prefix + '-year-select'),
        gridWrap: $(prefix + '-grid-wrap'), grid: $(prefix + '-grid')
      };
    }
    var repairPane = makePane('svc', 'repair');
    var ooPane = makePane('svc-oo', 'oneonone');
    var currentPath = '';

    function fillSelect(sel, pairs, placeholder) {
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
    function isPicker(pane) { return !!DATA[shared.typeKey(pane.state.device)]; }
    function modelOk(pane) {
      var ms = pane.state.modelState;
      return ms === 'chosen' || ms === 'notlisted' || ms === 'na';
    }

    function paneSetDevice(pane, device) {
      var st = pane.state;
      st.device = device; st.brandKey = ''; st.brandLabel = '';
      st.modelKey = ''; st.modelLabel = ''; st.modelState = 'pending';
      st.picks = []; st.kind = ''; st.hours = 0; st.year = '';
      pane.devGrid.querySelectorAll('[data-svc-device]').forEach(function (b) {
        b.classList.toggle('selected', b.getAttribute('data-svc-device') === device);
      });
      if (isPicker(pane)) {
        var typeKey = shared.typeKey(device);
        fillSelect(pane.brandSel,
          Object.keys(DATA[typeKey]).map(function (k) { return [k, k]; }).concat([['__other__', 'Other make']]),
          'Choose your make\u2026');
      } else {
        var fb = shared.fallback[device] || { brands: ['Other'] };
        fillSelect(pane.brandSel, fb.brands.map(function (b) { return [b, b]; }), 'Choose your make\u2026');
      }
      pane.brandWrap.hidden = false;
      pane.modelWrap.hidden = true;
      if (pane.yearWrap) pane.yearWrap.hidden = true;
      pane.gridWrap.hidden = true;
      svcFollow(pane.brandWrap);
      if (pane.kind === 'oneonone') renderOoSummary();
      gate(pane);
    }

    function paneSetBrand(pane, brandKey) {
      var st = pane.state;
      if (!brandKey) return;
      st.brandKey = brandKey;
      st.brandLabel = brandKey === '__other__' ? 'Other' : brandKey;
      st.modelKey = ''; st.modelLabel = ''; st.modelState = 'pending';
      st.picks = []; st.kind = ''; st.year = '';
      pane.brandSel.value = brandKey;
      if (isPicker(pane)) {
        var names = brandKey === '__other__' ? [] : Object.keys(DATA[shared.typeKey(st.device)][brandKey]);
        fillSelect(pane.modelSel,
          names.map(function (k) { return [k, k]; }).concat([['__notlisted__', "My model isn't listed"]]),
          'Choose your model\u2026');
        pane.modelWrap.hidden = false;
        if (pane.yearWrap) pane.yearWrap.hidden = true;
        pane.gridWrap.hidden = true;
        svcFollow(pane.modelWrap);
      } else {
        st.modelState = 'na';
        pane.modelWrap.hidden = true;
        renderGrid(pane);
      }
      if (pane.kind === 'oneonone') renderOoSummary();
      gate(pane);
    }

    function paneSetModel(pane, modelKey) {
      var st = pane.state;
      if (!modelKey) return;
      st.modelKey = modelKey;
      st.modelLabel = modelKey === '__notlisted__' ? '' : modelKey;
      st.modelState = modelKey === '__notlisted__' ? 'notlisted' : 'chosen';
      st.picks = []; st.kind = ''; st.year = '';
      pane.modelSel.value = modelKey;
      /* COMPUTER_YEAR_2026_11_10 (owner, Nov 10, 2026): a computer
         in the repair pane takes a year pick after the model —
         the service grid waits for it, and the reveal follows the
         guest like every other step. One-on-One has no year step
         (lessons order no parts). */
      if (pane.kind === 'repair' && st.device === 'Computer' && pane.yearSel) {
        fillSelect(pane.yearSel, SVC_YEARS.map(function (y) { return [y, y]; }), 'Choose the year\u2026');
        pane.yearWrap.hidden = false;
        pane.gridWrap.hidden = true;
        svcFollow(pane.yearWrap);
      } else {
        renderGrid(pane);
      }
      if (pane.kind === 'oneonone') renderOoSummary();
      gate(pane);
    }

    function paneSetYear(pane, year) {
      var st = pane.state;
      st.year = year || '';
      if (st.year) renderGrid(pane);
      gate(pane);
    }

    function wirePane(pane) {
      pane.devGrid.querySelectorAll('[data-svc-device]').forEach(function (btn) {
        btn.addEventListener('click', function () { paneSetDevice(pane, btn.getAttribute('data-svc-device')); });
      });
      pane.brandSel.addEventListener('change', function () { paneSetBrand(pane, pane.brandSel.value); });
      pane.modelSel.addEventListener('change', function () { paneSetModel(pane, pane.modelSel.value); });
      if (pane.yearSel) pane.yearSel.addEventListener('change', function () { paneSetYear(pane, pane.yearSel.value); });
    }

    /* ---------------- tiles ---------------- */
    function tileShell(inner) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'option-btn';
      b.style.padding = '0.85rem 0.5rem';
      b.style.alignItems = 'flex-start';
      b.style.textAlign = 'left';
      b.innerHTML = inner;
      return b;
    }
    function subSpan(text) {
      return '<span style="font-size:0.78rem; color: var(--brand-deep); font-weight:800;">' + esc(text) + '</span>';
    }
    function doorTile(iconCls, label, sub) {
      return tileShell('<i class="' + iconCls + '"></i><strong>' + esc(label) + '</strong>' + subSpan(sub));
    }

    function togglePick(pane, pick, btn) {
      var st = pane.state;
      var found = -1;
      st.picks.forEach(function (p, i) { if (p.name === pick.name) found = i; });
      if (found >= 0) { st.picks.splice(found, 1); btn.classList.remove('selected'); }
      else { st.picks.push(pick); btn.classList.add('selected'); }
      updateEstimate();
      gate(pane);
    }

    function genericRepairs(typeKey) {
      var seen = {};
      Object.keys(DATA[typeKey]).forEach(function (br) {
        Object.keys(DATA[typeKey][br]).forEach(function (mo) {
          Object.keys(DATA[typeKey][br][mo]).forEach(function (r) { seen[r] = true; });
        });
      });
      return shared.order.filter(function (r) { return seen[r]; });
    }

    function renderGrid(pane) {
      if (pane.kind === 'oneonone') { renderTopics(pane); return; }
      var st = pane.state;
      var grid = pane.grid;
      grid.innerHTML = '';
      if (isPicker(pane)) {
        var typeKey = shared.typeKey(st.device);
        /* V127_IPAD_STARTING_AT_2026_11_12: iPad prices read as estimates —
           same rule as the booking-flow tiles (renderBkRepairs). */
        var isIpad = (typeKey === 'Tablet' && st.brandKey === 'Apple');
        var repairs, priceOf;
        if (st.brandKey !== '__other__' && st.modelKey !== '__notlisted__') {
          repairs = Object.keys(DATA[typeKey][st.brandKey][st.modelKey]);
          priceOf = function (r) { return DATA[typeKey][st.brandKey][st.modelKey][r]; };
        } else {
          repairs = genericRepairs(typeKey);
          priceOf = function () { return null; };
        }
        repairs.forEach(function (r) {
          (function (r) {
            var price = priceOf(r);
            var label = shared.friendly[r] || r;
            var b = tileShell(shared.iconHtml(r) + '<strong>' + esc(label) + '</strong>' +
              subSpan(typeof price === 'number' ? (isIpad ? 'Starting at ' + shared.fmt(price) : shared.fmt(price)) : 'Price confirmed up front'));
            b.setAttribute('data-raw', r);
            b.addEventListener('click', function () {
              togglePick(pane, { name: label, price: typeof price === 'number' ? price : null, priceRange: null }, b);
            });
            grid.appendChild(b);
          })(r);
        });
      } else {
        var fb = shared.fallback[st.device] || { issues: [] };
        fb.issues.forEach(function (issue) {
          var b = tileShell(shared.iconForName(issue.name) + '<strong>' + esc(issue.name) + '</strong>' + subSpan(issue.price));
          b.setAttribute('data-raw', issue.name);
          b.addEventListener('click', function () {
            togglePick(pane, { name: issue.name, price: null, priceRange: issue.price }, b);
          });
          grid.appendChild(b);
        });
      }
      /* The catch-all renders for every device, and the One-on-One
         tile closes the grid — same as the booking form. */
      var se = tileShell(shared.iconHtml('Something else') + '<strong>Something else</strong>' + subSpan('Price confirmed up front'));
      se.setAttribute('data-svc-something-else', '1');
      se.addEventListener('click', function () {
        togglePick(pane, { name: 'Something else', price: null, priceRange: null }, se);
      });
      grid.appendChild(se);
      var oo = doorTile('fas fa-graduation-cap', 'One-on-One', 'Lessons & help on this device \u2014 $25 an hour');
      oo.setAttribute('data-svc-oo-door', '1');
      oo.addEventListener('click', function () { switchPath('oneonone'); });
      grid.appendChild(oo);
      pane.gridWrap.hidden = false;
      updateEstimate();
      gate(pane);
      svcFollow(pane.gridWrap);
    }

    function learnLabel(pane) {
      var st = pane.state;
      var word = { Phone: 'phone', Tablet: 'tablet', Computer: 'computer' }[st.device] || '';
      if (st.modelLabel) return 'Learn my ' + st.modelLabel;
      return word ? ('Learn my ' + word) : 'Learn my phone, computer, or tablet';
    }

    function renderTopics(pane) {
      var st = pane.state;
      var grid = pane.grid;
      grid.innerHTML = '';
      TOPICS.forEach(function (t) {
        var kind = t[0], icon = t[1], devices = t[2];
        if (st.device && devices.split(',').map(function (s) { return s.trim(); }).indexOf(st.device) < 0) return;
        var label = kind === 'Learn my phone, computer, or tablet' ? learnLabel(pane) : kind;
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'option-btn';
        b.setAttribute('data-svc-kind', kind);
        b.innerHTML = '<i class="' + icon + '"></i> ' + esc(label);
        if (st.kind === kind) b.classList.add('selected');
        b.addEventListener('click', function () {
          st.kind = kind;
          grid.querySelectorAll('[data-svc-kind]').forEach(function (x) { x.classList.remove('selected'); });
          b.classList.add('selected');
          renderOoSummary();
          gate(pane);
        });
        grid.appendChild(b);
      });
      /* The way back to repairs closes the grid — never trapped. */
      var escTile = document.createElement('button');
      escTile.type = 'button';
      escTile.className = 'option-btn';
      escTile.setAttribute('data-svc-repair-door', '1');
      escTile.innerHTML = '<i class="fas fa-wrench"></i> Not a lesson \u2014 I need a repair instead';
      escTile.addEventListener('click', function () { switchPath('repair'); });
      grid.appendChild(escTile);
      pane.gridWrap.hidden = false;
      gate(pane);
      svcFollow(pane.gridWrap);
    }

    /* ---------------- estimate + summary ---------------- */
    function estimateTotals(picks) {
      var lo = 0, hi = 0, any = false, unpriced = 0;
      picks.forEach(function (it) {
        if (typeof it.price === 'number') { lo += it.price; hi += it.price; any = true; return; }
        var r = parseRange(it.priceRange);
        if (r) { lo += r.lo; hi += r.hi; any = true; } else { unpriced++; }
      });
      return { any: any, unpriced: unpriced, lo: lo, hi: hi };
    }

    function updateEstimate() {
      var st = repairPane.state;
      var box = $('svc-estimate'), amt = $('svc-est-price'), note = $('svc-est-note');
      var disc = $('svc-est-disclaimer');
      if (!box) return;
      if (!st.picks.length) { box.hidden = true; if (disc) disc.hidden = true; return; }
      var modelLabel = st.modelLabel || ((st.brandLabel && st.brandLabel !== 'Other') ? st.brandLabel : st.device);
      var allIssues = st.picks.map(function (i) { return i.name; }).join(', ');
      var t = estimateTotals(st.picks);
      if (t.any && t.unpriced === 0) {
        amt.textContent = combinedText(t);
        note.innerHTML = esc(allIssues) + ' for ' + esc(modelLabel) + ' &mdash; ' +
          (st.picks.length > 1 ? 'estimated total for the repairs you picked' : 'estimated price') +
          ', parts and labor included. ' + FEE_NOTE;
      } else if (t.any) {
        var pricedNames = [], unpricedNames = [];
        st.picks.forEach(function (it) {
          if (typeof it.price === 'number' || parseRange(it.priceRange)) pricedNames.push(it.name); else unpricedNames.push(it.name);
        });
        var partial = combinedText(t);
        amt.textContent = 'From ' + partial;
        note.innerHTML = esc(pricedNames.join(', ')) + ' for ' + esc(modelLabel) + ' &mdash; estimated from ' + esc(partial) +
          ', parts and labor included. ' + esc(unpricedNames.join(', ')) + ' ' + (unpricedNames.length > 1 ? 'do' : 'does') +
          ' not have a set price yet &mdash; we confirm the exact price after diagnostics, before any work starts. ' + FEE_NOTE;
      } else {
        amt.textContent = 'Confirmed after diagnostics';
        note.innerHTML = 'There is no set price for ' + esc(allIssues.toLowerCase()) + ' on the ' + esc(modelLabel) +
          ' yet. Book the visit and we confirm your exact price after diagnostics, before any work starts. The visit fee covers the trip &mdash; $15 when the repair is already known, or $35 if your device needs diagnostics first &mdash; due at booking, non-refundable. Estimates are always free. ATR One members pay no visit fee for devices covered under their subscription.';
      }
      box.hidden = false;
      if (disc) disc.hidden = false;
    }

    /* Mirrors the form's ooRender: time priced pure at $25/hr, the
       $15 visit fee its own line, the total their sum. */
    function renderOoSummary() {
      var st = ooPane.state;
      var h = st.hours || 0;
      var time = h * 25;
      var priceEl = $('svc-oo-price');
      if (priceEl) priceEl.textContent = h ? ('$' + time) : 'Pick a time';
      var lines = $('svc-oo-lines');
      if (lines) {
        lines.innerHTML =
          (st.kind ? (esc(st.kind) + ' for your ' + esc([st.brandLabel, st.modelLabel].filter(Boolean).join(' ') || st.device || 'device') + '<br>') : '') +
          /* VIRTUAL_ONE_ON_ONE_2026_11_10: same fee story as the
             form — virtual has no visit fee (owner ruling). */
          (st.place === 'virtual'
            ? 'Virtual \u2014 we meet on your screen, no trip<br>' +
              'One-on-one time $25 per hour' + (h ? (' \u2014 ' + h + (h === 1 ? ' hour' : ' hours') + ' $' + time) : '') + '<br>' +
              (h ? ('<strong>Total $' + time + ' \u2014 the first hour ($25) is paid when you book</strong><br>') : '') +
              'If your session runs longer, the extra time is charged to your card on file at $25 an hour.<br>' +
              'ATR One members: your member key makes virtual sessions free.'
            : 'One-on-one time $25 per hour' + (h ? (' \u2014 ' + h + (h === 1 ? ' hour' : ' hours') + ' $' + time) : '') + '<br>' +
              'Visit fee $15<br>' +
              (h ? ('<strong>Total $' + (15 + time) + ' \u2014 the $' + time + ' time plus the $15 visit fee</strong><br>') : '') +
              'If your session runs longer, the extra time is settled at the visit at $25 an hour.<br>' +
              'ATR One Plus (paid) members pay no visit fee on covered devices.');
      }
    }

    function gate(pane) {
      var st = pane.state;
      var btn = pane.kind === 'oneonone' ? $('svc-oo-continue') : $('svc-continue');
      if (!btn) return;
      var ready = pane.kind === 'oneonone'
        ? !!(st.device && st.brandKey && modelOk(pane) && st.kind && st.hours && st.place)
        : !!(st.device && st.brandKey && modelOk(pane) && (st.device !== 'Computer' || st.year) && st.picks.length);
      btn.disabled = !ready;
    }


    /* WIZARD_SCROLL_FOLLOW_2026_11_10: advancing a step brings the
       new step to the guest. Before this, the pane setters unhid the
       next wrap and never scrolled, so on a phone the brand, model,
       and service steps rendered below the fold and the guest had to
       hunt for them (owner, Nov 10, 2026). One funnel: every reveal
       scrolls its wrap to just under the sticky header — the wraps
       carry scroll-margin-top in styles.css, the same offset idea
       the site's anchor targets already use. If the wrap already
       sits in the presented band under the header, the guest is
       left where they are. Reduced motion gets an instant jump —
       the codebase's own matchMedia pattern. */
    function svcFollow(el) {
      if (!el || el.hidden) return;
      var r = el.getBoundingClientRect();
      var hdr = document.querySelector('.header');
      var hb = hdr ? hdr.getBoundingClientRect().bottom : 0;
      if (r.top >= hb && r.top <= hb + 160) return;
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      try { el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); } catch (e) {}
    }

    /* ---------------- path switching ---------------- */
    function switchPath(p) {
      currentPath = p;
      var toRepair = p === 'repair';
      $('svc-pane-repair').hidden = !toRepair;
      $('svc-pane-oo').hidden = toRepair;
      document.querySelectorAll('[data-svc-path]').forEach(function (b) {
        b.classList.toggle('selected', b.getAttribute('data-svc-path') === p);
      });
      /* Carry the device / brand / model picks across, so switching
         doors never makes the customer start over. */
      var src = toRepair ? ooPane : repairPane;
      var dst = toRepair ? repairPane : ooPane;
      if (src.state.device && dst.state.device !== src.state.device) {
        paneSetDevice(dst, src.state.device);
        if (src.state.brandKey) {
          paneSetBrand(dst, src.state.brandKey);
          if (src.state.modelKey && isPicker(dst)) paneSetModel(dst, src.state.modelKey);
        }
      }
      var flow = $('svc-flow');
      if (flow) svcFollow(flow);
    }

    document.querySelectorAll('[data-svc-path]').forEach(function (btn) {
      btn.addEventListener('click', function () { switchPath(btn.getAttribute('data-svc-path')); });
    });
    document.querySelectorAll('[data-svc-hours]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        ooPane.state.hours = parseInt(btn.getAttribute('data-svc-hours'), 10) || 0;
        document.querySelectorAll('[data-svc-hours]').forEach(function (b) { b.classList.remove('selected'); });
        btn.classList.add('selected');
        renderOoSummary();
        gate(ooPane);
      });
    });
    /* VIRTUAL_ONE_ON_ONE_2026_11_10: the pane's How will we meet?
       tiles — one pick, asked first (before the device), driven
       into the form on Continue. */
    document.querySelectorAll('[data-svc-oo-place]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        ooPane.state.place = btn.getAttribute('data-svc-oo-place') || '';
        document.querySelectorAll('[data-svc-oo-place]').forEach(function (b) { b.classList.remove('selected'); });
        btn.classList.add('selected');
        renderOoSummary();
        gate(ooPane);
      });
    });
    wirePane(repairPane);
    wirePane(ooPane);

    /* ---------------- handoff to the booking form ----------------
       The form's own machinery is driven through its real controls —
       the device tile click, the brand/model selects (change events),
       and the repair tile clicks — so repairState, the estimate, and
       the intake carry exactly as if the customer had picked there. */
    function goToPageNav(pageId) {
      var a = document.createElement('a');
      a.setAttribute('href', '#' + pageId);
      a.setAttribute('data-page', pageId);
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    function clickFormDevice(device) {
      var b = document.querySelector('#repair [data-device="' + device + '"]');
      if (b) b.click();
      return !!b;
    }
    function setFormSelect(id, value) {
      var sel = $(id);
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
    function driveFormPicker(pane) {
      clickFormDevice(pane.state.device);
      setFormSelect('bk-brand-select', pane.state.brandKey);
      if (isPicker(pane)) setFormSelect('bk-model-select', pane.state.modelKey);
      /* COMPUTER_YEAR_2026_11_10: the pane's year pick drives the
         form's year select the same way, so the form renders its
         service tiles and the year lands in repairState. */
      if (pane.state.year) setFormSelect('bk-year-select', pane.state.year);
    }

    $('svc-continue').addEventListener('click', function () {
      var pane = repairPane, st = pane.state;
      goToPageNav('repair');
      driveFormPicker(pane);
      if (isPicker(pane)) {
        st.picks.forEach(function (pick) {
          if (pick.name === 'Something else') {
            var se = document.querySelector('#bk-repair-grid [data-bk-something-else]');
            if (se) se.click();
            return;
          }
          var tiles = document.querySelectorAll('#bk-repair-grid .option-btn');
          for (var i = 0; i < tiles.length; i++) {
            var strong = tiles[i].querySelector('strong');
            if (strong && strong.textContent === pick.name) { tiles[i].click(); break; }
          }
        });
      } else {
        st.picks.forEach(function (pick) {
          if (pick.name === 'Something else') {
            var sef = document.querySelector('#issue-list [data-bk-something-else]');
            if (sef) sef.click();
            return;
          }
          var btns = document.querySelectorAll('#issue-list .option-btn');
          for (var i = 0; i < btns.length; i++) {
            var strong = btns[i].querySelector('strong');
            if (strong && strong.textContent === pick.name) { btns[i].click(); break; }
          }
        });
      }
      var card = document.querySelector('.repair-card');
      if (card) { try { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
    });

    /* This Continue carries data-open-oneonone in the markup, so the
       form's own entry-point listener raises its One-on-One flag on
       this very click; the drive is deferred one tick so the flag
       lands before the device pick moves the form to step 2. */
    $('svc-oo-continue').addEventListener('click', function () {
      var pane = ooPane, st = pane.state;
      setTimeout(function () {
        goToPageNav('repair');
        driveFormPicker(pane);
        var kindBtn = document.querySelector('[data-service-kind="' + st.kind + '"]');
        if (kindBtn) kindBtn.click();
        var hrBtn = document.querySelector('[data-oo-hours="' + st.hours + '"]');
        if (hrBtn) hrBtn.click();
        /* VIRTUAL_ONE_ON_ONE_2026_11_10: the place pick rides the
           same handoff — the form's own tile gets the click, so the
           form's state, gate, and summary all move together. */
        if (st.place) {
          var plBtn = document.querySelector('[data-oo-place="' + st.place + '"]');
          if (plBtn) plBtn.click();
        }
        var card = document.querySelector('.repair-card');
        if (card) { try { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
      }, 0);
    });

    /* Site search hook: a repair result opens this flow already
       descended to the searched pick (see openRepairResult in the
       search module). */
    window.atrSvcOpenRepair = function (sel) {
      var device = sel.type === 'Smartwatch' ? 'Smart Watch' : sel.type;
      switchPath('repair');
      paneSetDevice(repairPane, device);
      if (sel.brand) {
        paneSetBrand(repairPane, sel.brand);
        if (sel.model) paneSetModel(repairPane, sel.model);
      }
      if (sel.repair) {
        var tiles = repairPane.grid.querySelectorAll('.option-btn');
        for (var i = 0; i < tiles.length; i++) {
          if (tiles[i].getAttribute('data-raw') === sel.repair) { tiles[i].click(); break; }
        }
      }
      /* SEARCH_INTO_FLOW_2026_11_11 (owner, Nov 11, 2026): a search
         pick is a COMPLETE pick — the guest already chose the
         device, the make, the model, and the repair in search, so
         the flow must not stop on the Services pane and must not
         ask make and model again in the form. When the pane's gate
         says the pick is complete, run the pane's own Continue
         handoff (the same code the guest's tap runs), then, on the
         form's model & service step, scroll past the answered
         pickers to the one question still open — ATR One coverage
         (the optional notes box rides right above it). An
         incomplete pick (a computer still needs its year) stays
         on the pane, exactly as a hand-made pick does. */
      var cont = document.getElementById('svc-continue');
      if (cont && !cont.disabled) {
        cont.click();
        setTimeout(function () {
          var wrap = document.getElementById('bk-atrone-wrap');
          if (wrap && !wrap.hidden) {
            try { wrap.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
          }
        }, 500);
      }
    };
  }
})();

/* ==================== PW_EYE_2026_11_10 ====================
   A show/hide eye on every password field on the website (owner,
   Nov 10, 2026 — he hit a sign-in failure and could not see what
   he had typed). The same toggle the Associate Hub has had since
   Nov 3, 2026, same classes, same behavior: one delegated handler
   flips only its own field between password and text, swaps the
   eye and the plain-words label ('Show password' / 'Hide
   password'), and hands focus back to the field. The button is
   type="button" in the markup — it never submits the form, and
   flipping the type never touches the typed value. */
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest ? e.target.closest('[data-pw-eye]') : null;
  if (!b) return;
  var wrap = b.closest ? b.closest('.pw-wrap') : null;
  var input = wrap ? wrap.querySelector('input') : null;
  if (!input) return;
  var show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  b.innerHTML = '<i class="fas ' + (show ? 'fa-eye-slash' : 'fa-eye') + '"></i>';
  b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  try { input.focus(); } catch (err) {}
});

/* =====================================================================
   VIRTUAL_ONE_ON_ONE_2026_11_10 — the Virtual One-on-One page gate.

   The page (section#virtual-oneonone) is the front door only: a
   consent box, one code box, and the virtual-session Edge Function
   behind it. The function is the only door — this page never reads
   the sessions table, and a member key is never computed here.

   Flow: the consent check enables the code box. "Check my code"
   sends the code to the function (with the guest's sign-in token
   when they have one, so a member key can be matched to their own
   account). A good answer shows the checked-in steps and the
   PHASE2_HANDOFF block, where the phase-2 RustDesk session will
   open from our own relay. A no shows the function's plain reason
   word for word; when the reason is "no path" the page also offers
   the two ways in (book a One-on-One, or join ATR One). Signed-in
   members get their own key shown on the page (action 'mykey').

   Everything here fails quiet: if the function is not deployed yet
   or the network drops, the guest gets one plain line and the phone
   number — never a spinner forever, never a fake session.
   ===================================================================== */
(function () {
  var SUPABASE_URL = 'https://lyujxpuicarblpkdzuuc.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5dWp4cHVpY2FyYmxwa2R6dXVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNjAxMjQsImV4cCI6MjEwNzczNjEyNH0.io4qD7pw878Xx97yoS6xzclO33aa4QYKENpwIyZ06xg';
  /* Waiver version, shared with atr-forms.js (the booking waiver)
     and recorded with every acceptance. DRAFT wording — the version
     string changes when the owner approves final text. */
  var WAIVER_VERSION = 'v1-draft-2026-11-10';
  var lastCode = '';
  /* PAY_WALL_2026_11_11: what the last good code check brought back —
     the basis (member vs code session) and, for a code session, the
     ticket the pay wall charges. */
  var lastBasis = '';
  var lastTicket = null;
  var paywallEl = document.getElementById('voo-paywall');
  var payConsent = document.getElementById('voo-pay-consent');
  var payBtn = document.getElementById('voo-pay-btn');
  var payMsg = document.getElementById('voo-pay-msg');
  var SQUARE_CHECKOUT_URL = SUPABASE_URL + '/functions/v1/square-ticket-checkout';
  var consent = document.getElementById('voo-consent');
  var codeEl = document.getElementById('voo-code');
  var startBtn = document.getElementById('voo-start');
  var msgEl = document.getElementById('voo-msg');
  var nextEl = document.getElementById('voo-next');
  var nopathEl = document.getElementById('voo-nopath');
  var keyEl = document.getElementById('voo-member-key');
  if (!consent || !codeEl || !startBtn) return;

  function sb() {
    if (window.supabase && window.supabase.createClient) {
      return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return null;
  }

  function showMsg(text) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.hidden = !text;
  }

  function setGate() {
    var on = !!consent.checked;
    codeEl.disabled = !on;
    startBtn.disabled = !on;
    if (on) showMsg('');
  }
  consent.addEventListener('change', setGate);
  setGate();

  function bearer(cb) {
    var client = sb();
    if (!client) { cb(SUPABASE_ANON_KEY); return; }
    try {
      client.auth.getSession().then(function (res) {
        var t = res && res.data && res.data.session && res.data.session.access_token;
        cb(t || SUPABASE_ANON_KEY);
      }).catch(function () { cb(SUPABASE_ANON_KEY); });
    } catch (e) { cb(SUPABASE_ANON_KEY); }
  }

  function callFn(payload, cb) {
    bearer(function (token) {
      fetch(SUPABASE_URL + '/functions/v1/virtual-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify(payload)
      }).then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (j) { cb(j); })
        .catch(function () { cb(null); });
    });
  }

  function check() {
    var code = (codeEl.value || '').replace(/[\s-]+/g, '').toUpperCase();
    if (!code) { showMsg('Type the code your associate gave you, then check it.'); return; }
    startBtn.disabled = true;
    showMsg('Checking your code…');
    callFn({ action: 'check', code: code }, function (j) {
      startBtn.disabled = false;
      if (!j) {
        showMsg('We could not check that code just now. Call or text us at (937) 280-6243 and we will get you connected.');
        return;
      }
      if (j.ok) {
        showMsg('');
        lastCode = code;
        lastBasis = j.basis || '';
        lastTicket = (j.ticket_id && j.email) ? { id: j.ticket_id, email: j.email, name: j.name || '' } : null;
        if (nopathEl) nopathEl.hidden = true;
        if (nextEl) nextEl.hidden = false;
        /* PAY_WALL_2026_11_11: a code guest with a ticket to charge
           pays to connect BEFORE the waiver — the waiver block waits
           until the pay step is done. A member (their key is the
           basis) or a session with no ticket behind it goes straight
           to the waiver, exactly as before. */
        var wv0 = document.getElementById('voo-waiver');
        if (lastTicket) {
          if (paywallEl) paywallEl.hidden = false;
          if (wv0) wv0.hidden = true;
        } else {
          if (paywallEl) paywallEl.hidden = true;
          if (wv0) wv0.hidden = false;
        }
        /* The code is good — but the session does NOT start yet.
           WAIVER 2 of 2 (owner's consent law, Nov 10, 2026): the
           screen-sharing waiver below comes first, and the hand-off
           activates only after it is agreed and recorded (see
           wireWaiver). */
      } else {
        showMsg(j.message || 'That code did not work. Check the code and try again.');
        if (j.reason === 'no_access' && nopathEl) nopathEl.hidden = false;
      }
    });
  }
  startBtn.addEventListener('click', check);
  codeEl.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && !startBtn.disabled) { ev.preventDefault(); check(); }
  });

  /* A signed-in member's own key belongs to this line. SHOW_MY_KEY
     _2026_11_11 (owner, Nov 11, 2026): the key no longer prints in
     the open — the line carries only a "Show my key" button, the key
     is held in this closure, and it is written into the page only
     while the member has it revealed; tapping again clears it back
     out. Signed out (or no active paid membership) answers nothing
     and the line stays hidden — no error, no hint. */
  var myKey = '';
  var keyToggle = document.getElementById('voo-key-toggle');
  var keyValue = document.getElementById('voo-key-value');
  callFn({ action: 'mykey' }, function (j) {
    if (j && j.ok && j.key && keyEl) {
      myKey = String(j.key);
      keyEl.hidden = false;
    }
  });
  if (keyToggle) keyToggle.addEventListener('click', function () {
    if (!keyValue || !myKey) return;
    if (keyValue.hidden) {
      keyValue.textContent = myKey;
      keyValue.hidden = false;
      keyToggle.textContent = 'Hide my key';
    } else {
      keyValue.textContent = '';
      keyValue.hidden = true;
      keyToggle.textContent = 'Show my key';
    }
  });

  /* WAIVER 2 of 2: the screen-sharing waiver at session start.
     The screen box is required — the Start button stays disabled
     without it, and it is never pre-checked. Mic and camera are the
     guest's own separate allows (optional, off by default, and the
     session tools themselves also start with both off). Start sends
     the agreement to the function to be recorded against the
     session; only a recorded agreement reveals the connecting steps
     and the PHASE2_HANDOFF block. If the recording fails, the guest
     is told plainly and can tap again — a session never starts on
     an unrecorded waiver. */
  (function wireWaiver() {
    var wvScreen = document.getElementById('voo-wv-screen');
    var wvMic = document.getElementById('voo-wv-mic');
    var wvCamera = document.getElementById('voo-wv-camera');
    var startSessionBtn = document.getElementById('voo-session-start');
    var wvMsg = document.getElementById('voo-wv-msg');
    var wvBlock = document.getElementById('voo-waiver');
    var finalBlock = document.getElementById('voo-final');
    var tsSlot = document.getElementById('ts-voo');
    if (!wvScreen || !startSessionBtn) return;
    /* HUMAN_CHECK_2026_11_11: mount the human-check widget with
       the waiver (explicit render works while the block is still
       hidden; the Start handler re-mounts, a no-op once live). */
    if (tsSlot && window.atrTurnstile) window.atrTurnstile.mount(tsSlot);
    wvScreen.addEventListener('change', function () {
      startSessionBtn.disabled = !wvScreen.checked;
    });
    /* HUMAN_CHECK_2026_11_11 (owner, Nov 11, 2026): Start my
       session stays inert until the site's human check confirms
       a person — the same Cloudflare Turnstile widget and the
       same verify-turnstile server path the sign-in and
       booking forms already use (turnstile.js,
       window.atrTurnstile.verify; no new machinery, no new
       function). Only then does the waiver record, and the
       redirect fires exactly as before. Like the rest of the
       site this fails closed: no confirmed check, no start. */
    function recordWaiver() {
      startSessionBtn.disabled = true;
      if (wvMsg) { wvMsg.textContent = 'Saving your agreement…'; wvMsg.hidden = false; }
      callFn({
        action: 'waiver', kind: 'session', code: lastCode,
        version: WAIVER_VERSION,
        mic_allowed: !!(wvMic && wvMic.checked),
        camera_allowed: !!(wvCamera && wvCamera.checked)
      }, function (j) {
        if (j && j.ok) {
          if (wvBlock) wvBlock.hidden = true;
          /* CONNECT_REDIRECT_2026_11_11 (owner, Nov 11, 2026): the
             check is the doorway - a code that matches sends the
             guest onward to the business's ATRG Connect
             link. There is no standing ATRG Connect link anywhere on
             the page; this redirect is the only way through, and it
             fires only after the waiver above has been recorded.
             The destination below is the generic QuickSupport
             entry - https://start.teamviewer.com with NO ID
             pre-filled, per the owner's rule (Nov 11, 2026): his
             own QuickSupport ID is his alone and never appears in
             a guest-facing link. The guest opens QuickSupport
             there and reads their own QuickSupport code to the
             associate, who enters it in TeamViewer. (Before: this
             revealed the in-page #voo-final block - our own
             session front end, which connected to nothing.) */
          window.location.href = 'https://start.teamviewer.com';
        } else {
          startSessionBtn.disabled = false;
          if (wvMsg) wvMsg.textContent = 'We could not save your agreement just now. Please tap Start my session once more.';
        }
      });
    }
    startSessionBtn.addEventListener('click', function () {
      if (!wvScreen.checked) return;
      if (!tsSlot || !window.atrTurnstile) {
        if (wvMsg) { wvMsg.textContent = 'The human check could not load on this device. Please reload the page — or call or text us and we will get you connected.'; wvMsg.hidden = false; }
        return;
      }
      window.atrTurnstile.mount(tsSlot);
      var tok = window.atrTurnstile.token(tsSlot);
      if (!tok) {
        if (wvMsg) { wvMsg.textContent = 'One quick human check first — tick the box just above, then tap Start my session again.'; wvMsg.hidden = false; }
        return;
      }
      startSessionBtn.disabled = true;
      if (wvMsg) { wvMsg.textContent = 'Checking…'; wvMsg.hidden = false; }
      bearer(function (b) {
        window.atrTurnstile.verify(tok, b, function (ok) {
          window.atrTurnstile.reset(tsSlot);
          if (!ok) {
            startSessionBtn.disabled = false;
            if (wvMsg) { wvMsg.textContent = 'The human check did not pass. Please tick the box once more, then tap Start my session again.'; wvMsg.hidden = false; }
            return;
          }
          recordWaiver();
        });
      });
    });
  })();

  /* PAY_WALL_2026_11_11 wiring: the consent box arms the Pay button.
     Tapping Pay records the booking waiver against the ticket
     (fire-and-forget — the same record the booking-time pay step
     used to write), then asks square-ticket-checkout for this
     ticket's first-hour session under the guest's own sign-in; the
     function's own guard matches the booking email to the account.
     Square opens in a new tab, the pay wall steps aside, and the
     waiver below is revealed so the guest can finish connecting.
     The associate confirms the payment in Square before the session
     starts — the same trust pattern the booking step used. A
     signed-out guest is told plainly to sign in first. */
  (function wirePaywall() {
    if (!paywallEl || !payConsent || !payBtn) return;
    payConsent.addEventListener('change', function () { payBtn.disabled = !payConsent.checked; });
    payBtn.addEventListener('click', function () {
      if (!lastTicket) return;
      payBtn.disabled = true;
      if (payMsg) { payMsg.textContent = 'Opening Square…'; payMsg.hidden = false; }
      try { callFn({ action: 'waiver', kind: 'booking', ticket_id: lastTicket.id, email: lastTicket.email, version: WAIVER_VERSION }, function () {}); } catch (e) { /* best-effort record */ }
      bearer(function (token) {
        if (!token || token === SUPABASE_ANON_KEY) {
          if (payMsg) payMsg.textContent = 'To pay the $25, sign in first (or make your free account) with the same email you booked with, then tap Pay again.';
          payBtn.disabled = false;
          return;
        }
        fetch(SQUARE_CHECKOUT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'apikey': SUPABASE_ANON_KEY },
          body: JSON.stringify({ mode: 'virtual-first-hour', ticket_id: lastTicket.id, email: lastTicket.email, name: lastTicket.name })
        }).then(function (r) { return r.json().catch(function () { return null; }); })
          .then(function (j) {
            if (j && j.ok && j.url) {
              window.open(j.url, '_blank', 'noopener');
              if (payMsg) payMsg.textContent = 'Square is open in a new tab. Once the $25 is paid, agree to the waiver below and start your session.';
              paywallEl.hidden = true;
              var wv = document.getElementById('voo-waiver');
              if (wv) { wv.hidden = false; try { wv.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }
            } else {
              if (payMsg) payMsg.textContent = (j && j.error) ? j.error : 'The payment step is not connected yet. Tell your associate — they will get you connected.';
              payBtn.disabled = false;
            }
          })
          .catch(function () {
            if (payMsg) payMsg.textContent = 'The payment step is not connected yet. Tell your associate — they will get you connected.';
            payBtn.disabled = false;
          });
      });
    });
  })();

  /* The End control (owner's guest-side rule, Nov 10, 2026): our
     own button in our own page. It resets the whole gate — code
     cleared, waivers and consent unchecked, checked-in blocks
     hidden — and says plainly that nothing is connected.
     PHASE2: the engine teardown hooks in here, so ending from the
     page also closes the RustDesk session. */
  var endBtn = document.getElementById('voo-end');
  if (endBtn) {
    endBtn.addEventListener('click', function () {
      /* PHASE2_HANDOFF_TEARDOWN: close the engine session here. */
      if (nextEl) nextEl.hidden = true;
      var fin = document.getElementById('voo-final');
      if (fin) fin.hidden = true;
      var wv = document.getElementById('voo-waiver');
      if (wv) wv.hidden = false;
      /* PAY_WALL_2026_11_11: the pay wall resets with everything
         else — hidden, consent cleared, button disarmed. */
      lastTicket = null;
      lastBasis = '';
      if (paywallEl) paywallEl.hidden = true;
      if (payConsent) payConsent.checked = false;
      if (payBtn) payBtn.disabled = true;
      if (payMsg) { payMsg.textContent = ''; payMsg.hidden = true; }
      ['voo-wv-screen', 'voo-wv-mic', 'voo-wv-camera'].forEach(function (id) {
        var box = document.getElementById(id);
        if (box) box.checked = false;
      });
      var ssb = document.getElementById('voo-session-start');
      if (ssb) ssb.disabled = true;
      codeEl.value = '';
      lastCode = '';
      consent.checked = false;
      setGate();
      showMsg('You have ended the session. Nothing is connected.');
    });
  }

  window.atrVirtual = { check: check };
})();
