const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const EventEmitter = require('events');
const AdmZip = require('adm-zip');

const {
  checkModuleUpdates,
  inspectModuleUpdate,
  installModuleUpdate,
  _internals
} = require('../mother/modules/moduleLoader/moduleUpdateService');

class UpdateEmitter extends EventEmitter {
  constructor(rows = []) {
    super();
    this.rows = rows;
    this.inserts = [];
    this.updates = [];
  }

  emit(eventName, payload, cb) {
    if (eventName === 'getModuleRegistry') {
      if (typeof cb === 'function') cb(null, JSON.parse(JSON.stringify(this.rows)));
      return true;
    }
    if (eventName === 'dbSelect') {
      if (payload.table === 'permissions') {
        if (typeof cb === 'function') cb(null, []);
        return true;
      }
      if (payload.table === '__rawSQL__' && payload.data?.rawSQL === 'SELECT_MODULE_BY_NAME') {
        const row = this.rows.find(item => item.module_name === payload.data.moduleName);
        if (typeof cb === 'function') cb(null, row ? [JSON.parse(JSON.stringify(row))] : []);
        return true;
      }
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
      if (payload.table === 'module_registry') {
        const row = this.rows.find(item => item.module_name === payload.where?.module_name);
        if (row) row.module_info = payload.data.module_info;
      }
      if (typeof cb === 'function') cb(null, { ok: true });
      return true;
    }
    if (eventName === 'log') return true;
    return super.emit(eventName, payload, cb);
  }
}

function createModuleZip(moduleName, version, moduleInfoOverrides = {}, files = {}) {
  const zip = new AdmZip();
  const info = {
    moduleName,
    version,
    developer: 'Test',
    description: 'Test module',
    ...moduleInfoOverrides
  };
  zip.addFile(`${moduleName}/moduleInfo.json`, Buffer.from(JSON.stringify(info, null, 2)));
  zip.addFile(`${moduleName}/index.js`, Buffer.from(files['index.js'] || 'module.exports = { initialize() {} };\n'));
  for (const [fileName, contents] of Object.entries(files)) {
    if (fileName === 'index.js') continue;
    zip.addFile(`${moduleName}/${fileName}`, Buffer.from(contents));
  }
  return zip.toBuffer();
}

function moduleRow(moduleName, version, moduleInfoOverrides = {}) {
  return {
    module_name: moduleName,
    is_active: true,
    module_info: {
      moduleName,
      version,
      developer: 'Test',
      description: 'Installed test module',
      trustedUpdateSource: {
        provider: 'github',
        owner: 'acme',
        repo: 'shop-sync',
        assetPattern: `${moduleName}-*.zip`
      },
      ...moduleInfoOverrides
    }
  };
}

function releaseMocks(moduleName, version, zipBuffer, options = {}) {
  const assetName = `${moduleName}-${version}.zip`;
  const zipUrl = `https://updates.test/${assetName}`;
  const shaUrl = `${zipUrl}.sha256`;
  const hash = crypto.createHash('sha256').update(zipBuffer).digest('hex');
  const releases = [{
    id: Number(version.replace(/\D/g, '')) || 1,
    tag_name: `v${version}`,
    name: `v${version}`,
    draft: false,
    prerelease: options.prerelease === true,
    html_url: `https://github.test/acme/shop-sync/releases/v${version}`,
    assets: [
      { id: 1, name: assetName, size: zipBuffer.length, browser_download_url: zipUrl },
      {
        id: 2,
        name: `${assetName}.sha256`,
        size: hash.length,
        browser_download_url: shaUrl
      }
    ]
  }];
  return {
    releases,
    hash,
    assetName,
    fetchJson: jest.fn(async () => releases),
    fetchBuffer: jest.fn(async url => {
      if (url === zipUrl) return zipBuffer;
      if (url === shaUrl) return Buffer.from(options.hashOverride || `${hash}  ${assetName}\n`);
      throw new Error(`Unexpected test URL ${url}`);
    })
  };
}

function writeModuleDir(modulesRoot, moduleName, version) {
  const moduleDir = path.join(modulesRoot, moduleName);
  fs.mkdirSync(moduleDir, { recursive: true });
  fs.writeFileSync(path.join(moduleDir, 'moduleInfo.json'), JSON.stringify({
    moduleName,
    version,
    developer: 'Test',
    description: 'Installed test module'
  }, null, 2));
  fs.writeFileSync(path.join(moduleDir, 'index.js'), 'module.exports = { initialize() {} };\n');
  return moduleDir;
}

test('module updater finds a newer trusted GitHub release', async () => {
  const zipBuffer = createModuleZip('shopSync', '1.2.0');
  const mocks = releaseMocks('shopSync', '1.2.0', zipBuffer);
  const emitter = new UpdateEmitter([moduleRow('shopSync', '1.0.0')]);

  const result = await checkModuleUpdates(emitter, 'admin-token', {}, {
    fetchJson: mocks.fetchJson
  });

  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].moduleName, 'shopSync');
  assert.strictEqual(result[0].available, true);
  assert.strictEqual(result[0].latestVersion, '1.2.0');
  assert.strictEqual(result[0].asset.name, 'shopSync-1.2.0.zip');
});

