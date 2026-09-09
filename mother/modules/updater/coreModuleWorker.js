'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { createCoreModuleStore } = require('./coreModuleStore');
const { MODULE_POLICY, packageError } = require('./coreModulePackages');
const { extractModuleArchive } = require('./coreModuleArchive');
const { fetchHttpsFile, TRUSTED_REPOSITORY } = require('../../security/runtimeIntegrity');

async function execute({ rootDir, operation, moduleName, version, generationId }) {
  if (!Object.prototype.hasOwnProperty.call(MODULE_POLICY, moduleName)) throw packageError('CORE_MODULE_RESTART_REQUIRED');
  const store = createCoreModuleStore({ rootDir });
  if (operation === 'activate') return store.activate(moduleName, generationId);
  if (operation === 'inspect') return store.inspect(moduleName, generationId);
  if (operation !== 'stage-release' || !/^\d+\.\d+\.\d+$/.test(version || '')) throw packageError('CORE_MODULE_WORKER_REQUEST_INVALID');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'blogposter-core-module-'));
  try {
    const archivePath = path.join(temporary, 'package.zip');
    await fetchHttpsFile(`https://github.com/${TRUSTED_REPOSITORY}/releases/download/v${version}/core-module-${moduleName}.zip`, archivePath, { maxBytes: 80 * 1024 * 1024 });
    const generationDir = path.join(temporary, 'generation');
    const manifest = extractModuleArchive(fs.readFileSync(archivePath), moduleName, generationDir);
    if (manifest.version !== version) throw packageError('CORE_MODULE_RELEASE_IDENTITY_MISMATCH');
    return store.stage(moduleName, generationDir);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function runModuleWorker(request, { WorkerImpl = Worker, timeoutMs = 120000 } = {}) {
  // Hashing the host tree and running gh verification must not block HTTP or
  // unrelated modules on the CMS event loop.
  return new Promise((resolve, reject) => {
    const worker = new WorkerImpl(__filename, { workerData: request });
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      if (error) reject(error); else resolve(result);
    };
    // Losing the worker after an atomic pointer write is ambiguous. Never
    // restore old runtime handlers when restart could select the new pointer.
    const interruption = code => packageError(request.operation === 'activate' ? 'CORE_MODULE_COMMIT_UNCERTAIN' : code);
    const timer = setTimeout(() => finish(interruption('CORE_MODULE_WORKER_TIMEOUT')), timeoutMs);
    worker.once('message', message => finish(message.error ? packageError(message.error) : null, message.result));
    worker.once('error', () => finish(interruption('CORE_MODULE_WORKER_FAILED')));
    worker.once('exit', () => { if (!settled) finish(interruption('CORE_MODULE_WORKER_EXITED')); });
  });
}

if (!isMainThread) {
  execute(workerData).then(result => parentPort.postMessage({ result }), error => parentPort.postMessage({ error: error.code || 'CORE_MODULE_WORKER_FAILED' }));
}

module.exports = { runModuleWorker };
