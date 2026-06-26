/**
 * mother/emitters/notificationEmitter.js
 *
 * A dedicated emitter for notifications (separate from meltdown checks).
 * Handles:
 *   - Basic or advanced JWT checks (if needed)
 *   - Notification grouping or types
 */

require('dotenv').config();
const EventEmitter = require('events');
const jwt = require('jsonwebtoken');

// Optional: Falls du JWT für Notifications absichern willst
const NOTIFICATION_JWT_SECRET = process.env.NOTIFICATION_JWT_SECRET;
const NOTIFICATION_SALT = process.env.NOTIFICATION_SALT;

// Mögliche Notification-Typen/Gruppen.
// Erweitert um "info" und "debug" damit Module diese Typen verwenden können,
// ohne dass ein Fallback zu "system" ausgelöst wird. Dadurch kann der
// Frontend‑Client nach Typ filtern.
const KNOWN_NOTIFICATION_TYPES = ['security', 'system', 'user', 'info', 'debug'];

class NotificationEmitter extends EventEmitter {
  constructor() {
    super();
    console.log('[NotificationEmitter] Initialized.');
  }

  /**
   * verifyNotificationJwt:
   *   Optional method to verify JWT if "requiresJwt" is set in payload.
   */
  verifyNotificationJwt(providedJwt) {
    if (!providedJwt) return null;
    try {
      return jwt.verify(providedJwt, NOTIFICATION_JWT_SECRET + NOTIFICATION_SALT);
    } catch (err) {
      console.warn('[NotificationEmitter] Invalid JWT =>', err.message);
      return null;
    }
  }

  /**
   * notify(payload):
   *   The main entry for modules to emit notifications.
   */
  notify(payload) {
    // Extract relevant fields
    const {
      moduleName = 'unknown',
      notificationType = 'system',
      priority = 'info',
      message = '',
      jwt: providedJwt,
      requiresJwt = false,  // If true, we do a JWT check
    } = payload;

    // If the type is unknown, we can skip or fallback to "system"
    if (!KNOWN_NOTIFICATION_TYPES.includes(notificationType)) {
      console.warn(`[NotificationEmitter] Unknown notificationType "${notificationType}". Using "system" as fallback.`);
      payload.notificationType = 'system';
    }

    if (requiresJwt) {
      const decoded = this.verifyNotificationJwt(providedJwt);
      if (!decoded) {
        console.warn('[NotificationEmitter] Aborting notification => invalid JWT.');
        return false;
      }
      // Du könntest hier weitere Permission-Checks machen, z.B. decoded.role o.Ä.
    }

    console.log('[NotificationEmitter] Emitting "notify" =>', {
      moduleName,
      notificationType,
      priority,
      message
    });

    // Emit the actual event for the Notification Manager
    return this.emit('notify', {
      ...payload,
      timestamp: new Date().toISOString(),
    });
  }
}

const notificationEmitter = new NotificationEmitter();

module.exports = notificationEmitter;
