'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { MANAGED_PATHS, buildRuntimeIntegrityManifest } = require('../mother/security/runtimeIntegrity');
const { prepareRuntimeIntegrity } = require('../tools/prepare-runtime-integrity');
const { verifyBuildBaseline } = require('../tools/verify-runtime-integrity-baseline');

let rootDir;
let manifest;
const names = ['runtime-integrity-manifest.json', 'runtime-integrity-manifest.bundle.json',
  'runtime-integrity-trusted-root.jsonl'];

beforeEach(() => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acr-source-inputs-'));
  fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ version: '1.2.3' }));
  fs.writeFileSync(path.join(rootDir, 'app.js'), 'module.exports = true;\n');
  for (const name of MANAGED_PATHS) {
    if (fs.existsSync(path.join(rootDir, name))) continue;
    if (name.includes('.')) fs.writeFileSync(path.join(rootDir, name), '{}\n');
    else fs.mkdirSync(path.join(rootDir, name));
  }
  manifest = buildRuntimeIntegrityManifest({ rootDir, version: '1.2.3',
    releaseTag: 'v1.2.3', sourceCommit: 'a'.repeat(40) });
});
afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(rootDir, { recursive: true, force: true });
});

function dependencies() {
  return {
    rootDir,
    fetchFile: jest.fn(async (url, target) => fs.writeFileSync(target,
      url.endsWith('manifest.json') ? JSON.stringify(manifest) : 'signed bundle', { mode: 0o600 })),
    runner: jest.fn(() => ({ status: 0, stdout: 'verifier-managed roots\n' })),
    verify: jest.fn(() => true)
  };
}

test('source builds fetch exact release metadata and obtain trust roots from the verifier', async () => {
  const deps = dependencies();
  await expect(prepareRuntimeIntegrity(deps)).resolves.toMatchObject({ downloaded: true, version: '1.2.3' });
  expect(deps.fetchFile.mock.calls.map(call => call[0])).toEqual([
    'https://github.com/BlogposterCMS/BlogposterCMS/releases/download/v1.2.3/runtime-integrity-manifest.json',
    'https://github.com/BlogposterCMS/BlogposterCMS/releases/download/v1.2.3/runtime-integrity-manifest.bundle.json'
  ]);
  expect(deps.runner).toHaveBeenCalledWith('gh', ['attestation', 'trusted-root'], expect.objectContaining({ timeout: 30000 }));
  expect(deps.verify).toHaveBeenCalledWith(expect.objectContaining({
    expectedVersion: '1.2.3', expectedSourceCommit: 'a'.repeat(40), trustedRootPath: expect.any(String)
  }));
  const manifestPath = path.join(rootDir, '.release-integrity', names[0]);
  expect(verifyBuildBaseline({ rootDir, manifestPath }).version).toBe('1.2.3');
  fs.appendFileSync(path.join(rootDir, 'app.js'), '// changed after signing');
  expect(() => verifyBuildBaseline({ rootDir, manifestPath })).toThrow('RUNTIME_INTEGRITY_BUILD_BASELINE_MISMATCH');
});

test('verified public inputs remain readable to the non-root runtime', async () => {
  const chmod = jest.spyOn(fs, 'chmodSync');
  const deps = dependencies();
  await prepareRuntimeIntegrity(deps);
  expect(chmod).toHaveBeenCalledTimes(names.length);
  for (const name of names) {
    expect(chmod).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`${name.replaceAll('.', '\\.')}$`)), 0o644);
    // Windows does not expose POSIX group/other bits; Linux also proves the mode.
    if (process.platform !== 'win32') {
      expect(fs.statSync(path.join(rootDir, '.release-integrity', name)).mode & 0o777).toBe(0o644);
    }
  }
  expect(deps.verify.mock.invocationCallOrder[0]).toBeLessThan(chmod.mock.invocationCallOrder[0]);
});

test('complete CI inputs are verified without release downloads', async () => {
  const deps = dependencies();
  const dir = path.join(rootDir, '.release-integrity');
  fs.mkdirSync(dir);
  names.forEach((name, i) => fs.writeFileSync(path.join(dir, name), i ? 'CI proof' : JSON.stringify(manifest)));
  await expect(prepareRuntimeIntegrity(deps)).resolves.toMatchObject({ downloaded: false });
  expect(deps.fetchFile).not.toHaveBeenCalled();
  expect(deps.runner).not.toHaveBeenCalled();
  expect(deps.verify).toHaveBeenCalledTimes(1);
});

test('partial inputs fail without mixing CI and downloaded files', async () => {
  const deps = dependencies();
  fs.mkdirSync(path.join(rootDir, '.release-integrity'));
  fs.writeFileSync(path.join(rootDir, '.release-integrity', names[0]), JSON.stringify(manifest));
  await expect(prepareRuntimeIntegrity(deps)).rejects.toMatchObject({ code: 'RUNTIME_INTEGRITY_BUILD_INPUTS_PARTIAL' });
  expect(deps.fetchFile).not.toHaveBeenCalled();
});

test.each(['signature', 'version', 'roots', 'download'])('failed %s cannot publish trusted inputs', async failure => {
  const chmod = jest.spyOn(fs, 'chmodSync');
  const deps = dependencies();
  if (failure === 'signature') deps.verify.mockImplementation(() => { throw new Error('BAD_SIGNATURE'); });
  if (failure === 'version') {
    manifest.version = '1.2.4';
    manifest.source.tag = 'v1.2.4';
  }
  if (failure === 'roots') deps.runner.mockReturnValue({ status: 1 });
  if (failure === 'download') deps.fetchFile.mockRejectedValue(new Error('DOWNLOAD_FAILED'));
  await expect(prepareRuntimeIntegrity(deps)).rejects.toThrow();
  expect(chmod).not.toHaveBeenCalled();
  expect(fs.existsSync(path.join(rootDir, '.release-integrity'))).toBe(false);
  expect(fs.readdirSync(rootDir).some(name => name.startsWith('.integrity-build-'))).toBe(false);
});

test('invalid packaged versions never become download URLs', async () => {
  const deps = dependencies();
  fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ version: '../latest' }));
  await expect(prepareRuntimeIntegrity(deps)).rejects.toMatchObject({ code: 'RUNTIME_INTEGRITY_BUILD_VERSION_INVALID' });
  expect(deps.fetchFile).not.toHaveBeenCalled();
});
