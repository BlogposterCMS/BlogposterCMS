const assert = require('assert');
const EventEmitter = require('events');
const path = require('path');
const { registerApplySchemaDefinitionEvent } = require('../mother/modules/databaseManager/meltdownBridging/applySchemaDefinitionEvent');
const { registerApplySchemaFileEvent } = require('../mother/modules/databaseManager/meltdownBridging/applySchemaFileEvent');
const { registerCreateDatabaseEvent } = require('../mother/modules/databaseManager/meltdownBridging/createDatabaseEvent');
const { registerHighLevelCrudEvents } = require('../mother/modules/databaseManager/meltdownBridging/highLevelCrudEvents');
const { registerPerformDbOperationEvent } = require('../mother/modules/databaseManager/meltdownBridging/performDbOperationEvent');

function createEmitterWithCommunityModule(moduleName = 'demoModule') {
  const emitter = new EventEmitter();
  emitter._moduleTypes = { [moduleName]: 'community' };
  return emitter;
}

function emitAsync(emitter, eventName, payload) {
  return new Promise(resolve => {
    emitter.emit(eventName, payload, (err, result) => {
      resolve({ err, result });
    });
  });
}

test('database manager rejects community high-level database mutations', async () => {
  const emitter = createEmitterWithCommunityModule();
  let performedOperation = false;
  registerHighLevelCrudEvents(emitter);
  emitter.on('performDbOperation', () => {
    performedOperation = true;
  });

  const { err } = await emitAsync(emitter, 'dbUpdate', {
    jwt: 'token',
    moduleName: 'demoModule',
    moduleType: 'community',
    table: 'items',
    data: { title: 'Nope' },
    where: { id: 1 }
  });

  assert(err);
  assert.match(err.message, /cannot call dbUpdate/);
  assert.strictEqual(performedOperation, false);
});

test('database manager trusts registered community type over spoofed core payloads', async () => {
  const emitter = createEmitterWithCommunityModule();
  registerHighLevelCrudEvents(emitter);

  const { err } = await emitAsync(emitter, 'dbSelect', {
    jwt: 'token',
    moduleName: 'demoModule',
    moduleType: 'core',
    table: '__rawSQL__',
    data: { rawSQL: 'SELECT * FROM users' }
  });

  assert(err);
  assert.match(err.message, /cannot emit database events as moduleType="core"/);
});

test('database manager rejects direct community performDbOperation calls', async () => {
  const emitter = createEmitterWithCommunityModule();
  registerPerformDbOperationEvent(emitter);

  const { err } = await emitAsync(emitter, 'performDbOperation', {
    jwt: 'token',
    moduleName: 'demoModule',
    moduleType: 'community',
    operation: 'DROP TABLE users',
    params: []
  });

  assert(err);
  assert.match(err.message, /cannot call performDbOperation directly/);
});

test('community dbSelect stays local and bypasses remote database bridge', async () => {
  const oldRemoteUrl = process.env.REMOTE_URL_demoModule;
  const oldAllowlist = process.env.REMOTE_URL_ALLOWLIST;
  process.env.REMOTE_URL_demoModule = 'http://db.example.test';
  process.env.REMOTE_URL_ALLOWLIST = 'db.example.test';

  try {
    const emitter = createEmitterWithCommunityModule();
    const operations = [];
    registerHighLevelCrudEvents(emitter);
    emitter.on('performDbOperation', (payload, cb) => {
      operations.push(payload);
      cb(null, { rows: [{ id: 1, title: 'Local' }] });
    });

    const { err, result } = await emitAsync(emitter, 'dbSelect', {
      jwt: 'token',
      moduleName: 'demoModule',
      moduleType: 'community',
      table: 'items'
    });

    assert.ifError(err);
    assert.deepStrictEqual(result, [{ id: 1, title: 'Local' }]);
    assert.strictEqual(operations.length, 1);
    assert.match(operations[0].operation, /^\s*SELECT\b/i);
  } finally {
    if (oldRemoteUrl === undefined) {
      delete process.env.REMOTE_URL_demoModule;
    } else {
      process.env.REMOTE_URL_demoModule = oldRemoteUrl;
    }

    if (oldAllowlist === undefined) {
      delete process.env.REMOTE_URL_ALLOWLIST;
    } else {
      process.env.REMOTE_URL_ALLOWLIST = oldAllowlist;
    }
  }
});

