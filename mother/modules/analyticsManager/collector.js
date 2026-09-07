'use strict';

const { normalizeRecord } = require('./domain');
const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');
const storageEvents = new Set([
  BACKEND_EVENTS.DB_SELECT, BACKEND_EVENTS.DB_INSERT, BACKEND_EVENTS.DB_UPDATE,
  BACKEND_EVENTS.DB_DELETE, BACKEND_EVENTS.PERFORM_DB_OPERATION, BACKEND_EVENTS.CREATE_DATABASE
]);
function isExcluded(input) { return input?.kind === 'system' && storageEvents.has(input.event); }
// Bounded module-owned ingress. Observers never block or recursively emit logs.
let queue = [];
let enabled = false;
let dropped = 0;
function record(input) {
  if (!enabled || isExcluded(input)) return;
  try {
    if (queue.length >= 2000) { dropped++; return; }
    queue.push(normalizeRecord(input));
  } catch { dropped++; }
}
function take() { const batch = queue; queue = []; return batch; }
function restore(batch) { queue = batch.concat(queue); if (queue.length > 2000) { dropped += queue.length - 2000; queue.length = 2000; } }
function setEnabled(value) { enabled = value === true; }
function health() { return { enabled, queued: queue.length, dropped }; }
module.exports = { record, take, restore, setEnabled, health, isExcluded };
