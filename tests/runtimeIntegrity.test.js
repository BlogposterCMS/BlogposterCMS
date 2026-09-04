const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  MANAGED_PATHS,
  buildRuntimeIntegrityManifest,
  parseRuntimeIntegrityManifest,
  verifyAttestation,
  verifyRuntimeIntegrity,
  verifyRuntimeModuleIntegrityNow,
  _internals
} = require('../mother/security/runtimeIntegrity');
const {
  verifyBuildBaseline
} = require('../tools/verify-runtime-integrity-baseline');

const RELEASE_IDENTITY = {
  version: '1.2.3',
  sourceCommit: 'a'.repeat(40),
  releaseTag: 'v1.2.3'
};

function createRuntimeFixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blogposter-runtime-test-'));
  fs.writeFileSync(path.join(rootDir, 'app.js'), 'module.exports = true;\n');
  fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ version: RELEASE_IDENTITY.version }));
  fs.writeFileSync(path.join(rootDir, 'package-lock.json'), '{}\n');

  for (const managedPath of MANAGED_PATHS.filter(item => !['app.js', 'package.json', 'package-lock.json'].includes(item))) {
    fs.mkdirSync(path.join(rootDir, managedPath), { recursive: true });
    if (managedPath !== 'modules') {
      fs.writeFileSync(path.join(rootDir, managedPath, 'fixture.txt'), `${managedPath}\n`);
    }
  }
  for (const moduleName of ['alpha', 'beta']) {
    const moduleDir = path.join(rootDir, 'modules', moduleName);
    fs.mkdirSync(moduleDir, { recursive: true });
    fs.writeFileSync(path.join(moduleDir, 'index.js'), `module.exports = '${moduleName}';\n`);
  }
  return rootDir;
}

