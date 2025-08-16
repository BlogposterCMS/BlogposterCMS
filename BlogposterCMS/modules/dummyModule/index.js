/**
 * mother/modules/dummyModule/index.js
 *
 * Minimal example of how a NO-UI module can look.
 *
 * Use this file as a template for your own community modules. The
 * comments walk you through every available hook and demonstrate how to
 * trigger safe database operations via the meltdown event bus.
 *
 * - No Express routes because we do NOT receive an `app` instance.
 * - Only `motherEmitter` is provided for DB, hooks and apiCoreRequest.
 * - A JWT and nonce are supplied by the module loader for authenticated events.
 */

'use strict';

module.exports = {
    /**
     * Called by the moduleLoader:
     *    await dummyModule.initialize({ motherEmitter, jwt, nonce });
     *
     * Inside this function you may:
     *   - register events
     *   - call "apiCoreRequest"
     *   - trigger "performDbOperation" / "createDatabase"
     */
    async initialize({ motherEmitter, jwt, nonce }) {
      console.log('[DUMMY MODULE] Initializing dummyModule...');
      // jwt => signed token issued by the loader; include in all non-public events
      // nonce => unique value for replay protection (not used in this demo)
  
      // 1) Example hook: pagePublished
      motherEmitter.on('pagePublished', (pageObj) => {
        const safeId = String(pageObj.id).replace(/[\n\r]/g, '');
        const safeTitle = String(pageObj.title || '').replace(/[\n\r]/g, '');
        console.log('[DUMMY MODULE] Detected pagePublished => id=%s title=%s', safeId, safeTitle);
        // Example: call a fictional external API.
        // Tokens or other secrets should NEVER live in the code.
        // Use environment variables instead.
        // motherEmitter.emit('apiCoreRequest', { service, action, payload }, cb)
        motherEmitter.emit(
          'apiCoreRequest',
          {
            jwt,
            moduleName: 'dummyModule',
            moduleType: 'community',
            service: 'dummyService',    // => in apiDefinition.json definiert
            action : 'logPagePublish',  // => "actionName": "logPagePublish"
            payload: { pageId: pageObj.id, title: pageObj.title }
          },
          (err, result) => {
            if (err) {
              console.error('[DUMMY MODULE] dummyService.logPagePublish error: %s', err.message);
            } else {
              console.log('[DUMMY MODULE] dummyService.logPagePublish result: %o', result);
            }
          }
        );
      });
  
      // 2) Example: database operation
      //    Here we create a simple "dummy table" if it doesn't exist.
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS dummy_dummytable (
          id SERIAL PRIMARY KEY,
          data TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `;
      motherEmitter.emit(
        'performDbOperation',
        {
          jwt,
          moduleName: 'dummyModule',
          moduleType: 'community',
          operation: createTableSQL,
          params: []
        },
        (err) => {
          if (err) {
            console.error('[DUMMY MODULE] Error creating dummy_dummytable: %s', err.message);
          } else {
            console.log('[DUMMY MODULE] dummy_dummytable ensured/created in dummymodule_db.');
          }
        }
      );
  
      // 3) Example: listen for the custom event "dummyAction"
      motherEmitter.on('dummyAction', (payload, callback) => {
        console.log('[DUMMY MODULE] got dummyAction');
        // => Do something here
        // => For example insert data into our dummy table
        const insertSQL = 'INSERT INTO dummy_dummytable(data) VALUES($1)';
        motherEmitter.emit(
          'performDbOperation',
          {
            jwt,
            moduleName: 'dummyModule',
            moduleType: 'community',
            operation: insertSQL,
            params: [ JSON.stringify(payload) ]
          },
          (dbErr) => {
            if (typeof callback !== 'function') return;
            if (dbErr) return callback(dbErr);
            callback(null, { success: true });
          }
        );
      });
  
      // => Done
      console.log('[DUMMY MODULE] dummyModule initialized. (No UI)');
      // Copy this module and adjust the events
      // to integrate your own features into BlogposterCMS.
    }
  };
  