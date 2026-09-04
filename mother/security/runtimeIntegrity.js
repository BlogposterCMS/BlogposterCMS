'use strict';

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const INTEGRITY_SCHEMA_VERSION = 1;
const PRODUCT = 'blogpostercms';
const TRUSTED_REPOSITORY = 'BlogposterCMS/BlogposterCMS';
const TRUSTED_SIGNER_WORKFLOW = 'BlogposterCMS/BlogposterCMS/.github/workflows/release.yml';
const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const MANAGED_PATHS = Object.freeze([
  'app.js',
  'package.json',
  'package-lock.json',
  'config',
  'mother',
  'ui',
  'apps',
  'modules',
  'presets',
  'public',
  'widgets',
  'node_modules'
]);
const MUTABLE_RUNTIME_PATHS = Object.freeze([
  // These compatibility links point into the persistent data volume and are
  // data, not release code. Their exact names are excluded; their parent code
  // directories remain fully covered by the signed baseline.
  'mother/modules/databaseManager/modulePasswords.json',
  'mother/modules/databaseManager/placeholders/placeholderData.json',
  'mother/modules/notificationManager/blogposter.log'
]);

let runtimeState = {
  enforced: false,
  rootDir: null,
  manifest: null,
  invalidModules: new Map()
};

function createIntegrityError(code, message, details = {}) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  err.details = details;
  return err;
}

