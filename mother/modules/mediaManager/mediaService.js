/**
 * mother/modules/mediaManager/mediaService.js
 *
 * This file has two simple functions:
 *   1) ensureMediaManagerDatabase => meltdown => createDatabase
 *   2) ensureMediaTables => meltdown => dbUpdate => 'INIT_MEDIA_SCHEMA'
 *
 */

require('dotenv').config();

function once(originalCb) {
  let fired = false;
  return (...args) => {
    if (fired) return;
    fired = true;
    if (typeof originalCb === 'function') originalCb(...args);
  };
}

function emitAsync(motherEmitter, eventName, payload) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(eventName, payload, once((err, result) => {
      if (err) return reject(err);
      resolve(result);
    }));
  });
}

function ensureMediaManagerDatabase(motherEmitter, jwt) {
  return new Promise((resolve, reject) => {
    console.log('[MEDIA MANAGER] Ensuring mediaManager DB/Schema via createDatabase meltdown...');

    motherEmitter.emit(
      'createDatabase',
      {
        jwt,
        moduleName : 'mediaManager',
        moduleType : 'core'
      },
      (err) => {
        if (err) {
          console.error('[MEDIA MANAGER] Error creating/fixing mediaManager DB:', err.message);
          return reject(err);
        }
        console.log('[MEDIA MANAGER] DB/Schema creation done (if needed).');
        resolve();
      }
    );
  });
}

function ensureMediaTables(motherEmitter, jwt) {
  return new Promise((resolve, reject) => {
    console.log('[MEDIA MANAGER] Creating schema & table/collection for mediaManager...');

    motherEmitter.emit(
      'dbUpdate',
      {
        jwt,
        moduleName : 'mediaManager',
        moduleType : 'core',
        table      : '__rawSQL__',
        data       : { rawSQL: 'INIT_MEDIA_SCHEMA' }
      },
      (err) => {
        if (err) {
          console.error('[MEDIA MANAGER] Error creating media schema/tables:', err.message);
          return reject(err);
        }
        console.log('[MEDIA MANAGER] Placeholder "INIT_MEDIA_SCHEMA" done.');
        resolve();
      }
    );
  });
}

function mediaDbUpdate(motherEmitter, jwt, rawSQL, params = {}) {
  return emitAsync(motherEmitter, 'dbUpdate', {
    jwt,
    moduleName: 'mediaManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

function mediaDbSelect(motherEmitter, jwt, rawSQL, params = {}) {
  return emitAsync(motherEmitter, 'dbSelect', {
    jwt,
    moduleName: 'mediaManager',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL, params }
  });
}

module.exports = {
  emitAsync,
  ensureMediaManagerDatabase,
  ensureMediaTables,
  mediaDbSelect,
  mediaDbUpdate
};
