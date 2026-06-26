const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const EventEmitter = require('events');
const {
  assertCommunityEventAllowed,
  createCommunityModuleHost,
  createCommunityHealthCheckHost,
  createDeniedAppFacade,
  isCommunityOwnedEvent,
  isCommunityOwnedQueryEvent,
  isCommunityLifecycleEvent,
  isCommunityOwnedTable,
  isCommunityQueryEvent,
  isBlockedCommunityStaticAssetPath,
  normalizeMountPath,
  resolveStaticAssetDir,
  createCommunityStaticAssetOptions,
  stripCommunityListenerPrivatePayload
} = require('../mother/modules/moduleLoader/moduleHost');

test('community event bus scopes emitted payloads to the owning module', () => {
  const motherEmitter = new EventEmitter();
  const calls = [];
  motherEmitter.on('dbSelect', payload => calls.push(payload));

  const moduleHost = createCommunityModuleHost({
    app: express(),
    motherEmitter,
    moduleName: 'demoModule',
    moduleDir: __dirname,
    jwt: 'token',
    nonce: 'nonce-1'
  });

  moduleHost.eventBus.emit('dbSelect', { table: 'demoModule_items' }, () => {});

  expect(calls).toEqual([
    {
      table: 'demoModule_items',
      jwt: 'token',
      moduleName: 'demoModule',
      moduleType: 'community',
      nonce: 'nonce-1'
    }
  ]);
});

test('community event bus refuses module identity spoofing', () => {
  const moduleHost = createCommunityModuleHost({
    app: express(),
    motherEmitter: new EventEmitter(),
    moduleName: 'demoModule',
    moduleDir: __dirname,
    jwt: 'token',
    nonce: 'nonce-1'
  });

  expect(() => {
    moduleHost.eventBus.emit('dbSelect', { moduleName: 'otherModule' }, () => {});
  }).toThrow(/cannot emit as/);

  expect(() => {
    moduleHost.eventBus.emit('dbSelect', { jwt: 'other-token' }, () => {});
  }).toThrow(/cannot override its module token/);

  expect(() => {
    moduleHost.eventBus.emit('dbSelect', { nonce: 'other-nonce' }, () => {});
  }).toThrow(/cannot override its nonce/);
});

test('community event bus refuses direct system mutation events', () => {
  const moduleHost = createCommunityModuleHost({
    app: express(),
    motherEmitter: new EventEmitter(),
    moduleName: 'demoModule',
    moduleDir: __dirname,
    jwt: 'token',
    nonce: 'nonce-1'
  });

  expect(() => {
    moduleHost.eventBus.emit('dbUpdate', { table: 'items', data: { title: 'Nope' } }, () => {});
  }).toThrow(/cannot call system event/);

  expect(() => {
    moduleHost.eventBus.emit('createDatabase', {}, () => {});
  }).toThrow(/cannot call system event/);

  expect(() => {
    moduleHost.eventBus.emit('httpRequest', { url: 'https://example.test' }, () => {});
  }).toThrow(/cannot call system event/);

  expect(() => {
    moduleHost.eventBus.emit('cmsAdminApiRequest', { path: '/admin' }, () => {});
  }).toThrow(/cannot call system event/);
});

test('community event bus only emits read/query events by default', () => {
  const motherEmitter = new EventEmitter();
  const calls = [];
  motherEmitter.on('demoModule.getSummary', payload => calls.push(payload));

  const moduleHost = createCommunityModuleHost({
    app: express(),
    motherEmitter,
    moduleName: 'demoModule',
    moduleDir: __dirname,
    jwt: 'token',
    nonce: 'nonce-1'
  });

  expect(isCommunityQueryEvent('getModuleSummary')).toBe(false);
  expect(isCommunityOwnedQueryEvent('demoModule.getSummary', 'demoModule')).toBe(true);
  expect(isCommunityOwnedQueryEvent('otherModule.getSummary', 'demoModule')).toBe(false);
  expect(isCommunityQueryEvent('saveModuleSummary')).toBe(false);
  expect(isCommunityQueryEvent('pagePublished')).toBe(false);
  expect(isCommunityLifecycleEvent('demoModule.ready', 'demoModule')).toBe(true);
  expect(isCommunityLifecycleEvent('otherModule.ready', 'demoModule')).toBe(false);
  expect(isCommunityOwnedEvent('demoModule.getSummary', 'demoModule')).toBe(true);
  expect(isCommunityOwnedEvent('otherModule.getSummary', 'demoModule')).toBe(false);

  moduleHost.eventBus.emit('demoModule.getSummary', { scope: 'own' }, () => {});
  moduleHost.eventBus.emit('demoModule.ready', {}, () => {});
  expect(calls).toEqual([
    {
      scope: 'own',
      jwt: 'token',
      moduleName: 'demoModule',
      moduleType: 'community',
      nonce: 'nonce-1'
    }
  ]);

  expect(() => {
    moduleHost.eventBus.emit('pagePublished', { id: 1 }, () => {});
  }).toThrow(/not allowed/);

  expect(() => {
    moduleHost.eventBus.emit('saveModuleSummary', { id: 1 }, () => {});
  }).toThrow(/not allowed/);

  expect(() => {
    moduleHost.eventBus.emit('getModuleSummary', { id: 1 }, () => {});
  }).toThrow(/module-owned data/);
});

