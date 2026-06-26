/**
 * mother/modules/shareManager/shareService.js
 *
 * Ensures the shareManager DB (or schema) and creates the "shared_links" table/collection.
 * Similar approach to pagesService.js => meltdown => dbUpdate with placeholders.
 */

require('dotenv').config();

/**
 * ensureShareManagerDatabase:
 *   meltdown => createDatabase
 *   bridging code decides if it's a dedicated DB or shared schema for shareManager.
 */
function ensureShareManagerDatabase(motherEmitter, jwt, nonce) {
  return new Promise((resolve, reject) => {
    console.log('[SHARE MANAGER SERVICE] Ensuring shareManager DB/Schema via createDatabase...');

    const meltdownPayload = {
      jwt,
      moduleName: 'shareManager',
      moduleType: 'core',
      nonce,
      targetModuleName: 'sharemanager'
    };

    motherEmitter.emit(
      'createDatabase',
      meltdownPayload,
      (err) => {
        if (err) {
          console.error('[SHARE MANAGER SERVICE] Error creating/fixing shareManager DB:', err.message);
          return reject(err);
        }
        console.log('[SHARE MANAGER SERVICE] shareManager DB/Schema creation done (if needed).');
        resolve();
      }
    );
  });
}

/**
 * ensureShareTables:
 *   meltdown => dbUpdate => { rawSQL: 'INIT_SHARED_LINKS_TABLE' }
 *   expected schema columns: shortToken, filePath, userId, isPublic,
 *   expiresAt TIMESTAMP
 */
function ensureShareTables(motherEmitter, jwt, nonce) {
  return new Promise((resolve, reject) => {
    console.log('[SHARE MANAGER SERVICE] Creating schema & table/collection for shareManager...');

    const meltdownPayload = {
      jwt,
      moduleName: 'shareManager',
      moduleType: 'core',
      nonce
    };

    motherEmitter.emit(
      'dbUpdate',
      {
        ...meltdownPayload,
        table: '__rawSQL__',
        where: {},
        data: { rawSQL: 'INIT_SHARED_LINKS_TABLE' }
      },
      (err) => {
        if (err) {
          console.error('[SHARE MANAGER SERVICE] Error creating shared_links table =>', err.message);
          return reject(err);
        }
        console.log('[SHARE MANAGER SERVICE] Placeholder "INIT_SHARED_LINKS_TABLE" done.');

        // if you want to do more, like "CHECK_AND_ALTER_SHARED_LINKS_TABLE", do it here

        resolve();
      }
    );
  });
}

module.exports = {
  ensureShareManagerDatabase,
  ensureShareTables
};
