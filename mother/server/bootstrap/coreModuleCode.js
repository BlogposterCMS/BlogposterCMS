'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');
const { lifecycleError } = require('./coreModuleScope');
const { isHostFile } = require('../../modules/updater/coreModulePackages');

/** Load a verified generation with local caches and canonical shared imports.
 * This is trusted core code, not a sandbox. The updater must verify every byte
 * and the compatible host before calling this loader.
 */
function loadCoreModuleCode({ moduleName, moduleDir, canonicalModuleDir }) {
  const root = fs.realpathSync(moduleDir);
  const canonicalRoot = fs.realpathSync(canonicalModuleDir);
  const cache = new Map();
  const hostRequire = createRequire(path.join(canonicalRoot, 'index.js'));
  const inside = filename => filename === root || filename.startsWith(`${root}${path.sep}`);

  function resolveLocal(request, parent) {
    const candidate = path.resolve(path.dirname(parent), request);
    if (!inside(candidate)) return null;
    for (const filename of [candidate, `${candidate}.js`, `${candidate}.json`, path.join(candidate, 'index.js')]) {
      if (fs.existsSync(filename) && fs.lstatSync(filename).isFile()) {
        if (!inside(fs.realpathSync(filename))) throw lifecycleError('CORE_MODULE_CODE_PATH_ESCAPE', moduleName);
        return filename;
      }
    }
    throw lifecycleError('CORE_MODULE_CODE_MISSING', moduleName);
  }

  function load(filename) {
    if (!inside(fs.realpathSync(filename)) || fs.lstatSync(filename).isSymbolicLink()) {
      throw lifecycleError('CORE_MODULE_CODE_PATH_ESCAPE', moduleName);
    }
    // Fingerprinted shared services must keep their canonical instance, including
    // mutation queues used by callers outside the updating module.
    const relative = path.relative(root, filename).split(path.sep).join('/');
    if (isHostFile(moduleName, relative)) return hostRequire(`./${relative}`);
    if (cache.has(filename)) return cache.get(filename).exports;
    const record = { exports: {}, filename, loaded: false };
    cache.set(filename, record);
    try {
      if (path.extname(filename) === '.json') {
        record.exports = JSON.parse(fs.readFileSync(filename, 'utf8'));
      } else {
        if (path.extname(filename) !== '.js') throw lifecycleError('CORE_MODULE_CODE_TYPE_UNSUPPORTED', moduleName);
        const canonicalFile = path.join(canonicalRoot, path.relative(root, filename));
        const sharedRequire = createRequire(canonicalFile);
        const requireGeneration = request => {
          if (typeof request !== 'string') throw lifecycleError('CORE_MODULE_IMPORT_INVALID', moduleName);
          const local = request.startsWith('.') ? resolveLocal(request, filename) : null;
          return local ? load(local) : sharedRequire(request);
        };
        requireGeneration.resolve = request => {
          const local = request.startsWith('.') ? resolveLocal(request, filename) : null;
          if (!local) return sharedRequire.resolve(request);
          const relative = path.relative(root, local).split(path.sep).join('/');
          return isHostFile(moduleName, relative) ? hostRequire.resolve(`./${relative}`) : local;
        };
        // Keep __dirname within this immutable generation for module-owned data.
        // Imports escaping its directory resolve against the original host.
        // Retain the host's runtime globals as well: enabled strategy registries
        // must not move to a different realm when evaluating a new generation.
        const execute = vm.compileFunction(fs.readFileSync(filename, 'utf8'),
          ['exports', 'require', 'module', '__filename', '__dirname', 'global', 'process'], { filename });
        execute.call(record.exports, record.exports, requireGeneration, record, filename, path.dirname(filename), global, process);
      }
      record.loaded = true;
      return record.exports;
    } catch (error) { cache.delete(filename); throw error; }
  }

  // Resolve host dependencies before evaluating the entry; no global cache is
  // cleared, so other modules retain their singleton services and active jobs.
  if (!hostRequire.resolve('./index.js')) throw lifecycleError('CORE_MODULE_ENTRY_INVALID', moduleName);
  return load(path.join(root, 'index.js'));
}

module.exports = { loadCoreModuleCode };
