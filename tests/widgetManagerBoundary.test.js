const assert = require('assert');
const EventEmitter = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');
const widgetManager = require('../mother/modules/widgetManager');
const { _internals } = widgetManager;

function emitAsync(emitter, eventName, payload) {
  return new Promise(resolve => {
    emitter.emit(eventName, payload, (err, result) => resolve({ err, result }));
  });
}

test('widget manager accepts safe community widget metadata and scripts', () => {
  const info = _internals.normalizeCommunityWidgetInfo({
    widgetId: 'heroBanner_1',
    widgetType: 'public',
    label: 'Hero Banner',
    category: 'marketing'
  });

  assert.deepStrictEqual(info, {
    widgetId: 'heroBanner_1',
    widgetType: 'public',
    label: 'Hero Banner',
    category: 'marketing'
  });
  assert.deepStrictEqual(_internals.isWidgetScriptAllowed('export function render() { return document.createElement("div"); }'), {
    ok: true
  });
  assert.strictEqual(_internals.normalizeCommunityWidgetFolderName('heroBanner_1'), 'heroBanner_1');
});

test('widget manager enforces strict design contract for trusted widgets', async () => {
  assert.deepStrictEqual(
    _internals.validateWidgetDesignContract({
      widgetId: 'contentSummary',
      widgetType: 'admin',
      category: 'core',
      content: '/ui/widgets/plainspace/admin/defaultwidgets/contentSummaryWidget.js'
    }),
    {
      ok: true,
      policy: 'strict',
      errors: [],
      warnings: []
    }
  );

  const badStrict = _internals.validateWidgetDesignContract({
    widgetId: 'adminFromCommunityRoot',
    widgetType: 'admin',
    category: 'custom',
    content: '/widgets/adminFromCommunityRoot/widget.js'
  });
  assert.strictEqual(badStrict.ok, false);
  assert.strictEqual(badStrict.policy, 'strict');
  assert.strictEqual(badStrict.errors[0].code, 'BP_WIDGET_CONTRACT_TRUSTED_SOURCE');

  const emitter = new EventEmitter();
  const dbCalls = [];
  _internals.setupWidgetManagerEvents(emitter);
  emitter.on('dbSelect', (payload, cb) => {
    dbCalls.push({ eventName: 'dbSelect', payload });
    cb(null, []);
  });

  const result = await emitAsync(emitter, 'createWidget', {
    jwt: 'token',
    moduleName: 'widgetManager',
    moduleType: 'core',
    widgetId: 'adminFromCommunityRoot',
    widgetType: 'admin',
    content: '/widgets/adminFromCommunityRoot/widget.js'
  });

  assert(result.err);
  assert.match(result.err.message, /WM:WIDGET_DESIGN_CONTRACT/);
  assert.match(result.err.message, /BP_WIDGET_CONTRACT_TRUSTED_SOURCE/);
  assert.strictEqual(dbCalls.length, 0);
});

test('widget manager requires tokenized styles for generated inline widgets', () => {
  const missingToken = _internals.validateWidgetDesignContract({
    widgetId: 'generatedCard',
    widgetType: 'public',
    designSource: 'ai',
    content: JSON.stringify({
      metadata: {
        designContract: { version: 1 }
      },
      css: '.generated-card { color: red; padding: 12px; }',
      html: '<section class="generated-card">Generated</section>'
    })
  });

  assert.strictEqual(missingToken.ok, false);
  assert.strictEqual(missingToken.policy, 'strict');
  assert(missingToken.errors.some(error => error.code === 'BP_WIDGET_CONTRACT_TOKEN_MISSING'));

  assert.deepStrictEqual(
    _internals.validateWidgetDesignContract({
      widgetId: 'generatedCard',
      widgetType: 'public',
      designSource: 'ai',
      content: JSON.stringify({
        metadata: {
          designContract: { version: 1 }
        },
        css: '.generated-card { color: var(--text-color); padding: var(--space-3); }',
        html: '<section class="generated-card">Generated</section>'
      })
    }),
    {
      ok: true,
      policy: 'strict',
      errors: [],
      warnings: []
    }
  );
});

