/**
 * mother/modules/auth/index.js
 *
 * The main Auth Module:
 *   1) Validates the JWT_SECRET
 *   2) Sets up meltdown events for the Auth Module (issueToken, validateToken, etc.)
 *   3) Dynamically loads & registers login strategies from ./strategies
 *   4) Provides meltdown events to enable/disable or list login strategies
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { onceCallback } = require('../../emitters/motherEmitter');
const { setupEventListeners } = require('./authService');
const { hasPermission } = require('../userManagement/permissionUtils');

const AUTH_STRATEGY_VIEW_PERMISSIONS = [
  'auth.strategies.view',
  'auth.strategies.manage'
];
const AUTH_STRATEGY_MANAGE_PERMISSION = 'auth.strategies.manage';
const MODULE_NAME = 'auth';
const MODULE_TYPE = 'core';

function requireCoreAuthPayload(payload, eventName) {
  if (!payload || !payload.jwt || payload.moduleName !== MODULE_NAME || payload.moduleType !== MODULE_TYPE) {
    throw new Error(`[AUTH MODULE] ${eventName} => invalid meltdown payload.`);
  }
}

function requireAuthPermission(payload, permissions, displayPermission) {
  const permissionList = Array.isArray(permissions) ? permissions : [permissions];
  if (!payload?.decodedJWT || !permissionList.some(permission => hasPermission(payload.decodedJWT, permission))) {
    throw new Error(`Forbidden - missing permission: ${displayPermission || permissionList[0]}`);
  }
}

module.exports = {
  initialize({ motherEmitter, JWT_SECRET, isCore }) {
    if (!isCore) {
      throw new Error('[AUTH MODULE] Must be loaded as a core module.');
    }
    if (!JWT_SECRET) {
      throw new Error('[AUTH MODULE] Missing JWT_SECRET, cannot sign tokens.');
    }
    const authModuleSecret = process.env.AUTH_MODULE_INTERNAL_SECRET;
    if (!authModuleSecret) {
      throw new Error('[AUTH MODULE] Missing AUTH_MODULE_INTERNAL_SECRET.');
    }
    if (!motherEmitter) {
      throw new Error('[AUTH MODULE] motherEmitter missing.');
    }
    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }

    console.log('[AUTH MODULE] Initializing core Auth Module...');
    setupEventListeners({ motherEmitter, JWT_SECRET });

    // A global place to store login strategies
    if (!global.loginStrategies) {
      global.loginStrategies = {};
    }

    // meltdown => listActiveLoginStrategies
    motherEmitter.on('listActiveLoginStrategies', (payload, cb) => {
      const callback = onceCallback(cb);
      try {
        requireCoreAuthPayload(payload, 'listActiveLoginStrategies');
      } catch (err) {
        return callback(err);
      }
      const activeStrategies = [];
      Object.entries(global.loginStrategies).forEach(([strategyName, strategyObj]) => {
        if (strategyObj.isEnabled) {
          activeStrategies.push({
            name: strategyName,
            description: strategyObj.description || '(No description)',
            scope: strategyObj.scope || 'admin'
          });
        }
      });

      callback(null, activeStrategies);
    });

    // meltdown => listLoginStrategies
    motherEmitter.on('listLoginStrategies', (payload, cb) => {
      const callback = onceCallback(cb);
      try {
        requireCoreAuthPayload(payload, 'listLoginStrategies');
        requireAuthPermission(payload, AUTH_STRATEGY_VIEW_PERMISSIONS, 'auth.strategies.view');
      } catch (err) {
        return callback(err);
      }
      const all = Object.entries(global.loginStrategies).map(([name, obj]) => ({
        name,
        description: obj.description || '(No description)',
        isEnabled: !!obj.isEnabled,
        scope: obj.scope || 'admin'
      }));
      callback(null, all);
    });

    // meltdown => setLoginStrategyEnabled
    motherEmitter.on('setLoginStrategyEnabled', (payload, cb) => {
      const callback = onceCallback(cb);
      try {
        requireCoreAuthPayload(payload, 'setLoginStrategyEnabled');
        requireAuthPermission(payload, AUTH_STRATEGY_MANAGE_PERMISSION);
      } catch (err) {
        return callback(err);
      }
      const { strategyName, enabled } = payload;
      if (!strategyName) {
        return callback(new Error('No strategyName specified.'));
      }
      const disallowed = ['__proto__', 'prototype', 'constructor'];
      if (disallowed.includes(strategyName)) {
        return callback(new Error('Invalid strategy name.'));
      }
      if (!Object.prototype.hasOwnProperty.call(global.loginStrategies, strategyName)) {
        return callback(new Error(`Strategy "${strategyName}" not found.`));
      }
      global.loginStrategies[strategyName].isEnabled = !!enabled;
      console.log(`[AUTH MODULE] Strategy "${strategyName}" => isEnabled=${enabled}`);
      return callback(null, { success: true });
    });

    // meltdown => registerLoginStrategy
    motherEmitter.on('registerLoginStrategy', (payload, cb) => {
      const callback = onceCallback(cb);
      const {
        skipJWT,
        moduleType,
        strategyName,
        description,
        loginFunction,
        scope,
        authModuleSecret: providedSecret
      } = payload || {};

      if (providedSecret !== authModuleSecret) {
        return callback(new Error('Invalid or missing auth module secret.'));
      }
      if (moduleType !== 'core' || skipJWT !== true) {
        return callback(new Error('Unauthorized login strategy registration.'));
      }
      if (!strategyName || typeof loginFunction !== 'function') {
        return callback(new Error('Invalid login strategy registration payload.'));
      }
      const disallowed = ['__proto__', 'prototype', 'constructor'];
      if (disallowed.includes(strategyName)) {
        return callback(new Error('Invalid strategy name.'));
      }

      global.loginStrategies[strategyName] = {
        description,
        loginFunction,
        isEnabled: strategyName === 'adminLocal',
        scope: scope || 'admin'
      };
      console.log(`[AUTH MODULE] Registered login strategy => ${strategyName}`);
      return callback(null, true);
    });

    // Finally, load all strategy files from ./strategies => e.g. google.js, facebook.js, etc.
    const strategiesPath = path.join(__dirname, 'strategies');
    if (fs.existsSync(strategiesPath)) {
      const strategyFiles = fs.readdirSync(strategiesPath).filter(file => file.endsWith('.js'));
      strategyFiles.forEach(file => {
        const strategy = require(path.join(strategiesPath, file));
        if (typeof strategy.initialize === 'function') {
          strategy.initialize({
            motherEmitter,
            JWT_SECRET,
            authModuleSecret
          });
          console.log(`[AUTH MODULE] Loaded strategy => ${file}`);
        }
      });
    } else {
      console.log('[AUTH MODULE] No additional OAuth strategies folder found.');
    }


// ─────────────────────────────────────────────────────────────
//  PUBLIC + CORE  loginWithStrategy listener
// ─────────────────────────────────────────────────────────────
motherEmitter.on('loginWithStrategy', (raw, cb) => {
  const callback = onceCallback(cb);

  /* unpack meltdown meta + user payload */
  const {
    moduleName,
    moduleType,
    decodedJWT,                 //  <-- now captured!
    strategy   = 'adminLocal',
    payload    = {}
  } = raw || {};

  /* allow three legitimate callers */
  const isCoreAuth  = moduleName === MODULE_NAME  && moduleType === MODULE_TYPE;
  const isPublicLogin =
        decodedJWT?.isPublic === true && decodedJWT?.purpose === 'login';

  if (!(isCoreAuth || isPublicLogin)) {
    return callback(
      new Error('[AUTH] loginWithStrategy ⇒ invalid payload / not authorized')
    );
  }

  /* look‑up strategy */
  const strat = global.loginStrategies[strategy];
  if (!strat || !strat.isEnabled) {
    return callback(new Error(`Strategy "${strategy}" disabled or unknown`));
  }

  /* safe execute */
  try {
    strat.loginFunction(payload, callback);
  } catch (ex) {
    console.error('[AUTH] Strategy "%s" threw:', strategy, ex);
    callback(ex);
  }
});

    
    console.log('[AUTH MODULE] Core Auth Module initialized successfully.');
  }
};
