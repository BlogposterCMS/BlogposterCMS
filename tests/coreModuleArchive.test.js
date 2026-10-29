'use strict';

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { createFixture } = require('./helpers/coreModuleFixture');
const { buildModuleArchive, extractModuleArchive } = require('../mother/modules/updater/coreModuleArchive');

let fixture;
beforeEach(() => { fixture = createFixture(); });
afterEach(() => { fs.rmSync(fixture.directory, { recursive: true, force: true }); });
function archive() {
  return buildModuleArchive({ moduleDir: path.join(fixture.generationDir, 'code'), moduleName: 'translationManager',
    manifest: fs.readFileSync(path.join(fixture.generationDir, 'manifest.json')), bundle: Buffer.from('{}') });
}

test('preserves attested bytes and verifies extracted generation', () => {
  const destination = path.join(fixture.directory, 'extracted');
  extractModuleArchive(archive(), 'translationManager', destination);
  expect(fs.readFileSync(path.join(destination, 'manifest.json'))).toEqual(fs.readFileSync(path.join(fixture.generationDir, 'manifest.json')));
  expect(fixture.verify({ rootDir: fixture.rootDir, generationDir: destination, moduleName: 'translationManager' }).manifest.version).toBe('0.10.7');
});

test('rejects extra archive entries before creating destination', () => {
  const zip = new AdmZip(archive()); zip.addFile('unreviewed.js', Buffer.from('bad'));
  const destination = path.join(fixture.directory, 'extracted');
  expect(() => extractModuleArchive(zip.toBuffer(), 'translationManager', destination)).toThrow('CORE_MODULE_ARCHIVE_INVALID');
  expect(fs.existsSync(destination)).toBe(false);
});

test('packaging rejects code changed after manifest attestation', () => {
  fs.appendFileSync(path.join(fixture.generationDir, 'code/index.js'), '\n// changed');
  expect(archive).toThrow('CORE_MODULE_RELEASE_BYTES_CHANGED');
});
