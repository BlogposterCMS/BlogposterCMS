/**
 * mother/emitters/uiEmitter.js
 *
 * Lightweight Emitter for Admin UI logic:
 *   - Nur UI-spezifische Events
 *   - Optional: einfache meltdownDetection
 *   - Kein JWT, keine Auth, kein Core-Zugriff
 */

const EventEmitter = require('events');

// Liste erlaubter Events für Kontrolle & Debugging
  const KNOWN_UI_EVENTS = [
    'registerAdminUI',
    'unregisterAdminUI',
    'switchAdminUI',
    'ui:render',
    'ui:themeLoaded',
    'ui:meltdown', // optional fallback
    'dialog:alert',
    'dialog:confirm',
    'dialog:prompt',
    'dialog:confirm-preview',
    'dialog:prompt-preview',
  ];

class UIEmitter extends EventEmitter {
  constructor() {
    super();
    console.log('[UI Emitter] Initialized lightweight UI emitter.');
  }

  emit(eventName, ...args) {
    const firstArg = args[0] || {};
    const uiName = firstArg.uiName || 'unknown';
    const caller  = firstArg.caller  || 'unspecified';

    // Keine Listener? → Warnung
    if (!this.listenerCount(eventName)) {
      console.warn(`[UI Emitter] No listeners for "${eventName}"`);
      return false;
    }

    // Optionales Check: Ist das ein bekanntes UI-Event?
    if (!KNOWN_UI_EVENTS.includes(eventName)) {
      console.warn(`[UI Emitter] ⚠️ UNKNOWN UI EVENT "${eventName}" from "${caller}"`);
    }

    try {
      console.log(`[UI Emitter] Emitting "${eventName}" from "${caller}"`);
      return super.emit(eventName, ...args);
    } catch (err) {
      console.error(`[UI Emitter] MELTDOWN: Error in "${eventName}" by "${uiName}" → ${err.message}`);
      super.emit('ui:meltdown', {
        eventName,
        uiName,
        caller,
        error: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString(),
      });
      return false;
    }
  }
}

  module.exports = new UIEmitter();
