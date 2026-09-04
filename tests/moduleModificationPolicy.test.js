const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  readModuleModificationSummary,
  resolveModuleOverrideDir,
  safeModuleModificationSummary,
  resolveModuleModificationDir,
  _internals: { normalizeOverridablePaths }
} = require('../mother/modules/moduleLoader/moduleModificationPolicy');

test('module modification policy detects user override files without exposing absolute paths', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-modification-'));
  const modificationRoot = path.join(tempRoot, 'module-overrides');
  const moduleDir = path.join(modificationRoot, 'shopSync');

  try {
    fs.mkdirSync(path.join(moduleDir, 'frontend'), { recursive: true });
    fs.writeFileSync(path.join(moduleDir, 'frontend', 'badge.css'), '.shop-sync {}');

    const summary = readModuleModificationSummary('shopSync', { modificationRoot });

    assert.strictEqual(summary.hasModification, true);
    assert.strictEqual(summary.valid, true);
    assert.strictEqual(summary.fileCount, 1);
    assert.strictEqual(summary.source, 'user-overrides');
    assert.strictEqual(summary.path, 'data/module-overrides/shopSync');
    assert.strictEqual(summary.path.includes(tempRoot), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('module modification policy treats missing or empty override folders as unmodified', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-modification-'));
  const modificationRoot = path.join(tempRoot, 'module-overrides');

  try {
    const missing = readModuleModificationSummary('emptyModule', { modificationRoot });
    assert.strictEqual(missing.hasModification, false);
    assert.strictEqual(missing.fileCount, 0);

    fs.mkdirSync(resolveModuleModificationDir('emptyModule', { modificationRoot }), { recursive: true });
    const empty = readModuleModificationSummary('emptyModule', { modificationRoot });
    assert.strictEqual(empty.hasModification, false);
    assert.strictEqual(empty.fileCount, 0);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('module modification policy reports forbidden backend override files with an error code', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-modification-'));
  const modificationRoot = path.join(tempRoot, 'module-overrides');
  const moduleDir = path.join(modificationRoot, 'shopSync');

  try {
    fs.mkdirSync(moduleDir, { recursive: true });
    fs.writeFileSync(path.join(moduleDir, 'index.js'), 'module.exports = {};');

    assert.throws(
      () => readModuleModificationSummary('shopSync', { modificationRoot }),
      /E_MODULE_MODIFICATION_FORBIDDEN_FILE/
    );

    const safeSummary = safeModuleModificationSummary('shopSync', { modificationRoot });
    assert.strictEqual(safeSummary.hasModification, true);
    assert.strictEqual(safeSummary.valid, false);
    assert.strictEqual(safeSummary.errorCode, 'E_MODULE_MODIFICATION_FORBIDDEN_FILE');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('module override resolver mirrors only declared static directories', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-overlay-'));
  const modificationRoot = path.join(tempRoot, 'module-overrides');
  const frontendDir = path.join(modificationRoot, 'shopSync', 'frontend');
  const templateDir = path.join(modificationRoot, 'shopSync', 'templates');

  try {
    fs.mkdirSync(frontendDir, { recursive: true });
    fs.mkdirSync(templateDir, { recursive: true });
    fs.writeFileSync(path.join(frontendDir, 'theme.css'), '.override {}');
    fs.writeFileSync(path.join(templateDir, 'card.html'), '<p>override</p>');

    assert.strictEqual(
      resolveModuleOverrideDir('shopSync', 'frontend', { staticFrontend: true }, { modificationRoot }),
      fs.realpathSync(frontendDir)
    );
    assert.strictEqual(
      resolveModuleOverrideDir('shopSync', 'templates', { staticFrontend: true }, { modificationRoot }),
      null
    );
    assert.strictEqual(
      resolveModuleOverrideDir('shopSync', 'templates', { overridablePaths: ['templates'] }, { modificationRoot }),
      fs.realpathSync(templateDir)
    );
    assert.deepStrictEqual(
      normalizeOverridablePaths({ overridablePaths: ['frontend', 'frontend', 'locales'] }),
      ['frontend', 'locales']
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('module override declarations reject traversal and absolute paths', () => {
  assert.throws(
    () => normalizeOverridablePaths({ overridablePaths: ['../mother'] }),
    /E_MODULE_OVERRIDE_PATH_INVALID/
  );
  assert.throws(
    () => normalizeOverridablePaths({ overridablePaths: 'frontend' }),
    /E_MODULE_OVERRIDE_DECLARATION_INVALID/
  );
});
