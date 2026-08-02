/* ==========================================================================
   Austin's Tech Repair Group — AI Chat Assistant Styles
   ========================================================================== */

.chat-bubble {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 999;
  width: 56px;
  height: 56px;
  background: var(--primary);
  color: white;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.35rem;
  box-shadow: 0 4px 20px rgba(0, 87, 255, 0.4);
  cursor: pointer;
  transition: transform var(--transition), background var(--transition);
  border: none;
}

.chat-bubble:hover {
  transform: scale(1.08);
  background: var(--primary-hover);
}

.chat-bubble-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  background: var(--danger);
  color: white;
  font-size: 0.65rem;
  font-weight: 700;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--surface);
}

.chat-window {
  position: fixed;
  bottom: 96px;
  right: 24px;
  z-index: 1000;
  width: 360px;
  max-width: calc(100vw - 48px);
  height: 500px;
  max-height: calc(100vh - 140px);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
  transform: translateY(16px) scale(0.98);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.chat-window.active {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0) scale(1);
}

.chat-header {
  padding: var(--space-4) var(--space-5);
  background: var(--surface-alt);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.chat-avatar {
  width: 36px;
  height: 36px;
  background: var(--primary);
  color: white;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
}

.chat-header-info {
  flex-grow: 1;
}

.chat-header-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 0.95rem;
}

.chat-header-status {
  font-size: 0.7rem;
  color: var(--success);
  font-weight: 600;
}

.chat-close {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 1rem;
  cursor: pointer;
  padding: var(--space-1);
  transition: color var(--transition);
}
.chat-close:hover {
  color: var(--text);
}

.chat-messages {
  flex-grow: 1;
  padding: var(--space-4);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  background: var(--bg);
}

.chat-message {
  display: flex;
  max-width: 85%;
}

.chat-message.user {
  margin-left: auto;
  justify-content: flex-end;
}

.chat-message.bot {
  margin-right: auto;
  justify-content: flex-start;
}

.message-bubble {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-xl);
  font-size: 0.9rem;
  line-height: 1.5;
}

.chat-message.user .message-bubble {
  background: var(--primary);
  color: white;
  border-bottom-right-radius: var(--radius-sm);
}

.chat-message.bot .message-bubble {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-bottom-left-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
}

.chat-quick-replies {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.quick-reply-chip {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--primary);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-full);
  font-size: 0.8rem;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  transition: all var(--transition);
}

.quick-reply-chip:hover {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

.chat-input-area {
  padding: var(--space-3) var(--space-4);
  background: var(--surface);
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.chat-input {
  flex-grow: 1;
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  padding: var(--space-2) var(--space-4);
  font-size: 16px; /* Prevents auto-zoom on mobile iOS safari */
  color: var(--text);
  outline: none;
  transition: border-color var(--transition);
}

.chat-input:focus {
  border-color: var(--primary);
}

.chat-send {
  width: 38px;
  height: 38px;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background var(--transition);
}

.chat-send:hover {
  background: var(--primary-hover);
}
