/* ============================================================
   AUSTIN'S TECH REPAIR GROUP — Repair Wizard
   ============================================================ */

(function () {
  'use strict';

  /* ---- Device Data ---- */
  const deviceData = {
    Phones: {
      brands: ['Apple', 'Samsung', 'Google', 'Motorola', 'LG', 'OnePlus', 'Other'],
      issues: [
        { name: 'Cracked Screen / Display', min: 79, max: 199 },
        { name: 'Battery Replacement', min: 39, max: 89 },
        { name: 'Charging Port Repair', min: 49, max: 99 },
        { name: 'Camera Repair', min: 59, max: 129 },
        { name: 'Speaker / Microphone', min: 39, max: 89 },
        { name: 'Water Damage Recovery', min: 79, max: 199 },
        { name: 'Software Troubleshooting', min: 29, max: 79 },
        { name: 'Data Transfer', min: 29, max: 59 },
        { name: 'Back Glass Replacement', min: 49, max: 129 },
      ]
    },
    Tablets: {
      brands: ['Apple', 'Samsung', 'Amazon', 'Lenovo', 'Microsoft', 'Other'],
      issues: [
        { name: 'Screen / Display Replacement', min: 89, max: 249 },
        { name: 'Battery Replacement', min: 49, max: 109 },
        { name: 'Charging Port Repair', min: 49, max: 99 },
        { name: 'Touch Screen Issue', min: 59, max: 149 },
        { name: 'Camera Repair', min: 49, max: 119 },
        { name: 'Software Setup & Support', min: 29, max: 79 },
      ]
    },
    Computers: {
      brands: ['Apple', 'Dell', 'HP', 'Lenovo', 'Asus', 'Acer', 'Microsoft', 'Custom', 'Other'],
      issues: [
        { name: 'SSD Upgrade', min: 79, max: 199 },
        { name: 'RAM Installation', min: 49, max: 129 },
        { name: 'Virus / Malware Removal', min: 59, max: 149 },
        { name: 'Display / Screen Repair', min: 99, max: 299 },
        { name: 'Power Issue / DC Jack', min: 79, max: 179 },
        { name: 'Software Recovery', min: 59, max: 149 },
        { name: 'Data Recovery / Rescue', min: 79, max: 299 },
        { name: 'Keyboard Replacement', min: 49, max: 149 },
        { name: 'Cooling / Fan Replacement', min: 49, max: 119 },
      ]
    },
    Gaming: {
      brands: ['Sony PlayStation', 'Microsoft Xbox', 'Nintendo', 'Steam Deck', 'Other'],
      issues: [
        { name: 'HDMI Port Repair', min: 79, max: 179 },
        { name: 'Cooling Fan Replacement', min: 49, max: 119 },
        { name: 'Storage / HDD Upgrade', min: 59, max: 179 },
        { name: 'Power Fault Diagnostics', min: 49, max: 149 },
        { name: 'Controller Repair', min: 29, max: 79 },
        { name: 'Overheating Solution', min: 49, max: 129 },
        { name: 'Disc Drive Repair', min: 59, max: 149 },
      ]
    },
    'Smart Watches': {
      brands: ['Apple Watch', 'Samsung Galaxy Watch', 'Garmin', 'Fitbit', 'Other'],
      issues: [
        { name: 'Battery Service', min: 49, max: 99 },
        { name: 'Display Replacement', min: 79, max: 179 },
        { name: 'Charging Issue', min: 39, max: 89 },
        { name: 'Pairing / Sync Fix', min: 29, max: 69 },
        { name: 'Button / Crown Repair', min: 39, max: 89 },
      ]
    },
    Business: {
      brands: ['Dell', 'HP', 'Lenovo', 'Microsoft', 'Apple', 'Custom Build', 'Other'],
      issues: [
        { name: 'Network Setup & Configuration', min: 99, max: 499 },
        { name: 'Server Installation', min: 199, max: 999 },
        { name: 'Workstation Repair', min: 79, max: 299 },
        { name: 'Data Backup Solution', min: 99, max: 399 },
        { name: 'Cybersecurity Assessment', min: 149, max: 599 },
        { name: 'Microsoft 365 Setup', min: 99, max: 299 },
        { name: 'VoIP Phone System', min: 149, max: 499 },
      ]
    },
  };

  /* ---- State ---- */
  let selectedDevice = null;
  let selectedBrand = null;
  let selectedIssue = null;

  /* ---- DOM Elements ---- */
  const stepDevice = document.getElementById('step-device');
  const stepIssue = document.getElementById('step-issue');
  const stepEstimate = document.getElementById('step-estimate');
  const stepContact = document.getElementById('step-contact');
  const makeGrid = document.getElementById('make-grid');
  const issueList = document.getElementById('issue-list');
  const issueTitle = document.getElementById('issue-title');
  const estimateSummary = document.getElementById('estimate-summary');
  const estimatePrice = document.getElementById('estimate-price');
  const progressSteps = {
    1: document.getElementById('progress-1'),
    2: document.getElementById('progress-2'),
    3: document.getElementById('progress-3'),
    4: document.getElementById('progress-4'),
  };

  /* ---- Helpers ---- */
  function showStep(step) {
    [stepDevice, stepIssue, stepEstimate, stepContact].forEach(s => s && s.classList.remove('active'));
    if (step) step.classList.add('active');
  }

  function setProgress(step) {
    for (let i = 1; i <= 4; i++) {
      if (progressSteps[i]) {
        if (i <= step) progressSteps[i].classList.add('active');
        else progressSteps[i].classList.remove('active');
      }
    }
  }

  /* ---- Step 1: Device Selection ---- */
  document.querySelectorAll('#step-device .option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedDevice = btn.getAttribute('data-device');
      document.querySelectorAll('#step-device .option-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');

      // Populate brands
      const data = deviceData[selectedDevice];
      if (data && makeGrid) {
        makeGrid.innerHTML = data.brands.map(brand =>
          `<button class="option-btn" type="button" data-brand="${brand}">${brand}</button>`
        ).join('');
        makeGrid.querySelectorAll('.option-btn').forEach(b => {
          b.addEventListener('click', () => selectBrand(b));
        });
      }

      // Populate issues
      if (data && issueList) {
        issueList.innerHTML = data.issues.map(issue =>
          `<div class="issue-item" data-issue="${issue.name}" data-min="${issue.min}" data-max="${issue.max}">
            <span>${issue.name}</span>
            <span class="price-range">$${issue.min} — $${issue.max}</span>
          </div>`
        ).join('');
        issueList.querySelectorAll('.issue-item').forEach(item => {
          item.addEventListener('click', () => selectIssue(item));
        });
      }

      // Update title
      if (issueTitle) issueTitle.textContent = `Select Brand & Issue — ${selectedDevice}`;

      // Move to step 2
      setTimeout(() => {
        showStep(stepIssue);
        setProgress(2);
      }, 300);
    });
  });

  /* ---- Step 2: Brand & Issue Selection ---- */
  function selectBrand(btn) {
    selectedBrand = btn.getAttribute('data-brand');
    document.querySelectorAll('#make-grid .option-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  }

  function selectIssue(item) {
    selectedIssue = {
      name: item.getAttribute('data-issue'),
      min: parseInt(item.getAttribute('data-min')),
      max: parseInt(item.getAttribute('data-max')),
    };
    document.querySelectorAll('#issue-list .issue-item').forEach(i => i.classList.remove('selected'));
    item.classList.add('selected');

    // Update estimate
    if (estimateSummary) {
      estimateSummary.innerHTML = '';
      const chips = [
        { label: 'Device', value: selectedDevice },
        { label: 'Brand', value: selectedBrand || 'Not selected' },
        { label: 'Issue', value: selectedIssue.name },
      ];
      chips.forEach(chip => {
        const el = document.createElement('span');
        el.className = 'estimate-chip';
        el.innerHTML = `<strong>${chip.label}:</strong> ${chip.value}`;
        estimateSummary.appendChild(el);
      });
    }

    if (estimatePrice) {
      estimatePrice.textContent = `$${selectedIssue.min} — $${selectedIssue.max}`;
    }

    // Store in hidden fields
    const deviceHidden = document.getElementById('repair-device-hidden');
    const makeHidden = document.getElementById('repair-make-hidden');
    const issueHidden = document.getElementById('repair-issue-hidden');
    if (deviceHidden) deviceHidden.value = selectedDevice || '';
    if (makeHidden) makeHidden.value = selectedBrand || '';
    if (issueHidden) issueHidden.value = selectedIssue.name || '';

    setTimeout(() => {
      showStep(stepEstimate);
      setProgress(3);
    }, 400);
  }

  /* ---- Back Buttons ---- */
  document.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-back');
      if (target === 'device') { showStep(stepDevice); setProgress(1); }
      else if (target === 'issue') { showStep(stepIssue); setProgress(2); }
      else if (target === 'estimate') { showStep(stepEstimate); setProgress(3); }
    });
  });

  /* ---- Continue to Contact ---- */
  document.querySelectorAll('[data-action="continue-contact"]').forEach(btn => {
    btn.addEventListener('click', () => {
      showStep(stepContact);
      setProgress(4);
    });
  });

  /* ---- File Upload ---- */
  const fileUpload = document.getElementById('file-upload');
  const fileBrowseBtn = document.getElementById('file-browse-btn');
  const fileDropZone = document.getElementById('file-drop-zone');
  const filePreviewList = document.getElementById('file-preview-list');

  if (fileBrowseBtn && fileUpload) {
    fileBrowseBtn.addEventListener('click', () => fileUpload.click());
  }

  if (fileDropZone && fileUpload) {
    fileDropZone.addEventListener('click', (e) => {
      if (e.target.tagName !== 'BUTTON') fileUpload.click();
    });
    fileDropZone.addEventListener('dragover', (e) => { e.preventDefault(); fileDropZone.style.borderColor = 'var(--primary)'; });
    fileDropZone.addEventListener('dragleave', () => { fileDropZone.style.borderColor = 'var(--border)'; });
    fileDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      fileDropZone.style.borderColor = 'var(--border)';
      handleFiles(e.dataTransfer.files);
    });
    fileUpload.addEventListener('change', (e) => handleFiles(e.target.files));
  }

  function handleFiles(files) {
    if (!filePreviewList) return;
    Array.from(files).slice(0, 5).forEach(file => {
      if (file.size > 10 * 1024 * 1024) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const preview = document.createElement('div');
        preview.style.cssText = 'width: 80px; height: 80px; border-radius: var(--radius-md); overflow: hidden; position: relative; background: var(--surface-2);';
        if (file.type.startsWith('image/')) {
          preview.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;" /><div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.6);color:#fff;font-size:0.5rem;padding:2px;text-align:center;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${file.name}</div>`;
        } else {
          preview.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:1.5rem;color:var(--text-faint);"><i class="fas fa-file"></i></div>`;
        }
        filePreviewList.appendChild(preview);
      };
      reader.readAsDataURL(file);
    });
  }

  /* ---- Repair Form Submit ---- */
  const repairForm = document.getElementById('repair-contact-form');
  const repairThanks = document.getElementById('repair-thanks');

  if (repairForm) {
    repairForm.addEventListener('submit', (e) => {
      e.preventDefault();

      // Collect all repair request data
      var repairRequest = {
        id: 'RR-' + Date.now(),
        ticketId: 'TKT-' + Math.floor(100000 + Math.random() * 900000),
        timestamp: new Date().toISOString(),
        status: 'new',
        source: 'Website Repair Wizard',
        device: {
          type: document.getElementById('repair-device-hidden') ? document.getElementById('repair-device-hidden').value : '',
          brand: document.getElementById('repair-make-hidden') ? document.getElementById('repair-make-hidden').value : '',
          model: document.getElementById('device-model') ? document.getElementById('device-model').value : '',
          issue: document.getElementById('repair-issue-hidden') ? document.getElementById('repair-issue-hidden').value : '',
        },
        estimate: selectedIssue ? '$' + selectedIssue.min + ' — $' + selectedIssue.max : 'Not provided',
        customer: {
          name: document.getElementById('full-name') ? document.getElementById('full-name').value : '',
          phone: document.getElementById('phone-number') ? document.getElementById('phone-number').value : '',
          email: document.getElementById('email-address') ? document.getElementById('email-address').value : '',
          location: document.getElementById('city-zip') ? document.getElementById('city-zip').value : '',
          preferredTime: document.getElementById('preferred-time') ? document.getElementById('preferred-time').value : '',
        },
        additionalDetails: document.getElementById('additional-details') ? document.getElementById('additional-details').value : '',
        notes: []
      };

      // Save to localStorage for employee portal pickup
      var existing = JSON.parse(localStorage.getItem('atr_repair_requests') || '[]');
      existing.push(repairRequest);
      localStorage.setItem('atr_repair_requests', JSON.stringify(existing));

      // Dispatch event for same-tab portal listeners
      window.dispatchEvent(new CustomEvent('atr:new-repair-request', { detail: repairRequest }));

      repairForm.style.display = 'none';
      if (repairThanks) repairThanks.hidden = false;
    });
  }

})();