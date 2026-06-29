const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const EventEmitter = require('events');

const {
  initModuleRegistryAdminEvents,
  _internals
} = require('../mother/modules/moduleLoader/moduleRegistryEvents');

class ActivationEmitter extends EventEmitter {
  constructor() {
    super();
    this.updates = [];
    this.removals = [];
    this.registered = [];
  }

  registerModuleType(moduleName, moduleType) {
    this.registered.push({ moduleName, moduleType });
  }

  emit(eventName, payload, cb) {
    if (eventName === 'dbSelect') {
      if (typeof cb === 'function') cb(null, []);
      return true;
    }
    if (eventName === 'dbUpdate') {
      this.updates.push(payload);
      if (typeof cb === 'function') cb(null, { ok: true });
      return true;
    }
    if (eventName === 'removeListenersByModule') {
      this.removals.push(payload);
      return true;
    }
    return super.emit(eventName, payload, cb);
  }
}

async function withTempModule(moduleName, source, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-activation-'));
  const modulesRoot = path.join(root, 'modules');
  const moduleDir = path.join(modulesRoot, moduleName);
  fs.mkdirSync(moduleDir, { recursive: true });
  fs.writeFileSync(path.join(moduleDir, 'moduleInfo.json'), JSON.stringify({
    moduleName,
    version: '1.0.0',
    developer: 'Test',
    description: 'Activation test'
  }));
  fs.writeFileSync(path.join(moduleDir, 'index.js'), source);

  const originalCwd = process.cwd();
  const previousLoadedModules = global.loadedModules;
  try {
    process.chdir(root);
    return await fn({ root, modulesRoot, moduleDir });
  } finally {
    const loadedModule = global.loadedModules?.[moduleName];
    if (loadedModule && typeof loadedModule.stop === 'function') {
      await loadedModule.stop('test cleanup');
    }
    process.chdir(originalCwd);
    global.loadedModules = previousLoadedModules;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('activateModuleInRegistry immediate load uses scoped community event bus', async () => {
  await withTempModule('safeActivation', `
    module.exports = {
      async initialize({ motherEmitter, app, moduleHost }) {
        app.get('/raw', () => {});
        motherEmitter.emit('safeActivation.ready', { ok: true }, () => {});
        module.exports.capabilities = moduleHost.capabilities;
      }
    };
  `, async ({ modulesRoot }) => {
    const emitter = new ActivationEmitter();
    const forwarded = [];
    emitter.on('safeActivation.ready', (payload, cb) => {
      forwarded.push(payload);
      cb(null, { ok: true });
    });

    const previousAppAccess = process.env.ALLOW_COMMUNITY_APP_ACCESS;
    process.env.ALLOW_COMMUNITY_APP_ACCESS = 'true';
    try {
      const result = await _internals.attemptSingleLoad('safeActivation', emitter, {}, 'module-token', { modulesRoot });

      assert.strictEqual(result, false);
      assert.strictEqual(emitter.removals.length, 0);
      assert.strictEqual(global.loadedModules?.safeActivation, undefined);
      assert.match(emitter.updates[0].data.last_error, /raw Express app/);
    } finally {
      if (previousAppAccess === undefined) {
        delete process.env.ALLOW_COMMUNITY_APP_ACCESS;
      } else {
        process.env.ALLOW_COMMUNITY_APP_ACCESS = previousAppAccess;
      }
    }
  });
});

test('activateModuleInRegistry immediate load scopes safe payloads and records loaded module', async () => {
  await withTempModule('safeActivation', `
    module.exports = {
      async initialize({ motherEmitter, moduleHost }) {
        motherEmitter.emit('safeActivation.ready', { ok: true }, () => {});
        module.exports.capabilities = moduleHost.capabilities;
      }
    };
  `, async ({ modulesRoot }) => {
    const emitter = new ActivationEmitter();
    const forwarded = [];
    emitter.on('safeActivation.ready', (payload, cb) => {
      forwarded.push(payload);
      cb(null, { ok: true });
    });

    const result = await _internals.attemptSingleLoad('safeActivation', emitter, {}, 'module-token', { modulesRoot });

    assert.strictEqual(result, true);
    assert.deepStrictEqual(emitter.registered[0], {
      moduleName: 'safeActivation',
      moduleType: 'community'
    });
    assert.strictEqual(forwarded[0].moduleName, 'safeActivation');
    assert.strictEqual(forwarded[0].moduleType, 'community');
    assert.strictEqual(forwarded[0].jwt, 'module-token');
    assert.strictEqual(typeof forwarded[0].nonce, 'string');
    assert.strictEqual(global.loadedModules.safeActivation.capabilities.rawExpressApp, false);
    assert.strictEqual(global.loadedModules.safeActivation.capabilities.systemWrites, false);
  });
});

test('activateModuleInRegistry does not expose loader tokens in module initialize context', async () => {
  await withTempModule('tokenlessActivation', `
    module.exports = {
      async initialize(context) {
        context.motherEmitter.emit('tokenlessActivation.ready', {
          hasJwt: Object.prototype.hasOwnProperty.call(context, 'jwt'),
          hasNonce: Object.prototype.hasOwnProperty.call(context, 'nonce')
        }, () => {});
      }
    };
  `, async ({ modulesRoot }) => {
    const emitter = new ActivationEmitter();
    const forwarded = [];
    emitter.on('tokenlessActivation.ready', (payload, cb) => {
      forwarded.push(payload);
      cb(null, payload);
    });

    const result = await _internals.attemptSingleLoad('tokenlessActivation', emitter, {}, 'module-token', { modulesRoot });

    assert.strictEqual(result, true);
    assert.strictEqual(forwarded[0].hasJwt, false);
    assert.strictEqual(forwarded[0].hasNonce, false);
  });
});

test('activateModuleInRegistry immediate load blocks system events', async () => {
  await withTempModule('badActivation', `
    module.exports = {
      async initialize({ motherEmitter }) {
        motherEmitter.emit('dbUpdate', { table: 'users', data: { admin: true } }, () => {});
      }
    };
  `, async ({ modulesRoot }) => {
    const emitter = new ActivationEmitter();
    const result = await _internals.attemptSingleLoad('badActivation', emitter, {}, 'module-token', { modulesRoot });

    assert.strictEqual(result, false);
    assert.strictEqual(emitter.removals.length, 0);
    assert.strictEqual(global.loadedModules?.badActivation, undefined);
    assert.match(emitter.updates[0].data.last_error, /system event/);
  });
});

test('activateModuleInRegistry immediate load runs community code outside the host process', async () => {
  await withTempModule('processActivation', `
    module.exports = {
      async initialize({ motherEmitter }) {
        motherEmitter.emit('processActivation.ready', { modulePid: process.pid }, () => {});
      }
    };
  `, async ({ modulesRoot }) => {
    const emitter = new ActivationEmitter();
    const forwarded = [];
    emitter.on('processActivation.ready', (payload, cb) => {
      forwarded.push(payload);
      cb(null, { ok: true });
    });

    const result = await _internals.attemptSingleLoad('processActivation', emitter, {}, 'module-token', { modulesRoot });

    assert.strictEqual(result, true);
    assert.notStrictEqual(forwarded[0].modulePid, process.pid);
    assert.strictEqual(global.loadedModules.processActivation.runtime, 'process');
    assert.strictEqual(typeof global.loadedModules.processActivation.processId, 'number');
  });
});

test('activateModuleInRegistry rejects app-shaped folders in modules', async () => {
  await withTempModule('mixedActivation', `
    module.exports = {
      async initialize({ motherEmitter }) {
        motherEmitter.emit('mixedActivation.ready', {}, () => {});
      }
    };
  `, async ({ modulesRoot, moduleDir }) => {
    fs.writeFileSync(path.join(moduleDir, 'app.json'), JSON.stringify({
      name: 'mixedActivation'
    }));

    const emitter = new ActivationEmitter();
    const result = await _internals.attemptSingleLoad('mixedActivation', emitter, {}, 'module-token', { modulesRoot });

    assert.strictEqual(result, false);
    assert.strictEqual(emitter.removals.length, 0);
    assert.strictEqual(global.loadedModules?.mixedActivation, undefined);
    assert.match(emitter.updates[0].data.last_error, /app\.json/);
  });
});

test('activateModuleInRegistry rejects widget-shaped content nested in modules', async () => {
  await withTempModule('mixedWidgetActivation', `
    module.exports = {
      async initialize({ motherEmitter }) {
        motherEmitter.emit('mixedWidgetActivation.ready', {}, () => {});
      }
    };
  `, async ({ modulesRoot, moduleDir }) => {
    const widgetDir = path.join(moduleDir, 'embedded-widget');
    fs.mkdirSync(widgetDir, { recursive: true });
    fs.writeFileSync(path.join(widgetDir, 'widgetInfo.json'), JSON.stringify({
      widgetId: 'embedded-widget',
      widgetType: 'public'
    }));

    const emitter = new ActivationEmitter();
    const result = await _internals.attemptSingleLoad('mixedWidgetActivation', emitter, {}, 'module-token', { modulesRoot });

    assert.strictEqual(result, false);
    assert.strictEqual(emitter.removals.length, 0);
    assert.strictEqual(global.loadedModules?.mixedWidgetActivation, undefined);
    assert.match(emitter.updates[0].data.last_error, /widgetInfo\.json/);
  });
});

test('deactivateModuleInRegistry removes runtime listeners and loaded module exports', async () => {
  const emitter = new ActivationEmitter();
  initModuleRegistryAdminEvents(emitter, {});

  let stopped = false;
  global.loadedModules = {
    staleModule: {
      async stop() {
        stopped = true;
      }
    }
  };
  const staleListener = Object.assign(() => {}, { moduleName: 'staleModule' });
  emitter.on('stale.event', staleListener);

  const result = await new Promise(resolve => {
    emitter.emit('deactivateModuleInRegistry', {
      jwt: 'module-token',
      moduleName: 'moduleLoader',
      moduleType: 'core',
      targetModuleName: 'staleModule'
    }, (err, data) => resolve({ err, data }));
  });

  assert.ifError(result.err);
  assert.deepStrictEqual(result.data, {
    moduleName: 'staleModule',
    deactivated: true
  });
  assert.strictEqual(emitter.updates[0].where.module_name, 'staleModule');
  assert.strictEqual(emitter.updates[0].data.is_active, false);
  assert.strictEqual(global.loadedModules.staleModule, undefined);
  assert.strictEqual(stopped, true);
  assert.strictEqual(emitter.removals.length, 0);
  assert.strictEqual(emitter.listeners('stale.event').length, 0);
});

test('registry admin events refuse core-owned module names', async () => {
  const emitter = new ActivationEmitter();
  initModuleRegistryAdminEvents(emitter, {});

  for (const eventName of ['activateModuleInRegistry', 'deactivateModuleInRegistry']) {
    const result = await new Promise(resolve => {
      emitter.emit(eventName, {
        jwt: 'module-token',
        moduleName: 'moduleLoader',
        moduleType: 'core',
        targetModuleName: 'designer'
      }, (err, data) => resolve({ err, data }));
    });

    assert(result.err);
    assert.match(result.err.message, /Core-owned module "designer" cannot be/);
  }

  assert.strictEqual(emitter.updates.length, 0);
});
