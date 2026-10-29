'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MODULE_POLICY, verifyModuleGeneration, packageError } = require('./coreModulePackages');
const GENERATION = /^[a-f0-9]{64}$/;

/** Persist code generations, never customer data or a second module registry. */
function createCoreModuleStore({ rootDir, verify = verifyModuleGeneration }) {
  const storeRoot = path.resolve(rootDir, 'data/core-module-updates');
  function moduleRoot(moduleName) {
    if (!Object.prototype.hasOwnProperty.call(MODULE_POLICY, moduleName)) throw packageError('CORE_MODULE_RESTART_REQUIRED');
    const directory = path.join(storeRoot, moduleName);
    // Existing private paths must not redirect updater writes into host code.
    for (const candidate of [path.dirname(storeRoot), storeRoot, directory]) {
      if (fs.existsSync(candidate) && fs.lstatSync(candidate).isSymbolicLink()) throw packageError('CORE_MODULE_STORE_SYMLINK');
    }
    return directory;
  }
  function generationDir(moduleName, generationId) {
    if (!GENERATION.test(generationId || '')) throw packageError('CORE_MODULE_GENERATION_INVALID');
    const directory = path.join(moduleRoot(moduleName), generationId);
    if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) throw packageError('CORE_MODULE_STORE_SYMLINK');
    return directory;
  }
  function state(moduleName) {
    const filename = path.join(moduleRoot(moduleName), 'active.json');
    if (!fs.existsSync(filename)) return { schemaVersion: 1, active: null, previous: null };
    if (fs.lstatSync(filename).isSymbolicLink()) throw packageError('CORE_MODULE_STORE_SYMLINK');
    let value;
    try { value = JSON.parse(fs.readFileSync(filename, 'utf8')); }
    catch { throw packageError('CORE_MODULE_STATE_INVALID'); }
    if (value?.schemaVersion !== 1 || !GENERATION.test(value.active || '') ||
        (value.previous !== null && !GENERATION.test(value.previous || ''))) throw packageError('CORE_MODULE_STATE_INVALID');
    return value;
  }
  function inspect(moduleName, generationId) {
    const inspected = verify({ rootDir, moduleName, generationDir: generationDir(moduleName, generationId) });
    if (inspected.generationId !== generationId) throw packageError('CORE_MODULE_GENERATION_MISMATCH');
    return inspected;
  }
  function writeState(moduleName, value) {
    const directory = moduleRoot(moduleName);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const temporary = path.join(directory, `.active-${crypto.randomUUID()}.tmp`);
    let descriptor;
    let renamed = false;
    try {
      descriptor = fs.openSync(temporary, 'wx', 0o600);
      fs.writeFileSync(descriptor, JSON.stringify(value));
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor); descriptor = undefined;
      fs.renameSync(temporary, path.join(directory, 'active.json'));
      renamed = true;
      // Linux production also persists the directory entry after atomic rename.
      if (process.platform !== 'win32') {
        const directoryFd = fs.openSync(directory, 'r');
        try { fs.fsyncSync(directoryFd); } finally { fs.closeSync(directoryFd); }
      }
    } catch (error) {
      if (renamed) throw packageError('CORE_MODULE_COMMIT_UNCERTAIN');
      throw error;
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
  return {
    state,
    inspect,
    stage(moduleName, sourceDir) {
      const verified = verify({ rootDir, moduleName, generationDir: sourceDir });
      const destination = generationDir(moduleName, verified.generationId);
      if (!fs.existsSync(destination)) {
        fs.mkdirSync(moduleRoot(moduleName), { recursive: true, mode: 0o700 });
        const temporary = path.join(moduleRoot(moduleName), `.stage-${crypto.randomUUID()}`);
        try {
          fs.cpSync(sourceDir, temporary, { recursive: true, errorOnExist: true, force: false });
          const staged = verify({ rootDir, moduleName, generationDir: temporary });
          if (staged.generationId !== verified.generationId) throw packageError('CORE_MODULE_GENERATION_MISMATCH');
          fs.renameSync(temporary, destination);
        } finally {
          // This is a generated child of the fixed, checked module store root.
          if (fs.existsSync(temporary)) fs.rmSync(temporary, { recursive: true, force: true });
        }
      }
      return inspect(moduleName, verified.generationId);
    },
    active(moduleName) {
      const selected = state(moduleName);
      return selected.active ? inspect(moduleName, selected.active) : null;
    },
    activate(moduleName, generationId) {
      const selected = state(moduleName);
      const candidate = inspect(moduleName, generationId);
      if (selected.active !== generationId) writeState(moduleName, {
        schemaVersion: 1, active: generationId, previous: selected.active
      });
      return candidate;
    }
  };
}

module.exports = { createCoreModuleStore };
