/**
 * mother/emitters/motherEmitter.js
 *
 * meltdown logic that keeps errors local to the offending module.
 *
 * - If meltdown triggers for a module, we set meltdownStates[module] = true
 * - Then all future events from that module are immediately ignored.
 * - We do NOT kill the entire server. The meltdown is local to that module.
 * - We do NOT re-emit meltdown errors across multiple events.
 */

require('dotenv').config();
const EventEmitter = require('events');
const jwt = require('jsonwebtoken');

const notificationEmitter = require('./notificationEmitter');

// Secrets must be provided via environment variables
const JWT_SECRET         = process.env.JWT_SECRET;
const TOKEN_SALT_HIGH    = process.env.TOKEN_SALT_HIGH   || '';
const TOKEN_SALT_MEDIUM  = process.env.TOKEN_SALT_MEDIUM || '';
const TOKEN_SALT_LOW     = process.env.TOKEN_SALT_LOW    || '';
const AUTH_MODULE_SECRET = process.env.AUTH_MODULE_INTERNAL_SECRET || '';

/** Public events skip meltdown checks entirely */
const PUBLIC_EVENTS = [
  'issuePublicToken',
  'ensurePublicToken',
  'removeListenersByModule',
  'deactivateModule'
];

/**
 * skipJWT events => only valid if (moduleName === 'auth')
 * and we have the correct authModuleSecret
 */
const ALLOWED_SKIPJWT_EVENTS = [
  'issueUserToken',
  'issueModuleToken',
  'registerLoginStrategy',
  'validateToken'
];

/**
 * meltdownStates stores moduleName -> boolean
 * true => meltdown triggered for that module => ignore subsequent calls
 */
const meltdownStates = new Map();



/**
 * onceCallback => ensures meltdown callbacks only fire once
 */
function onceCallback(originalCb) {
  let hasFired = false;
  return (...args) => {
    if (hasFired) return;
    hasFired = true;
    if (typeof originalCb === 'function') {
      originalCb(...args);
    } else {
      console.warn('[MotherEmitter] meltdown event had no valid callback, oh well.');
    }
  };
}

/** maskJwtInArgs => removes sensitive fields entirely from meltdown payload */
function maskJwtInArgs(args) {
  const sensitiveKeys = [
    'jwt',
    'authModuleSecret',
    'tokenSalts',
    'JWT_SECRET',
    'AUTH_MODULE_SECRET',
    'AUTH_MODULE_INTERNAL_SECRET',
    'TOKEN_SALT_HIGH',
    'TOKEN_SALT_MEDIUM',
    'TOKEN_SALT_LOW'
  ].map(k => k.toLowerCase());

  const sanitize = (value) => {
    if (Array.isArray(value)) {
      return value.map(sanitize);
    }
    if (value && typeof value === 'object') {
      const clone = {};
      Object.keys(value).forEach(key => {
        if (!sensitiveKeys.includes(key.toLowerCase())) {
          clone[key] = sanitize(value[key]);
        }
      });
      return clone;
    }
    return value;
  };

  try {
    return args.map(arg => sanitize(arg));
  } catch {
    // Fallback => return array of empty objects so nothing sensitive is logged
    return args.map(() => ({}));
  }
}

/**
 * Convert detailed meltdown reasons to concise, user friendly messages for the
 * Notification Hub UI. We only have limited space there so internal details are
 * mapped to short strings. Logs remain unaffected.
 */
function formatMeltdownMessage(moduleName, reason) {
  const lower = String(reason || '').toLowerCase();

  if (lower.startsWith('no jwt provided')) {
    return `${moduleName} deactivated because it did not provide a valid token`;
  }

  if (lower.startsWith('invalid jwt')) {
    return `${moduleName} deactivated because it provided an invalid token`;
  }

  if (lower.startsWith('invalid authmodulesecret')) {
    return `${moduleName} deactivated due to invalid module secret`;
  }

  if (lower.startsWith('unauthorized skipjwt usage')) {
    return `${moduleName} deactivated due to unauthorized skipJWT usage`;
  }

  if (lower.startsWith('could not decode token')) {
    return `${moduleName} deactivated because its token could not be decoded`;
  }

  return `Local meltdown for ${moduleName}`;
}

/**
 * meltdownForModule => local meltdown that deactivates the module. 
 * We remove all its listeners. No server kill (unless you want it).
 */
function meltdownForModule(reason, moduleName, motherEmitter) {
  // Mark meltdown triggered => ignore subsequent events from that module
  meltdownStates.set(moduleName, true);

  const userFriendly = formatMeltdownMessage(moduleName, reason);

  // Possibly notify. Up to you if you want a “critical” priority or “warning”
  notificationEmitter.notify({
    moduleName,
    notificationType: 'system',
    priority: 'warning', // or 'critical' if you prefer
    message: userFriendly
  });

  console.warn('[MotherEmitter] meltdown => deactivating module="%s" => reason="%s"', moduleName, reason);

  // Deactivate means removing all listeners from that module
  motherEmitter.emit('deactivateModule', { moduleName, reason });
}

class MotherEmitter extends EventEmitter {
  constructor() {
    super();
    console.log('[MotherEmitter] Initialized motherEmitter instance.');
    this._moduleTypes = Object.create(null); // track 'core'/'community' if desired
  }

  registerModuleType(moduleName, type) {
    this._moduleTypes[moduleName] = type;
    console.log('[MotherEmitter] Registered module="%s" => type="%s"', moduleName, type);
  }

