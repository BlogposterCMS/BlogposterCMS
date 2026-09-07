'use strict';

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');
const { requestBackendEvent } = require('../../contracts/backendEventContracts');
const { hasPermission } = require('../userManagement/permissionUtils');
const collector = require('./collector');
const { summarize } = require('./domain');
let activeRuntime = null;

// Only this host adapter knows the current event/database runtime. A future Go
// adapter can retain the versioned JSON record and summary contracts unchanged.
async function initialize({ motherEmitter, jwt, nonce, isCore }) {
  if (!isCore || !motherEmitter || !jwt) throw new Error('ANALYTICS_INITIALIZATION_INVALID');
  if (activeRuntime) throw new Error('ANALYTICS_ALREADY_INITIALIZED');
  motherEmitter.registerModuleType('analyticsManager', 'core');
  const payload = { jwt, moduleName: 'analyticsManager', moduleType: 'core' };
  const db = (operation, params = {}, read = false) => requestBackendEvent(motherEmitter,
    read ? BACKEND_EVENTS.DB_SELECT : BACKEND_EVENTS.DB_UPDATE,
    { ...payload, table: '__rawSQL__', data: { rawSQL: operation, params } });
  await requestBackendEvent(motherEmitter, BACKEND_EVENTS.CREATE_DATABASE, { ...payload, nonce, targetModuleName: 'analyticsManager' });
  await db('INIT_ANALYTICS');
  let pending = null;
  let lastError = null;
  async function flush() {
    if (pending) return pending;
    const batch = collector.take().map(row => ({ ...row, id: row.id || globalThis.crypto.randomUUID() }));
    pending = (async () => {
      try {
        if (batch.length) await db('APPEND_ANALYTICS', { records: batch });
        await db('PRUNE_ANALYTICS', { before: new Date(Date.now() - 60 * 86400000).toISOString() });
        lastError = null;
      } catch {
        collector.restore(batch);
        lastError = 'ANALYTICS_STORAGE_UNAVAILABLE';
      } finally { pending = null; }
    })();
    return pending;
  }
  const handler = async (request, callback) => {
    try {
      if (!request?.decodedJWT || request.decodedJWT.isPublic || !hasPermission(request.decodedJWT, 'analytics.read')) throw new Error('ANALYTICS_FORBIDDEN');
      const days = request.days === undefined ? 7 : Number(request.days);
      if (![1, 7, 30].includes(days)) throw new Error('ANALYTICS_INVALID_PERIOD');
      await flush();
      const rows = await db('READ_ANALYTICS', { from: new Date(Date.now() - days * 2 * 86400000).toISOString() }, true);
      if (!Array.isArray(rows)) throw new Error('ANALYTICS_STORAGE_RESULT_INVALID');
      // Apply the same exclusion policy to already stored records after upgrades.
      callback(null, { ...summarize(rows.filter(row => !collector.isExcluded(row)), days), health: { ...collector.health(), lastError, truncated: rows.length > 100000 }, retentionDays: 60 });
    } catch (error) { callback(error); }
  };
  handler.moduleName = 'analyticsManager';
  motherEmitter.on(BACKEND_EVENTS.ANALYTICS_SUMMARY, handler);
  collector.setEnabled(true);
  const timer = setInterval(() => void flush(), 5000);
  timer.unref?.();
  activeRuntime = { flush, shutdown: async () => {
    collector.setEnabled(false); clearInterval(timer);
    await flush();
    // A concurrent batch may have been in flight before shutdown began.
    if (collector.health().queued && !lastError) await flush();
    motherEmitter.removeListener?.(BACKEND_EVENTS.ANALYTICS_SUMMARY, handler);
    activeRuntime = null;
  } };
  return activeRuntime;
}
async function shutdown() { if (activeRuntime) await activeRuntime.shutdown(); }
module.exports = { initialize, shutdown };
