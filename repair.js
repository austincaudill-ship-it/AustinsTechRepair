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

  // Step 1: Device Button Clicks
  const deviceBtns = document.querySelectorAll('#step-device .option-btn');
  deviceBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      state.device = btn.getAttribute('data-device');
      
      const hiddenDevice = document.getElementById('repair-device-hidden');
      if (hiddenDevice) hiddenDevice.value = state.device;

      populateStep2(state.device);
      switchStep('step-issue', 2);
    });
  });

  // Populate Step 2 (Brands & Issues)
  function populateStep2(deviceType) {
    const data = repairData[deviceType] || { brands: ['Standard'], issues: ['General Repair'] };
    
    const makeGrid = document.getElementById('make-grid');
    if (makeGrid) {
      makeGrid.innerHTML = '';
      data.brands.forEach(brand => {
        const bBtn = document.createElement('button');
        bBtn.type = 'button';
        bBtn.className = 'option-btn';
        bBtn.textContent = brand;
        bBtn.addEventListener('click', () => {
          makeGrid.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
          bBtn.classList.add('selected');
          state.brand = brand;
          const hiddenMake = document.getElementById('repair-make-hidden');
          if (hiddenMake) hiddenMake.value = brand;
          checkStep2Complete();
        });
        makeGrid.appendChild(bBtn);
      });
    }

    const issueList = document.getElementById('issue-list');
    if (issueList) {
      issueList.innerHTML = '';
      data.issues.forEach(issue => {
        const iBtn = document.createElement('button');
        iBtn.type = 'button';
        iBtn.className = 'option-btn';
        iBtn.textContent = issue;
        iBtn.addEventListener('click', () => {
          issueList.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
          iBtn.classList.add('selected');
          state.issue = issue;
          const hiddenIssue = document.getElementById('repair-issue-hidden');
          if (hiddenIssue) hiddenIssue.value = issue;
          checkStep2Complete();
        });
        issueList.appendChild(iBtn);
      });
    }
  }

  function checkStep2Complete() {
    if (state.brand && state.issue) {
      setTimeout(() => {
        updateEstimate();
        switchStep('step-estimate', 3);
      }, 300);
    }
  }

  function updateEstimate() {
    const summary = document.getElementById('estimate-summary');
    if (summary) {
      summary.innerHTML = `
        <span style="padding: 6px 12px; background: rgba(0,0,0,0.05); border-radius: 6px; font-size: 0.85rem; font-weight: 600;">Device: ${state.device}</span> 
        <span style="padding: 6px 12px; background: rgba(0,0,0,0.05); border-radius: 6px; font-size: 0.85rem; font-weight: 600;">Brand: ${state.brand}</span> 
        <span style="padding: 6px 12px; background: rgba(0,0,0,0.05); border-radius: 6px; font-size: 0.85rem; font-weight: 600;">Issue: ${state.issue}</span>
      `;
    }
  }

  // Continue to Contact button
  const continueBtn = document.querySelector('[data-action="continue-contact"]');
  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      switchStep('step-contact', 4);
    });
  }

  // Back Button Handlers
  document.querySelectorAll('.back-btn').forEach(bBtn => {
    bBtn.addEventListener('click', () => {
      const target = bBtn.getAttribute('data-back');
      if (target === 'device') switchStep('step-device', 1);
      if (target === 'issue') switchStep('step-issue', 2);
      if (target === 'estimate') switchStep('step-estimate', 3);
    });
  });

  // Core Step Switcher & Progress Bar updater
  function switchStep(targetId, stepNumber) {
    document.querySelectorAll('.repair-step').forEach(step => step.classList.remove('active'));
    const targetStep = document.getElementById(targetId);
    if (targetStep) targetStep.classList.add('active');

    document.querySelectorAll('.progress-step').forEach(pStep => pStep.classList.remove('active'));
    for (let i = 1; i <= stepNumber; i++) {
      const pDot = document.getElementById('progress-' + i);
      if (pDot) pDot.classList.add('active');
    }
  }
});
