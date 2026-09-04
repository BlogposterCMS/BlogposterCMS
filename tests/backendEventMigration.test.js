'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const {
  BACKEND_EVENT_CONTRACTS,
  BACKEND_EVENT_CONTRACTS_BY_NAME,
  getBackendEventContract,
  requestBackendEvent
} = require('../mother/contracts/backendEventContracts');
const { EVENT_CONTRACT_ERROR_CODES } = require('../mother/contracts/eventContract');
const {
  BACKEND_EVENTS,
  BACKEND_EVENT_NAMES
} = require('../mother/contracts/generatedBackendEventCatalog');
const {
  GENERATED_BACKEND_EVENT_CONTRACT_SPECS
} = require('../mother/contracts/generatedBackendEventContractSpecs');

const ROOT = path.resolve(__dirname, '..');

test('backend event migration check blocks stale catalogs and private Promise adapters', () => {
  const result = spawnSync(process.execPath, [
    path.join(ROOT, 'tools', 'migrate-backend-event-contracts.js'),
    '--check'
  ], { cwd: ROOT, encoding: 'utf8' });

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Backend event contract migration is current/);
});

test('generated backend catalog is unique and resolves every declared event', () => {
  assert(BACKEND_EVENT_NAMES.length >= 300);
  assert.strictEqual(new Set(BACKEND_EVENT_NAMES).size, BACKEND_EVENT_NAMES.length);
  for (const eventName of BACKEND_EVENT_NAMES) {
    const contract = getBackendEventContract(eventName);
    assert.strictEqual(contract?.eventName, eventName);
    assert(contract.payloadSchema);
    assert(contract.resultSchema);
    assert(contract.resultType);
    assert.notStrictEqual(contract.resultType, 'BackendEventResult');
    assert(contract.timeoutMs > 0);
    assert.strictEqual(schemaContainsAny(contract.payloadSchema), false, `${eventName} payload contains any`);
    assert.strictEqual(schemaContainsAny(contract.resultSchema), false, `${eventName} result contains any`);
  }
  assert(BACKEND_EVENT_CONTRACTS_BY_NAME.size >= BACKEND_EVENT_NAMES.length);
  for (const contract of Object.values(BACKEND_EVENT_CONTRACTS)) {
    assert.strictEqual(getBackendEventContract(contract.eventName), contract);
  }
});

function schemaContainsAny(schema) {
  if (!schema || typeof schema !== 'object') return false;
  if (schema.type === 'any') return true;
  return Object.values(schema).some(value => (
    Array.isArray(value)
      ? value.some(schemaContainsAny)
      : schemaContainsAny(value)
  ));
}

test('generated schemas and stable constants cover the complete backend event catalog', () => {
  assert.deepStrictEqual(
    Object.keys(GENERATED_BACKEND_EVENT_CONTRACT_SPECS).sort(),
    [...BACKEND_EVENT_NAMES].sort()
  );
  assert.deepStrictEqual(
    Object.values(BACKEND_EVENTS).sort(),
    [...BACKEND_EVENT_NAMES].sort()
  );
  assert.strictEqual(
    new Set(BACKEND_EVENT_NAMES.map(eventName => getBackendEventContract(eventName).resultType)).size,
    BACKEND_EVENT_NAMES.length
  );

  const catalogTypes = fs.readFileSync(
    path.join(ROOT, 'mother', 'contracts', 'generatedBackendEventCatalog.d.ts'),
    'utf8'
  );
  const contractTypes = fs.readFileSync(
    path.join(ROOT, 'mother', 'contracts', 'generatedBackendEventContracts.d.ts'),
    'utf8'
  );
  assert.match(catalogTypes, /readonly CMS_ADMIN_API_REQUEST: "cmsAdminApiRequest";/);
  assert.match(contractTypes, /export type DbSelectResult = JsonValue \| undefined;/);
  assert.match(contractTypes, /export interface BackendEventContractMap/);
  assert.deepStrictEqual(
    GENERATED_BACKEND_EVENT_CONTRACT_SPECS.registerFontProvider.payloadSchema.properties.initFunction,
    { type: 'function' }
  );
});

test('generated payload schemas reject undeclared fields for statically closed events', async () => {
  const emitter = new EventEmitter();
  emitter.on(BACKEND_EVENTS.APPLY_SCHEMA_DEFINITION, (_payload, callback) => callback(null, { ok: true }));

  await assert.rejects(
    () => requestBackendEvent(emitter, BACKEND_EVENTS.APPLY_SCHEMA_DEFINITION, {
      moduleName: 'testModule',
      unexpected: true
    }),
    error => (
      error.code === EVENT_CONTRACT_ERROR_CODES.INVALID_PAYLOAD &&
      error.details.path === '$.unexpected'
    )
  );
});

test('shared backend request helper works with a plain EventEmitter and rejects undeclared events', async () => {
  const emitter = new EventEmitter();
  emitter.on('dbSelect', (_payload, callback) => callback(null, []));

  const rows = await requestBackendEvent(emitter, 'dbSelect', { moduleName: 'testModule' });
  assert.deepStrictEqual(rows, []);

  await assert.rejects(
    () => requestBackendEvent(emitter, 'not.declared', { moduleName: 'testModule' }),
    error => error.code === EVENT_CONTRACT_ERROR_CODES.NOT_REGISTERED
  );
});

test('long-running facade deadline outlives every mutating inner contract deadline', () => {
  const outer = BACKEND_EVENT_CONTRACTS.CMS_ADMIN_API_REQUEST;
  for (const eventName of [
    'installAppFromDirectory',
    'installModuleFromZip',
    'installModuleUpdate',
    'runExport',
    'runImport'
  ]) {
    assert(outer.timeoutMs > getBackendEventContract(eventName).timeoutMs);
  }
});
