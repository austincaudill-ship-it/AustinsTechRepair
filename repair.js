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

  // 1. Handle Device Selection
  document.querySelectorAll('#step-device .option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.device = btn.getAttribute('data-device');
      document.getElementById('repair-device-hidden').value = state.device;
      populateStep2(state.device);
      switchStep('step-issue', 2);
    });
  });

  // 2. Populate Step 2 Grids
  function populateStep2(deviceType) {
    const data = repairData[deviceType] || { brands: ['Standard'], issues: ['General Repair'] };
    
    const makeGrid = document.getElementById('make-grid');
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
        document.getElementById('repair-make-hidden').value = brand;
        checkStep2Complete();
      });
      makeGrid.appendChild(bBtn);
    });

    const issueList = document.getElementById('issue-list');
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
        document.getElementById('repair-issue-hidden').value = issue;
        checkStep2Complete();
      });
      issueList.appendChild(iBtn);
    });
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
    summary.innerHTML = `
      <span class="badge" style="padding: 4px 10px; background: var(--primary-light, #eee); border-radius: var(--radius-md);">Device: ${state.device}</span> 
      <span class="badge" style="padding: 4px 10px; background: var(--primary-light, #eee); border-radius: var(--radius-md);">Brand: ${state.brand}</span> 
      <span class="badge" style="padding: 4px 10px; background: var(--primary-light, #eee); border-radius: var(--radius-md);">Issue: ${state.issue}</span>
    `;
  }

  // 3. Continue to Contact Step
  const continueBtn = document.querySelector('[data-action="continue-contact"]');
  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      switchStep('step-contact', 4);
    });
  }

  // 4. Back Button Controls
  document.querySelectorAll('.back-btn').forEach(bBtn => {
    bBtn.addEventListener('click', () => {
      const target = bBtn.getAttribute('data-back');
      const stepMap = { device: ['step-device', 1], issue: ['step-issue', 2], estimate: ['step-estimate', 3] };
      if (stepMap[target]) {
        switchStep(stepMap[target][0], stepMap[target][1]);
      }
    });
  });

  // 5. General Step Switcher
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

  // 6. File Upload Handlers (Optional enhancement)
  const fileBrowseBtn = document.getElementById('file-browse-btn');
  const fileUploadInput = document.getElementById('file-upload');
  if (fileBrowseBtn && fileUploadInput) {
    fileBrowseBtn.addEventListener('click', () => fileUploadInput.click());
  }
});
