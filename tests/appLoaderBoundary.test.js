const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const EventEmitter = require('events');
const appLoader = require('../mother/modules/appLoader');

class MockEmitter extends EventEmitter {
  emit(event, payload, cb) {
    if (event === 'dbUpdate' || event === 'dbSelect') {
      if (typeof cb === 'function') cb(null, []);
      return true;
    }
    return super.emit(event, payload, cb);
  }
}

function emitAsync(emitter, eventName, payload) {
  return new Promise(resolve => {
    emitter.emit(eventName, payload, (err, result) => resolve({ err, result }));
  });
}

function adminPayload(extra = {}) {
  return {
    jwt: 'admin-token',
    moduleName: 'appLoader',
    moduleType: 'core',
    appName: 'designer',
    decodedJWT: {
      permissions: {
        builder: { use: true },
        content: { update: true }
      }
    },
    ...extra
  };
}

test('app loader dispatch allows app lifecycle events only after app permission check', async () => {
  const emitter = new MockEmitter();
  await appLoader.initialize({
    motherEmitter: emitter,
    isCore: true,
    jwt: 'core-token',
    baseDir: path.join(__dirname, '..', 'apps')
  });

  const denied = await emitAsync(emitter, 'dispatchAppEvent', adminPayload({
    event: 'designer-ready',
    decodedJWT: { permissions: {} }
  }));
  assert(denied.err);
  assert.match(denied.err.message, /builder\.use/);

  const ready = await emitAsync(emitter, 'dispatchAppEvent', adminPayload({
    event: 'designer-ready',
    data: { boot: true }
  }));
  assert.ifError(ready.err);
  assert.strictEqual(ready.result.ok, true);
  assert.strictEqual(ready.result.event, 'designer-ready');
  assert.strictEqual(ready.result.handled, false);
});

test('app loader rejects unsupported app events instead of forwarding system access', async () => {
  const emitter = new MockEmitter();
  await appLoader.initialize({
    motherEmitter: emitter,
    isCore: true,
    jwt: 'core-token',
    baseDir: path.join(__dirname, '..', 'apps')
  });

  const result = await emitAsync(emitter, 'dispatchAppEvent', adminPayload({
    event: 'dbUpdate',
    data: { table: 'users' }
  }));

  assert(result.err);
  assert.match(result.err.message, /Unsupported app event/);
});

test('app loader routes app backend commands through runtime admin facade', async () => {
  const emitter = new MockEmitter();
  await appLoader.initialize({
    motherEmitter: emitter,
    isCore: true,
    jwt: 'core-token',
    baseDir: path.join(__dirname, '..', 'apps')
  });

  let routedPayload = null;
  emitter.on('cmsAdminApiRequest', (payload, cb) => {
    routedPayload = payload;
    cb(null, { resource: payload.resource, action: payload.action, rows: [] });
  });

  const command = await emitAsync(emitter, 'dispatchAppEvent', adminPayload({
    event: 'cms-admin-request',
    data: {
      resource: 'content',
      action: 'list',
      params: { contentTypeKey: 'post' }
    }
  }));

  assert.ifError(command.err);
  assert.strictEqual(command.result.ok, true);
  assert.strictEqual(command.result.handled, true);
  assert.strictEqual(command.result.data.resource, 'content');
  assert.strictEqual(routedPayload.moduleName, 'runtimeManager');
  assert.strictEqual(routedPayload.resource, 'content');
  assert.strictEqual(routedPayload.action, 'list');
  assert.deepStrictEqual(routedPayload.params, { contentTypeKey: 'post' });
  assert.deepStrictEqual(routedPayload.appContext, {
    appName: 'designer',
    event: 'cms-admin-request'
  });
});