function writeSignedFixture(rootDir) {
  const manifest = buildRuntimeIntegrityManifest({
    rootDir,
    ...RELEASE_IDENTITY,
    generatedAt: new Date('2026-09-04T12:00:00.000Z')
  });
  const manifestPath = path.join(rootDir, 'signed-manifest.json');
  const bundlePath = path.join(rootDir, 'signed-bundle.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  fs.writeFileSync(bundlePath, '{}');
  return { manifest, manifestPath, bundlePath };
}

afterEach(() => {
  _internals.resetRuntimeIntegrityForTests();
});

test('runtime manifest covers application code, modules and production dependencies', () => {
  const rootDir = createRuntimeFixture();
  try {
    const manifest = buildRuntimeIntegrityManifest({ rootDir, ...RELEASE_IDENTITY });
    expect(manifest.managedPaths).toEqual(MANAGED_PATHS);
    expect(manifest.files.some(record => record.path === 'modules/alpha/index.js')).toBe(true);
    expect(manifest.files.some(record => record.path === 'node_modules/fixture.txt')).toBe(true);
    expect(parseRuntimeIntegrityManifest(JSON.stringify(manifest))).toEqual(manifest);
    expect(manifest.files.map(record => record.path)).toEqual(
      [...manifest.files.map(record => record.path)].sort((a, b) => a.localeCompare(b))
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('container build gate rejects drift from the externally signed baseline', () => {
  const rootDir = createRuntimeFixture();
  try {
    const { manifestPath } = writeSignedFixture(rootDir);
    expect(verifyBuildBaseline({ rootDir, manifestPath })).toMatchObject({
      fileCount: expect.any(Number),
      version: '1.2.3'
    });
    fs.appendFileSync(path.join(rootDir, 'node_modules', 'fixture.txt'), 'changed\n');
    expect(() => verifyBuildBaseline({ rootDir, manifestPath })).toThrow(
      /RUNTIME_INTEGRITY_BUILD_BASELINE_MISMATCH/
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('runtime-generated data files are excluded without weakening executable coverage', () => {
  expect(_internals.pathIsMutableRuntimeData('mother/modules/example/runtime.log')).toBe(true);
  expect(_internals.pathIsMutableRuntimeData('mother/modules/example/cache.sqlite-wal')).toBe(true);
  expect(_internals.pathIsMutableRuntimeData('mother/modules/example/index.js')).toBe(false);
  expect(_internals.pathIsMutableRuntimeData('modules/example/index.js')).toBe(false);
});

test('production startup fails closed on changed core files after signature verification', async () => {
  const rootDir = createRuntimeFixture();
  try {
    const { manifestPath, bundlePath } = writeSignedFixture(rootDir);
    fs.appendFileSync(path.join(rootDir, 'app.js'), '// tampered\n');
    const attestationVerifier = jest.fn(() => true);

    await expect(verifyRuntimeIntegrity({
      rootDir,
      manifestPath,
      bundlePath,
      env: { NODE_ENV: 'production' },
      attestationVerifier,
      consoleLike: { info: jest.fn(), error: jest.fn() }
    })).rejects.toMatchObject({ code: 'RUNTIME_INTEGRITY_CORE_MISMATCH' });
    expect(attestationVerifier).toHaveBeenCalledTimes(1);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('production startup verifies packaged attestation assets without a network fetch', async () => {
  const rootDir = createRuntimeFixture();
  try {
    const signed = writeSignedFixture(rootDir);
    const integrityDir = path.join(rootDir, '.integrity');
    fs.mkdirSync(integrityDir);
    fs.renameSync(signed.manifestPath, path.join(integrityDir, 'runtime-integrity-manifest.json'));
    fs.renameSync(signed.bundlePath, path.join(integrityDir, 'runtime-integrity-manifest.bundle.json'));
    const fetchFile = jest.fn(() => Promise.reject(new Error('network must not be used')));
    const attestationVerifier = jest.fn(() => true);

    await expect(verifyRuntimeIntegrity({
      rootDir,
      env: { NODE_ENV: 'production' },
      fetchFile,
      attestationVerifier,
      consoleLike: { info: jest.fn(), error: jest.fn() }
    })).resolves.toMatchObject({ enforced: true, version: '1.2.3' });
    expect(fetchFile).not.toHaveBeenCalled();
    expect(attestationVerifier).toHaveBeenCalledWith(expect.objectContaining({
      expectedSourceCommit: 'a'.repeat(40),
      expectedVersion: '1.2.3'
    }));
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('changed module is blocked while an unaffected module remains eligible', async () => {
  const rootDir = createRuntimeFixture();
  try {
    const { manifestPath, bundlePath } = writeSignedFixture(rootDir);
    fs.appendFileSync(path.join(rootDir, 'modules', 'alpha', 'index.js'), '// tampered\n');
    const audit = { info: jest.fn(), error: jest.fn() };

    const result = await verifyRuntimeIntegrity({
      rootDir,
      manifestPath,
      bundlePath,
      env: { APP_ENV: 'production' },
      attestationVerifier: () => true,
      consoleLike: audit
    });

    expect(result.invalidModules).toEqual(['alpha']);
    expect(() => verifyRuntimeModuleIntegrityNow('alpha', audit)).toThrow(
      expect.objectContaining({ code: 'RUNTIME_INTEGRITY_MODULE_BLOCKED' })
    );
    expect(verifyRuntimeModuleIntegrityNow('beta', audit)).toBe(true);
    expect(audit.error.mock.calls.flat().join(' ')).toContain('RUNTIME_INTEGRITY_MODULE_BLOCKED');

    const registerModuleType = jest.fn();
    const emitter = {
      emit: jest.fn((eventName, payload, callback) => callback?.(null)),
      eventNames: jest.fn(() => []),
      listeners: jest.fn(() => []),
      registerModuleType,
      removeListener: jest.fn()
    };
    const { attemptModuleLoad } = require('../mother/modules/moduleLoader')._internals;
    await expect(attemptModuleLoad(
      { module_name: 'alpha', moduleInfo: {} },
      ['alpha'],
      path.join(rootDir, 'modules'),
      emitter,
      {},
      'test-jwt',
      false
    )).resolves.toBe(false);
    expect(registerModuleType).not.toHaveBeenCalled();
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('invalid attestation stops startup before a manifest can be trusted', async () => {
  const rootDir = createRuntimeFixture();
  try {
    const { manifestPath, bundlePath } = writeSignedFixture(rootDir);
    const signatureError = Object.assign(new Error('invalid signature'), {
      code: 'RUNTIME_INTEGRITY_ATTESTATION_INVALID'
    });
    await expect(verifyRuntimeIntegrity({
      rootDir,
      manifestPath,
      bundlePath,
      env: { NODE_ENV: 'production' },
      attestationVerifier: () => { throw signatureError; },
      consoleLike: { info: jest.fn(), error: jest.fn() }
    })).rejects.toBe(signatureError);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('production cannot disable runtime integrity', async () => {
  await expect(verifyRuntimeIntegrity({
    env: { NODE_ENV: 'production', BLOGPOSTER_RUNTIME_INTEGRITY: 'off' },
    consoleLike: { info: jest.fn(), error: jest.fn() }
  })).rejects.toMatchObject({ code: 'RUNTIME_INTEGRITY_BYPASS_DENIED' });
});

test('attestation verifier pins repository, workflow, tag and hosted runner policy', () => {
  const runner = jest.fn(() => ({ status: 0, stdout: '', stderr: '' }));
  expect(verifyAttestation({
    manifestPath: '/tmp/manifest.json',
    bundlePath: '/tmp/bundle.json',
    expectedVersion: '1.2.3',
    expectedSourceCommit: 'a'.repeat(40),
    runner
  })).toBe(true);
  expect(runner).toHaveBeenCalledWith('gh', expect.arrayContaining([
    '--repo', 'BlogposterCMS/BlogposterCMS',
    '--signer-workflow', 'BlogposterCMS/BlogposterCMS/.github/workflows/release.yml',
    '--source-ref', 'refs/tags/v1.2.3',
    '--source-digest', 'a'.repeat(40),
    '--deny-self-hosted-runners'
  ]), expect.any(Object));
});

test('application startup imports integrity gate before event infrastructure', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'app.js'), 'utf8');
  expect(source).not.toContain("require('dotenv')");
  expect(source.indexOf("require('./mother/security/runtimeIntegrity')")).toBeLessThan(
    source.indexOf("require('./mother/emitters/motherEmitter')")
  );
  expect(source.indexOf('await verifyRuntimeIntegrity')).toBeLessThan(
    source.indexOf("require('./mother/emitters/motherEmitter')")
  );
});