test('database manager rejects unsafe high-level table identifiers', async () => {
  const emitter = createEmitterWithCommunityModule();
  let performedOperation = false;
  registerHighLevelCrudEvents(emitter);
  emitter.on('performDbOperation', () => {
    performedOperation = true;
  });

  const { err } = await emitAsync(emitter, 'dbSelect', {
    jwt: 'token',
    moduleName: 'demoModule',
    moduleType: 'community',
    table: 'items"; DROP TABLE users; --'
  });

  assert(err);
  assert.match(err.message, /Unsafe database identifier/);
  assert.strictEqual(performedOperation, false);
});

test('database manager rejects unsafe high-level raw expressions', async () => {
  const emitter = new EventEmitter();
  let performedOperation = false;
  registerHighLevelCrudEvents(emitter);
  emitter.on('performDbOperation', () => {
    performedOperation = true;
  });

  const { err } = await emitAsync(emitter, 'dbUpdate', {
    jwt: 'token',
    moduleName: 'userManagement',
    moduleType: 'core',
    table: 'users',
    data: {
      token_version: { __raw_expr: 'token_version + 1; DROP TABLE users' }
    },
    where: { id: 1 }
  });

  assert(err);
  assert.match(err.message, /Unsafe raw expression/);
  assert.strictEqual(performedOperation, false);
});

test('database manager rejects community database lifecycle events', async () => {
  const createEmitter = createEmitterWithCommunityModule();
  registerCreateDatabaseEvent(createEmitter);
  const createResult = await emitAsync(createEmitter, 'createDatabase', {
    jwt: 'token',
    moduleName: 'demoModule',
    moduleType: 'community'
  });

  assert(createResult.err);
  assert.match(createResult.err.message, /schema and database lifecycle belong to core/);

  const schemaFileEmitter = createEmitterWithCommunityModule();
  registerApplySchemaFileEvent(schemaFileEmitter);
  const schemaFileResult = await emitAsync(schemaFileEmitter, 'applySchemaFile', {
    jwt: 'token',
    moduleName: 'demoModule',
    moduleType: 'community',
    filePath: 'schema.json'
  });

  assert(schemaFileResult.err);
  assert.match(schemaFileResult.err.message, /schema and database lifecycle belong to core/);

  const schemaDefinitionEmitter = createEmitterWithCommunityModule();
  registerApplySchemaDefinitionEvent(schemaDefinitionEmitter);
  const schemaDefinitionResult = await emitAsync(schemaDefinitionEmitter, 'applySchemaDefinition', {
    jwt: 'token',
    moduleName: 'demoModule',
    moduleType: 'community',
    filePath: 'schema.json'
  });

  assert(schemaDefinitionResult.err);
  assert.match(schemaDefinitionResult.err.message, /schema and database lifecycle belong to core/);
});

test('database manager requires explicit core payloads for lifecycle events', async () => {
  const emitter = new EventEmitter();
  registerCreateDatabaseEvent(emitter);

  const missingCoreType = await emitAsync(emitter, 'createDatabase', {
    jwt: 'token',
    moduleName: 'databaseManager'
  });

  assert(missingCoreType.err);
  assert.match(missingCoreType.err.message, /requires moduleType="core"/);

  const unsafeModuleName = await emitAsync(emitter, 'createDatabase', {
    jwt: 'token',
    moduleName: '../databaseManager',
    moduleType: 'core'
  });

  assert(unsafeModuleName.err);
  assert.match(unsafeModuleName.err.message, /Unsafe lifecycle module name/);
});

test('database manager rejects schema paths in sibling module prefixes', async () => {
  const emitter = new EventEmitter();
  registerApplySchemaDefinitionEvent(emitter);

  const siblingPrefixPath = path.join(
    __dirname,
    '..',
    'mother',
    'modules',
    'databaseManagerExtra',
    'schemaDefinition.json'
  );

  const result = await emitAsync(emitter, 'applySchemaDefinition', {
    jwt: 'token',
    moduleName: 'databaseManager',
    moduleType: 'core',
    filePath: siblingPrefixPath
  });

  assert(result.err);
  assert.match(result.err.message, /filePath outside module directory/);
});