test('app loader routes manifest-allowed legacy app events through the runtime facade', async () => {
  const emitter = new MockEmitter();
  await appLoader.initialize({
    motherEmitter: emitter,
    isCore: true,
    jwt: 'core-token',
    baseDir: path.join(__dirname, '..', 'apps')
  });

  const routed = [];
  emitter.on('cmsAdminApiRequest', (payload, cb) => {
    routed.push(payload);
    if (payload.resource === 'designer' && payload.action === 'get') {
      cb(null, {
        resource: payload.resource,
        action: payload.action,
        eventName: 'designer.getDesign',
        data: { id: payload.params.id, title: 'Allowed Design' }
      });
      return;
    }
    if (payload.resource === 'media' && payload.action === 'deleteLocalItem') {
      cb(null, {
        resource: payload.resource,
        action: payload.action,
        eventName: 'deleteLocalItem',
        data: { deleted: true, id: payload.params.id }
      });
      return;
    }
    cb(new Error(`Unexpected runtime route: ${payload.resource}.${payload.action}`));
  });

  const allowed = await emitAsync(emitter, 'dispatchAppEvent', adminPayload({
    event: 'cms-meltdown-request',
    data: {
      eventName: 'designer.getDesign',
      payload: {
        id: 'design-1',
        jwt: 'app-supplied-token',
        moduleName: 'wrongModule',
        moduleType: 'community',
        decodedJWT: { permissions: { '*': false } }
      }
    }
  }));

  assert.ifError(allowed.err);
  assert.strictEqual(allowed.result.ok, true);
  assert.deepStrictEqual(allowed.result.data, { id: 'design-1', title: 'Allowed Design' });
  assert.strictEqual(routed[0].jwt, 'admin-token');
  assert.strictEqual(routed[0].moduleName, 'runtimeManager');
  assert.strictEqual(routed[0].moduleType, 'core');
  assert.strictEqual(routed[0].resource, 'designer');
  assert.strictEqual(routed[0].action, 'get');
  assert.deepStrictEqual(routed[0].params, { id: 'design-1' });
  assert.deepStrictEqual(routed[0].appContext, {
    appName: 'designer',
    event: 'cms-meltdown-request',
    targetEvent: 'designer.getDesign',
    coreOwned: true
  });
  assert.strictEqual(routed[0].decodedJWT.permissions.builder.use, true);

  const denied = await emitAsync(emitter, 'dispatchAppEvent', adminPayload({
    event: 'cms-meltdown-request',
    data: {
      eventName: 'deleteUser',
      payload: { userId: 1 }
    }
  }));
  assert(denied.err);
  assert.match(denied.err.message, /not allowed/);

  const rawDenied = await emitAsync(emitter, 'dispatchAppEvent', adminPayload({
    event: 'cms-meltdown-request',
    data: {
      eventName: 'designer.getDesign',
      payload: { table: '__rawSQL__', id: 'design-1' }
    }
  }));
  assert(rawDenied.err);
  assert.match(rawDenied.err.message, /Raw database/);

  const writeAllowed = await emitAsync(emitter, 'dispatchAppEvent', adminPayload({
    event: 'cms-meltdown-request',
    data: {
      eventName: 'deleteLocalItem',
      payload: { id: 'media-1' }
    }
  }));
  assert.ifError(writeAllowed.err);
  assert.deepStrictEqual(writeAllowed.result.data, { deleted: true, id: 'media-1' });
  assert.strictEqual(routed[1].moduleName, 'runtimeManager');
  assert.strictEqual(routed[1].moduleType, 'core');
  assert.strictEqual(routed[1].resource, 'media');
  assert.strictEqual(routed[1].action, 'deleteLocalItem');
  assert.deepStrictEqual(routed[1].params, { id: 'media-1' });
});

