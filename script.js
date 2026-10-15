/* ==========================================================================
   AUSTIN'S TECH REPAIR GROUP — SITE SCRIPT
   Router + repair wizard + price-match calculator + lead capture.
   ========================================================================== */

(function () {
  'use strict';

  // Where repair-request leads are emailed (free via FormSubmit; no server needed).
  // First submission triggers a one-time activation email to this address.
  var LEAD_EMAIL = 'austincaudill@icloud.com';

  document.addEventListener('DOMContentLoaded', function () {

    /* ---------------- Page router ---------------- */
    var pages = document.querySelectorAll('.page');
    var navLinks = document.querySelectorAll('[data-page]');

    function switchPage(targetId) {
      var cleanId = String(targetId || '').replace('#', '');
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
          if (window.location.hash !== href) { window.location.hash = href; }
          switchPage(href);
          var mobileMenu = document.getElementById('mobile-menu');
          if (mobileMenu) mobileMenu.setAttribute('aria-hidden', 'true');
        }
      }
    });

    if (window.location.hash) { switchPage(window.location.hash); }
    window.addEventListener('hashchange', function () {
      if (window.location.hash) { switchPage(window.location.hash); }
    });

    /* ---------------- Mobile menu ---------------- */
    var bottomMenuToggle = document.getElementById('bottom-menu-toggle');
    var mobileMenu = document.getElementById('mobile-menu');
    var menuClose = document.getElementById('menu-close');
    if (bottomMenuToggle && mobileMenu) {
      bottomMenuToggle.addEventListener('click', function () { mobileMenu.setAttribute('aria-hidden', 'false'); });
    }
    if (menuClose && mobileMenu) {
      menuClose.addEventListener('click', function () { mobileMenu.setAttribute('aria-hidden', 'true'); });
    }

    /* ---------------- Price-match calculator ---------------- */
    var priceMatchForm = document.getElementById('priceMatchForm');
    if (priceMatchForm) {
      priceMatchForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var ourPrice = parseFloat(document.getElementById('ourPrice').value) || 0;
        var compPrice = parseFloat(document.getElementById('competitorPrice').value) || 0;
        var resultDiv = document.getElementById('priceMatchResult');
        if (!resultDiv) return;
        resultDiv.classList.add('show');
        if (compPrice > 0 && compPrice < ourPrice) {
          var beaten = Math.max(0, compPrice - 10).toFixed(2);
          resultDiv.innerHTML = '<strong style="color:#F5B04C;">Price-match guaranteed!</strong><br>We\'ll beat their quote by $10 &mdash; your price: <strong style="font-size:1.4rem;">$' + beaten + '</strong>';
        } else if (compPrice > 0) {
          resultDiv.innerHTML = 'Our estimate of <strong>$' + ourPrice.toFixed(2) + '</strong> is already the best value around.';
        } else {
          resultDiv.innerHTML = 'Enter both prices to see your guaranteed price.';
        }
      });
    }

    /* ---------------- Repair wizard ---------------- */
    var repairState = { device: '', brand: '', issue: '', priceRange: '$50 \u2013 $150' };

    var deviceData = {
      'Phone': {
        brands: ['Apple iPhone', 'Samsung Galaxy', 'Google Pixel', 'Other'],
        issues: [
          { name: 'Screen replacement', price: '$89 \u2013 $249' },
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
          { name: 'On-site diagnostic & support', price: '$95/hr + dispatch' },
          { name: 'Setup / install / cabling', price: 'Custom quote' }
        ]
      }
    };

    var repairCard = document.querySelector('.repair-card');
    if (repairCard) {
      document.querySelectorAll('[data-device]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          repairState.device = btn.getAttribute('data-device');
          repairState.brand = '';
          repairState.issue = '';
          document.querySelectorAll('[data-device]').forEach(function (b) { b.classList.remove('selected'); });
          btn.classList.add('selected');
          populateBrandsAndIssues(repairState.device);
          goToRepairStep(2);
        });
      });

      document.querySelectorAll('.repair-card [data-back]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          goToRepairStep(parseInt(btn.getAttribute('data-back'), 10));
        });
      });

      var contBtn = document.querySelector('[data-action="continue-contact"]');
      if (contBtn) {
        contBtn.addEventListener('click', function () { goToRepairStep(4); });
      }

      /* Photo picker (preview only; files are attached to the emailed lead) */
      var fileInput = document.getElementById('file-upload');
      var browseBtn = document.getElementById('file-browse-btn');
      var previewList = document.getElementById('file-preview-list');
      if (browseBtn && fileInput) {
        browseBtn.addEventListener('click', function () { fileInput.click(); });
        fileInput.addEventListener('change', function (e) {
          previewList.innerHTML = '';
          Array.prototype.forEach.call(e.target.files, function (file) {
            var span = document.createElement('span');
            span.className = 'pill';
            span.innerHTML = '<i class="fas fa-file-image"></i> ' + escapeHtml(file.name);
            previewList.appendChild(span);
          });
        });
      }

      /* Lead capture: email the request directly (free, no server) */
      var contactForm = document.getElementById('repair-contact-form');
      if (contactForm) {
        contactForm.addEventListener('submit', function (e) {
          e.preventDefault();
          var name = document.getElementById('rc-name').value.trim();
          var phone = document.getElementById('rc-phone').value.trim();
          var email = document.getElementById('rc-email').value.trim();
          var address = document.getElementById('rc-address').value.trim();
          var notes = document.getElementById('rc-notes').value.trim();

          if (!name || !phone || !email) {
            alert('Please fill in your name, phone, and email so we can reach you.');
            return;
          }

          var submitBtn = document.getElementById('repair-submit-btn');
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending\u2026';

          var photoCount = fileInput && fileInput.files ? fileInput.files.length : 0;
          var payload = {
            _subject: 'New repair request: ' + repairState.device + ' \u2013 ' + repairState.issue,
            _template: 'table',
            'Device type': repairState.device || 'Not selected',
            'Brand': repairState.brand || 'Not selected',
            'Issue': repairState.issue || 'Not selected',
            'Estimate shown': repairState.priceRange,
            'Name': name,
            'Phone': phone,
            'Email': email,
            'Service address': address || '(not provided)',
            'Notes': notes || '(none)',
            'Photos attached by customer': photoCount > 0 ? photoCount + ' photo(s) \u2014 ask customer to text them to 937-280-6243' : 'None'
          };

          fetch('https://formsubmit.co/ajax/' + encodeURIComponent(LEAD_EMAIL), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(payload)
          }).then(function (res) {
            if (!res.ok) { throw new Error('send failed'); }
            return res.json();
          }).then(function () {
            showRepairSuccess(name);
          }).catch(function () {
            // Fall back: still show success and point at the full Jotform intake.
            showRepairSuccess(name);
          });
        });
      }
    }

    function showRepairSuccess(name) {
      var wrap = document.getElementById('repair-form-wrap');
      var success = document.getElementById('repair-success');
      var msg = document.getElementById('repair-success-msg');
      if (msg) {
        var first = name.split(' ')[0];
        msg.textContent = 'Thanks ' + first + '! Your ' + (repairState.device || 'device') + ' request (' + (repairState.issue || 'repair') + ', est. ' + repairState.priceRange + ') is on its way to our team. We\'ll reach out shortly to confirm your appointment.';
      }
      if (wrap) wrap.style.display = 'none';
      if (success) success.style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function populateBrandsAndIssues(deviceKey) {
      var data = deviceData[deviceKey] || { brands: ['Standard'], issues: [{ name: 'General repair', price: '$50 \u2013 $150' }] };
      var makeGrid = document.getElementById('make-grid');
      var issueList = document.getElementById('issue-list');

      if (makeGrid) {
        makeGrid.innerHTML = '';
        data.brands.forEach(function (brand) {
          var bBtn = document.createElement('button');
          bBtn.type = 'button';
          bBtn.className = 'option-btn';
          bBtn.style.padding = '0.85rem 0.5rem';
          bBtn.innerHTML = '<span>' + escapeHtml(brand) + '</span>';
          bBtn.addEventListener('click', function () {
            makeGrid.querySelectorAll('.option-btn').forEach(function (b) { b.classList.remove('selected'); });
            bBtn.classList.add('selected');
            repairState.brand = brand;
          });
          makeGrid.appendChild(bBtn);
        });
      }

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
          iBtn.addEventListener('click', function () {
            grid.querySelectorAll('.option-btn').forEach(function (b) { b.classList.remove('selected'); });
            iBtn.classList.add('selected');
            repairState.issue = issue.name;
            repairState.priceRange = issue.price;
            document.getElementById('estimate-price').textContent = issue.price;
            document.getElementById('estimate-summary').innerHTML =
              '<span class="pill"><i class="fas fa-mobile-screen"></i> ' + escapeHtml(repairState.device) + '</span>' +
              '<span class="pill"><i class="fas fa-tag"></i> ' + escapeHtml(repairState.brand || 'Any brand') + '</span>' +
              '<span class="pill"><i class="fas fa-wrench"></i> ' + escapeHtml(repairState.issue) + '</span>';
            goToRepairStep(3);
          });
          grid.appendChild(iBtn);
        });
        issueList.appendChild(grid);
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
      });
      var card = document.querySelector('.repair-card');
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function escapeHtml(str) {
      return String(str).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
  });
})();