function normalizeRelativePath(value, label = 'integrity path') {
  const raw = String(value || '');
  const normalized = raw.replace(/\\/g, '/').replace(/^\.\//, '');
  const segments = normalized.split('/').filter(Boolean);
  if (
    !segments.length ||
    raw.includes('\0') ||
    path.isAbsolute(raw) ||
    segments.some(segment => segment === '.' || segment === '..')
  ) {
    throw createIntegrityError('RUNTIME_INTEGRITY_PATH_INVALID', `${label} must be a safe relative path.`);
  }
  return segments.join('/');
}

function pathIsManaged(relativePath, managedPaths = MANAGED_PATHS) {
  return managedPaths.some(managedPath => (
    relativePath === managedPath || relativePath.startsWith(`${managedPath}/`)
  ));
}

function pathIsMutableRuntimeData(relativePath) {
  // Node treats unknown extensions as CommonJS in require(), so suffix-based
  // exclusions would let executable module code escape the signed baseline.
  return MUTABLE_RUNTIME_PATHS.includes(relativePath);
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sha256Value(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function collectPathEntries(rootDir, managedPath, output) {
  const normalizedRoot = path.resolve(rootDir);
  const relativePath = normalizeRelativePath(managedPath, 'managed path');
  if (pathIsMutableRuntimeData(relativePath)) return;
  const absolutePath = path.resolve(normalizedRoot, relativePath);
  const rootPrefix = normalizedRoot.endsWith(path.sep) ? normalizedRoot : `${normalizedRoot}${path.sep}`;
  if (absolutePath !== normalizedRoot && !absolutePath.startsWith(rootPrefix)) {
    throw createIntegrityError('RUNTIME_INTEGRITY_PATH_ESCAPE', `Managed path escapes the application root: ${relativePath}`);
  }
  if (!fs.existsSync(absolutePath)) {
    throw createIntegrityError('RUNTIME_INTEGRITY_MANAGED_PATH_MISSING', `Managed release path is missing: ${relativePath}`);
  }

  const stats = fs.lstatSync(absolutePath);
  if (stats.isSymbolicLink()) {
    const linkTarget = fs.readlinkSync(absolutePath);
    const resolvedTarget = path.resolve(path.dirname(absolutePath), linkTarget);
    if (resolvedTarget !== normalizedRoot && !resolvedTarget.startsWith(rootPrefix)) {
      throw createIntegrityError('RUNTIME_INTEGRITY_SYMLINK_ESCAPE', `Managed symbolic link leaves the application root: ${relativePath}`);
    }
    // Hash the link itself rather than following it. This covers npm's .bin
    // links and detects retargeting without reading the same dependency twice.
    const encodedTarget = `symlink:${linkTarget}`;
    output.push({
      path: relativePath,
      size: Buffer.byteLength(encodedTarget),
      sha256: sha256Value(encodedTarget)
    });
    return;
  }
  if (stats.isFile()) {
    output.push({
      path: relativePath,
      size: stats.size,
      sha256: sha256File(absolutePath)
    });
    return;
  }
  if (!stats.isDirectory()) {
    throw createIntegrityError('RUNTIME_INTEGRITY_ENTRY_TYPE_INVALID', `Unsupported managed entry type: ${relativePath}`);
  }

  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const childPath = `${relativePath}/${entry.name}`;
    collectPathEntries(rootDir, childPath, output);
  }
}

function collectManagedFiles(rootDir, managedPaths = MANAGED_PATHS) {
  const files = [];
  for (const managedPath of managedPaths) {
    collectPathEntries(rootDir, managedPath, files);
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function requireReleaseIdentity({ version, sourceCommit, releaseTag, sourceRepository = TRUSTED_REPOSITORY }) {
  const normalizedVersion = String(version || '').trim();
  const normalizedCommit = String(sourceCommit || '').trim().toLowerCase();
  const normalizedTag = String(releaseTag || '').trim();
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(normalizedVersion)) {
    throw createIntegrityError('RUNTIME_INTEGRITY_VERSION_INVALID', 'Runtime integrity version must be semantic.');
  }
  if (!/^[a-f0-9]{40}$/.test(normalizedCommit)) {
    throw createIntegrityError('RUNTIME_INTEGRITY_COMMIT_INVALID', 'Runtime integrity source commit must be a full Git SHA.');
  }
  if (normalizedTag !== `v${normalizedVersion}`) {
    throw createIntegrityError('RUNTIME_INTEGRITY_TAG_MISMATCH', `Release tag must equal v${normalizedVersion}.`);
  }
  if (sourceRepository !== TRUSTED_REPOSITORY) {
    throw createIntegrityError('RUNTIME_INTEGRITY_REPOSITORY_MISMATCH', 'Runtime integrity repository does not match the trust policy.');
  }
  return {
    version: normalizedVersion,
    sourceCommit: normalizedCommit,
    releaseTag: normalizedTag,
    sourceRepository
  };
}

function buildRuntimeIntegrityManifest({ rootDir, version, sourceCommit, releaseTag, generatedAt = new Date() }) {
  const identity = requireReleaseIdentity({ version, sourceCommit, releaseTag });
  return {
    schemaVersion: INTEGRITY_SCHEMA_VERSION,
    product: PRODUCT,
    version: identity.version,
    generatedAt: generatedAt.toISOString(),
    source: {
      repository: identity.sourceRepository,
      commit: identity.sourceCommit,
      tag: identity.releaseTag
    },
    managedPaths: [...MANAGED_PATHS],
    files: collectManagedFiles(rootDir)
  };
}

function parseRuntimeIntegrityManifest(raw) {
  let manifest;
  try {
    manifest = typeof raw === 'string' || Buffer.isBuffer(raw) ? JSON.parse(String(raw)) : raw;
  } catch (err) {
    throw createIntegrityError('RUNTIME_INTEGRITY_MANIFEST_INVALID', `Integrity manifest is not valid JSON: ${err.message}`);
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw createIntegrityError('RUNTIME_INTEGRITY_MANIFEST_INVALID', 'Integrity manifest must be an object.');
  }
  if (manifest.schemaVersion !== INTEGRITY_SCHEMA_VERSION || manifest.product !== PRODUCT) {
    throw createIntegrityError('RUNTIME_INTEGRITY_MANIFEST_INVALID', 'Integrity manifest schema or product is unsupported.');
  }
  requireReleaseIdentity({
    version: manifest.version,
    sourceCommit: manifest.source?.commit,
    releaseTag: manifest.source?.tag,
    sourceRepository: manifest.source?.repository
  });
  if (JSON.stringify(manifest.managedPaths) !== JSON.stringify(MANAGED_PATHS)) {
    throw createIntegrityError('RUNTIME_INTEGRITY_SCOPE_MISMATCH', 'Signed integrity scope does not match the runtime trust policy.');
  }
  if (!Array.isArray(manifest.files) || !manifest.files.length) {
    throw createIntegrityError('RUNTIME_INTEGRITY_MANIFEST_INVALID', 'Integrity manifest must contain file records.');
  }

  let previousPath = '';
  const seen = new Set();
  for (const record of manifest.files) {
    const relativePath = normalizeRelativePath(record?.path, 'manifest file path');
    if (relativePath !== record.path || !pathIsManaged(relativePath)) {
      throw createIntegrityError('RUNTIME_INTEGRITY_MANIFEST_INVALID', `Manifest contains an unmanaged path: ${relativePath}`);
    }
    if (seen.has(relativePath) || (previousPath && previousPath.localeCompare(relativePath) >= 0)) {
      throw createIntegrityError('RUNTIME_INTEGRITY_MANIFEST_ORDER_INVALID', 'Manifest file paths must be unique and sorted.');
    }
    if (!Number.isSafeInteger(record.size) || record.size < 0 || !/^[a-f0-9]{64}$/.test(record.sha256 || '')) {
      throw createIntegrityError('RUNTIME_INTEGRITY_MANIFEST_INVALID', `Manifest record is invalid: ${relativePath}`);
    }
    seen.add(relativePath);
    previousPath = relativePath;
  }
  return manifest;
}

function moduleNameForPath(relativePath) {
  const match = /^modules\/([^/]+)(?:\/|$)/.exec(relativePath);
  return match ? match[1] : null;
}

function compareRecords(expectedRecords, actualRecords) {
  const expected = new Map(expectedRecords.map(record => [record.path, record]));
  const actual = new Map(actualRecords.map(record => [record.path, record]));
  const issues = [];

  for (const [relativePath, record] of expected) {
    const current = actual.get(relativePath);
    if (!current) {
      issues.push({ code: 'RUNTIME_INTEGRITY_FILE_MISSING', path: relativePath });
    } else if (current.size !== record.size) {
      issues.push({ code: 'RUNTIME_INTEGRITY_SIZE_MISMATCH', path: relativePath });
    } else if (current.sha256 !== record.sha256) {
      issues.push({ code: 'RUNTIME_INTEGRITY_HASH_MISMATCH', path: relativePath });
    }
  }
  for (const relativePath of actual.keys()) {
    if (!expected.has(relativePath)) {
      issues.push({ code: 'RUNTIME_INTEGRITY_UNEXPECTED_FILE', path: relativePath });
    }
  }
  return issues.sort((left, right) => left.path.localeCompare(right.path));
}

function splitIntegrityIssues(issues) {
  const coreIssues = [];
  const invalidModules = new Map();
  for (const issue of issues) {
    const moduleName = moduleNameForPath(issue.path);
    if (!moduleName) {
      coreIssues.push(issue);
      continue;
    }
    const current = invalidModules.get(moduleName) || [];
    current.push(issue);
    invalidModules.set(moduleName, current);
  }
  return { coreIssues, invalidModules };
}

function auditIntegrity(consoleLike, level, code, message, details = {}) {
  const target = consoleLike?.[level] || consoleLike?.log || console.log;
  target.call(consoleLike || console, `[RUNTIME_INTEGRITY_AUDIT] ${JSON.stringify({
    code,
    message,
    ...details,
    timestamp: new Date().toISOString()
  })}`);
}

function verifyAttestation({ manifestPath, bundlePath, expectedVersion, expectedSourceCommit, ghPath = 'gh', runner = spawnSync }) {
  if (!/^[a-f0-9]{40}$/.test(expectedSourceCommit || '')) {
    throw createIntegrityError('RUNTIME_INTEGRITY_COMMIT_INVALID', 'Attestation verification requires the full expected source commit.');
  }
  const args = [
    'attestation', 'verify', manifestPath,
    '--repo', TRUSTED_REPOSITORY,
    '--bundle', bundlePath,
    '--signer-workflow', TRUSTED_SIGNER_WORKFLOW,
    '--source-ref', `refs/tags/v${expectedVersion}`,
    '--source-digest', expectedSourceCommit,
    '--deny-self-hosted-runners'
  ];
  const result = runner(ghPath, args, {
    encoding: 'utf8',
    env: { ...process.env, GH_PROMPT_DISABLED: '1' },
    windowsHide: true
  });
  if (result?.status !== 0) {
    throw createIntegrityError(
      'RUNTIME_INTEGRITY_ATTESTATION_INVALID',
      'GitHub/Sigstore verification of the runtime manifest failed.',
      { exitCode: result?.status ?? null }
    );
  }
  return true;
}

function fetchHttpsFile(url, destination, options = {}) {
  const maxBytes = options.maxBytes || MAX_ARTIFACT_BYTES;
  const redirectsRemaining = options.redirectsRemaining ?? 5;
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'https:') {
    return Promise.reject(createIntegrityError('RUNTIME_INTEGRITY_DOWNLOAD_PROTOCOL_DENIED', 'Integrity artifacts require HTTPS.'));
  }

  return new Promise((resolve, reject) => {
    const request = https.get(parsedUrl, {
      headers: { 'User-Agent': 'BlogposterCMS-Runtime-Integrity/1' }
    }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        if (redirectsRemaining <= 0) {
          reject(createIntegrityError('RUNTIME_INTEGRITY_DOWNLOAD_REDIRECT_LIMIT', 'Integrity artifact exceeded the redirect limit.'));
          return;
        }
        const redirected = new URL(response.headers.location, parsedUrl);
        fetchHttpsFile(redirected.toString(), destination, {
          maxBytes,
          redirectsRemaining: redirectsRemaining - 1
        }).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(createIntegrityError('RUNTIME_INTEGRITY_DOWNLOAD_FAILED', `Integrity artifact returned HTTP ${response.statusCode}.`));
        return;
      }
      const chunks = [];
      let total = 0;
      response.on('data', chunk => {
        total += chunk.length;
        if (total > maxBytes) {
          request.destroy(createIntegrityError('RUNTIME_INTEGRITY_DOWNLOAD_TOO_LARGE', 'Integrity artifact exceeds the size limit.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        try {
          fs.writeFileSync(destination, Buffer.concat(chunks), { flag: 'wx', mode: 0o600 });
          resolve(destination);
        } catch (err) {
          reject(createIntegrityError('RUNTIME_INTEGRITY_ARTIFACT_WRITE_FAILED', `Cannot stage integrity artifact: ${err.message}`));
        }
      });
    });
    request.setTimeout(30000, () => {
      request.destroy(createIntegrityError('RUNTIME_INTEGRITY_DOWNLOAD_TIMEOUT', 'Integrity artifact download timed out.'));
    });
    request.on('error', err => reject(err.code?.startsWith?.('RUNTIME_INTEGRITY_')
      ? err
      : createIntegrityError('RUNTIME_INTEGRITY_DOWNLOAD_FAILED', `Integrity artifact download failed: ${err.message}`)));
  });
}

function defaultArtifactUrls(version) {
  const releaseRoot = `https://github.com/${TRUSTED_REPOSITORY}/releases/download/v${version}`;
  return {
    manifestUrl: `${releaseRoot}/runtime-integrity-manifest.json`,
    bundleUrl: `${releaseRoot}/runtime-integrity-manifest.bundle.json`
  };
}

function integrityIsRequired(env = process.env) {
  const mode = String(env.BLOGPOSTER_RUNTIME_INTEGRITY || '').trim().toLowerCase();
  const production = env.NODE_ENV === 'production' || env.APP_ENV === 'production';
  if (mode === 'off' && production) {
    throw createIntegrityError('RUNTIME_INTEGRITY_BYPASS_DENIED', 'Runtime integrity cannot be disabled in production.');
  }
  return production || mode === 'required';
}

async function verifyRuntimeIntegrity(options = {}) {
  const env = options.env || process.env;
  const consoleLike = options.consoleLike || console;
  if (!integrityIsRequired(env)) {
    runtimeState = { enforced: false, rootDir: null, manifest: null, invalidModules: new Map() };
    auditIntegrity(consoleLike, 'info', 'RUNTIME_INTEGRITY_DEV_SKIPPED', 'Runtime integrity is not enforced outside production.');
    return { enforced: false, invalidModules: [] };
  }

  const rootDir = path.resolve(options.rootDir || path.resolve(__dirname, '../..'));
  let packageInfo;
  try {
    packageInfo = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  } catch (err) {
    throw createIntegrityError('RUNTIME_INTEGRITY_PACKAGE_INVALID', `Cannot read packaged release identity: ${err.message}`);
  }
  const version = String(packageInfo.version || '').trim();
  const urls = defaultArtifactUrls(version);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blogposter-integrity-'));
  const packagedManifestPath = path.join(rootDir, '.integrity', 'runtime-integrity-manifest.json');
  const packagedBundlePath = path.join(rootDir, '.integrity', 'runtime-integrity-manifest.bundle.json');
  const localManifestPath = options.manifestPath || env.BLOGPOSTER_RUNTIME_INTEGRITY_MANIFEST_PATH ||
    (fs.existsSync(packagedManifestPath) ? packagedManifestPath : null);
  const localBundlePath = options.bundlePath || env.BLOGPOSTER_RUNTIME_INTEGRITY_BUNDLE_PATH ||
    (fs.existsSync(packagedBundlePath) ? packagedBundlePath : null);
  const manifestPath = localManifestPath || path.join(tempDir, 'runtime-integrity-manifest.json');
  const bundlePath = localBundlePath || path.join(tempDir, 'runtime-integrity-manifest.bundle.json');
  const fetchFile = options.fetchFile || fetchHttpsFile;
  const attestationVerifier = options.attestationVerifier || verifyAttestation;

  try {
    if (!localManifestPath) {
      await fetchFile(env.BLOGPOSTER_RUNTIME_INTEGRITY_MANIFEST_URL || urls.manifestUrl, manifestPath);
    }
    if (!localBundlePath) {
      await fetchFile(env.BLOGPOSTER_RUNTIME_INTEGRITY_BUNDLE_URL || urls.bundleUrl, bundlePath);
    }
    const rawManifest = fs.readFileSync(manifestPath, 'utf8');
    let identityCandidate;
    try {
      identityCandidate = JSON.parse(rawManifest);
    } catch (err) {
      throw createIntegrityError('RUNTIME_INTEGRITY_MANIFEST_INVALID', `Integrity manifest is not valid JSON: ${err.message}`);
    }
    if (identityCandidate?.version !== version) {
      throw createIntegrityError('RUNTIME_INTEGRITY_VERSION_MISMATCH', `Integrity baseline does not match package ${version}.`);
    }
    attestationVerifier({
      manifestPath,
      bundlePath,
      expectedVersion: version,
      expectedSourceCommit: identityCandidate?.source?.commit
    });
    const manifest = parseRuntimeIntegrityManifest(rawManifest);
    if (manifest.version !== version) {
      throw createIntegrityError('RUNTIME_INTEGRITY_VERSION_MISMATCH', `Signed baseline ${manifest.version} does not match package ${version}.`);
    }

    const issues = compareRecords(manifest.files, collectManagedFiles(rootDir));
    const { coreIssues, invalidModules } = splitIntegrityIssues(issues);
    if (coreIssues.length) {
      const first = coreIssues[0];
      throw createIntegrityError('RUNTIME_INTEGRITY_CORE_MISMATCH', `${first.code}: ${first.path}`, {
        issueCount: coreIssues.length,
        firstIssue: first
      });
    }

    runtimeState = { enforced: true, rootDir, manifest, invalidModules };
    for (const [moduleName, moduleIssues] of invalidModules) {
      auditIntegrity(consoleLike, 'error', 'RUNTIME_INTEGRITY_MODULE_BLOCKED', 'Community module failed signed baseline verification.', {
        moduleName,
        issueCount: moduleIssues.length,
        firstIssue: moduleIssues[0]
      });
    }
    auditIntegrity(consoleLike, 'info', 'RUNTIME_INTEGRITY_VERIFIED', 'Signed runtime baseline and managed files verified.', {
      fileCount: manifest.files.length,
      blockedModules: invalidModules.size,
      version
    });
    return { enforced: true, invalidModules: [...invalidModules.keys()], fileCount: manifest.files.length, version };
  } catch (err) {
    auditIntegrity(consoleLike, 'error', err.code || 'RUNTIME_INTEGRITY_FAILED', err.message || String(err));
    throw err;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function assertRuntimeModuleIntegrity(moduleName) {
  if (!runtimeState.enforced) return true;
  const issues = runtimeState.invalidModules.get(moduleName);
  if (!issues?.length) return true;
  throw createIntegrityError(
    'RUNTIME_INTEGRITY_MODULE_BLOCKED',
    `Community module "${moduleName}" is not present in the verified release baseline.`,
    { moduleName, firstIssue: issues[0], issueCount: issues.length }
  );
}

function verifyRuntimeModuleIntegrityNow(moduleName, consoleLike = console) {
  const normalizedModuleName = normalizeRelativePath(moduleName, 'module name');
  if (normalizedModuleName.includes('/')) {
    throw createIntegrityError('RUNTIME_INTEGRITY_MODULE_NAME_INVALID', 'Module name must contain exactly one safe path segment.');
  }
  assertRuntimeModuleIntegrity(normalizedModuleName);
  if (!runtimeState.enforced) return true;
  const prefix = `modules/${normalizedModuleName}`;
  const expected = runtimeState.manifest.files.filter(record => record.path === prefix || record.path.startsWith(`${prefix}/`));
  let actual;
  try {
    actual = collectManagedFiles(runtimeState.rootDir, [prefix]);
  } catch (err) {
    const issue = { code: err.code || 'RUNTIME_INTEGRITY_MODULE_RECHECK_FAILED', path: prefix };
    runtimeState.invalidModules.set(normalizedModuleName, [issue]);
    auditIntegrity(consoleLike, 'error', 'RUNTIME_INTEGRITY_MODULE_BLOCKED', 'Community module failed its process-start integrity recheck.', {
      moduleName: normalizedModuleName,
      firstIssue: issue
    });
    throw createIntegrityError('RUNTIME_INTEGRITY_MODULE_BLOCKED', `Community module "${normalizedModuleName}" failed its process-start integrity recheck.`, {
      moduleName: normalizedModuleName,
      firstIssue: issue
    });
  }
  const issues = compareRecords(expected, actual);
  if (issues.length) {
    runtimeState.invalidModules.set(normalizedModuleName, issues);
    auditIntegrity(consoleLike, 'error', 'RUNTIME_INTEGRITY_MODULE_BLOCKED', 'Community module changed after startup verification.', {
      moduleName: normalizedModuleName,
      firstIssue: issues[0],
      issueCount: issues.length
    });
    throw createIntegrityError('RUNTIME_INTEGRITY_MODULE_BLOCKED', `Community module "${normalizedModuleName}" changed after startup verification.`, {
      moduleName: normalizedModuleName,
      firstIssue: issues[0],
      issueCount: issues.length
    });
  }
  return true;
}

function resetRuntimeIntegrityForTests() {
  runtimeState = { enforced: false, rootDir: null, manifest: null, invalidModules: new Map() };
}

module.exports = {
  INTEGRITY_SCHEMA_VERSION,
  MANAGED_PATHS,
  MUTABLE_RUNTIME_PATHS,
  PRODUCT,
  TRUSTED_REPOSITORY,
  TRUSTED_SIGNER_WORKFLOW,
  assertRuntimeModuleIntegrity,
  buildRuntimeIntegrityManifest,
  collectManagedFiles,
  compareRecords,
  defaultArtifactUrls,
  fetchHttpsFile,
  parseRuntimeIntegrityManifest,
  verifyAttestation,
  verifyRuntimeIntegrity,
  verifyRuntimeModuleIntegrityNow,
  _internals: {
    createIntegrityError,
    integrityIsRequired,
    moduleNameForPath,
    normalizeRelativePath,
    pathIsManaged,
    pathIsMutableRuntimeData,
    resetRuntimeIntegrityForTests,
    splitIntegrityIssues
  }
};
