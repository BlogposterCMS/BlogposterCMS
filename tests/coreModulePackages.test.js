'use strict';

const fs = require('fs');
const path = require('path');
const { createFixture } = require('./helpers/coreModuleFixture');
const { parseManifest, createModuleManifest } = require('../mother/modules/updater/coreModulePackages');

let fixture;
beforeEach(() => { fixture = createFixture(); });
afterEach(() => { fs.rmSync(fixture.directory, { recursive: true, force: true }); });
function verify() { return fixture.verify({ rootDir: fixture.rootDir, generationDir: fixture.generationDir, moduleName: 'translationManager' }); }

test('widget changelog edits preserve host compatibility while shared code edits do not', () => {
  const { hostFingerprint } = require('../mother/modules/updater/coreModulePackages');
  const policy = Object.values(require('../mother/modules/updater/coreWidgetPackages').WIDGET_POLICY)[0];
  const files = [
    {path: policy.entry.replace(/\.js$/, '.CHANGELOG.md'),size:1,sha256:'a'.repeat(64)},
    {path:'ui/shared/example.js',size:1,sha256:'b'.repeat(64)}
  ];
  const before = hostFingerprint(files, {name:'fixture',version:'1.0.0'});
  files[0].sha256 = 'c'.repeat(64);
  expect(hostFingerprint(files, {name:'fixture',version:'1.0.1'})).toBe(before);
  files[1].sha256 = 'd'.repeat(64);
  expect(hostFingerprint(files, {name:'fixture',version:'1.0.1'})).not.toBe(before);
});

test('database packages exclude mutable installation credentials and placeholder data', () => {
  const directory = path.join(fixture.source, 'mother/modules/databaseManager');
  fs.mkdirSync(path.join(directory, 'placeholders'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'index.js'), 'module.exports = {};');
  fs.writeFileSync(path.join(directory, 'moduleInfo.json'), '{"moduleName":"databaseManager"}');
  fs.writeFileSync(path.join(directory, 'modulePasswords.json'), '{"fixtureOnly":true}');
  fs.writeFileSync(path.join(directory, 'placeholders/placeholderData.json'), '{"fixtureOnly":true}');
  const runtimeManifest = { ...fixture.runtimeManifest,
    files: require('../mother/security/runtimeIntegrity').collectManagedFiles(fixture.source) };
  const manifest = createModuleManifest({ rootDir: fixture.source, moduleName: 'databaseManager', runtimeManifest });
  expect(manifest.files.map(file => file.path)).toEqual(['index.js', 'moduleInfo.json']);
});

test('checks the official attestation identity and immutable host trust roots before accepting a generation', () => {
  const result = verify();
  expect(result.manifest.version).toBe('0.10.7');
  expect(result.generationId).toMatch(/^[a-f0-9]{64}$/);
  expect(fixture.attestationVerifier).toHaveBeenCalledWith(expect.objectContaining({
    expectedVersion: '0.10.7', expectedSourceCommit: 'a'.repeat(40),
    trustedRootPath: path.join(fixture.rootDir, '.integrity/runtime-integrity-trusted-root.jsonl')
  }));
});

test('a signature failure cannot be replaced by matching local hashes', () => {
  fixture.attestationVerifier.mockImplementation(() => { throw new Error('signature rejected'); });
  expect(verify).toThrow('signature rejected');
});

test.each(['modify', 'extra', 'missing'])('rejects %s code relative to the signed manifest', change => {
  const code = path.join(fixture.generationDir, 'code');
  if (change === 'modify') fs.appendFileSync(path.join(code, 'index.js'), '\n// changed');
  if (change === 'extra') fs.writeFileSync(path.join(code, 'surprise.js'), 'module.exports = true;');
  if (change === 'missing') fs.unlinkSync(path.join(code, 'dbInit.js'));
  expect(verify).toThrow('CORE_MODULE_PACKAGE_INTEGRITY_FAILED');
});

test.each(['schema', 'host', 'dependency'])('rejects incompatible %s changes', change => {
  if (change === 'schema') fs.appendFileSync(path.join(fixture.rootDir, 'mother/modules/translationManager/dbInit.js'), '\n// changed');
  if (change === 'host') fs.writeFileSync(path.join(fixture.rootDir, 'app.js'), 'changed');
  if (change === 'dependency') fs.writeFileSync(path.join(fixture.rootDir, 'package.json'), JSON.stringify({ name: 'blogposter_cms', version: '0.10.6', engines: { node: '>=26' } }));
  expect(verify).toThrow('CORE_MODULE_HOST_INCOMPATIBLE');
});

test('release packaging refuses bytes changed after the signed baseline was created', () => {
  fs.appendFileSync(path.join(fixture.source, 'mother/modules/translationManager/index.js'), 'changed');
  expect(() => createModuleManifest({ rootDir: fixture.source, moduleName: 'translationManager', runtimeManifest: fixture.runtimeManifest }))
    .toThrow('CORE_MODULE_RELEASE_BYTES_CHANGED');
});

test.each(['../escape.js', '/absolute.js', 'C:/outside.js', 'a//b.js'])('rejects unsafe manifest path %s', filename => {
  fixture.manifest.files[0].path = filename;
  expect(() => parseManifest(JSON.stringify(fixture.manifest), 'translationManager')).toThrow('CORE_MODULE_MANIFEST_FILE_INVALID');
});

test('package declarations cannot enable an unmigrated module', () => {
  fixture.manifest.moduleName = 'unknownModule';
  expect(() => parseManifest(JSON.stringify(fixture.manifest), 'unknownModule')).toThrow('CORE_MODULE_RESTART_REQUIRED');
});

test('preview release manifests retain their exact signed tag identity', () => {
  fixture.manifest.version = '0.10.7-rc.1';
  fixture.manifest.source.tag = 'v0.10.7-rc.1';
  expect(parseManifest(JSON.stringify(fixture.manifest), 'translationManager').version).toBe('0.10.7-rc.1');
});


test('signed root release notes do not force a host update for module-only releases', () => {
  const { hostFingerprint } = require('../mother/modules/updater/coreModulePackages');
  const files = [{ path: 'app.js', size: 1, sha256: 'a'.repeat(64) }, { path: 'CHANGELOG.md', size: 12, sha256: 'b'.repeat(64) }];
  const before = hostFingerprint(files, { version: '1.0.0' });
  files[1] = { path: 'CHANGELOG.md', size: 42, sha256: 'c'.repeat(64) };
  expect(hostFingerprint(files, { version: '1.0.1' })).toBe(before);
  files[0].sha256 = 'd'.repeat(64);
  expect(hostFingerprint(files, { version: '1.0.1' })).not.toBe(before);
});
