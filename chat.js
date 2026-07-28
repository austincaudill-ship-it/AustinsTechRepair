/* ============================================================
   AUSTIN'S TECH REPAIR GROUP — AI Chat Assistant
   ============================================================ */
(function () {
  'use strict';

  const KB = {
    hours: {
      keywords: ['hour', 'open', 'close', 'time', 'when', 'available', 'schedule'],
      response: "We're open Monday through Friday, 9:00 AM to 6:00 PM, and Saturdays from 10:00 AM to 4:00 PM. We're closed on Sundays. Walk-ins are welcome, but appointments get priority service!"
    },
    location: {
      keywords: ['location', 'address', 'where', 'directions', 'find you'],
      response: "We're located at 170 E Main St, Xenia, OH 45385 — right in the Dayton metro area. You can find us easily off US-35. Give us a call at 513-478-8077 if you need directions!"
    },
    phone: {
      keywords: ['phone', 'call', 'number', 'contact', 'reach'],
      response: "You can reach us at 513-478-8077 during business hours. Prefer email? Send us a message through the Contact page and we'll get back to you within 24 hours."
    },
    pricing: {
      keywords: ['price', 'cost', 'how much', 'estimate', 'quote', 'charge', 'fee', 'expensive', 'cheap', 'affordable'],
      response: "Pricing depends on your device and the issue. Here are some general ranges:\n\n• Phone screen repair: $59 - $199\n• Battery replacement: $39 - $89\n• Water damage diagnostic: $49 - $99\n• Computer repair: $79 - $299\n• Gaming console repair: $69 - $249\n\nFor an instant estimate, use our Repair Wizard on the Repair page — just select your device and issue!"
    },
    repairTime: {
      keywords: ['how long', 'time', 'fast', 'quick', 'turnaround', 'wait', 'ready', 'same day'],
      response: "Most repairs are completed same-day or within 24 hours! Screen replacements and battery swaps are typically done in under an hour. More complex repairs (water damage, logic board issues) may take 2-3 business days. We'll give you an exact timeline when you drop off your device."
    },
    warranty: {
      keywords: ['warranty', 'guarantee', 'guaranteed', 'stand behind'],
      response: "We stand behind our work with a 90-day repair warranty on all repairs. If the same issue comes back within 90 days, we'll fix it free of charge. Parts are covered by their respective manufacturer warranties."
    },
    devices: {
      keywords: ['what device', 'what do you fix', 'what can you repair', 'device', 'phone', 'tablet', 'computer', 'laptop', 'gaming', 'console', 'watch', 'xbox', 'playstation', 'nintendo', 'iphone', 'samsung', 'android', 'mac', 'pc', 'ipad', 'fitbit', 'apple watch'],
      response: "We repair a wide range of devices:\n\n• Phones — iPhone, Samsung Galaxy, Google Pixel, OnePlus, and more\n• Computers — MacBook, Dell, HP, Lenovo, custom builds\n• Gaming — Xbox, PlayStation, Nintendo Switch, Steam Deck\n• Smart Watches — Apple Watch, Samsung Galaxy Watch, Fitbit\n• Tablets — iPad, Samsung Galaxy Tab, Surface Pro\n• We also handle business and B2B repair contracts!"
    },
    water: {
      keywords: ['water', 'liquid', 'wet', 'dropped', 'pool', 'rain', 'spill', 'coffee'],
      response: "Liquid damage is one of our specialties! Turn off the device immediately, don't charge it, and bring it in ASAP. We perform ultrasonic cleaning, component-level diagnostics, and corrosion treatment. Success rate is high when treated within 48 hours. Diagnostic starts at $49."
    },
    screen: {
      keywords: ['screen', 'cracked', 'broken', 'shattered', 'glass', 'display', 'lcd', 'oled'],
      response: "Cracked screen? We've got you covered! We use premium-quality parts and most screen replacements are done within an hour. Prices vary by device — use the Repair Wizard for an instant estimate, or call us at 513-478-8077."
    },
    battery: {
      keywords: ['battery', 'charging', 'won\'t charge', 'power', 'drain', 'die', 'dead'],
      response: "Battery issues are super common and usually a quick fix! We replace batteries for phones, tablets, laptops, and watches. Most battery replacements are done same-day. Prices range from $39 - $89 depending on the device."
    },
    b2b: {
      keywords: ['b2b', 'business', 'enterprise', 'bulk', 'company', 'contract', 'corporate', 'fleet'],
      response: "We offer B2B repair contracts for businesses of all sizes! Benefits include priority turnaround, volume discounts, dedicated account management, and net-30 invoicing. Visit our B2B page or call 513-478-8077 to set up a business account."
    },
    atrOne: {
      keywords: ['atr one', 'membership', 'member', 'subscribe', 'subscription', 'plan', 'perk'],
      response: "ATR One is our premium membership program! Members get 15% off all repairs, free annual diagnostics, priority service queue, and exclusive deals on accessories. It's just $9.99/month or $99/year. Check out the ATR One page for full details!"
    },
    shop: {
      keywords: ['shop', 'buy', 'purchase', 'accessories', 'products', 'store', 'cases', 'chargers', 'cables'],
      response: "Our online shop has a great selection of accessories — phone cases, screen protectors, chargers, cables, and more from top brands like Anker, Spigen, and Belkin. We also carry refurbished devices with a 30-day warranty. Browse the Shop page to see what's available!"
    },
    appointment: {
      keywords: ['appointment', 'book', 'schedule', 'reserve', 'drop off'],
      response: "You can start a repair request right now using our Repair Wizard on the Repair page! Just select your device, choose the issue, and fill in your contact info. We'll be ready for you when you arrive. Walk-ins are also welcome during business hours."
    },
    shipping: {
      keywords: ['ship', 'mail', 'send in', 'mail in', 'remote', 'far away'],
      response: "Can't make it in person? We offer mail-in repair service! Package your device securely, include a note with your contact info and the issue, and ship to: 170 E Main St, Xenia, OH 45385. We'll diagnose and call you with an estimate before proceeding. Return shipping is included with completed repairs over $50."
    },
    payment: {
      keywords: ['pay', 'payment', 'cash', 'card', 'credit', 'debit', 'venmo', 'cashapp', 'financing'],
      response: "We accept cash, all major credit/debit cards, Apple Pay, Google Pay, Venmo, and CashApp. For repairs over $150, we offer 0% financing through Affirm — just ask when you check out!"
    }
  };

  const QUICK_REPLIES = [
    'What are your hours?',
    'What devices do you fix?',
    'How much does a screen repair cost?',
    'How long do repairs take?',
    'Do you offer a warranty?',
    'Where are you located?'
  ];

  let chatWindow = null;
  let messagesContainer = null;
  let chatInput = null;
  let sendBtn = null;
  let badgeEl = null;
  let isOpen = false;
  let hasGreeted = false;

  function buildWidget() {
    const bubble = document.createElement('button');
    bubble.className = 'chat-bubble';
    bubble.setAttribute('aria-label', 'Open chat assistant');
    bubble.innerHTML = '<i class="fas fa-comments"></i><span class="chat-bubble-badge" style="display:inline-block">1</span>';
    bubble.addEventListener('click', toggleChat);

    const win = document.createElement('div');
    win.className = 'chat-window';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', 'AI Chat Assistant');
    win.innerHTML = `
      <div class="chat-header">
        <div class="chat-avatar"><i class="fas fa-robot"></i></div>
        <div class="chat-header-info">
          <div class="chat-header-name">ATR Assistant</div>
          <div class="chat-header-status">Online — Replies instantly</div>
        </div>
        <button class="chat-close" aria-label="Close chat"><i class="fas fa-times"></i></button>
      </div>
      <div class="chat-messages"></div>
      <div class="chat-input-area">
        <input type="text" class="chat-input" placeholder="Ask me anything..." aria-label="Chat message" />
        <button class="chat-send" aria-label="Send message"><i class="fas fa-paper-plane"></i></button>
      </div>
    `;

    document.body.appendChild(bubble);
    document.body.appendChild(win);
    
    chatWindow = win;
    messagesContainer = win.querySelector('.chat-messages');
    chatInput = win.querySelector('.chat-input');
    sendBtn = win.querySelector('.chat-send');
    badgeEl = bubble.querySelector('.chat-bubble-badge');

    win.querySelector('.chat-close').addEventListener('click', closeChat);
    sendBtn.addEventListener('click', handleUserSendMessage);
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleUserSendMessage();
      }
    });
  }

  function toggleChat() {
    if (isOpen) {
      closeChat();
    } else {
      openChat();
    }
  }

  function openChat() {
    isOpen = true;
    chatWindow.classList.add('active');
    if (badgeEl) badgeEl.style.display = 'none';
    chatInput.focus();

    if (!hasGreeted) {
      hasGreeted = true;
      appendMessage('bot', "Hello! Welcome to Austin's Tech Repair Group. How can I help you with your device or repair questions today?");
      renderQuickReplies();
    }
  }

  function closeChat() {
    isOpen = false;
    chatWindow.classList.remove('active');
  }

  function appendMessage(sender, text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${sender}`;
    
    const formattedText = text.replace(/\n/g, '<br>');
    msgDiv.innerHTML = `<div class="message-bubble">${formattedText}</div>`;
    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function renderQuickReplies() {
    const qrContainer = document.createElement('div');
    qrContainer.className = 'chat-quick-replies';
    
    QUICK_REPLIES.forEach(question => {
      const chip = document.createElement('button');
      chip.className = 'quick-reply-chip';
      chip.textContent = question;
      chip.addEventListener('click', () => {
        appendMessage('user', question);
        qrContainer.remove();
        processQuery(question);
      });
      qrContainer.appendChild(chip);
    });

    messagesContainer.appendChild(qrContainer);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function handleUserSendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    appendMessage('user', text);
    chatInput.value = '';

    // Remove any existing active quick replies when user types manually
    const existingQR = messagesContainer.querySelector('.chat-quick-replies');
    if (existingQR) existingQR.remove();

    processQuery(text);
  }

  function processQuery(query) {
    const lowerQuery = query.toLowerCase();
    let bestMatch = null;

    // Search KB keywords
    for (const key in KB) {
      const item = KB[key];
      const matchFound = item.keywords.some(kw => lowerQuery.includes(kw));
      if (matchFound) {
        bestMatch = item.response;
        break;
      }
    }

    // Typing indicator delay simulation
    setTimeout(() => {
      if (bestMatch) {
        appendMessage('bot', bestMatch);
      } else {
        appendMessage('bot', "That's a great question! For specific diagnostics or custom quotes, feel free to give us a call directly at 513-478-8077 or stop by our Xenia shop at 170 E Main St.");
      }
    }, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildWidget);
  } else {
    buildWidget();
  }
})();