test('app loader requires explicit write access for mutating bridge events', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-app-loader-'));
  const appDir = path.join(tmpRoot, 'thinapp');
  fs.mkdirSync(appDir);
  fs.writeFileSync(path.join(appDir, 'app.json'), JSON.stringify({
    name: 'thinapp',
    permissions: [],
    allowedEvents: [
      { eventName: 'deleteLocalItem', moduleName: 'mediaManager', moduleType: 'core', access: 'read' }
    ]
  }, null, 2));
  fs.writeFileSync(path.join(appDir, 'index.html'), '<!doctype html><title>Thin App</title>');

  try {
    const emitter = new MockEmitter();
    emitter.on('deleteLocalItem', (_payload, cb) => {
      cb(null, { deleted: true });
    });

    await assert.rejects(
      () => appLoader._internals.handleDispatchAppEvent(emitter, {
        jwt: 'admin-token',
        moduleName: 'appLoader',
        moduleType: 'core',
        appName: 'thinapp',
        event: 'cms-meltdown-request',
        data: {
          eventName: 'deleteLocalItem',
          payload: { id: 'media-1' }
        }
      }, tmpRoot),
      /write access/
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('app loader requires direct bridge events to map to runtime facade contracts', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-app-loader-'));
  const appDir = path.join(tmpRoot, 'thinapp');
  fs.mkdirSync(appDir);
  fs.writeFileSync(path.join(appDir, 'app.json'), JSON.stringify({
    name: 'thinapp',
    permissions: [],
    allowedEvents: [
      { eventName: 'getThing', moduleName: 'contentEngine', moduleType: 'core', access: 'read' }
    ]
  }, null, 2));
  fs.writeFileSync(path.join(appDir, 'index.html'), '<!doctype html><title>Thin App</title>');

  try {
    const emitter = new MockEmitter();
    let forwarded = false;
    emitter.on('getThing', (_payload, cb) => {
      forwarded = true;
      cb(null, { ok: true });
    });

    await assert.rejects(
      () => appLoader._internals.handleDispatchAppEvent(emitter, {
        jwt: 'admin-token',
        moduleName: 'appLoader',
        moduleType: 'core',
        appName: 'thinapp',
        event: 'cms-meltdown-request',
        data: {
          eventName: 'getThing',
          payload: {}
        }
      }, tmpRoot),
      /runtime facade/
    );
    assert.strictEqual(forwarded, false);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('app loader lets manifest agentSurface apps publish and poll only surface-owned agent events', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-app-loader-'));
  const appDir = path.join(tmpRoot, 'agentapp');
  fs.mkdirSync(appDir);
  fs.writeFileSync(path.join(appDir, 'app.json'), JSON.stringify({
    name: 'agentapp',
    permissions: [],
    agentSurface: true
  }, null, 2));
  fs.writeFileSync(path.join(appDir, 'index.html'), '<!doctype html><title>Agent App</title>');

  try {
    const emitter = new MockEmitter();
    const forwarded = [];
    emitter.on('agent.publishSurfaceSnapshot', (payload, cb) => {
      forwarded.push(payload);
      cb(null, { revision: 1, appName: payload.appName, surfaceId: payload.surfaceId });
    });
    emitter.on('agent.pollSurfaceCommands', (payload, cb) => {
      forwarded.push(payload);
      cb(null, []);
    });
    emitter.on('agent.enqueueSurfaceCommand', (_payload, cb) => {
      cb(null, { queued: true });
    });

    const manifest = appLoader._internals.readAppDirectoryInfo(appDir, 'agentapp').appInfo;
    assert.strictEqual(appLoader._internals.manifestHasAgentSurface(manifest), true);
    assert.strictEqual(appLoader._internals.getAllowedAppEventDescriptor(manifest, 'agent.publishSurfaceSnapshot').access, 'write');
    assert.strictEqual(appLoader._internals.getAllowedAppEventDescriptor(manifest, 'agent.pollSurfaceCommands').access, 'write');
    assert.strictEqual(appLoader._internals.getAllowedAppEventDescriptor(manifest, 'agent.enqueueSurfaceCommand'), null);
    assert.strictEqual(appLoader._internals.getAllowedAppEventDescriptor(manifest, 'agent.refreshSurface'), null);

    const published = await appLoader._internals.handleDispatchAppEvent(emitter, {
      jwt: 'admin-token',
      moduleName: 'appLoader',
      moduleType: 'core',
      appName: 'agentapp',
      event: 'cms-meltdown-request',
      data: {
        eventName: 'agent.publishSurfaceSnapshot',
        payload: {
          appName: 'otherapp',
          surfaceId: 'agentapp.main',
          title: 'Agent App'
        }
      }
    }, tmpRoot);

    assert.deepStrictEqual(published.data, {
      revision: 1,
      appName: 'agentapp',
      surfaceId: 'agentapp.main'
    });
    assert.strictEqual(forwarded[0].moduleName, 'agentManager');
    assert.strictEqual(forwarded[0].moduleType, 'core');
    assert.strictEqual(forwarded[0].appName, 'agentapp');
    assert.deepStrictEqual(forwarded[0].appContext, {
      appName: 'agentapp',
      event: 'cms-meltdown-request',
      targetEvent: 'agent.publishSurfaceSnapshot',
      coreOwned: false
    });

    const polled = await appLoader._internals.handleDispatchAppEvent(emitter, {
      jwt: 'admin-token',
      moduleName: 'appLoader',
      moduleType: 'core',
      appName: 'agentapp',
      event: 'cms-meltdown-request',
      data: {
        eventName: 'agent.pollSurfaceCommands',
        payload: { appName: 'otherapp', surfaceId: 'agentapp.main' }
      }
    }, tmpRoot);
    assert.deepStrictEqual(polled.data, []);
    assert.strictEqual(forwarded[1].appName, 'agentapp');

    await assert.rejects(
      () => appLoader._internals.handleDispatchAppEvent(emitter, {
        jwt: 'admin-token',
        moduleName: 'appLoader',
        moduleType: 'core',
        appName: 'agentapp',
        event: 'cms-meltdown-request',
        data: {
          eventName: 'agent.enqueueSurfaceCommand',
          payload: { surfaceId: 'agentapp.main', command: { action: 'dom.click' } }
        }
      }, tmpRoot),
      /core-owned apps/
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('app loader refuses direct write bridge access for non-core apps', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-app-loader-'));
  const appDir = path.join(tmpRoot, 'thinapp');
  fs.mkdirSync(appDir);
  fs.writeFileSync(path.join(appDir, 'app.json'), JSON.stringify({
    name: 'thinapp',
    permissions: [],
    allowedEvents: [
      { eventName: 'deleteLocalItem', moduleName: 'mediaManager', moduleType: 'core', access: 'write' }
    ]
  }, null, 2));
  fs.writeFileSync(path.join(appDir, 'index.html'), '<!doctype html><title>Thin App</title>');

  try {
    const emitter = new MockEmitter();
    emitter.on('deleteLocalItem', (_payload, cb) => {
      cb(null, { deleted: true });
    });

    await assert.rejects(
      () => appLoader._internals.handleDispatchAppEvent(emitter, {
        jwt: 'admin-token',
        moduleName: 'appLoader',
        moduleType: 'core',
        appName: 'thinapp',
        event: 'cms-meltdown-request',
        data: {
          eventName: 'deleteLocalItem',
          payload: { id: 'media-1' }
        }
      }, tmpRoot),
      /direct write access/
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('app loader dispatch validates app folder shape before forwarding app events', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-app-loader-'));
  const appDir = path.join(tmpRoot, 'mixedapp');
  fs.mkdirSync(appDir);
  fs.writeFileSync(path.join(appDir, 'app.json'), JSON.stringify({
    name: 'mixedapp',
    permissions: [],
    allowedEvents: [
      { eventName: 'getThing', moduleName: 'contentEngine', moduleType: 'core', access: 'read' }
    ]
  }, null, 2));
  fs.writeFileSync(path.join(appDir, 'index.html'), '<!doctype html><title>Mixed App</title>');
  fs.writeFileSync(path.join(appDir, 'widgetInfo.json'), JSON.stringify({
    widgetId: 'mixed-widget',
    widgetType: 'public'
  }));

  try {
    const emitter = new MockEmitter();
    let forwarded = false;
    emitter.on('getThing', (_payload, cb) => {
      forwarded = true;
      cb(null, { ok: true });
    });

    await assert.rejects(
      () => appLoader._internals.handleDispatchAppEvent(emitter, {
        jwt: 'admin-token',
        moduleName: 'appLoader',
        moduleType: 'core',
        appName: 'mixedapp',
        event: 'cms-meltdown-request',
        data: {
          eventName: 'getThing',
          payload: {}
        }
      }, tmpRoot),
      /widgetInfo\.json/
    );
    assert.strictEqual(forwarded, false);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('app loader rejects sensitive runtime files inside app folders', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-app-loader-'));
  const appDir = path.join(tmpRoot, 'secretapp');
  fs.mkdirSync(appDir);
  fs.writeFileSync(path.join(appDir, 'app.json'), JSON.stringify({
    name: 'secretapp',
    permissions: []
  }, null, 2));
  fs.writeFileSync(path.join(appDir, 'index.html'), '<!doctype html><title>Secret App</title>');
  fs.writeFileSync(path.join(appDir, '.env.production'), 'TOKEN=never-serve-this');

  try {
    assert.throws(
      () => appLoader._internals.readAppDirectoryInfo(appDir, 'secretapp'),
      /sensitive runtime file ".env\.production"/
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('app loader rejects direct host bridge code inside user-managed app folders', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-app-loader-'));
  const appDir = path.join(tmpRoot, 'bridgeapp');
  fs.mkdirSync(appDir);
  fs.writeFileSync(path.join(appDir, 'app.json'), JSON.stringify({
    name: 'bridgeapp',
    permissions: []
  }, null, 2));

  try {
    fs.writeFileSync(path.join(appDir, 'index.html'), '<script>fetch("/api/meltdown")</script>');
    assert.throws(
      () => appLoader._internals.readAppDirectoryInfo(appDir, 'bridgeapp'),
      /Meltdown API access/
    );

    fs.writeFileSync(path.join(appDir, 'index.html'), '<script src="/build/meltdownEmitter.js"></script>');
    assert.throws(
      () => appLoader._internals.readAppDirectoryInfo(appDir, 'bridgeapp'),
      /Meltdown bridge script access/
    );

    fs.writeFileSync(path.join(appDir, 'index.html'), '<script>document.querySelector("meta[name=admin-token]")</script>');
    assert.throws(
      () => appLoader._internals.readAppDirectoryInfo(appDir, 'bridgeapp'),
      /admin token metadata access/
    );

    fs.writeFileSync(
      path.join(appDir, 'index.html'),
      '<script>window.parent.postMessage({ type: "cms-admin-request", data: { resource: "content", action: "list" } }, "*")</script>'
    );
    assert.doesNotThrow(() => {
      appLoader._internals.readAppDirectoryInfo(appDir, 'bridgeapp');
    });
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('app loader rejects app manifests that claim module, widget or legacy app identity', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-app-loader-'));
  const legacyNameAppDir = path.join(tmpRoot, 'legacynameapp');
  const typedAppDir = path.join(tmpRoot, 'typedapp');
  const moduleLikeAppDir = path.join(tmpRoot, 'modulelikeapp');
  const widgetLikeAppDir = path.join(tmpRoot, 'widgetlikeapp');
  fs.mkdirSync(legacyNameAppDir);
  fs.mkdirSync(typedAppDir);
  fs.mkdirSync(moduleLikeAppDir);
  fs.mkdirSync(widgetLikeAppDir);
  fs.writeFileSync(path.join(legacyNameAppDir, 'app.json'), JSON.stringify({
    name: 'legacynameapp',
    appName: 'otherapp'
  }, null, 2));
  fs.writeFileSync(path.join(legacyNameAppDir, 'index.html'), '<!doctype html><title>Legacy Name App</title>');
  fs.writeFileSync(path.join(typedAppDir, 'app.json'), JSON.stringify({
    name: 'typedapp',
    appType: 'module'
  }, null, 2));
  fs.writeFileSync(path.join(typedAppDir, 'index.html'), '<!doctype html><title>Typed App</title>');
  fs.writeFileSync(path.join(moduleLikeAppDir, 'app.json'), JSON.stringify({
    name: 'modulelikeapp',
    moduleName: 'modulelikeapp',
    moduleType: 'core'
  }, null, 2));
  fs.writeFileSync(path.join(moduleLikeAppDir, 'index.html'), '<!doctype html><title>Module-like App</title>');
  fs.writeFileSync(path.join(widgetLikeAppDir, 'app.json'), JSON.stringify({
    name: 'widgetlikeapp',
    widgetId: 'widgetlikeapp',
    widgetType: 'public'
  }, null, 2));
  fs.writeFileSync(path.join(widgetLikeAppDir, 'index.html'), '<!doctype html><title>Widget-like App</title>');

  try {
    assert.throws(
      () => appLoader._internals.readAppDirectoryInfo(legacyNameAppDir, 'legacynameapp'),
      /cannot declare appName/
    );
    assert.throws(
      () => appLoader._internals.readAppDirectoryInfo(typedAppDir, 'typedapp'),
      /cannot declare appType/
    );
    assert.throws(
      () => appLoader._internals.readAppDirectoryInfo(moduleLikeAppDir, 'modulelikeapp'),
      /cannot declare moduleName/
    );
    assert.throws(
      () => appLoader._internals.readAppDirectoryInfo(widgetLikeAppDir, 'widgetlikeapp'),
      /cannot declare widgetId/
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('app loader permits core-owned app folders to carry internal bridge bootstraps', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-app-loader-'));
  const appDir = path.join(tmpRoot, 'designer');
  fs.mkdirSync(appDir);
  fs.writeFileSync(path.join(appDir, 'app.json'), JSON.stringify({
    name: 'designer',
    permissions: ['builder.use']
  }, null, 2));
  fs.writeFileSync(path.join(appDir, 'index.html'), '<script src="/build/meltdownEmitter.js"></script>');

  try {
    assert.doesNotThrow(() => {
      appLoader._internals.readAppDirectoryInfo(appDir, 'designer');
    });
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('app loader rejects package runtime files and nested app manifests', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-app-loader-'));
  const packagedAppDir = path.join(tmpRoot, 'packagedapp');
  const nestedAppDir = path.join(tmpRoot, 'nestedapp');

  fs.mkdirSync(packagedAppDir);
  fs.writeFileSync(path.join(packagedAppDir, 'app.json'), JSON.stringify({
    name: 'packagedapp',
    permissions: []
  }, null, 2));
  fs.writeFileSync(path.join(packagedAppDir, 'index.html'), '<!doctype html><title>Packaged App</title>');
  fs.writeFileSync(path.join(packagedAppDir, 'package.json'), JSON.stringify({ scripts: { start: 'node server.js' } }));

  fs.mkdirSync(path.join(nestedAppDir, 'embedded-app'), { recursive: true });
  fs.writeFileSync(path.join(nestedAppDir, 'app.json'), JSON.stringify({
    name: 'nestedapp',
    permissions: []
  }, null, 2));
  fs.writeFileSync(path.join(nestedAppDir, 'index.html'), '<!doctype html><title>Nested App</title>');
  fs.writeFileSync(path.join(nestedAppDir, 'embedded-app', 'app.json'), JSON.stringify({ name: 'embedded' }));

  try {
    assert.throws(
      () => appLoader._internals.readAppDirectoryInfo(packagedAppDir, 'packagedapp'),
      /sensitive runtime file "package\.json"/
    );
    assert.throws(
      () => appLoader._internals.readAppDirectoryInfo(nestedAppDir, 'nestedapp'),
      /nested app\.json/
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('app loader rejects node_modules inside app folders', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-app-loader-'));
  const appDir = path.join(tmpRoot, 'nodeapp');
  fs.mkdirSync(path.join(appDir, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(appDir, 'app.json'), JSON.stringify({
    name: 'nodeapp',
    permissions: []
  }, null, 2));
  fs.writeFileSync(path.join(appDir, 'index.html'), '<!doctype html><title>Node App</title>');

  try {
    assert.throws(
      () => appLoader._internals.readAppDirectoryInfo(appDir, 'nodeapp'),
      /runtime dependency folder "node_modules"/
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('app loader bridge batch reports per-event errors without exposing system events', async () => {
  const emitter = new MockEmitter();
  await appLoader.initialize({
    motherEmitter: emitter,
    isCore: true,
    jwt: 'core-token',
    baseDir: path.join(__dirname, '..', 'apps')
  });

  emitter.on('cmsAdminApiRequest', (payload, cb) => {
    cb(null, {
      resource: payload.resource,
      action: payload.action,
      eventName: 'designer.getDesign',
      data: { id: payload.params.id }
    });
  });

  const batch = await emitAsync(emitter, 'dispatchAppEvent', adminPayload({
    event: 'cms-meltdown-batch-request',
    data: {
      events: [
        { eventName: 'designer.getDesign', payload: { id: 'ok' } },
        { eventName: 'dbSelect', payload: { table: 'users' } }
      ]
    }
  }));

  assert.ifError(batch.err);
  assert.strictEqual(batch.result.ok, true);
  assert.deepStrictEqual(batch.result.data[0], {
    eventName: 'designer.getDesign',
    data: { id: 'ok' }
  });
  assert.strictEqual(batch.result.data[1].eventName, 'dbSelect');
  assert.match(batch.result.data[1].error, /not allowed|internal/);
});