test('community event bus refuses sensitive system query events', () => {
  const moduleHost = createCommunityModuleHost({
    app: express(),
    motherEmitter: new EventEmitter(),
    moduleName: 'demoModule',
    moduleDir: __dirname,
    jwt: 'token',
    nonce: 'nonce-1'
  });

  const sensitiveQueries = [
    'getAllUsers',
    'getUserDetailsById',
    'getAllRoles',
    'getAllPermissions',
    'getModuleRegistry',
    'listApps',
    'listSettings',
    'getModuleSettings',
    'listLoginStrategies'
  ];

  for (const eventName of sensitiveQueries) {
    expect(() => {
      moduleHost.eventBus.emit(eventName, {}, () => {});
    }).toThrow(/sensitive system event/);
  }
});

test('community event bus refuses arbitrary core query events', () => {
  const moduleHost = createCommunityModuleHost({
    app: express(),
    motherEmitter: new EventEmitter(),
    moduleName: 'demoModule',
    moduleDir: __dirname,
    jwt: 'token',
    nonce: 'nonce-1'
  });

  const coreQueries = [
    'getContentEntry',
    'listContentEntries',
    'listMediaAttachments',
    'getRecentNotifications',
    'resolveSeoMeta',
    'searchPages'
  ];

  for (const eventName of coreQueries) {
    expect(() => {
      moduleHost.eventBus.emit(eventName, {}, () => {});
    }).toThrow(/module-owned data/);
  }
});

test('community event bus refuses raw SQL reads', () => {
  expect(() => {
    assertCommunityEventAllowed('dbSelect', {
      table: '__rawSQL__',
      data: { rawSQL: 'LIST_CONTENT_ENTRIES' }
    });
  }).toThrow(/raw SQL/);
});

test('community event bus restricts dbSelect to module-owned tables', () => {
  expect(isCommunityOwnedTable('demoModule', 'demoModule_items')).toBe(true);
  expect(isCommunityOwnedTable('demoModule', 'community_demoModule_items')).toBe(true);
  expect(isCommunityOwnedTable('demoModule', 'users')).toBe(false);

  const moduleHost = createCommunityModuleHost({
    app: express(),
    motherEmitter: new EventEmitter(),
    moduleName: 'demoModule',
    moduleDir: __dirname,
    jwt: 'token',
    nonce: 'nonce-1'
  });

  expect(() => {
    moduleHost.eventBus.emit('dbSelect', { table: 'users' }, () => {});
  }).toThrow(/module-owned tables/);
});

test('community listeners are tagged with moduleName for cleanup', () => {
  const motherEmitter = new EventEmitter();
  const moduleHost = createCommunityModuleHost({
    app: express(),
    motherEmitter,
    moduleName: 'demoModule',
    moduleDir: __dirname,
    jwt: 'token',
    nonce: 'nonce-1'
  });

  moduleHost.eventBus.on('demoModule.pagePublished', () => {});

  expect(motherEmitter.listeners('demoModule.pagePublished')[0].moduleName).toBe('demoModule');
  expect(() => {
    moduleHost.eventBus.on('pagePublished', () => {});
  }).toThrow(/module-owned events/);
  expect(() => {
    moduleHost.eventBus.once('otherModule.ready', () => {});
  }).toThrow(/module-owned events/);
});

test('community listeners receive hardened payload and callback facades', () => {
  const motherEmitter = new EventEmitter();
  const moduleHost = createCommunityModuleHost({
    app: express(),
    motherEmitter,
    moduleName: 'demoModule',
    moduleDir: __dirname,
    jwt: 'token',
    nonce: 'nonce-1'
  });
  const seen = {};
  let callbackResult;

  moduleHost.eventBus.on('demoModule.incoming', (payload, callback) => {
    seen.payloadCtor = payload.constructor;
    seen.payloadProto = Object.getPrototypeOf(payload);
    seen.nestedCtor = payload.nested.constructor;
    seen.callbackCtor = callback.constructor;
    seen.callbackProto = Object.getPrototypeOf(callback);
    callback(null, { ok: true });
  });

  motherEmitter.emit('demoModule.incoming', { nested: { ok: true } }, (err, result) => {
    callbackResult = { err, result };
  });

  expect(seen.payloadCtor).toBeUndefined();
  expect(seen.payloadProto).toBe(null);
  expect(seen.nestedCtor).toBeUndefined();
  expect(seen.callbackCtor).toBeUndefined();
  expect(seen.callbackProto).toBe(null);
  expect(callbackResult).toEqual({ err: null, result: { ok: true } });
});

