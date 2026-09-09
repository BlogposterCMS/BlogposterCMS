'use strict';

const path = require('path');
const { MODULE_POLICY, packageError } = require('./coreModulePackages');
const { runModuleWorker } = require('./coreModuleWorker');
const { loadCoreModuleCode } = require('../../server/bootstrap/coreModuleCode');
const { compareVersions } = require('../moduleLoader/moduleUpdateService');

function createCoreModuleUpdates({ rootDir, lifecycle, run = runModuleWorker, load = loadCoreModuleCode }) {
  const rows = new Map();
  const jobs = new Map();
  let checkedRelease = null;
  let checking = null;
  const currentVersion = moduleName => lifecycle.snapshot().find(row => row.moduleName === moduleName)?.generation?.releaseVersion || require(path.join(rootDir, 'package.json')).version;
  const snapshot = () => Object.keys(MODULE_POLICY).map(moduleName => ({
    moduleName, kind: MODULE_POLICY[moduleName].kind || 'module', label: MODULE_POLICY[moduleName].label || moduleName,
    currentVersion: currentVersion(moduleName), status: 'not_checked', available: false,
    ...rows.get(moduleName)
  }));

  async function check(version) {
    for (const moduleName of Object.keys(MODULE_POLICY)) {
      if (jobs.has(moduleName)) continue;
      if (compareVersions(version, currentVersion(moduleName)) <= 0) {
        rows.set(moduleName, { status: 'current', available: false }); continue;
      }
      rows.set(moduleName, { status: 'checking', available: false, latestVersion: version });
      try {
        const candidate = await run({ rootDir, operation: 'stage-release', moduleName, version });
        // Review text comes only from the verified manifest of this generation.
        rows.set(moduleName, { status: 'available', available: true, latestVersion: version, generationId: candidate.generationId,
          releaseNotes: candidate.manifest?.releaseNotes, breakingChange: candidate.manifest?.breakingChange });
      } catch (error) {
        rows.set(moduleName, { status: error.code === 'CORE_MODULE_HOST_INCOMPATIBLE' ? 'host_required' : 'error',
          available: false, latestVersion: version, errorCode: error.code || 'CORE_MODULE_CHECK_FAILED' });
      }
    }
  }

  return {
    snapshot,
    busy: () => jobs.size > 0,
    observeRelease(state, { force = false } = {}) {
      const version = state?.candidate?.latestVersion;
      // A successful check with no newer host release also establishes current
      // module versions; otherwise the module section stays unchecked forever.
      if (!(state?.candidate?.available || (state?.configured && state.phase === 'current')) || !/^\d+\.\d+\.\d+$/.test(version || '') || checking || (!force && checkedRelease === version)) return;
      checkedRelease = version;
      checking = check(version).finally(() => { checking = null; });
    },
    install({ moduleName, generationId, version }) {
      const row = rows.get(moduleName);
      if (jobs.has(moduleName)) throw packageError('CORE_MODULE_UPDATE_BUSY');
      if (!row?.available || row.generationId !== generationId || row.latestVersion !== version) throw packageError('CORE_MODULE_REVIEW_CHANGED');
      if (compareVersions(version, currentVersion(moduleName)) <= 0) throw packageError('CORE_MODULE_DOWNGRADE_DENIED');
      rows.set(moduleName, { ...row, available: false, status: 'installing' });
      const job = Promise.resolve().then(async () => {
        try {
          const candidate = await run({ rootDir, operation: 'inspect', moduleName, generationId });
          const implementation = MODULE_POLICY[moduleName].kind === 'widget'
            ? require('../../server/bootstrap/coreBrowserModule')
            : load({ moduleName, moduleDir: candidate.moduleDir, canonicalModuleDir: path.join(rootDir, 'mother/modules', moduleName) });
          if (typeof implementation.healthCheck !== 'function') throw packageError('CORE_MODULE_HEALTH_CHECK_MISSING');
          await lifecycle.replace(moduleName, implementation, {
            generation: { generationId, releaseVersion: version },
            browserDirectory: candidate.moduleDir,
            healthCheck: (next, context) => next.healthCheck(context),
            beforeActivate: () => run({ rootDir, operation: 'activate', moduleName, generationId })
          });
          rows.set(moduleName, { ...row, status: 'completed', available: false, latestVersion: version, generationId });
        } catch (error) {
          rows.set(moduleName, { ...row, status: 'error', available: false, latestVersion: version, errorCode: error.code || 'CORE_MODULE_INSTALL_FAILED' });
        } finally { jobs.delete(moduleName); }
      });
      jobs.set(moduleName, job);
      return { moduleName, status: 'installing', generationId };
    },
    // Internal completion signal for shutdown/tests; UI uses the existing status action.
    async settled() { if (checking) await checking; await Promise.all(jobs.values()); }
  };
}

module.exports = { createCoreModuleUpdates };