  /** merges JWT_SECRET with salt depending on trustLevel */
  combineSecretWithSalt(baseSecret, trustLevel) {
    switch ((trustLevel || '').toLowerCase()) {
      case 'high':   return baseSecret + TOKEN_SALT_HIGH;
      case 'medium': return baseSecret + TOKEN_SALT_MEDIUM;
      default:       return baseSecret + TOKEN_SALT_LOW;
    }
  }

  emit(eventName, ...args) {
    // (1) If no listeners => just warn. 
    if (!this.listenerCount(eventName)) {
      console.warn('[MotherEmitter] WARNING: No listeners for event="%s".', eventName);
      return false;
    }

    // (2) minimal payload check
    const firstArg = args[0];
    if (!firstArg || typeof firstArg !== 'object' || !firstArg.moduleName) {
      console.warn('[MotherEmitter] WARNING: Event="%s" missing \'moduleName\' in firstArg => returning error.', eventName);
      const cb = args.find(a => typeof a === 'function');
      if (cb) cb(new Error('Missing moduleName in payload'));
      return false;
    }

    const { moduleName, skipJWT, authModuleSecret, jwt: providedJwt, isExternalRequest } = firstArg;

    // (3) If meltdown already triggered for that module => ignore
    if (meltdownStates.get(moduleName)) {
        console.warn('[MotherEmitter] meltdown already triggered for module="%s". Ignoring event="%s".', moduleName, eventName);
      return false;
    }

    // (4) Public event => skip meltdown checks
    if (PUBLIC_EVENTS.includes(eventName)) {
        console.log('[MotherEmitter] Public event => skipping meltdown => event="%s".', eventName);
      const safeArgs = maskJwtInArgs(args);
      console.log('[MotherEmitter] Emitting public event="%s" with %d arg(s)', eventName, safeArgs.length);
      return super.emit(eventName, ...args);
    }

    // (5) skipJWT logic => only allowed if moduleName='auth' & event in ALLOWED_SKIPJWT_EVENTS & secret is correct
    if (skipJWT) {
      if (moduleName === 'auth' && ALLOWED_SKIPJWT_EVENTS.includes(eventName)) {
        if (authModuleSecret !== AUTH_MODULE_SECRET) {
          meltdownForModule(`Invalid authModuleSecret for skipJWT event="${eventName}"`, moduleName, this);
          return false;
        }
          console.log('[MotherEmitter] skipJWT => authorized => event="%s" => normal emit.', eventName);
        return super.emit(eventName, ...args);
      } else {
        meltdownForModule(`Unauthorized skipJWT usage => event="${eventName}"`, moduleName, this);
        return false;
      }
    }

    // (6) If not skipJWT => require a valid JWT
    if (!providedJwt) {
      meltdownForModule(`No JWT provided => event="${eventName}"`, moduleName, this);
      return false;
    }

    // (7) decode unverified
    let decodedUnverified;
    try {
      decodedUnverified = jwt.decode(providedJwt) || {};
    } catch (err) {
      meltdownForModule(`Could not decode token => ${err.message}`, moduleName, this);
      return false;
    }
    if (!decodedUnverified.trustLevel) decodedUnverified.trustLevel = 'low';

    // (8) verify using salt
    const finalSecret = this.combineSecretWithSalt(JWT_SECRET, decodedUnverified.trustLevel);
    try {
      firstArg.decodedJWT = jwt.verify(providedJwt, finalSecret);
    } catch (verifyErr) {
      meltdownForModule(`Invalid JWT => ${verifyErr.message}`, moduleName, this);
      return false;
    }

    // (9) meltdown checks pass => do normal event
    const safeArgs = maskJwtInArgs(args);
    console.log('[MotherEmitter] Emitting event="%s" with %d arg(s)', eventName, safeArgs.length);
    return super.emit(eventName, ...args);
  }
}

const motherEmitter = new MotherEmitter();

/* ──────────────────────────────────────────────
   DEBUG HOOK: log any getPageBySlug without JWT
   ────────────────────────────────────────────── */
   const origEmit = motherEmitter.emit.bind(motherEmitter);

   motherEmitter.emit = function (event, payload, cb) {
     if (event === 'getPageBySlug' && (!payload || !payload.jwt)) {
       console.trace('[DEBUG] getPageBySlug **without** JWT from here ⇧');
     }
     return origEmit(event, payload, cb);
   };

/** 
 * Public event => remove all event listeners for the given module
 */
motherEmitter.on('removeListenersByModule', (payload) => {
  const modName = (typeof payload === 'string') ? payload : payload?.moduleName;
  if (!modName) {
    console.warn('[MotherEmitter] removeListenersByModule => missing moduleName => ignoring.');
    return;
  }
  console.warn('[MotherEmitter] Removing all listeners for module="%s"', modName);

  motherEmitter.eventNames().forEach(evtName => {
    motherEmitter.listeners(evtName).forEach(listener => {
      if (listener.moduleName === modName) {
        motherEmitter.removeListener(evtName, listener);
        console.warn('[MotherEmitter] Removed listener from event="%s" for module="%s"', evtName, modName);
      }
    });
  });
});

/**
 * Public event => "deactivateModule" means remove all the module’s listeners
 */
motherEmitter.on('deactivateModule', (payload) => {
  const { moduleName, reason } = payload || {};
  console.warn('[MotherEmitter] Deactivating module="%s" => reason="%s"', moduleName, reason);
  motherEmitter.emit('removeListenersByModule', { moduleName });
});

module.exports = {
  motherEmitter,
  onceCallback,
  meltdownForModule
};