test('community listeners do not receive loader token fields', () => {
  const motherEmitter = new EventEmitter();
  const moduleHost = createCommunityModuleHost({
    app: express(),
    motherEmitter,
    moduleName: 'demoModule',
    moduleDir: __dirname,
    jwt: 'token',
    nonce: 'nonce-1'
  });
  let seenPayload;

  moduleHost.eventBus.on('demoModule.getSummary', payload => {
    seenPayload = payload;
  });
  moduleHost.eventBus.emit('demoModule.getSummary', { visible: true }, () => {});

  expect(seenPayload.visible).toBe(true);
  expect(seenPayload.moduleName).toBe('demoModule');
  expect(Object.prototype.hasOwnProperty.call(seenPayload, 'jwt')).toBe(false);
  expect(Object.prototype.hasOwnProperty.call(seenPayload, 'nonce')).toBe(false);
  expect(Object.prototype.hasOwnProperty.call(seenPayload, 'moduleType')).toBe(false);
  const stripped = stripCommunityListenerPrivatePayload({
    jwt: 'token',
    nonce: 'nonce-1',
    moduleType: 'community',
    keep: true
  });
  expect(stripped.keep).toBe(true);
  expect(Object.prototype.hasOwnProperty.call(stripped, 'jwt')).toBe(false);
});

test('community event bus refuses system listeners', () => {
  const moduleHost = createCommunityModuleHost({
    app: express(),
    motherEmitter: new EventEmitter(),
    moduleName: 'demoModule',
    moduleDir: __dirname,
    jwt: 'token',
    nonce: 'nonce-1'
  });

  expect(() => {
    moduleHost.eventBus.on('dbSelect', () => {});
  }).toThrow(/cannot subscribe to system event/);

  expect(() => {
    moduleHost.eventBus.once('cmsAdminApiRequest', () => {});
  }).toThrow(/cannot subscribe to system event/);

  expect(() => {
    moduleHost.eventBus.on('getAllUsers', () => {});
  }).toThrow(/cannot subscribe to system event/);
});

test('community event bus only exposes listener counts for module-owned events', () => {
  const motherEmitter = new EventEmitter();
  motherEmitter.on('getAllUsers', () => {});
  motherEmitter.on('demoModule.ready', () => {});

  const moduleHost = createCommunityModuleHost({
    app: express(),
    motherEmitter,
    moduleName: 'demoModule',
    moduleDir: __dirname,
    jwt: 'token',
    nonce: 'nonce-1'
  });

  expect(moduleHost.eventBus.listenerCount('demoModule.ready')).toBe(1);
  expect(() => {
    moduleHost.eventBus.listenerCount('getAllUsers');
  }).toThrow(/cannot subscribe to system event/);
  expect(() => {
    moduleHost.eventBus.listenerCount('otherModule.ready');
  }).toThrow(/module-owned events/);
});

test('community health check refuses system listeners', () => {
  const moduleHost = createCommunityHealthCheckHost({
    moduleName: 'demoModule',
    moduleDir: __dirname,
    jwt: 'token',
    nonce: 'nonce-1',
    markEvent: () => {}
  });

  expect(() => {
    moduleHost.eventBus.on('dbSelect', () => {});
  }).toThrow(/cannot subscribe to system event/);
});

test('static assets are constrained to the module URL and folder', () => {
  const app = express();
  const moduleHost = createCommunityModuleHost({
    app,
    motherEmitter: new EventEmitter(),
    moduleName: 'demoModule',
    moduleDir: __dirname,
    jwt: 'token',
    nonce: 'nonce-1'
  });

  const mount = moduleHost.registerStaticAssets({
    dir: 'sandboxModule',
    mountPath: 'assets'
  });

  expect(mount.mountPath).toBe('/modules/demoModule/assets');
  expect(mount.dir).toBe(path.join(__dirname, 'sandboxModule'));
  expect(() => {
    moduleHost.registerStaticAssets({ dir: '..', mountPath: 'bad' });
  }).toThrow(/inside the module folder/);
  expect(() => {
    moduleHost.registerStaticAssets({ dir: 'missing-static', mountPath: 'missing' });
  }).toThrow(/must exist/);
});

