const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const EventEmitter = require('events');

const { _internals } = require('../mother/modules/moduleLoader');
const {
  buildModuleRuntimeEnv
} = require('../mother/modules/moduleLoader/moduleRuntimeEnv');
const {
  runCommunityModuleHealthCheck,
  startCommunityModuleProcess
} = require('../mother/modules/moduleLoader/moduleProcessRuntime');

async function withTempModule(moduleName, files, fn) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-process-'));
  const modulesRoot = path.join(parent, 'modules');
  const root = path.join(modulesRoot, moduleName);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'moduleInfo.json'), JSON.stringify({
    moduleName,
    version: '1.0.0',
    developer: 'Test',
    description: 'Process runtime test'
  }));
  try {
    for (const [fileName, contents] of Object.entries(files)) {
      const filePath = path.join(root, fileName);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, contents);
    }
    return await fn({ modulesRoot, root, indexJsPath: path.join(root, 'index.js') });
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
}

async function withEnv(values, fn) {
  const previous = {};
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key];
    if (values[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = values[key];
    }
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function runtimeOptions({ root, indexJsPath }, overrides = {}) {
  return {
    app: { use() {} },
    indexJsPath,
    jwt: 'module-token',
    moduleDir: root,
    moduleInfo: { moduleName: path.basename(root) },
    moduleName: path.basename(root),
    motherEmitter: new EventEmitter(),
    nonce: 'nonce-1',
    ...overrides
  };
}

test('module runtime env hides service secrets even when the module declares them', async () => {
  await withEnv({
    OPENAI_API_KEY: 'secret-openai',
    BRAVE_API_KEY: 'secret-brave',
    GROK_API_KEY: 'secret-grok'
  }, async () => {
    await withTempModule('envModule', {
      'index.js': 'module.exports = { initialize() {} };'
    }, ({ root }) => {
      const env = buildModuleRuntimeEnv(root);
      assert.strictEqual(env.OPENAI_API_KEY, undefined);
      assert.strictEqual(env.BRAVE_API_KEY, undefined);
      assert.strictEqual(env.GROK_API_KEY, undefined);
    });

    await withTempModule('declaredEnvModule', {
      'apiDefinition.json': JSON.stringify({
        services: ['openai', { provider: 'brave' }]
      }),
      'index.js': 'module.exports = { initialize() {} };'
    }, ({ root }) => {
      const env = buildModuleRuntimeEnv(root);
      assert.strictEqual(env.OPENAI_API_KEY, undefined);
      assert.strictEqual(env.BRAVE_API_KEY, undefined);
      assert.strictEqual(env.GROK_API_KEY, undefined);
    });
  });
});

(process.platform === 'linux' ? test : test.skip)('process health check initializes a module through IPC without loading it into the host process', async () => {
  await withTempModule('healthModule', {
    'index.js': `
      module.exports = {
        async initialize({ motherEmitter }) {
          motherEmitter.emit('healthModule.ready', { ok: true }, () => {});
        }
      };
    `
  }, async context => {
    await runCommunityModuleHealthCheck(runtimeOptions(context));
    assert.strictEqual(global.loadedModules?.healthModule, undefined);
  });
});

(process.platform === 'linux' ? test : test.skip)('process runtime acknowledges an unclaimed module ready signal during startup', async () => {
  await withTempModule('readyModule', {
    'index.js': `
      module.exports = {
        async initialize({ motherEmitter }) {
          await new Promise((resolve, reject) => {
            motherEmitter.emit('readyModule.ready', { ok: true }, err => {
              if (err) return reject(err);
              resolve();
            });
          });
        }
      };
    `
  }, async context => {
    const motherEmitter = new EventEmitter();
    const runtime = await startCommunityModuleProcess(runtimeOptions(context, {
      motherEmitter
    }));

    try {
      assert.strictEqual(motherEmitter.listenerCount('readyModule.ready'), 0);
      assert.strictEqual(runtime.getRuntimeRecord().capabilities.processIsolated, true);
    } finally {
      await runtime.stop('test done');
    }
  });
});

(process.platform === 'linux' ? test : test.skip)('process runtime refuses raw Express access during health check', async () => {
  await withTempModule('rawAppModule', {
    'index.js': `
      module.exports = {
        async initialize({ app }) {
          app.get('/raw', () => {});
        }
      };
    `
  }, async context => {
    await assert.rejects(
      () => runCommunityModuleHealthCheck(runtimeOptions(context)),
      /E_MODULE_RUNNER_RAW_APP_DENIED|raw Express app/
    );
  });
});

(process.platform === 'linux' ? test : test.skip)('process runtime blocks direct system events at the host boundary', async () => {
  await withTempModule('systemEventModule', {
    'index.js': `
      module.exports = {
        async initialize({ motherEmitter }) {
          motherEmitter.emit('dbUpdate', { table: 'users', data: { admin: true } }, () => {});
        }
      };
    `
  }, async context => {
    await assert.rejects(
      () => runCommunityModuleHealthCheck(runtimeOptions(context)),
      /E_MODULE_ACCESS_DENIED|system event|not allowed/
    );
  });
});

(process.platform === 'linux' ? test : test.skip)('process runtime proxies module-owned listeners and callbacks over IPC', async () => {
  await withTempModule('listenerModule', {
    'index.js': `
      module.exports = {
        async initialize({ motherEmitter }) {
          motherEmitter.on('listenerModule.ping', (payload, callback) => {
            callback(null, { pong: payload.message });
          });
          motherEmitter.emit('listenerModule.ready', { ok: true }, () => {});
        }
      };
    `
  }, async context => {
    const motherEmitter = new EventEmitter();
    motherEmitter.on('listenerModule.ready', (_payload, callback) => callback(null, { ok: true }));
    const runtime = await startCommunityModuleProcess(runtimeOptions(context, { motherEmitter }));
    try {
      const result = await new Promise(resolve => {
        motherEmitter.emit('listenerModule.ping', { message: 'hello' }, (err, data) => {
          resolve({ err, data });
        });
      });
      assert.ifError(result.err);
      assert.deepStrictEqual(result.data, { pong: 'hello' });
      assert.strictEqual(runtime.getRuntimeRecord().capabilities.processIsolated, true);
    } finally {
      await runtime.stop('test done');
    }
  });
});

(process.platform === 'linux' ? test : test.skip)('process runtime proxies community storage calls over IPC', async () => {
  await withTempModule('storageModule', {
    'index.js': `
      module.exports = {
        async initialize({ moduleHost, motherEmitter }) {
          const rows = await moduleHost.storage.select('items', { where: { status: 'open' } });
          await moduleHost.storage.insert('items', { title: rows[0].title });
          motherEmitter.emit('storageModule.ready', { title: rows[0].title }, () => {});
        }
      };
    `
  }, async context => {
    const motherEmitter = new EventEmitter();
    const calls = [];
    motherEmitter.on('dbSelect', (payload, callback) => {
      calls.push({ eventName: 'dbSelect', payload });
      callback(null, [{ id: 1, title: 'Stored' }]);
    });
    motherEmitter.on('dbInsert', (payload, callback) => {
      calls.push({ eventName: 'dbInsert', payload });
      callback(null, [{ id: 2, title: payload.data.title }]);
    });
    motherEmitter.on('storageModule.ready', (_payload, callback) => callback(null, { ok: true }));

    const runtime = await startCommunityModuleProcess(runtimeOptions(context, { motherEmitter }));
    try {
      assert.deepStrictEqual(calls.map(call => call.eventName), ['dbSelect', 'dbInsert']);
      assert.strictEqual(calls[0].payload.table, 'community_storagemodule_items');
      assert.deepStrictEqual({ ...calls[0].payload.where }, { status: 'open' });
      assert.strictEqual(calls[1].payload.table, 'community_storagemodule_items');
      assert.deepStrictEqual({ ...calls[1].payload.data }, { title: 'Stored' });
      assert.strictEqual(runtime.getRuntimeRecord().capabilities.moduleStorage, true);
    } finally {
      await runtime.stop('test done');
    }
  });
});

test('module loader rejects mixed app, widget and package-manager folders', async () => {
  await withTempModule('mixedAppModule', {
    'index.js': 'module.exports = { initialize() {} };',
    'app.json': JSON.stringify({ name: 'mixedAppModule' })
  }, ({ root }) => {
    assert.throws(
      () => _internals.assertCommunityModuleFolderShape(root, 'mixedAppModule'),
      /app\.json/
    );
  });

  await withTempModule('mixedWidgetModule', {
    'index.js': 'module.exports = { initialize() {} };',
    'embedded-widget/widgetInfo.json': JSON.stringify({
      widgetId: 'embedded-widget',
      widgetType: 'public'
    })
  }, ({ root }) => {
    assert.throws(
      () => _internals.assertCommunityModuleFolderShape(root, 'mixedWidgetModule'),
      /widgetInfo\.json/
    );
  });

  await withTempModule('packagedModule', {
    'index.js': 'module.exports = { initialize() {} };',
    'package.json': JSON.stringify({ scripts: { postinstall: 'node setup.js' } })
  }, ({ root }) => {
    assert.throws(
      () => _internals.assertCommunityModuleFolderShape(root, 'packagedModule'),
      /package\.json/
    );
  });
});

test('module loader blocks former static frontends without mounting files', () => {
  const app = { use: jest.fn() };
  expect(() => _internals.serveStaticFrontend({row:{module_name:'legacy',is_active:true,moduleInfo:{staticFrontend:true}},app})).toThrow('E_MODULE_UI_DENIED');
  expect(app.use).not.toHaveBeenCalled();
});

(process.platform === 'linux' ? test : test.skip)('dummy community module initializes through the process health-check runner', async () => {
  const modulePath = path.resolve(__dirname, '../modules/dummyModule/index.js');
  await runCommunityModuleHealthCheck({
    indexJsPath: modulePath,
    jwt: 'module-token',
    moduleDir: path.dirname(modulePath),
    moduleInfo: { moduleName: 'dummyModule' },
    moduleName: 'dummyModule',
    motherEmitter: new EventEmitter(),
    nonce: 'nonce-1'
  });
});
