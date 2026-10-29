'use strict';

const fs = require('fs');
const path = require('path');
const { createFixture } = require('./helpers/coreModuleFixture');
const { createCoreModuleStore } = require('../mother/modules/updater/coreModuleStore');

let fixture;
let store;
beforeEach(() => {
  fixture = createFixture();
  store = createCoreModuleStore({ rootDir: fixture.rootDir, verify: fixture.verify });
});
afterEach(() => { fs.rmSync(fixture.directory, { recursive: true, force: true }); });

test('staging does not activate code and a fresh store verifies the selected generation again', () => {
  const candidate = store.stage('translationManager', fixture.generationDir);
  expect(store.active('translationManager')).toBeNull();
  store.activate('translationManager', candidate.generationId);
  fixture.attestationVerifier.mockClear();
  const restarted = createCoreModuleStore({ rootDir: fixture.rootDir, verify: fixture.verify });
  expect(restarted.active('translationManager').manifest.version).toBe('0.10.7');
  expect(fixture.attestationVerifier).toHaveBeenCalledTimes(1);
});

test('a tampered persistent generation fails closed after restart', () => {
  const candidate = store.stage('translationManager', fixture.generationDir);
  store.activate('translationManager', candidate.generationId);
  fs.appendFileSync(path.join(candidate.moduleDir, 'index.js'), 'tampered');
  expect(() => store.active('translationManager')).toThrow('CORE_MODULE_PACKAGE_INTEGRITY_FAILED');
});

test('a pointer cannot escape the owned module store or select a different manifest identity', () => {
  const candidate = store.stage('translationManager', fixture.generationDir);
  expect(() => store.activate('translationManager', '../outside')).toThrow('CORE_MODULE_GENERATION_INVALID');
  const base = path.dirname(path.dirname(candidate.moduleDir));
  fs.renameSync(path.dirname(candidate.moduleDir), path.join(base, 'b'.repeat(64)));
  expect(() => store.activate('translationManager', 'b'.repeat(64))).toThrow('CORE_MODULE_GENERATION_MISMATCH');
});

test('staging retains an existing selected generation on verification failure', () => {
  const candidate = store.stage('translationManager', fixture.generationDir);
  store.activate('translationManager', candidate.generationId);
  const prior = store.state('translationManager');
  fixture.attestationVerifier.mockImplementation(() => { throw new Error('rejected'); });
  expect(() => store.stage('translationManager', fixture.generationDir)).toThrow('rejected');
  expect(store.state('translationManager')).toEqual(prior);
});