test('widget manager keeps community design contract advisory', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-widget-design-'));
  const widgetDir = path.join(tmpRoot, 'brandWidget');
  fs.mkdirSync(widgetDir, { recursive: true });
  fs.writeFileSync(
    path.join(widgetDir, 'widget.js'),
    [
      'export function render(el) {',
      '  document.body.style.backgroundColor = "#ff0000";',
      '  el.innerHTML = "<div style=\\"color:#000\\">Brand</div>";',
      '}'
    ].join('\n')
  );

  try {
    assert.deepStrictEqual(
      _internals.isWidgetScriptAllowed(fs.readFileSync(path.join(widgetDir, 'widget.js'), 'utf8')),
      { ok: true }
    );
    const report = _internals.validateCommunityWidgetDesignContract(widgetDir, 'brandWidget');
    assert.strictEqual(report.ok, true);
    assert.strictEqual(report.policy, 'advisory');
    assert(report.warnings.some(warning => warning.code === 'BP_WIDGET_CONTRACT_RAW_COLOR'));
    assert(report.warnings.some(warning => warning.code === 'BP_WIDGET_CONTRACT_GLOBAL_STYLE'));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('widget manager rejects community widget system access patterns', () => {
  for (const folderName of ['../bad', 'bad path', 'bad.js', 'bad$name', 'nested/widget']) {
    assert.throws(() => {
      _internals.normalizeCommunityWidgetFolderName(folderName);
    }, /folder names/);
  }

  assert.throws(() => {
    _internals.normalizeCommunityWidgetInfo({
      widgetId: '../bad',
      widgetType: 'public'
    });
  }, /widgetId/);

  assert.throws(() => {
    _internals.normalizeCommunityWidgetInfo({
      widgetId: 'otherWidget',
      widgetType: 'public'
    }, 'folderWidget');
  }, /must match widget folder/);

  assert.throws(() => {
    _internals.normalizeCommunityWidgetInfo({
      widgetId: 'good',
      widgetType: 'system'
    });
  }, /widgetType/);

  assert.throws(() => {
    _internals.normalizeCommunityWidgetInfo({
      widgetId: 'adminShape',
      widgetType: 'admin'
    });
  }, /Community widgets/);

  assert.throws(() => {
    _internals.normalizeCommunityWidgetInfo({
      widgetId: 'coreClaimWidget',
      widgetType: 'public',
      moduleType: 'core'
    });
  }, /cannot declare moduleType/);

  assert.throws(() => {
    _internals.normalizeCommunityWidgetInfo({
      widgetId: 'moduleClaimWidget',
      widgetType: 'public',
      moduleName: 'contentEngine'
    });
  }, /cannot declare moduleName/);

  assert.throws(() => {
    _internals.normalizeCommunityWidgetInfo({
      widgetId: 'appClaimWidget',
      widgetType: 'public',
      appName: 'designer'
    });
  }, /cannot declare appName/);

  const blocked = [
    'window.meltdownEmit("deleteWidget", {})',
    'fetch("/api/meltdown")',
    'fetch("/api/content")',
    'fetch("/admin/api/apps")',
    'fetch("admin/api/apps")',
    'fetch("/login")',
    'fetch("/install")',
    'fetch("https://example.com/collect")',
    'fetch("/api/public/content", { credentials: "include" })',
    'console.log(window.ADMIN_TOKEN)',
    'document.querySelector("meta[name=\\"admin-token\\"]")',
    'navigator.sendBeacon("/log", "x")',
    'new WebSocket("wss://example.com")',
    'new EventSource("/stream")',
    'localStorage.getItem("token")',
    'document.cookie',
    'eval("alert(1)")',
    'const fs = require("fs")'
  ];

  for (const source of blocked) {
    assert.strictEqual(_internals.isWidgetScriptAllowed(source).ok, false, source);
  }

  assert.deepStrictEqual(_internals.isWidgetScriptAllowed('fetch("/api/public/content?path=/home")'), {
    ok: true
  });
});

test('widget manager raw events require widgetManager core scope', async () => {
  const emitter = new EventEmitter();
  const dbCalls = [];
  _internals.setupWidgetManagerEvents(emitter);

  emitter.on('dbUpdate', (payload, cb) => {
    dbCalls.push({ eventName: 'dbUpdate', payload });
    cb(null, { ok: true });
  });

  emitter.on('dbSelect', (payload, cb) => {
    dbCalls.push({ eventName: 'dbSelect', payload });
    cb(null, []);
  });

  const cases = [
    ['createWidget', { widgetId: 'hero', widgetType: 'public', content: '/widgets/hero.js' }],
    ['getWidgets', { widgetType: 'public' }],
    ['updateWidget', { widgetId: 'hero', widgetType: 'public' }],
    ['deleteWidget', { widgetId: 'hero', widgetType: 'public' }],
    ['saveLayout.v1', { lane: 'public', layout: [] }]
  ];

  for (const [eventName, extra] of cases) {
    const result = await emitAsync(emitter, eventName, {
      jwt: 'token',
      moduleName: 'plainspace',
      moduleType: 'core',
      ...extra
    });
    assert(result.err, `${eventName} should reject non-widgetManager scope`);
    assert.match(result.err.message, /invalid meltdown payload/);
  }

  assert.strictEqual(dbCalls.length, 0);

  const saveLayout = await emitAsync(emitter, 'saveLayout.v1', {
    jwt: 'token',
    moduleName: 'widgetManager',
    moduleType: 'core',
    lane: 'public',
    layout: [{ widgetId: 'hero', order: 2 }]
  });
  assert.ifError(saveLayout.err);

  const updateCall = dbCalls.find(call => call.eventName === 'dbUpdate');
  assert(updateCall);
  assert.strictEqual(updateCall.payload.moduleName, 'widgetManager');
  assert.strictEqual(updateCall.payload.moduleType, 'core');
  assert.strictEqual(updateCall.payload.data.rawSQL, 'UPDATE_WIDGET_PUBLIC');
});

test('widget manager initializer enforces and registers core scope', async () => {
  const deniedEmitter = new EventEmitter();
  await assert.rejects(
    () => widgetManager.initialize({ motherEmitter: deniedEmitter, isCore: false, jwt: 'token' }),
    /core module/
  );

  const emitter = new EventEmitter();
  const registered = [];
  const dbCalls = [];
  emitter.registerModuleType = (moduleName, moduleType) => {
    registered.push({ moduleName, moduleType });
  };
  emitter.on('dbUpdate', (payload, cb) => {
    dbCalls.push({ eventName: 'dbUpdate', payload });
    cb(null, { ok: true });
  });
  emitter.on('dbSelect', (_payload, cb) => cb(null, []));
  emitter.on('dbInsert', (_payload, cb) => cb(null, { ok: true }));

  await widgetManager.initialize({
    motherEmitter: emitter,
    isCore: true,
    jwt: 'token',
    nonce: 'nonce'
  });

  assert.deepStrictEqual(registered, [{ moduleName: 'widgetManager', moduleType: 'core' }]);
  assert.strictEqual(widgetManager.MODULE_NAME, 'widgetManager');
  assert.strictEqual(widgetManager.MODULE_TYPE, 'core');
  assert(dbCalls.some(call => call.payload.data.rawSQL === 'INIT_WIDGETS_TABLE_PUBLIC'));
  assert(dbCalls.some(call => call.payload.data.rawSQL === 'INIT_WIDGETS_TABLE_ADMIN'));
  assert.strictEqual(emitter.listenerCount('createWidget'), 1);
});

test('widget manager rejects mixed app/module widget folders and realpath escapes', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-widget-manager-'));
  const goodDir = path.join(tmpRoot, 'goodWidget');
  const appDir = path.join(tmpRoot, 'appShaped');
  const moduleDir = path.join(tmpRoot, 'moduleShaped');
  const nestedModuleDir = path.join(tmpRoot, 'nestedModuleWidget');
  const nestedModuleManifestDir = path.join(nestedModuleDir, 'embedded-module');
  const nestedWidgetDir = path.join(tmpRoot, 'nestedWidgetManifest');
  const nestedWidgetManifestDir = path.join(nestedWidgetDir, 'embedded-widget');
  const packageDir = path.join(tmpRoot, 'packagedWidget');
  const secretDir = path.join(tmpRoot, 'secretWidget');
  const nodeModulesDir = path.join(tmpRoot, 'nodeRuntimeWidget');
  const linkedContentDir = path.join(tmpRoot, 'linkedContentWidget');
  const outsideDir = path.join(tmpRoot, '..', `outside-widget-${Date.now()}`);
  const linkDir = path.join(tmpRoot, 'linkedWidget');
  fs.mkdirSync(goodDir, { recursive: true });
  fs.mkdirSync(appDir, { recursive: true });
  fs.mkdirSync(moduleDir, { recursive: true });
  fs.mkdirSync(nestedModuleManifestDir, { recursive: true });
  fs.mkdirSync(nestedWidgetManifestDir, { recursive: true });
  fs.mkdirSync(packageDir, { recursive: true });
  fs.mkdirSync(secretDir, { recursive: true });
  fs.mkdirSync(path.join(nodeModulesDir, 'node_modules'), { recursive: true });
  fs.mkdirSync(linkedContentDir, { recursive: true });
  fs.mkdirSync(outsideDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, 'app.json'), '{}');
  fs.writeFileSync(path.join(moduleDir, 'moduleInfo.json'), '{}');
  fs.writeFileSync(path.join(nestedModuleManifestDir, 'moduleInfo.json'), '{}');
  fs.writeFileSync(path.join(nestedWidgetDir, 'widgetInfo.json'), '{}');
  fs.writeFileSync(path.join(nestedWidgetManifestDir, 'widgetInfo.json'), '{}');
  fs.writeFileSync(path.join(packageDir, 'package.json'), '{}');
  fs.writeFileSync(path.join(secretDir, '.env.production'), 'TOKEN=never-serve-this');

  try {
    assert.strictEqual(_internals.resolveCommunityWidgetFolder(tmpRoot, 'goodWidget'), goodDir);
    assert.throws(() => {
      _internals.assertCommunityWidgetFolderShape(appDir, 'appShaped');
    }, /app\.json/);
    assert.throws(() => {
      _internals.assertCommunityWidgetFolderShape(moduleDir, 'moduleShaped');
    }, /moduleInfo\.json/);
    assert.throws(() => {
      _internals.assertCommunityWidgetFolderShape(nestedModuleDir, 'nestedModuleWidget');
    }, /moduleInfo\.json/);
    assert.throws(() => {
      _internals.assertCommunityWidgetFolderShape(nestedWidgetDir, 'nestedWidgetManifest');
    }, /nested widgetInfo\.json/);
    assert.throws(() => {
      _internals.assertCommunityWidgetFolderShape(packageDir, 'packagedWidget');
    }, /sensitive runtime file "package\.json"/);
    assert.throws(() => {
      _internals.assertCommunityWidgetFolderShape(secretDir, 'secretWidget');
    }, /sensitive runtime file "\.env\.production"/);
    assert.throws(() => {
      _internals.assertCommunityWidgetFolderShape(nodeModulesDir, 'nodeRuntimeWidget');
    }, /runtime dependency folder "node_modules"/);

    let canCreateLinks = true;
    try {
      fs.symlinkSync(outsideDir, path.join(linkedContentDir, 'linked-assets'), process.platform === 'win32' ? 'junction' : 'dir');
    } catch {
      canCreateLinks = false;
    }

    if (canCreateLinks) {
      assert.throws(() => {
        _internals.assertCommunityWidgetFolderShape(linkedContentDir, 'linkedContentWidget');
      }, /symlinks or junctions/);

      fs.symlinkSync(outsideDir, linkDir, process.platform === 'win32' ? 'junction' : 'dir');
      assert.throws(() => {
        _internals.resolveCommunityWidgetFolder(tmpRoot, 'linkedWidget');
      }, /inside the widgets folder/);
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  }
});

test('widget manager scans every community widget script file', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-widget-scripts-'));
  const safeWidgetDir = path.join(tmpRoot, 'safeWidget');
  const badWidgetDir = path.join(tmpRoot, 'badWidget');
  const nestedDir = path.join(badWidgetDir, 'assets');
  fs.mkdirSync(safeWidgetDir, { recursive: true });
  fs.mkdirSync(nestedDir, { recursive: true });
  fs.writeFileSync(path.join(safeWidgetDir, 'widget.js'), 'export function render() { return document.createElement("div"); }');
  fs.writeFileSync(path.join(safeWidgetDir, 'helper.mjs'), 'export const ok = true;');
  fs.writeFileSync(path.join(badWidgetDir, 'widget.js'), 'import "./assets/helper.js"; export function render() {}');
  fs.writeFileSync(path.join(nestedDir, 'helper.js'), 'fetch("/api/meltdown", { method: "POST" });');

  try {
    assert.doesNotThrow(() => {
      _internals.assertCommunityWidgetScriptsAllowed(safeWidgetDir, 'safeWidget');
    });
    assert.throws(() => {
      _internals.assertCommunityWidgetScriptsAllowed(badWidgetDir, 'badWidget');
    }, /assets\/helper\.js.*Meltdown API access/);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('server widgets static route is guarded before serving files', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(appJs, /guardWidgetStaticRoot/);
  assert.match(
    appJs,
    /app\.use\(\s*['"]\/widgets['"]\s*,\s*setStaticCorsHeaders\s*,\s*guardWidgetStaticRoot\s*,\s*blockBrowserSourceFiles\s*,\s*express\.static\(widgetsPath\)/
  );
});
