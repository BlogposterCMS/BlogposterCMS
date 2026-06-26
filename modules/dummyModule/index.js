/**
 * modules/dummyModule/index.js
 *
 * Minimal example of a no-UI community module.
 *
 * Community modules receive a scoped event bus and moduleHost. They can expose
 * module-owned events and react to documented hooks, but they must not call raw
 * database/system events or mutate host files directly.
 */

'use strict';

let initialized = false;

function cleanLogValue(value) {
  return String(value || '').replace(/[\n\r]/g, '');
}

module.exports = {
  async initialize({ motherEmitter, moduleHost }) {
    if (initialized) {
      console.warn('[DUMMY MODULE] initialize called more than once; skipping.');
      return;
    }
    initialized = true;

    console.log('[DUMMY MODULE] Initializing dummyModule...');

    motherEmitter.emit(
      'dummyModule.ready',
      {
        capabilities: {
          rawSql: Boolean(moduleHost?.capabilities?.rawSql),
          systemWrites: Boolean(moduleHost?.capabilities?.systemWrites)
        }
      },
      () => {}
    );

    motherEmitter.on('dummyModule.pagePublished', (pageObj = {}) => {
      const safeId = cleanLogValue(pageObj.id);
      const safeTitle = cleanLogValue(pageObj.title);
      console.log('[DUMMY MODULE] dummyModule.pagePublished => id=%s title=%s', safeId, safeTitle);
    });

    motherEmitter.on('dummyModule.dummyAction', (payload = {}, callback) => {
      const message = cleanLogValue(payload.message || payload.title || 'dummyModule.dummyAction');
      if (typeof callback === 'function') {
        callback(null, {
          ok: true,
          module: 'dummyModule',
          message
        });
      }
    });

    console.log('[DUMMY MODULE] dummyModule initialized. (No UI)');
  }
};
