const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const EventEmitter = require('events');

const { uninstallModule } = require('../mother/modules/moduleLoader/moduleUninstaller');

class UninstallEmitter extends EventEmitter {
  constructor() {
    super();
    this.deletes = [];
    this.updates = [];
    this.removals = [];
  }

  emit(eventName, payload, cb) {
    if (eventName === 'dbDelete') {
      this.deletes.push(payload);
      if (typeof cb === 'function') cb(null, { ok: true });
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

test('module uninstaller cleans runtime state and removes only the module folder', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-uninstall-'));
  const modulesRoot = path.join(tempRoot, 'modules');
  const moduleDir = path.join(modulesRoot, 'oldModule');
  fs.mkdirSync(moduleDir, { recursive: true });
  fs.writeFileSync(path.join(moduleDir, 'index.js'), 'module.exports = {};');
  fs.writeFileSync(path.join(modulesRoot, 'keep.txt'), 'keep');

  const emitter = new UninstallEmitter();
  global.loadedModules = { oldModule: { active: true } };
  const staleListener = Object.assign(() => {}, { moduleName: 'oldModule' });
  emitter.on('oldModule.event', staleListener);

  try {
    const result = await uninstallModule(emitter, 'module-token', 'oldModule', {
      modulesRoot,
      removeRegistryRow: true,
      removeDatabase: true
    });

    assert.deepStrictEqual(result, { success: true, moduleName: 'oldModule' });
    assert.strictEqual(global.loadedModules.oldModule, undefined);
    assert.strictEqual(emitter.removals.length, 0);
    assert.strictEqual(emitter.listeners('oldModule.event').length, 0);
    assert.strictEqual(emitter.deletes[0].where.module_name, 'oldModule');
    assert.strictEqual(emitter.updates[0].data.rawSQL, 'DROP_MODULE_DATABASE');
    assert.deepStrictEqual(emitter.updates[0].data.params, ['oldmodule']);
    assert.strictEqual(fs.existsSync(moduleDir), false);
    assert.strictEqual(fs.existsSync(path.join(modulesRoot, 'keep.txt')), true);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    delete global.loadedModules;
  }
});

test('module uninstaller rejects invalid module names before deleting files', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-uninstall-'));
  const modulesRoot = path.join(tempRoot, 'modules');
  fs.mkdirSync(modulesRoot, { recursive: true });

  try {
    await assert.rejects(
      () => uninstallModule(new UninstallEmitter(), 'module-token', '../escape', { modulesRoot }),
      /Invalid module name/
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('module uninstaller refuses core-owned module names before deleting files', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-uninstall-'));
  const modulesRoot = path.join(tempRoot, 'modules');
  const moduleDir = path.join(modulesRoot, 'designer');
  fs.mkdirSync(moduleDir, { recursive: true });
  fs.writeFileSync(path.join(moduleDir, 'index.js'), 'module.exports = {};');
  const emitter = new UninstallEmitter();

  try {
    await assert.rejects(
      () => uninstallModule(emitter, 'module-token', 'designer', { modulesRoot }),
      /Core-owned module "designer" cannot be uninstalled/
    );
    assert.strictEqual(fs.existsSync(path.join(moduleDir, 'index.js')), true);
    assert.strictEqual(emitter.deletes.length, 0);
    assert.strictEqual(emitter.updates.length, 0);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