test('static assets block source, secret and package-manager files', () => {
  [
    '/component.ts',
    '/component.tsx',
    '/nested/.env.production',
    '/package.json',
    '/package-lock.json',
    '/pnpm-lock.yaml',
    '/.npmrc',
    '/%2eenv.local'
  ].forEach(requestPath => {
    expect(isBlockedCommunityStaticAssetPath(requestPath)).toBe(true);
  });

  [
    '/frontend/component.js',
    '/assets/styles.css',
    '/package-card.json'
  ].forEach(requestPath => {
    expect(isBlockedCommunityStaticAssetPath(requestPath)).toBe(false);
  });
});

test('community static asset options cannot expose host callbacks', () => {
  expect(createCommunityStaticAssetOptions({
    dotfiles: 'allow',
    maxAge: '1h',
    immutable: true,
    extensions: ['html', 'json'],
    index: ['index.html']
  })).toEqual({
    dotfiles: 'ignore',
    maxAge: '1h',
    immutable: true,
    extensions: ['html', 'json'],
    index: ['index.html']
  });

  expect(() => {
    createCommunityStaticAssetOptions({ setHeaders() {} });
  }).toThrow(/not available|callbacks/);
  expect(() => {
    createCommunityStaticAssetOptions({ index: '../admin.html' });
  }).toThrow(/unsafe value/);
  expect(() => {
    createCommunityStaticAssetOptions({ fallthrough: 'yes' });
  }).toThrow(/must be boolean/);
});

test('static assets reject realpath escapes from symlinked directories', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-host-'));
  const moduleDir = path.join(tmpRoot, 'demoModule');
  const outsideDir = path.join(tmpRoot, 'outside');
  const linkDir = path.join(moduleDir, 'public-link');
  fs.mkdirSync(moduleDir, { recursive: true });
  fs.mkdirSync(outsideDir, { recursive: true });

  try {
    try {
      fs.symlinkSync(outsideDir, linkDir, process.platform === 'win32' ? 'junction' : 'dir');
    } catch {
      return;
    }

    expect(() => {
      resolveStaticAssetDir(moduleDir, 'public-link');
    }).toThrow(/inside the module folder/);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('legacy app facade denies direct Express access', () => {
  const appFacade = createDeniedAppFacade('demoModule');
  expect(() => appFacade.get('/x', () => {})).toThrow(/raw Express app/);
});

test('community host facades do not expose host constructors', () => {
  const motherEmitter = new EventEmitter();
  const moduleHost = createCommunityModuleHost({
    app: express(),
    motherEmitter,
    moduleName: 'demoModule',
    moduleDir: __dirname,
    jwt: 'token',
    nonce: 'nonce-1'
  });
  const appFacade = createDeniedAppFacade('demoModule');
  const listener = moduleHost.eventBus.on('demoModule.ready', () => {});

  expect(listener).toBeUndefined();
  expect(Object.getPrototypeOf(moduleHost)).toBe(null);
  expect(moduleHost.constructor).toBeUndefined();
  expect(Object.getPrototypeOf(moduleHost.capabilities)).toBe(null);
  expect(moduleHost.capabilities.constructor).toBeUndefined();
  expect(Object.getPrototypeOf(moduleHost.eventBus)).toBe(null);
  expect(moduleHost.eventBus.emit.constructor).toBeUndefined();
  expect(Object.getPrototypeOf(moduleHost.eventBus.emit)).toBe(null);
  expect(moduleHost.registerStaticAssets.constructor).toBeUndefined();
  expect(appFacade.get.constructor).toBeUndefined();
  expect(Object.getPrototypeOf(appFacade.get)).toBe(null);
});

test('module host capabilities expose read-only system boundaries', () => {
  const moduleHost = createCommunityModuleHost({
    app: express(),
    motherEmitter: new EventEmitter(),
    moduleName: 'demoModule',
    moduleDir: __dirname,
    jwt: 'token',
    nonce: 'nonce-1'
  });

  expect(moduleHost.capabilities.rawSql).toBe(false);
  expect(moduleHost.capabilities.systemWrites).toBe(false);
});

test('normalizes community static mount paths', () => {
  expect(normalizeMountPath('demoModule', '/modules/demoModule/public')).toBe('/modules/demoModule/public');
  expect(normalizeMountPath('demoModule', '/public')).toBe('/modules/demoModule/public');
  expect(normalizeMountPath('demoModule', 'assets/icons')).toBe('/modules/demoModule/assets/icons');
  expect(() => normalizeMountPath('demoModule', '/modules/demoModule/../admin')).toThrow(/parent traversal/);
  expect(() => normalizeMountPath('demoModule', '../admin')).toThrow(/parent traversal/);
  expect(() => normalizeMountPath('demoModule', 'assets/%2e%2e/admin')).toThrow(/parent traversal/);
  expect(() => normalizeMountPath('demoModule', 'assets/%2f/admin')).toThrow(/parent traversal/);
});
