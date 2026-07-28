document.addEventListener('DOMContentLoaded', () => {
  const state = { device: '', brand: '', issue: '' };

  const repairData = {
    Phones: {
      brands: ['Apple', 'Samsung', 'Google', 'Other'],
      issues: ['Screen Repair', 'Battery Replacement', 'Charging Port', 'Water Damage', 'Other']
    },
    Tablets: {
      brands: ['Apple iPad', 'Samsung Galaxy Tab', 'Microsoft Surface', 'Other'],
      issues: ['Screen Repair', 'Battery Replacement', 'Charging Port', 'Other']
    },
    Computers: {
      brands: ['Apple Mac', 'Dell', 'HP', 'Lenovo', 'Custom PC'],
      issues: ['Screen Repair', 'Keyboard / Trackpad', 'Slow Performance / Virus', 'No Power / Won’t Boot', 'Other']
    },
    Gaming: {
      brands: ['PlayStation', 'Xbox', 'Nintendo Switch', 'Other'],
      issues: ['HDMI Port Repair', 'Overheating / Fan', 'Disc Drive', 'No Power', 'Other']
    },
    "Smart Watches": {
      brands: ['Apple Watch', 'Samsung Galaxy Watch', 'Garmin', 'Other'],
      issues: ['Screen Repair', 'Battery Replacement', 'Water Damage', 'Other']
    },
    Business: {
      brands: ['POS System', 'Server / Network', 'Fleet Laptops', 'Other'],
      issues: ['Hardware Diagnostic', 'Data Recovery', 'Component Replacement', 'Other']
    }
  };

  // Helper: safe element getter
  const $ = (id) => document.getElementById(id);
  const normalizeId = (id) => id ? (id.startsWith('#') ? id.slice(1) : id) : id;

  // Core Step Switcher & Progress Bar updater (single implementation)
  function switchStep(targetId, stepNumber) {
    const id = normalizeId(targetId);
    document.querySelectorAll('.repair-step').forEach(step => step.classList.remove('active'));
    const targetStep = document.getElementById(id);
    if (targetStep) {
      targetStep.classList.add('active');
      // accessibility: ensure focus
      if (!targetStep.hasAttribute('tabindex')) targetStep.setAttribute('tabindex', '-1');
      try { targetStep.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    } else {
      console.warn('switchStep: target step not found:', id);
    }

    document.querySelectorAll('.progress-step').forEach(pStep => pStep.classList.remove('active'));
    for (let i = 1; i <= (stepNumber || 1); i++) {
      const pDot = document.getElementById('progress-' + i);
      if (pDot) pDot.classList.add('active');
    }
  }

  // Ensure existing device buttons are handled reliably by delegation in case markup changes
  const stepDevice = $('step-device');
  stepDevice && stepDevice.addEventListener('click', (e) => {
    const btn = e.target.closest('.option-btn');
    if (!btn || !stepDevice.contains(btn)) return;
    e.preventDefault();

    // Visual selection for device buttons
    stepDevice.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');

    state.device = btn.getAttribute('data-device') || (btn.dataset && btn.dataset.device) || btn.textContent.trim();

    const hiddenDevice = $('repair-device-hidden');
    if (hiddenDevice) hiddenDevice.value = state.device;

    // Reset step 2 state
    state.brand = '';
    state.issue = '';
    const hiddenMake = $('repair-make-hidden');
    const hiddenIssue = $('repair-issue-hidden');
    if (hiddenMake) hiddenMake.value = '';
    if (hiddenIssue) hiddenIssue.value = '';

    populateStep2(state.device);
    switchStep('step-issue', 2);
  });

  // Populate Step 2 (Brands & Issues)
  function populateStep2(deviceType) {
    const data = repairData[deviceType] || { brands: ['Standard'], issues: ['General Repair'] };

    const makeGrid = $('make-grid');
    if (makeGrid) {
      makeGrid.innerHTML = '';
      data.brands.forEach(brand => {
        const bBtn = document.createElement('button');
        bBtn.type = 'button';
        bBtn.className = 'option-btn';
        bBtn.textContent = brand;
        bBtn.setAttribute('data-brand', brand);
        bBtn.setAttribute('aria-pressed', 'false');
        bBtn.tabIndex = 0;
        bBtn.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            bBtn.click();
          }
        });
        makeGrid.appendChild(bBtn);
      });
    }

    const issueList = $('issue-list');
    if (issueList) {
      issueList.innerHTML = '';
      data.issues.forEach(issue => {
        const iBtn = document.createElement('button');
        iBtn.type = 'button';
        iBtn.className = 'option-btn';
        iBtn.textContent = issue;
        iBtn.setAttribute('data-issue', issue);
        iBtn.setAttribute('aria-pressed', 'false');
        iBtn.tabIndex = 0;
        iBtn.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            iBtn.click();
          }
        });
        issueList.appendChild(iBtn);
      });
    }
  }

  // Delegated handlers for brand and issue selections (works for dynamic buttons)
  const makeGrid = $('make-grid');
  makeGrid && makeGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.option-btn');
    if (!btn || !makeGrid.contains(btn)) return;
    e.preventDefault();

    makeGrid.querySelectorAll('.option-btn').forEach(b => {
      b.classList.remove('selected');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('selected');
    btn.setAttribute('aria-pressed', 'true');

    const brand = btn.getAttribute('data-brand') || btn.textContent.trim();
    state.brand = brand;
    const hiddenMake = $('repair-make-hidden');
    if (hiddenMake) hiddenMake.value = brand;

    checkStep2Complete();
  });

  const issueList = $('issue-list');
  issueList && issueList.addEventListener('click', (e) => {
    const btn = e.target.closest('.option-btn');
    if (!btn || !issueList.contains(btn)) return;
    e.preventDefault();

    issueList.querySelectorAll('.option-btn').forEach(b => {
      b.classList.remove('selected');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('selected');
    btn.setAttribute('aria-pressed', 'true');

    const issue = btn.getAttribute('data-issue') || btn.textContent.trim();
    state.issue = issue;
    const hiddenIssue = $('repair-issue-hidden');
    if (hiddenIssue) hiddenIssue.value = issue;

    checkStep2Complete();
  });

  // Ensures BOTH Brand and Issue are picked before advancing
  function checkStep2Complete() {
    if (state.brand !== '' && state.issue !== '') {
      setTimeout(() => {
        updateEstimate();
        switchStep('step-estimate', 3);
      }, 300);
    }
  }

  function updateEstimate() {
    const summary = $('estimate-summary');
    if (summary) {
      summary.innerHTML = `\n        <span style="padding: 6px 12px; background: rgba(0,0,0,0.05); border-radius: 6px; font-size: 0.85rem; font-weight: 600;">Device: ${escapeHtml(state.device)}</span> \n        <span style="padding: 6px 12px; background: rgba(0,0,0,0.05); border-radius: 6px; font-size: 0.85rem; font-weight: 600;">Brand: ${escapeHtml(state.brand)}</span> \n        <span style="padding: 6px 12px; background: rgba(0,0,0,0.05); border-radius: 6px; font-size: 0.85rem; font-weight: 600;">Issue: ${escapeHtml(state.issue)}</span>\n      `;
    }
  }

  // basic HTML escape for safety when inserting user-visible strings
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Continue to Contact button
  const continueBtn = document.querySelector('[data-action="continue-contact"]');
  if (continueBtn) {
    continueBtn.addEventListener('click', (e) => {
      e.preventDefault();
      switchStep('step-contact', 4);
    });
  }

  // Back Button Handlers
  document.querySelectorAll('.back-btn').forEach(bBtn => {
    bBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const target = bBtn.getAttribute('data-back');
      if (target === 'device') switchStep('step-device', 1);
      if (target === 'issue') switchStep('step-issue', 2);
      if (target === 'estimate') switchStep('step-estimate', 3);
    });
  });

});