test('module updater inspects update packages and reports new access grants', async () => {
  const zipBuffer = createModuleZip('shopSync', '1.2.0', {
    requestedAccess: [{ resource: 'content', action: 'list', reason: 'Read catalog entries' }]
  });
  const mocks = releaseMocks('shopSync', '1.2.0', zipBuffer);
  const emitter = new UpdateEmitter([moduleRow('shopSync', '1.0.0')]);

  const inspection = await inspectModuleUpdate(emitter, 'admin-token', {
    targetModuleName: 'shopSync'
  }, {
    fetchJson: mocks.fetchJson,
    fetchBuffer: mocks.fetchBuffer
  });

  assert.strictEqual(inspection.available, true);
  assert.strictEqual(inspection.hash, mocks.hash);
  assert.strictEqual(inspection.assetName, mocks.assetName);
  assert.strictEqual(inspection.requiresAdminApproval, true);
  assert.strictEqual(inspection.newRequestedAccess[0].event, 'listContentEntries');
});

test('module updater rejects packages whose hash sidecar does not match', async () => {
  const zipBuffer = createModuleZip('shopSync', '1.2.0');
  const mocks = releaseMocks('shopSync', '1.2.0', zipBuffer, {
    hashOverride: `${'0'.repeat(64)}  shopSync-1.2.0.zip\n`
  });
  const emitter = new UpdateEmitter([moduleRow('shopSync', '1.0.0')]);

  await assert.rejects(
    () => inspectModuleUpdate(emitter, 'admin-token', {
      targetModuleName: 'shopSync'
    }, {
      fetchJson: mocks.fetchJson,
      fetchBuffer: mocks.fetchBuffer
    }),
    /E_MODULE_UPDATE_HASH_MISMATCH/
  );
});

test('module updater requires approval for newly requested core access', async () => {
  const zipBuffer = createModuleZip('shopSync', '1.2.0', {
    requestedAccess: [{ resource: 'content', action: 'list' }]
  });
  const mocks = releaseMocks('shopSync', '1.2.0', zipBuffer);
  const emitter = new UpdateEmitter([moduleRow('shopSync', '1.0.0')]);

  await assert.rejects(
    () => installModuleUpdate(emitter, 'admin-token', {
      targetModuleName: 'shopSync'
    }, {
      fetchJson: mocks.fetchJson,
      fetchBuffer: mocks.fetchBuffer,
      runHealthCheck: jest.fn()
    }),
    /E_MODULE_UPDATE_PERMISSION_APPROVAL_REQUIRED/
  );
});

test('module updater installs approved updates with backup and registry metadata', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-update-'));
  const modulesRoot = path.join(tempRoot, 'modules');
  const backupRoot = path.join(tempRoot, 'backups');
  const tempUpdateRoot = path.join(tempRoot, 'updates');
  const zipBuffer = createModuleZip('shopSync', '1.2.0', {
    requestedAccess: [{ resource: 'content', action: 'list' }]
  }, {
    'frontend/readme.txt': 'updated asset'
  });
  const mocks = releaseMocks('shopSync', '1.2.0', zipBuffer);
  const emitter = new UpdateEmitter([moduleRow('shopSync', '1.0.0')]);
  const healthCheck = jest.fn(async () => ({ ok: true }));

  try {
    writeModuleDir(modulesRoot, 'shopSync', '1.0.0');
    const result = await installModuleUpdate(emitter, 'admin-token', {
      targetModuleName: 'shopSync',
      approvedAccess: [{ resource: 'content', action: 'list' }],
      grantedBy: 'admin-1'
    }, {
      modulesRoot,
      backupRoot,
      tempRoot: tempUpdateRoot,
      fetchJson: mocks.fetchJson,
      fetchBuffer: mocks.fetchBuffer,
      runHealthCheck: healthCheck
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.fromVersion, '1.0.0');
    assert.strictEqual(result.toVersion, '1.2.0');
    assert.strictEqual(result.wasActive, true);
    assert(fs.existsSync(path.join(modulesRoot, 'shopSync', 'frontend', 'readme.txt')));
    assert(fs.existsSync(path.join(result.backupDir, 'moduleInfo.json')));
    assert.strictEqual(healthCheck.mock.calls.length, 1);

    const registryUpdate = emitter.updates.find(update => update.table === 'module_registry');
    const moduleInfo = JSON.parse(registryUpdate.data.module_info);
    assert.strictEqual(moduleInfo.version, '1.2.0');
    assert.strictEqual(moduleInfo.trustedUpdateSource.provider, 'github');
    assert.strictEqual(moduleInfo.trustedAccessGrants[0].event, 'listContentEntries');
    assert.strictEqual(moduleInfo.updateState.hash, mocks.hash);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('module updater restores the previous folder when folder swap fails', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-update-rollback-'));
  const modulesRoot = path.join(tempRoot, 'modules');
  const backupRoot = path.join(tempRoot, 'backups');

  try {
    writeModuleDir(modulesRoot, 'shopSync', '1.0.0');

    assert.throws(
      () => _internals.swapModuleFolders({
        modulesRoot,
        backupRoot,
        moduleName: 'shopSync',
        moduleSourceDir: path.join(tempRoot, 'missing-source'),
        currentVersion: '1.0.0'
      }),
      /E_MODULE_UPDATE_SWAP_FAILED/
    );
    assert(fs.existsSync(path.join(modulesRoot, 'shopSync', 'moduleInfo.json')));
    assert.strictEqual(fs.readdirSync(path.join(backupRoot, 'shopSync')).length, 0);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
