const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const EventEmitter = require('events');
const AdmZip = require('adm-zip');

const {
  installModuleFromZip,
  _internals
} = require('../mother/modules/moduleLoader/moduleInstallerService');

class InstallerEmitter extends EventEmitter {
  constructor() {
    super();
    this.inserts = [];
    this.updates = [];
  }

  emit(eventName, payload, cb) {
    if (eventName === 'dbSelect') {
      if (typeof cb === 'function') cb(null, []);
      return true;
    }
    if (eventName === 'dbInsert') {
      this.inserts.push(payload);
      if (typeof cb === 'function') cb(null, { ok: true });
      return true;
    }
    if (eventName === 'dbUpdate') {
      this.updates.push(payload);
      if (typeof cb === 'function') cb(null, { ok: true });
      return true;
    }
    if (eventName === 'log') {
      return true;
    }
    return super.emit(eventName, payload, cb);
  }
}

function createModuleZip(moduleName, files = {}, moduleInfoOverrides = {}) {
  const zip = new AdmZip();
  const info = {
    moduleName,
    version: '1.0.0',
    developer: 'Test',
    description: 'Test module',
    ...moduleInfoOverrides
  };
  zip.addFile(`${moduleName}/moduleInfo.json`, Buffer.from(JSON.stringify(info)));
  zip.addFile(`${moduleName}/index.js`, Buffer.from('module.exports = { initialize() {} };\n'));
  for (const [fileName, contents] of Object.entries(files)) {
    zip.addFile(`${moduleName}/${fileName}`, Buffer.from(contents));
  }
  return zip.toBuffer();
}

test('module installer installs a validated community module into a bounded root', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-install-'));
  const modulesRoot = path.join(tempRoot, 'modules');
  const tempDir = path.join(tempRoot, 'tmp');
  const emitter = new InstallerEmitter();

  try {
    const result = await installModuleFromZip(
      emitter,
      'module-token',
      createModuleZip('safeModule', {
        'frontend/public/readme.txt': 'asset'
      }),
      { modulesRoot, tempDir }
    );

    assert.deepStrictEqual(result, { success: true, moduleName: 'safeModule' });
    assert(fs.existsSync(path.join(modulesRoot, 'safeModule', 'index.js')));
    assert(fs.existsSync(path.join(modulesRoot, 'safeModule', 'frontend', 'public', 'readme.txt')));
    assert.strictEqual(emitter.inserts.length, 1);
    assert.strictEqual(emitter.inserts[0].data.module_name, 'safeModule');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('module installer rejects app manifests inside module zips', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-install-'));
  const emitter = new InstallerEmitter();

  try {
    await assert.rejects(
      () => installModuleFromZip(
        emitter,
        'module-token',
        createModuleZip('appShapedModule', {
          'app.json': '{}'
        }),
        { modulesRoot: path.join(tempRoot, 'modules'), tempDir: path.join(tempRoot, 'tmp') }
      ),
      /app\.json/
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('module installer rejects widget manifests and host UI trees inside module zips', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-install-'));
  const emitter = new InstallerEmitter();

  try {
    await assert.rejects(
      () => installModuleFromZip(
        emitter,
        'module-token',
        createModuleZip('widgetShapedModule', {
          'widgetInfo.json': '{}'
        }),
        { modulesRoot: path.join(tempRoot, 'modules'), tempDir: path.join(tempRoot, 'tmp') }
      ),
      /widgetinfo\.json/i
    );

    const widgetsZip = new AdmZip();
    widgetsZip.addFile('widgets/hero/widget.js', Buffer.from('export function render() {}\n'));
    await assert.rejects(
      () => installModuleFromZip(
        emitter,
        'module-token',
        widgetsZip.toBuffer(),
        { modulesRoot: path.join(tempRoot, 'modules'), tempDir: path.join(tempRoot, 'tmp') }
      ),
      /top-level "widgets"/
    );

    assert.throws(
      () => _internals.assertSafeArchiveEntry({ entryName: 'ui/app.js', header: { attr: 0 } }),
      /top-level "ui"/
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('module installer rejects package manifests and dependency lockfiles inside module zips', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-install-'));
  const emitter = new InstallerEmitter();

  try {
    await assert.rejects(
      () => installModuleFromZip(
        emitter,
        'module-token',
        createModuleZip('packagedModule', {
          'package.json': JSON.stringify({ scripts: { postinstall: 'node setup.js' } })
        }),
        { modulesRoot: path.join(tempRoot, 'modules'), tempDir: path.join(tempRoot, 'tmp') }
      ),
      /package\.json/
    );

    assert.throws(
      () => _internals.assertSafeArchiveEntry({ entryName: 'safeModule/package-lock.json', header: { attr: 0 } }),
      /package-lock\.json/
    );
    assert.throws(
      () => _internals.assertSafeArchiveEntry({ entryName: 'safeModule/pnpm-lock.yaml', header: { attr: 0 } }),
      /pnpm-lock\.yaml/
    );
    assert.throws(
      () => _internals.assertSafeArchiveEntry({ entryName: 'safeModule/yarn.lock', header: { attr: 0 } }),
      /yarn\.lock/
    );
    assert.throws(
      () => _internals.assertSafeArchiveEntry({ entryName: 'safeModule/.env.production', header: { attr: 0 } }),
      /\.env\.production/
    );
    assert.throws(
      () => _internals.assertSafeArchiveEntry({ entryName: 'safeModule/.npmrc', header: { attr: 0 } }),
      /\.npmrc/
    );
    assert.throws(
      () => _internals.assertSafeArchiveEntry({ entryName: 'safeModule/node_modules/pkg/index.js', header: { attr: 0 } }),
      /node_modules/
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('module installer rejects module-root host folders after extraction', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-install-'));
  const emitter = new InstallerEmitter();

  try {
    await assert.rejects(
      () => installModuleFromZip(
        emitter,
        'module-token',
        createModuleZip('hostFolderModule', {
          'public/index.html': '<!doctype html>'
        }),
        { modulesRoot: path.join(tempRoot, 'modules'), tempDir: path.join(tempRoot, 'tmp') }
      ),
      /host folder "public"/
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('module installer rejects core-owned module names', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-install-'));
  const emitter = new InstallerEmitter();

  try {
    await assert.rejects(
      () => installModuleFromZip(
        emitter,
        'module-token',
        createModuleZip('designer'),
        { modulesRoot: path.join(tempRoot, 'modules'), tempDir: path.join(tempRoot, 'tmp') }
      ),
      /owned by the core/
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('module installer rejects modules that claim a core moduleType', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-install-'));
  const emitter = new InstallerEmitter();

  try {
    await assert.rejects(
      () => installModuleFromZip(
        emitter,
        'module-token',
        createModuleZip('coreClaimModule', {}, { moduleType: 'core' }),
        { modulesRoot: path.join(tempRoot, 'modules'), tempDir: path.join(tempRoot, 'tmp') }
      ),
      /moduleType.*community.*omitted/i
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('module installer rejects modules that claim app or widget identity', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-install-'));
  const emitter = new InstallerEmitter();

  try {
    await assert.rejects(
      () => installModuleFromZip(
        emitter,
        'module-token',
        createModuleZip('widgetClaimModule', {}, { widgetId: 'heroWidget' }),
        { modulesRoot: path.join(tempRoot, 'modules'), tempDir: path.join(tempRoot, 'tmp') }
      ),
      /cannot declare widgetId/
    );

    await assert.rejects(
      () => installModuleFromZip(
        emitter,
        'module-token',
        createModuleZip('appClaimModule', {}, { appName: 'toolApp' }),
        { modulesRoot: path.join(tempRoot, 'modules'), tempDir: path.join(tempRoot, 'tmp') }
      ),
      /cannot declare appName/
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('module installer rejects traversal archive entries before extraction', () => {
  assert.throws(
    () => _internals.normalizeArchiveEntryName('../escape/moduleInfo.json'),
    /escapes/
  );
  assert.throws(
    () => _internals.normalizeArchiveEntryName('/absolute/moduleInfo.json'),
    /relative/
  );
});

test('module installer stores approved access grants separately from declared module permissions', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-install-'));
  const emitter = new InstallerEmitter();

  try {
    const result = await installModuleFromZip(
      emitter,
      'module-token',
      createModuleZip('shopSync', {}, {
        permissions: [
          { key: 'shopSync.sync', description: 'Run shop sync' }
        ],
        requestedAccess: [
          { resource: 'content', action: 'list', reason: 'Read catalog entries' }
        ]
      }),
      {
        modulesRoot: path.join(tempRoot, 'modules'),
        tempDir: path.join(tempRoot, 'tmp'),
        approvedAccess: [{ resource: 'content', action: 'list' }],
        grantedBy: 'user-1'
      }
    );

    assert.deepStrictEqual(result, { success: true, moduleName: 'shopSync' });
    const registryInsert = emitter.inserts.find(insert => insert.table === 'module_registry');
    const permissionInsert = emitter.inserts.find(insert => insert.table === 'permissions');
    const moduleInfo = JSON.parse(registryInsert.data.module_info);
    assert.deepStrictEqual(moduleInfo.permissions[0], {
      key: 'shopSync.sync',
      permission_key: 'shopSync.sync',
      description: 'Run shop sync',
      category: 'shopSync',
      source: 'module',
      ownerModule: 'shopSync'
    });
    assert.strictEqual(moduleInfo.trustedAccessGrants[0].event, 'listContentEntries');
    assert.strictEqual(moduleInfo.trustedAccessGrants[0].grantedBy, 'user-1');
    assert.strictEqual(permissionInsert.data.permission_key, 'shopSync.sync');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('module installer rejects community manifests that claim core permission names', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-install-'));
  const emitter = new InstallerEmitter();

  try {
    await assert.rejects(
      () => installModuleFromZip(
        emitter,
        'module-token',
        createModuleZip('shopSync', {}, {
          permissions: ['users.delete']
        }),
        { modulesRoot: path.join(tempRoot, 'modules'), tempDir: path.join(tempRoot, 'tmp') }
      ),
      /only declare permissions below "shopSync\.\*"/
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('module ZIP inspection returns access requests without installing files', () => {
  const inspected = _internals.inspectModuleZipBuffer(createModuleZip('shopSync', {}, {
    permissions: ['shopSync.read'],
    requestedAccess: [{ resource: 'content', action: 'list' }]
  }));

  assert.strictEqual(inspected.moduleName, 'shopSync');
  assert.strictEqual(inspected.permissions[0].permission_key, 'shopSync.read');
  assert.strictEqual(inspected.requestedAccess[0].event, 'listContentEntries');
  assert.strictEqual(inspected.requestedAccess[0].resource, 'content');
  assert.strictEqual(inspected.requestedAccess[0].action, 'list');
});

test('module ZIP inspection exposes protected access as one-time only but rejects permanent grants', async () => {
  const inspected = _internals.inspectModuleZipBuffer(createModuleZip('shopSync', {}, {
    requestedAccess: [{ resource: 'users', action: 'delete', reason: 'Clean up mapped shop users' }]
  }));

  assert.strictEqual(inspected.requestedAccess[0].event, 'deleteUser');
  assert.strictEqual(inspected.requestedAccess[0].resource, 'users');
  assert.strictEqual(inspected.requestedAccess[0].protected, true);
  assert.strictEqual(inspected.requestedAccess[0].allowPermanent, false);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-install-'));
  const emitter = new InstallerEmitter();

  try {
    await assert.rejects(
      () => installModuleFromZip(
        emitter,
        'module-token',
        createModuleZip('shopSync', {}, {
          requestedAccess: [{ resource: 'users', action: 'delete', reason: 'Clean up mapped shop users' }]
        }),
        {
          modulesRoot: path.join(tempRoot, 'modules'),
          tempDir: path.join(tempRoot, 'tmp'),
          approvedAccess: [{ resource: 'users', action: 'delete' }],
          grantedBy: 'user-1'
        }
      ),
      /Resource action "users\.delete" resolves to protected event "deleteUser"/
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
